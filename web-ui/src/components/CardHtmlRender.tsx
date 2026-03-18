import { useEffect, useRef, useState, useMemo } from 'react';

interface CardHtmlRenderProps {
  html: string;
  interactive?: boolean;
}

function buildSrcdoc(html: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
</style>
</head><body>
${html}
<script>
(function() {
  function postHeight() {
    parent.postMessage({ type: 'lf-resize', height: document.documentElement.scrollHeight }, '*');
  }
  new ResizeObserver(postHeight).observe(document.documentElement);
  postHeight();
})();
</script>
</body></html>`;
}

export default function CardHtmlRender({ html }: CardHtmlRenderProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(60);

  const srcdoc = useMemo(() => buildSrcdoc(html), [html]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === 'lf-resize' && typeof event.data.height === 'number') {
        setHeight(event.data.height);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      srcDoc={srcdoc}
      className="card-html-render rounded-xl"
      style={{ width: '100%', height: `${height}px`, border: 'none', display: 'block', minHeight: '60px' }}
    />
  );
}
