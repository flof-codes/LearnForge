import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  /** One picture's markup from a card frame: an <img> with a resolved src, or an inline <svg>. */
  html: string;
  /** A figure image gets a white plate in dark mode, as in the card, so black lines stay readable. */
  plate?: boolean;
  onClose: () => void;
}

/**
 * A picture from a card, as large as the screen allows. The markup comes from
 * the card frame, so it is shown in a frame of its own with scripts off.
 */
export default function FigureZoom({ html, plate = false, onClose }: Props) {
  const { t } = useTranslation('app');
  const { resolvedTheme } = useTheme();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    // Capture phase: the study views listen for keys on the window as well.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus();
    };
  }, [onClose]);

  // A wide drawing on a narrow screen gains nothing from fitting it again: it is drawn twice the width and pans sideways.
  const viewBox = /^\s*<svg[^>]*\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(html);
  const wide = !!viewBox && Number(viewBox[1]) > 1.6 * Number(viewBox[2]);
  const srcdoc = `<!DOCTYPE html><html data-theme="${resolvedTheme}"><head><meta charset="utf-8"><style>
html { color-scheme: ${resolvedTheme}; }
body { margin: 0; min-height: 100vh; display: grid; place-items: safe center; padding: 12px; box-sizing: border-box; background: transparent; overflow: auto; }
img, svg { display: block; max-width: 100%; max-height: calc(100vh - 24px); width: auto; height: auto; }
svg { width: 100%; }
${wide ? '@media (max-width: 700px) { svg { width: 200vw; max-width: none; } }' : ''}
${plate && resolvedTheme === 'dark' ? 'img { background: #fff; border-radius: 8px; }' : ''}
</style></head><body>${html}</body></html>`;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('figure.zoomTitle')} className="fixed inset-0 z-[100] flex flex-col bg-bg-primary">
      <div className="flex justify-end px-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="p-2.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover"
          aria-label={t('figure.close')}
        >
          <X size={22} />
        </button>
      </div>
      <iframe sandbox="" srcDoc={srcdoc} title={t('figure.zoomTitle')} className="flex-1 w-full border-0 pb-[env(safe-area-inset-bottom)]" />
    </div>,
    document.body,
  );
}
