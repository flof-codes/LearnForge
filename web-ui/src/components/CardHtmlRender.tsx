import { useEffect, useRef, useCallback } from 'react';

interface CardHtmlRenderProps {
  html: string;
  interactive?: boolean;
  onInteraction?: (data: { type: string; value: unknown }) => void;
}

export default function CardHtmlRender({ html, interactive = false, onInteraction }: CardHtmlRenderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onInteractionRef = useRef(onInteraction);
  onInteractionRef.current = onInteraction; // eslint-disable-line react-hooks/refs

  const setupBridge = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- global bridge for card HTML
    const win = window as any;
    win.lfMcqToggle = (element: HTMLElement) => {
      onInteractionRef.current?.({ type: 'mcq-toggle', value: { text: element.textContent } });
    };
    win.lfMcqCheck = () => {
      onInteractionRef.current?.({ type: 'mcq-check', value: {} });
    };
    win.lfSliderUpdate = (name: string, value: number) => {
      onInteractionRef.current?.({ type: 'slider', value: { name, value } });
    };
    win.lfDragDrop = (sourceId: string, targetId: string) => {
      onInteractionRef.current?.({ type: 'dragdrop', value: { sourceId, targetId } });
    };
    win.lfOpenResponse = (text: string) => {
      onInteractionRef.current?.({ type: 'openresponse', value: { text } });
    };
  }, []);

  const cleanupBridge = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const keys = ['lfMcqToggle', 'lfMcqCheck', 'lfMcqSelect', 'lfSliderUpdate', 'lfDragDrop', 'lfOpenResponse'];
    for (const key of keys) {
      try { delete win[key]; } catch { win[key] = undefined; }
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (interactive) {
      setupBridge();
      container.innerHTML = html;

      // Separate external and inline scripts
      const scripts = Array.from(container.querySelectorAll('script'));
      const externalScripts = scripts.filter(s => s.src);
      const inlineScripts = scripts.filter(s => !s.src);

      // Load external scripts sequentially (they depend on each other, e.g. KaTeX + auto-render),
      // then execute inline scripts, then trigger DOMContentLoaded for scripts that listen for it.
      const loadExternal = (index: number) => {
        if (index >= externalScripts.length) {
          // All external scripts loaded — now run inline scripts
          inlineScripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            newScript.textContent = oldScript.textContent;
            oldScript.parentNode?.replaceChild(newScript, oldScript);
          });
          // Re-dispatch DOMContentLoaded so card scripts that listen for it can execute
          document.dispatchEvent(new Event('DOMContentLoaded'));
          return;
        }
        const oldScript = externalScripts[index];
        const newScript = document.createElement('script');
        newScript.src = oldScript.src;
        newScript.onload = () => loadExternal(index + 1);
        newScript.onerror = () => loadExternal(index + 1);
        oldScript.parentNode?.replaceChild(newScript, oldScript);
      };
      loadExternal(0);
    } else {
      // Static mode: strip scripts, but still try to render KaTeX if already loaded
      const temp = document.createElement('div');
      temp.innerHTML = html;
      temp.querySelectorAll('script').forEach(s => s.remove());
      container.innerHTML = temp.innerHTML;

      // If KaTeX was loaded by a previous interactive render, render math in static cards too
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      if (win.renderMathInElement) {
        win.renderMathInElement(container, {
          delimiters: [{ left: '$$', right: '$$', display: false }],
          throwOnError: false,
        });
      }
    }

    return () => {
      if (interactive) cleanupBridge();
      if (container) container.innerHTML = '';
    };
  }, [html, interactive, setupBridge, cleanupBridge]);

  return (
    <div
      ref={containerRef}
      className="card-html-render rounded-xl overflow-hidden"
      style={{ minHeight: '60px' }}
    />
  );
}
