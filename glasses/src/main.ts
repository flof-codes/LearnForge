import {
  waitForEvenAppBridge,
  TextContainerProperty,
  TextContainerUpgrade,
  ListContainerProperty,
  ListItemContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  type EvenAppBridge,
  type EvenHubEvent,
} from "@evenrealities/even_hub_sdk";
import { ApiError, fetchBatch, fetchSummary, pollPairing, randomSecret, sha256Hex, startPairing, submitReview, type ReviewBody } from "./api.js";
import { storage } from "./storage.js";
import { render, type Page } from "./render.js";
import { initialState, reduce, type Action, type Effect, type MenuItem, type State } from "./state.js";

/**
 * LearnForge on the Even Realities G2.
 *
 * Two page shapes. A plain screen is one text box. A screen with choices is a
 * text header plus the firmware's native list, which moves its own highlight on
 * swipe and reports the tapped index; that avoids the bounce a text box shows
 * when swiped. Everything else is the state machine in state.ts.
 */

const TEXT_ID = 1;
const TEXT_NAME = "main";
const LIST_ID = 2;
const LIST_NAME = "rows";
const HEADER_HEIGHT = 100;
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
let pairTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;
let compilePolls = 0;
let compileTimer: ReturnType<typeof setTimeout> | null = null;

// --- Display -----------------------------------------------------------------

const menuObject = new MenuContainerProperty({
  menuItems: MENU.map(m => new MenuItemProperty({ itemID: m.id, itemName: m.label })),
});

const frame = { borderWidth: 2, borderColor: 8, borderRadius: 8, paddingLength: 10 };

function textContainers(content: string): TextContainerProperty[] {
  return [new TextContainerProperty({
    ...frame, xPosition: 0, yPosition: 0, width: 576, height: 288,
    containerID: TEXT_ID, containerName: TEXT_NAME, content, isEventCapture: 1,
  })];
}

function listContainers(header: string, items: string[]) {
  return {
    textObject: [new TextContainerProperty({
      ...frame, xPosition: 0, yPosition: 0, width: 576, height: HEADER_HEIGHT,
      containerID: TEXT_ID, containerName: TEXT_NAME, content: header, isEventCapture: 0,
    })],
    listObject: [new ListContainerProperty({
      ...frame, xPosition: 0, yPosition: HEADER_HEIGHT, width: 576, height: 288 - HEADER_HEIGHT,
      containerID: LIST_ID, containerName: LIST_NAME, isEventCapture: 1,
      itemContainer: new ListItemContainerProperty({
        itemCount: items.length,
        itemWidth: 0,
        isItemSelectBorderEn: 1,
        itemName: items,
      }),
    })],
  };
}

let shown: Page = render(state);
const startResult = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: textContainers(shown.kind === "text" ? shown.content : ""), menuObject }),
);
if (startResult !== 0) console.error("createStartUpPageContainer failed:", startResult);

/** Redraws are serialised: a rebuild that overlaps an upgrade leaves the page half-drawn. */
let drawing: Promise<void> = Promise.resolve();
function draw(): void {
  drawing = drawing.then(async () => {
    const page = render(state);
    const sameList = shown.kind === "list" && page.kind === "list" && shown.items.join("\n") === page.items.join("\n");
    const sameText = shown.kind === "text" && page.kind === "text";
    if (sameList || sameText) {
      const content = page.kind === "text" ? page.content : page.header;
      const before = shown.kind === "text" ? shown.content : shown.header;
      if (content !== before) {
        await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: TEXT_ID, containerName: TEXT_NAME, content }));
      }
    } else if (page.kind === "text") {
      await bridge.rebuildPageContainer(new RebuildPageContainer({ containerTotalNum: 1, textObject: textContainers(page.content), menuObject }));
    } else {
      const { textObject, listObject } = listContainers(page.header, page.items);
      await bridge.rebuildPageContainer(new RebuildPageContainer({ containerTotalNum: 2, textObject, listObject, menuObject }));
    }
    shown = page;
  }).catch(err => console.warn("draw failed:", err));
}

// --- Dispatch and effects ------------------------------------------------------

function dispatch(action: Action): void {
  const { state: next, effects } = reduce(state, action);
  state = next;
  draw();
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
        if (err instanceof ApiError && err.status !== 401 && err.status < 500 && err.status !== 0) {
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
  const listType = eventTypeOf(event.listEvent);

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT || listType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    // Root page: the system exit dialog. Mandatory, whichever envelope carried it.
    void bridge.shutDownPageContainer(1);
    return;
  }

  if (event.listEvent) {
    // The firmware moved the highlight itself; scroll events from a list are boundary notices only.
    if (listType !== OsEventTypeList.CLICK_EVENT) return;
    const items = shown.kind === "list" ? shown.items : [];
    let index = event.listEvent.currentSelectItemIndex;
    // The index is omitted for the first item on some builds; fall back to the name, then to 0.
    if (index === undefined) {
      const byName = event.listEvent.currentSelectItemName ? items.indexOf(event.listEvent.currentSelectItemName) : -1;
      index = byName >= 0 ? byName : 0;
    }
    dispatch({ type: "CLICK_ROW", index, now: Date.now() });
    return;
  }

  const type = textType ?? sysType;
  switch (type) {
    case OsEventTypeList.CLICK_EVENT:
      // On a list page the tap already arrived as a listEvent.
      if (shown.kind === "text") dispatch({ type: "CLICK", now: Date.now() });
      return;
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
