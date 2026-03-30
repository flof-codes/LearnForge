import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, 'dist');

const ROUTES = [
  '/',
  '/docs',
  '/impressum',
  '/datenschutz',
  '/agb',
  '/privacy',
  '/terms',
  '/imprint',
];

// In React 19 + react-helmet-async v3, helmet tags are rendered inline
// at the start of the React tree output. Extract them and move to <head>.
function extractHeadTags(html) {
  const headTags = [];
  let remaining = html;

  // Extract all tags that should be in <head> from the beginning of the HTML
  // These appear before the actual component markup (which starts with <div or <header)
  const headTagPattern = /^(<title[^>]*>.*?<\/title>|<meta\s[^>]*\/?>|<link\s[^>]*\/?>|<script\s+type="application\/ld\+json"[^>]*>.*?<\/script>)/s;

  while (true) {
    const match = remaining.match(headTagPattern);
    if (!match) break;
    headTags.push(match[1]);
    remaining = remaining.slice(match[0].length);
  }

  return { headTags, bodyHtml: remaining };
}

async function prerender() {
  const template = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
  const { render } = await import(resolve(distDir, 'server', 'entry-server.js'));

  for (const route of ROUTES) {
    const { html } = render(route);
    const { headTags, bodyHtml } = extractHeadTags(html);

    let page = template;

    if (headTags.length > 0) {
      // Find and replace <title> in template with the SSR-rendered one
      const ssrTitle = headTags.find(t => t.startsWith('<title'));
      if (ssrTitle) {
        page = page.replace(/<title>.*?<\/title>/, ssrTitle);
      }

      // Remove existing meta description, OG/Twitter tags and their surrounding comments
      page = page.replace(/\s*<meta\s+name="description"[^>]*\/?>/g, '');
      page = page.replace(/\s*<meta\s+property="og:[^"]*"[^>]*\/?>/g, '');
      page = page.replace(/\s*<meta\s+name="twitter:[^"]*"[^>]*\/?>/g, '');
      page = page.replace(/\s*<!-- Open Graph -->\s*/g, '\n');
      page = page.replace(/\s*<!-- Twitter Card -->\s*/g, '\n');
      // Collapse multiple blank lines
      page = page.replace(/\n{3,}/g, '\n\n');

      // Inject SSR meta/link/script tags (excluding title, already handled) before </head>
      const extraTags = headTags.filter(t => !t.startsWith('<title')).join('\n    ');
      if (extraTags) {
        page = page.replace('</head>', `    ${extraTags}\n  </head>`);
      }
    }

    // Inject rendered body HTML into root div with server-rendered marker
    page = page.replace(
      '<div id="root"></div>',
      `<div id="root" data-server-rendered="true">${bodyHtml}</div>`,
    );

    // Write to appropriate path
    if (route === '/') {
      writeFileSync(resolve(distDir, 'index.html'), page);
      console.log(`  Pre-rendered: / -> index.html (${headTags.length} head tags)`);
    } else {
      const dir = resolve(distDir, route.slice(1));
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, 'index.html'), page);
      console.log(`  Pre-rendered: ${route} -> ${route.slice(1)}/index.html (${headTags.length} head tags)`);
    }
  }

  console.log(`\nPre-rendered ${ROUTES.length} routes successfully.`);
}

prerender().catch((err) => {
  console.error('Pre-rendering failed:', err);
  process.exit(1);
});
