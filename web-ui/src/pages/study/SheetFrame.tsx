import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  /** A small label above the title. */
  eyebrow?: string;
  /** Room for diagrams: wider on desktop. */
  wide?: boolean;
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
}

/** A sheet from the bottom on a phone, a dialog in the middle from md up. */
export default function SheetFrame({ title, eyebrow, wide, closeLabel, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        className={`relative w-full max-h-[86dvh] overflow-y-auto bg-bg-primary rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4 md:rounded-xl md:border md:border-border md:p-6 ${wide ? 'md:w-[40rem]' : 'md:w-[32rem]'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <div className="text-[10px] uppercase tracking-wider text-text-muted">{eyebrow}</div>}
            <h3 className="text-lg font-medium leading-snug">{title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label={closeLabel ?? title} className="p-1 text-text-muted hover:text-text-primary"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
