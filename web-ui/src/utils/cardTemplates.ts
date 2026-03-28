/**
 * Generates Pico CSS styled card HTML from plain-text inputs.
 * Used by the onboarding wizard's "simple mode" card creation.
 * Matches the visual style of MCP-generated cards (Pico classless + Inter font).
 */

const SHARED_HEAD = `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/picocss/2.1.1/pico.classless.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300..900&display=swap">
<style>
:root{--pico-font-family:'Inter',sans-serif;--pico-font-size:93.75%}
html,body{margin:0;padding:0;background:transparent}
body>main{margin:0;padding:0;max-width:none}
[data-bloom]{display:inline-block;padding:3px 12px;border-radius:20px;font-size:.72em;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
[data-bloom="0"]{background:#fef3c7;color:#92400e}
article{border:1px solid #e7e5e4;background:#fafaf9}
blockquote{border-left-color:#d97706}
</style>`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateFrontHtml(question: string): string {
  return `${SHARED_HEAD}
<article>
  <span data-bloom="0">Remember</span>
  <p>${escapeHtml(question)}</p>
</article>`;
}

export function generateBackHtml(answer: string): string {
  return `${SHARED_HEAD}
<style>
details{margin:10px 0;border:1px solid #e7e5e4;border-radius:12px;background:white;overflow:hidden}
summary{display:flex;align-items:center;padding:14px 16px;cursor:pointer;font-weight:600;font-size:.95em;list-style:none}
summary:hover{background:#f5f5f4}
summary::-webkit-details-marker{display:none}
details[open] summary{background:#f5f5f4;border-bottom:1px solid #e7e5e4}
details>div{padding:14px 16px}
details p{margin:0 0 8px;font-size:.9em;line-height:1.65;color:#44403c}
details p:last-child{margin-bottom:0}
</style>
<article>
  <small>Answer / Explanation</small>
  <details open>
    <summary>Answer</summary>
    <div><p>${escapeHtml(answer)}</p></div>
  </details>
</article>`;
}
