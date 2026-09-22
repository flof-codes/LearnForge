import {
  waitForEvenAppBridge,
  TextContainerProperty,
  TextContainerUpgrade,
  CreateStartUpPageContainer,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  type EvenAppBridge,
  type EvenHubEvent,
} from "@evenrealities/even_hub_sdk";
import { ApiError, fetchBatch, fetchSummary, pollPairing, randomSecret, sha256Hex, startPairing, submitReview, type ReviewBody } from "./api.js";
import { storage } from "./storage.js";
import { render } from "./render.js";
import { initialState, reduce, type Action, type Effect, type MenuItem, type State } from "./state.js";

/**
 * LearnForge on the Even Realities G2.
 *
 * One full-screen text container, redrawn in place after every event. The ring
 * (and the temple pads) deliver click, double click, scroll up/down and the
 * tap-then-hold menu; everything else is a state machine in state.ts.
 */

const CONTAINER_ID = 1;
const CONTAINER_NAME = "main";
const SCROLL_COOLDOWN_MS = 300;
const PAIR_POLL_MS = 2000;
const COMPILE_POLL_MS = 15000;
const COMPILE_POLL_MAX = 24; // 6 minutes

const MENU: Array<{ id: number; label: string; item: MenuItem }> = [
  { id: 1, label: "Skip card", item: "skip" },
  { id: 2, label: "Home", item: "home" },
  { id: 3, label: "Close app", item: "close" },
];

const bridge = await waitForEvenAppBridge();

let state: State = initialState();
let token: string | null = null;
let lastScrollAt = 0;
let pairTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;
let compilePolls = 0;
let compileTimer: ReturnType<typeof setTimeout> | null = null;

// --- Display -----------------------------------------------------------------

const menuObject = new MenuContainerProperty({
  menuItems: MENU.map(m => new MenuItemProperty({ itemID: m.id, itemName: m.label })),
});

const startResult = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 288,
        // A frame around the whole text: without it the block is hard to focus on the waveguide.
        borderWidth: 2,
        borderColor: 8,
        borderRadius: 8,
        paddingLength: 10,
        containerID: CONTAINER_ID,
        containerName: CONTAINER_NAME,
        content: render(state),
        isEventCapture: 1,
      }),
    ],
    menuObject,
  }),
);
if (startResult !== 0) console.error("createStartUpPageContainer failed:", startResult);

let lastContent = render(state);
async function draw(): Promise<void> {
  const content = render(state);
  if (content === lastContent) return;
  lastContent = content;
  await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: CONTAINER_ID, containerName: CONTAINER_NAME, content }));
}

// --- Dispatch and effects ------------------------------------------------------

function dispatch(action: Action): void {
  const { state: next, effects } = reduce(state, action);
  state = next;
  void draw();
  for (const effect of effects) void runEffect(effect);
}

async function runEffect(effect: Effect): Promise<void> {
  try {
    switch (effect.type) {
      case "FETCH_SUMMARY": {
        if (!token) return;
        dispatch({ type: "SUMMARY_LOADED", summary: await fetchSummary(token) });
        return;
      }
      case "FETCH_BATCH": {
        if (!token) return;
        await flushQueue();
        const batch = await fetchBatch(token, effect.mode, effect.sessionId, effect.exclude);
        await storage.setSession(bridge, batch.sessionId);
        dispatch({ type: "BATCH_LOADED", sessionId: batch.sessionId, questions: batch.questions, pendingCompile: batch.pendingCompile, compiling: batch.compiling });
        scheduleCompilePoll(batch.compiling || batch.pendingCompile > 0);
        return;
      }
      case "SUBMIT_REVIEW": {
        await enqueueReview(effect.review);
        await flushQueue();
        return;
      }
      case "SHUTDOWN":
        await bridge.shutDownPageContainer(1);
        return;
    }
  } catch (err) {
    if (await handleAuthError(err)) return;
    const message = err instanceof Error ? err.message : String(err);
    if (effect.type === "FETCH_BATCH") dispatch({ type: "BATCH_FAILED", message });
    else if (effect.type === "FETCH_SUMMARY") console.warn("summary failed:", message);
    else dispatch({ type: "FAILED", message });
  }
}

/** A revoked or expired token sends the app back to pairing. */
async function handleAuthError(err: unknown): Promise<boolean> {
  if (!(err instanceof ApiError) || err.status !== 401) return false;
  token = null;
  await storage.clearToken(bridge);
  await beginPairing();
  return true;
}

/** While the server compiles, ask again every few seconds; stop after a bounded number of tries. */
function scheduleCompilePoll(active: boolean): void {
  if (compileTimer) { clearTimeout(compileTimer); compileTimer = null; }
  if (!active || state.view.kind !== "empty") { compilePolls = 0; return; }
  if (compilePolls >= COMPILE_POLL_MAX) { compilePolls = 0; return; }
  compilePolls += 1;
  compileTimer = setTimeout(() => {
    compileTimer = null;
    if (state.view.kind === "empty") dispatch({ type: "RETRY_BATCH" });
  }, COMPILE_POLL_MS);
}

// --- Offline review queue --------------------------------------------------------

async function enqueueReview(review: ReviewBody): Promise<void> {
  const queue = await storage.getQueue(bridge);
  if (!queue.some(r => r.question_id === review.question_id)) queue.push(review);
  await storage.setQueue(bridge, queue);
}

/** Sends queued reviews in order. A ticket answered twice returns the first result, so a retry is safe. */
async function flushQueue(): Promise<void> {
  if (flushing || !token) return;
  flushing = true;
  try {
    let queue = await storage.getQueue(bridge);
    while (queue.length > 0) {
      const head = queue[0];
      try {
        await submitReview(token, head);
      } catch (err) {
        // 4xx other than 401 means this review will never be accepted; drop it rather than block the queue.
        if (err instanceof ApiError && err.status !== 401 && err.status < 500) {
          console.warn("review rejected:", err.message);
        } else {
          throw err;
        }
      }
      queue = queue.slice(1);
      await storage.setQueue(bridge, queue);
    }
  } finally {
    flushing = false;
  }
}

// --- Pairing ----------------------------------------------------------------------

async function beginPairing(): Promise<void> {
  if (pairTimer) { clearInterval(pairTimer); pairTimer = null; }
  const secret = randomSecret();
  const { code, expiresAt } = await startPairing(await sha256Hex(secret));
  dispatch({ type: "PAIR_STARTED", code: `${code.slice(0, 3)} ${code.slice(3)}`, expiresAt: new Date(expiresAt).getTime() });

  pairTimer = setInterval(() => void pollOnce(), PAIR_POLL_MS);

  async function pollOnce(): Promise<void> {
    try {
      if (Date.now() > new Date(expiresAt).getTime()) {
        if (pairTimer) clearInterval(pairTimer);
        pairTimer = null;
        await beginPairing();
        return;
      }
      const { status } = await pollPairing(code);
      if (status === "claimed") {
        if (pairTimer) clearInterval(pairTimer);
        pairTimer = null;
        token = secret;
        await storage.setToken(bridge, secret);
        dispatch({ type: "PAIRED" });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // The code expired server-side; start over with a fresh one.
        if (pairTimer) clearInterval(pairTimer);
        pairTimer = null;
        await beginPairing();
      }
    }
  }
}

// --- Input -------------------------------------------------------------------------

/**
 * CLICK_EVENT is 0 and protobuf drops zero-valued fields, so a tap arrives as an
 * envelope whose eventType is undefined. Resolve the default inside the envelope
 * check, never on the whole event.
 */
function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null;
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT;
}

function onEvent(event: EvenHubEvent): void {
  if (event.menuItemClickEvent) {
    const entry = MENU.find(m => m.id === event.menuItemClickEvent?.itemID);
    if (entry) dispatch({ type: "MENU", item: entry.item });
    return;
  }

  const sysType = eventTypeOf(event.sysEvent);
  const textType = eventTypeOf(event.textEvent);
  const type = textType ?? sysType;
  if (type === null) return;

  switch (type) {
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      // Root page: the system exit dialog. Mandatory, whichever envelope carried it.
      void bridge.shutDownPageContainer(1);
      return;
    case OsEventTypeList.CLICK_EVENT:
      dispatch({ type: "CLICK", now: Date.now() });
      return;
    case OsEventTypeList.SCROLL_TOP_EVENT:
    case OsEventTypeList.SCROLL_BOTTOM_EVENT: {
      const now = Date.now();
      if (now - lastScrollAt < SCROLL_COOLDOWN_MS) return;
      lastScrollAt = now;
      dispatch({ type: type === OsEventTypeList.SCROLL_TOP_EVENT ? "SCROLL_UP" : "SCROLL_DOWN" });
      return;
    }
    case OsEventTypeList.FOREGROUND_ENTER_EVENT:
      // Back from the background: push any answers given while the link was down.
      void flushQueue();
      return;
    case OsEventTypeList.SYSTEM_EXIT_EVENT:
    case OsEventTypeList.ABNORMAL_EXIT_EVENT:
      if (pairTimer) clearInterval(pairTimer);
      unsubscribe();
      return;
    default:
      return;
  }
}

const unsubscribe = bridge.onEvenHubEvent(onEvent);

// --- Boot ------------------------------------------------------------------------------

async function boot(b: EvenAppBridge): Promise<void> {
  token = await storage.getToken(b);
  if (!token) {
    await beginPairing();
    return;
  }
  const sessionId = await storage.getSession(b);
  if (sessionId) state = { ...state, sessionId };
  dispatch({ type: "PAIRED" });
  void flushQueue();
}

boot(bridge).catch((err: unknown) => {
  // A failed first request must not leave the display on "Starting...".
  const message = err instanceof Error ? err.message : String(err);
  dispatch({ type: "FAILED", message: `Cannot reach LearnForge: ${message}` });
});
