/**
 * The phone side of the plugin: the Even Realities app shows this page while
 * the glasses show the question. It mirrors the question and takes a typed
 * request about it; the answer goes to the glasses and is mirrored here.
 */

export interface CompanionQuestion {
  stem: string;
  options: Array<{ id: string; text: string }>;
}

export interface Companion {
  setQuestion(q: CompanionQuestion | null): void;
  setStatus(text: string): void;
  setAnswer(text: string | null): void;
  setBusy(busy: boolean): void;
}

export function mountCompanion(root: HTMLElement, onAsk: (text: string) => void): Companion {
  root.innerHTML = "";
  root.className = "companion";

  const title = el("h1", "LearnForge");
  const status = el("p", "Connecting to the glasses...");
  status.className = "status";
  const question = el("div", "");
  question.className = "question";
  const form = document.createElement("form");
  const input = document.createElement("textarea");
  input.placeholder = "Ask about this card, e.g. why is B wrong?";
  input.rows = 3;
  input.maxLength = 500;
  input.setAttribute("autocapitalize", "sentences");
  const send = document.createElement("button");
  send.type = "submit";
  send.textContent = "Send to Claude";
  form.append(input, send);
  const answer = el("div", "");
  answer.className = "answer";
  answer.hidden = true;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    onAsk(text);
    input.value = "";
  });

  root.append(title, status, question, form, answer);

  return {
    setQuestion(q) {
      question.innerHTML = "";
      if (!q) {
        question.append(el("p", "No question on the glasses right now."));
        form.hidden = true;
        return;
      }
      form.hidden = false;
      question.append(el("p", q.stem));
      const list = document.createElement("ul");
      for (const o of q.options) list.append(el("li", `${o.id}  ${o.text}`));
      question.append(list);
    },
    setStatus(text) { status.textContent = text; },
    setAnswer(text) {
      answer.hidden = !text;
      answer.textContent = text ?? "";
    },
    setBusy(busy) {
      send.disabled = busy;
      send.textContent = busy ? "Asking..." : "Send to Claude";
    },
  };
}

function el(tag: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
