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
import { ApiError, askQuestion, fetchBatch, fetchSummary, pollPairing, randomSecret, sha256Hex, startPairing, submitReview, type ReviewBody } from "./api.js";
import { storage } from "./storage.js";
import { answerPages, render, type BasePage, type Page } from "./render.js";
import { mountCompanion } from "./companion.js";
import { initialState, questionOf, reduce, type Action, type Effect, type MenuItem, type State } from "./state.js";

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
const OVERLAY_ID = 3;
const OVERLAY_NAME = "answer";
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

/**
 * Containers for a base page. With an overlay, the overlay box takes the event
 * capture and every container gets a zOrderIndex (the firmware wants all or none).
 */
function baseContainers(page: BasePage, withOverlay: boolean) {
  const z = (n: number) => (withOverlay ? { zOrderIndex: n } : {});
  if (page.kind === "text") {
    return {
      textObject: [new TextContainerProperty({
        ...frame, ...z(1), xPosition: 0, yPosition: 0, width: 576, height: 288,
        containerID: TEXT_ID, containerName: TEXT_NAME, content: page.content, isEventCapture: withOverlay ? 0 : 1,
      })],
      listObject: [] as ListContainerProperty[],
    };
  }
  return {
    textObject: [new TextContainerProperty({
      ...frame, ...z(1), xPosition: 0, yPosition: 0, width: 576, height: HEADER_HEIGHT,
      containerID: TEXT_ID, containerName: TEXT_NAME, content: page.header, isEventCapture: 0,
    })],
    listObject: [new ListContainerProperty({
      ...frame, ...z(2), xPosition: 0, yPosition: HEADER_HEIGHT, width: 576, height: 288 - HEADER_HEIGHT,
      containerID: LIST_ID, containerName: LIST_NAME, isEventCapture: withOverlay ? 0 : 1,
      itemContainer: new ListItemContainerProperty({
        itemCount: page.items.length,
        itemWidth: 0,
        isItemSelectBorderEn: 1,
        itemName: page.items,
      }),
    })],
  };
}

/** The answer card: inset over the base page, drawn last, owns the tap. */
function overlayContainer(content: string): TextContainerProperty {
  return new TextContainerProperty({
    ...frame, zOrderIndex: 3, xPosition: 24, yPosition: 28, width: 528, height: 232,
    containerID: OVERLAY_ID, containerName: OVERLAY_NAME, content, isEventCapture: 1,
  });
}

/** What must match for an in-place text update to be enough. */
function shape(page: Page): string {
  const base = page.kind === "overlay" ? page.base : page;
  const items = base.kind === "list" ? base.items.join("\n") : "";
  return `${page.kind}:${base.kind}:${items}`;
}

let shown: Page = render(state);
{
  const first = baseContainers(shown.kind === "overlay" ? shown.base : shown, false);
  const startResult = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({ containerTotalNum: first.textObject.length + first.listObject.length, textObject: first.textObject, listObject: first.listObject, menuObject }),
  );
  if (startResult !== 0) console.error("createStartUpPageContainer failed:", startResult);
}

function headerOf(page: Page): string {
  const base = page.kind === "overlay" ? page.base : page;
  return base.kind === "text" ? base.content : base.header;
}

/** Redraws are serialised: a rebuild that overlaps an upgrade leaves the page half-drawn. */
let drawing: Promise<void> = Promise.resolve();
function draw(): void {
  drawing = drawing.then(async () => {
    const page = render(state);
    if (shape(page) === shape(shown)) {
      // Same containers on screen: update text in place, which does not flicker.
      const content = headerOf(page);
      if (content !== headerOf(shown)) {
        await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: TEXT_ID, containerName: TEXT_NAME, content }));
      }
      if (page.kind === "overlay" && shown.kind === "overlay" && page.overlay !== shown.overlay) {
        await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: OVERLAY_ID, containerName: OVERLAY_NAME, content: page.overlay }));
      }
    } else {
      const withOverlay = page.kind === "overlay";
      const { textObject, listObject } = baseContainers(withOverlay ? page.base : page, withOverlay);
      if (page.kind === "overlay") textObject.push(overlayContainer(page.overlay));
      await bridge.rebuildPageContainer(new RebuildPageContainer({ containerTotalNum: textObject.length + listObject.length, textObject, listObject, menuObject }));
    }
    shown = page;
  }).catch(err => console.warn("draw failed:", err));
}

// --- Phone side ---------------------------------------------------------------

const companion = mountCompanion(document.getElementById("app") as HTMLElement, text => dispatch({ type: "ASK", text }));

function syncCompanion(): void {
  const v = state.view;
  const q = questionOf(v);
  companion.setQuestion(q ? { stem: q.stem, options: q.options } : null);
  companion.setBusy(v.kind === "asking");
  companion.setAnswer(v.kind === "answer" ? v.answer : null);
  const status: Record<State["view"]["kind"], string> = {
    boot: "Starting...",
    pair: "Type the code from the glasses at learnforge.eu, Settings, Glasses.",
    home: "Home is on the glasses. Pick a mode with the ring.",
    preparing: "Fetching questions...",
    empty: "Waiting for compiled questions.",
    question: "This question is on the glasses.",
    result: "Result is on the glasses. Tap the ring for the next one.",
    done: "Session done.",
    error: "Something went wrong on the glasses.",
    asking: "Asking Claude...",
    answer: "Answer is on the glasses.",
  };
  companion.setStatus(status[v.kind]);
}

// --- Dispatch and effects ------------------------------------------------------

function dispatch(action: Action): void {
  const { state: next, effects } = reduce(state, action);
  state = next;
  draw();
  syncCompanion();
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
      case "ASK": {
        if (!token) return;
        const { answer } = await askQuestion(token, effect.questionId, effect.text);
        dispatch({ type: "ANSWER_LOADED", answer });
        return;
      }
      case "SHUTDOWN":
        await bridge.shutDownPageContainer(1);
        return;
    }
  } catch (err) {
    if (await handleAuthError(err)) return;
    const message = err instanceof Error ? err.message : String(err);
    if (effect.type === "ASK") dispatch({ type: "ASK_FAILED", message });
    else if (effect.type === "FETCH_BATCH") dispatch({ type: "BATCH_FAILED", message });
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
    // On a question the double tap confirms the marked answer; everywhere else it is the system exit dialog.
    if (state.view.kind === "question") {
      dispatch({ type: "CONFIRM" });
      return;
    }
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
      if (shown.kind === "overlay") {
        const v = state.view;
        dispatch({ type: "ANSWER_NEXT", pageCount: v.kind === "answer" ? answerPages(v.answer).length : 1 });
      } else if (shown.kind === "text") {
        dispatch({ type: "CLICK", now: Date.now() });
      }
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
