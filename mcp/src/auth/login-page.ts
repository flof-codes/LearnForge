/** Server-rendered HTML login page for OAuth authorization flow. */

const STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #111827; color: #e0e4ef;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
  }
  .card {
    background: #1f2937; border: 1px solid #374151; border-radius: 12px;
    padding: 2rem; width: 100%; max-width: 400px;
  }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.25rem; }
  .subtitle { color: #9ca3af; font-size: 0.875rem; margin-bottom: 1.5rem; }
  .client-name { color: #60a5fa; font-weight: 500; }
  label { display: block; font-size: 0.875rem; color: #d1d5db; margin-bottom: 0.375rem; }
  input[type="email"], input[type="password"] {
    width: 100%; padding: 0.625rem 0.75rem; background: #111827;
    border: 1px solid #374151; border-radius: 8px; color: #e0e4ef;
    font-size: 0.875rem; outline: none; transition: border-color 0.15s;
  }
  input:focus { border-color: #60a5fa; }
  .field { margin-bottom: 1rem; }
  button {
    width: 100%; padding: 0.625rem; background: #2563eb; color: #fff;
    border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 500;
    cursor: pointer; transition: opacity 0.15s;
  }
  button:hover { opacity: 0.9; }
  .error {
    background: #7f1d1d33; border: 1px solid #991b1b; border-radius: 8px;
    padding: 0.75rem; margin-bottom: 1rem; color: #fca5a5; font-size: 0.875rem;
  }
  .logo { text-align: center; margin-bottom: 1.5rem; font-size: 1.25rem; letter-spacing: -0.025em; }
  .logo span { color: #60a5fa; }
`;

export function renderLoginPage(sessionToken: string, clientName?: string, error?: string): string {
  const errorHtml = error
    ? `<div class="error">${escapeHtml(error)}</div>`
    : "";

  const clientLabel = clientName ? `<span class="client-name">${escapeHtml(clientName)}</span>` : "an application";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in — LearnForge</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="logo"><span>Learn</span>Forge</div>
    <h1>Sign in</h1>
    <p class="subtitle">Authorize ${clientLabel} to access your LearnForge account</p>
    ${errorHtml}
    <form method="POST" action="/mcp/login">
      <input type="hidden" name="session_token" value="${escapeHtml(sessionToken)}">
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required autocomplete="email" autofocus>
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password">
      </div>
      <button type="submit">Sign in &amp; authorize</button>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
