import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api/client';
import {
  bounds, fmt, moved, newRect, parseOcclusionField, polygonPoints, serializeOcclusionField, type EditorShape,
} from '../lib/occlusion';

interface Props {
  /** The Occlusion field, Anki's syntax. */
  value: string;
  /** The Image field's HTML; its first <img> is drawn on. */
  imageHtml: string;
  onChange: (value: string) => void;
}

const API_BASE = (api.defaults.baseURL ?? '').replace(/\/+$/, '');
const MIN_SIZE = 0.01;

function imageSrc(html: string): string | null {
  const m = /<img[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(html);
  if (!m) return null;
  return m[1].startsWith('/media/') ? `${API_BASE}${m[1]}` : m[1];
}

type Drag =
  | { mode: 'draw'; x0: number; y0: number; x: number; y: number }
  | { mode: 'move'; id: number; x0: number; y0: number; start: EditorShape }
  | { mode: 'resize'; id: number; start: EditorShape };

/**
 * Mask editor for image occlusion notes: drag on the picture to draw a
 * rectangle, drag a mask to move it, the corner handle resizes a rectangle.
 * Masks with the same number are asked together on one card.
 */
export default function OcclusionEditor({ value, imageHtml, onChange }: Props) {
  const { t } = useTranslation('app');
  const [shapes, setShapes] = useState<EditorShape[]>(() => parseOcclusionField(value));
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [raw, setRaw] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastWritten = useRef(value);
  const src = imageSrc(imageHtml);
  const asked = shapes.filter(s => s.kind !== 'text');
  const hideAll = asked.length > 0 ? asked.every(s => s.props.oi === '1') : true;

  // A change typed into the raw field (or a reset of the form) re-reads the shapes.
  useEffect(() => {
    if (value !== lastWritten.current) {
      lastWritten.current = value;
      setShapes(parseOcclusionField(value));
    }
  }, [value]);

  const commit = (next: EditorShape[]) => {
    setShapes(next);
    const text = serializeOcclusionField(next);
    lastWritten.current = text;
    onChange(text);
  };

  const point = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const onStageDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const { x, y } = point(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelected(null);
    setDrag({ mode: 'draw', x0: x, y0: y, x, y });
  };

  const onShapeDown = (e: React.PointerEvent, s: EditorShape) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const { x, y } = point(e);
    stageRef.current!.setPointerCapture(e.pointerId);
    setSelected(s.id);
    setDrag({ mode: 'move', id: s.id, x0: x, y0: y, start: s });
  };

  const onHandleDown = (e: React.PointerEvent, s: EditorShape) => {
    e.stopPropagation();
    stageRef.current!.setPointerCapture(e.pointerId);
    setDrag({ mode: 'resize', id: s.id, start: s });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { x, y } = point(e);
    if (drag.mode === 'draw') setDrag({ ...drag, x, y });
    else if (drag.mode === 'move') setShapes(prev => prev.map(s => (s.id === drag.id ? moved(drag.start, x - drag.x0, y - drag.y0) : s)));
    else {
      const b = bounds(drag.start);
      setShapes(prev => prev.map(s => (s.id === drag.id
        ? { ...s, props: { ...s.props, width: fmt(Math.max(MIN_SIZE, x - b.left)), height: fmt(Math.max(MIN_SIZE, y - b.top)) } }
        : s)));
    }
  };

  const onUp = () => {
    if (!drag) return;
    if (drag.mode === 'draw') {
      const left = Math.min(drag.x0, drag.x), top = Math.min(drag.y0, drag.y);
      const width = Math.abs(drag.x - drag.x0), height = Math.abs(drag.y - drag.y0);
      if (width >= MIN_SIZE && height >= MIN_SIZE) {
        const ordinal = Math.max(0, ...shapes.map(s => s.ordinal)) + 1;
        const rect = newRect(ordinal, left, top, width, height, hideAll);
        commit([...shapes, rect]);
        setSelected(rect.id);
      }
    } else {
      commit(shapes);
    }
    setDrag(null);
  };

  const current = shapes.find(s => s.id === selected) ?? null;
  const update = (id: number, change: Partial<EditorShape>) => commit(shapes.map(s => (s.id === id ? { ...s, ...change } : s)));
  const remove = (id: number) => { commit(shapes.filter(s => s.id !== id)); setSelected(null); };
  const setHideAll = (on: boolean) => commit(shapes.map(s => {
    if (s.kind === 'text') return s;
    const props = { ...s.props };
    if (on) props.oi = '1'; else delete props.oi;
    return { ...s, props };
  }));

  const cards = useMemo(() => [...new Set(asked.map(s => s.ordinal))].sort((a, b) => a - b), [asked]);
  const draft = drag?.mode === 'draw'
    ? { left: Math.min(drag.x0, drag.x), top: Math.min(drag.y0, drag.y), width: Math.abs(drag.x - drag.x0), height: Math.abs(drag.y - drag.y0) }
    : null;
  const pct = (n: number) => `${n * 100}%`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-text-muted">{t('occlusionEditor.cards', { count: cards.length })}</span>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={hideAll} onChange={e => setHideAll(e.target.checked)} />
          {t('occlusionEditor.hideAll')}
        </label>
        <button type="button" className="text-accent-blue hover:underline" onClick={() => setRaw(!raw)}>
          {raw ? t('occlusionEditor.showEditor') : t('occlusionEditor.showText')}
        </button>
      </div>

      {raw || !src ? (
        <>
          {!src && <p className="text-sm text-text-muted">{t('occlusionEditor.noImage')}</p>}
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-text-primary text-xs font-mono focus:outline-none focus:border-accent-blue resize-y"
          />
        </>
      ) : (
        <>
          <p className="text-xs text-text-muted">{t('occlusionEditor.help')}</p>
          <div
            ref={stageRef}
            className="relative select-none -mx-4 md:mx-0"
            style={{ touchAction: 'none', cursor: 'crosshair' }}
            onPointerDown={onStageDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <img src={src} alt="" draggable={false} className="block w-full h-auto pointer-events-none" />
            {shapes.map(s => {
              const b = bounds(s);
              const isSel = s.id === selected;
              const base = 'absolute flex items-center justify-center text-[11px] font-semibold leading-none';
              const color = s.kind === 'text' ? 'bg-white/90 text-black' : isSel ? 'bg-[#ff8e8e]/85 text-black' : 'bg-[#ffeba2]/85 text-black';
              return (
                <div
                  key={s.id}
                  onPointerDown={e => onShapeDown(e, s)}
                  className={`${base} ${color} ${isSel ? 'outline outline-2 outline-accent-blue' : 'outline outline-1 outline-[#212121]'}`}
                  style={{
                    left: pct(b.left), top: pct(b.top), width: pct(b.width), height: pct(b.height),
                    borderRadius: s.kind === 'ellipse' ? '50%' : undefined,
                    clipPath: s.kind === 'polygon' ? polygonClip(s.props.points, b) : undefined,
                    cursor: 'move',
                  }}
                >
                  {s.kind === 'text' ? s.props.text : s.ordinal}
                  {isSel && s.kind === 'rect' && (
                    <span
                      onPointerDown={e => onHandleDown(e, s)}
                      className="absolute -right-2 -bottom-2 w-4 h-4 rounded-full bg-accent-blue border-2 border-white"
                      style={{ cursor: 'nwse-resize' }}
                    />
                  )}
                </div>
              );
            })}
            {draft && (
              <div className="absolute border-2 border-dashed border-accent-blue bg-accent-blue/10"
                style={{ left: pct(draft.left), top: pct(draft.top), width: pct(draft.width), height: pct(draft.height) }} />
            )}
          </div>

          {current && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {current.kind !== 'text' && (
                <label className="inline-flex items-center gap-2">
                  {t('occlusionEditor.card')}
                  <input
                    type="number" min={1} max={500} value={current.ordinal}
                    onChange={e => update(current.id, { ordinal: Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 1)) })}
                    className="w-16 px-2 py-1 rounded bg-bg-surface border border-border text-text-primary"
                  />
                </label>
              )}
              <span className="text-xs text-text-muted">{t('occlusionEditor.sameNumber')}</span>
              <button type="button" onClick={() => remove(current.id)} className="ml-auto text-red-500 hover:underline">
                {t('occlusionEditor.delete')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** A polygon's outline as a CSS clip path inside its own bounding box. */
function polygonClip(points: string | undefined, box: { width: number; height: number }): string {
  const pts = polygonPoints(points);
  const minX = Math.min(...pts.map(p => p[0])), minY = Math.min(...pts.map(p => p[1]));
  return `polygon(${pts.map(([x, y]) => `${((x - minX) / (box.width || 1)) * 100}% ${((y - minY) / (box.height || 1)) * 100}%`).join(',')})`;
}
