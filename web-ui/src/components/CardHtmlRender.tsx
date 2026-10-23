import { useEffect, useRef, useState, useMemo } from 'react';
import api from '../api/client';
import { useTheme } from '../contexts/ThemeContext';
import FigureZoom from './FigureZoom';

interface CardHtmlRenderProps {
  html: string;
  interactive?: boolean;
  /**
   * Phone layout: the card's own <article> frame is flattened so the text runs
   * the full width of the frame. The stored card HTML is not changed.
   */
  flat?: boolean;
}

// The API signs media as relative /media/<id>/<sig>. The API may live under a
// path of the web app's own host (e.g. https://host/api), where a root-relative
// link would miss it, so every media link gets the full API address in front.
const API_BASE = (api.defaults.baseURL ?? '').replace(/\/+$/, '');

function resolveMediaLinks(html: string): string {
  return html.replace(/(["'(=\s])\/media\//g, `$1${API_BASE}/media/`);
}

// Wide content scrolls inside itself; the frame clips whatever sticks out.
// :where() keeps these at zero specificity, so a card's own rules still win.
// Figures (.lf-figure, see core lib/figures.ts) fit the width, a tall photo
// stays within about two thirds of the screen, and a picture opens large on a tap.
// --lf-vh is the app window's 1vh: inside the frame vh would follow the frame,
// which grows with its content.
const FIT_CSS = `
:where(img) { max-width: 100%; height: auto; }
:where(svg[viewBox]) { max-width: 100%; height: auto; }
:where(.lf-figure img) { max-height: calc(var(--lf-vh, 8px) * 65); object-fit: contain; }
.lf-zoomable { cursor: zoom-in; }
[data-theme="dark"] .lf-figure img { background: #fff; border-radius: 6px; }
[data-theme="dark"] .lf-figure svg :is([stroke="#000" i], [stroke="#000000" i], [stroke="black" i]) { stroke: currentColor; }
[data-theme="dark"] .lf-figure svg :is([fill="#000" i], [fill="#000000" i], [fill="black" i]) { fill: currentColor; }
:where(pre) { overflow-x: auto; }
.katex-display { overflow-x: auto; overflow-y: hidden; max-width: 100%; padding-block: 2px; }
.lf-xscroll { overflow-x: auto; max-width: 100%; }
`;

// Comes after the card's own styles so it wins at equal specificity.
// Pico draws <article> as a padded, bordered box. Zeroing its horizontal
// spacing variable also pulls the header and footer back in, which bleed to the
// box edge through negative margins.
const FLAT_CSS = `
:root { --pico-font-size: 100%; }
body { overflow-x: auto; overflow-y: hidden; }
body > article, body > main > article {
  --pico-block-spacing-horizontal: 0px;
  margin: 0 !important;
  padding-inline: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}
body > article > header, body > article > footer,
body > main > article > header, body > main > article > footer {
  background: transparent !important;
}
`;

function buildSrcdoc(html: string, theme: 'light' | 'dark', flat: boolean, vh: number): string {
  // data-theme makes Pico follow the app's theme switch instead of the system setting.
  // color-scheme has to match the app's (see index.css): a frame whose scheme
  // differs from its parent gets an opaque canvas instead of a transparent one,
  // and it gives cards without colours of their own readable default text.
  return `<!DOCTYPE html>
<html data-theme="${theme}"><head>
<meta charset="utf-8">
<style>
html { color-scheme: ${theme}; --lf-vh: ${vh}px; }
html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
</style>
</head><body>
${html}
<style>${FIT_CSS}${flat ? FLAT_CSS : ''}</style>
<script>
(function() {
  // A table wider than the card gets its own scroll box. Only those are touched,
  // so selectors in cards that already fit keep matching.
  function fitTables() {
    document.querySelectorAll('table').forEach(function(t) {
      var p = t.parentElement;
      if (!p || p.classList.contains('lf-xscroll')) return;
      if (t.offsetWidth <= p.clientWidth + 1) return;
      var w = document.createElement('div');
      w.className = 'lf-xscroll';
      p.insertBefore(w, t);
      w.appendChild(t);
    });
  }
  // Pictures open large on a tap: every figure, and images that are not part of a control.
  function zoomTarget(el) {
    var pic = el && el.closest ? el.closest('.lf-figure img, .lf-figure svg, img') : null;
    if (!pic || pic.closest('a, button, label, summary, [onclick], [data-no-zoom]')) return null;
    // A picture under positioned overlays (image occlusion masks) would show its answer alone.
    var box = pic.parentElement;
    if (box && box.children.length > 1 && getComputedStyle(box).position !== 'static') return null;
    if (pic.tagName.toLowerCase() === 'img' && !pic.closest('.lf-figure') && pic.naturalWidth > 0 && pic.naturalWidth < 48) return null;
    return pic;
  }
  function markZoomable() {
    document.querySelectorAll('.lf-figure img, .lf-figure svg, img').forEach(function(p) {
      if (zoomTarget(p) === p) p.classList.add('lf-zoomable');
    });
  }
  document.addEventListener('click', function(e) {
    var pic = zoomTarget(e.target);
    if (!pic) return;
    var plate = pic.tagName.toLowerCase() === 'img' && !!pic.closest('.lf-figure');
    parent.postMessage({ type: 'lf-zoom', html: pic.outerHTML, plate: plate }, '*');
  });
  function postHeight() {
    fitTables();
    markZoomable();
    parent.postMessage({ type: 'lf-resize', height: document.documentElement.scrollHeight }, '*');
  }
  new ResizeObserver(postHeight).observe(document.documentElement);
  postHeight();
})();
</script>
</body></html>`;
}

export default function CardHtmlRender({ html, flat = false }: CardHtmlRenderProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(60);
  const [zoom, setZoom] = useState<{ html: string; plate: boolean } | null>(null);
  const { resolvedTheme } = useTheme();

  const srcdoc = useMemo(
    () => buildSrcdoc(resolveMediaLinks(html), resolvedTheme, flat, window.innerHeight / 100),
    [html, resolvedTheme, flat],
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === 'lf-resize' && typeof event.data.height === 'number') {
        setHeight(event.data.height);
      }
      if (event.data?.type === 'lf-zoom' && typeof event.data.html === 'string' && event.data.html.length < 500_000) {
        setZoom({ html: event.data.html, plate: !!event.data.plate });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <>
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        className={`card-html-render ${flat ? '' : 'rounded-xl'}`}
        style={{ width: '100%', height: `${height}px`, border: 'none', display: 'block', minHeight: '60px' }}
      />
      {zoom && <FigureZoom html={zoom.html} plate={zoom.plate} onClose={() => setZoom(null)} />}
    </>
  );
}
