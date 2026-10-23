/**
 * Anki's image occlusion syntax for the mask editor. The server's parser
 * (core/src/lib/image-occlusion.ts) is the reference; this reads and writes
 * the same text: {{cN::image-occlusion:rect:left=.1:top=.2:width=.3:height=.1:oi=1}}
 */

export type OcclusionKind = 'rect' | 'ellipse' | 'polygon' | 'text';

export interface EditorShape {
  id: number;
  ordinal: number;
  /** Further card numbers of a shape on several cards (`{{c1,2::…}}`); kept as they are. */
  alsoOn: number[];
  kind: OcclusionKind;
  props: Record<string, string>;
}

const PREFIX = 'image-occlusion:';
const KINDS: OcclusionKind[] = ['rect', 'ellipse', 'polygon', 'text'];
let nextId = 1;

function parseProps(text: string): Record<string, string> {
  const props: Record<string, string> = {};
  let i = 0;
  while (i < text.length && text[i] === ':') {
    const eq = text.indexOf('=', i + 1);
    if (eq < 0) break;
    const name = text.slice(i + 1, eq);
    let value = '';
    let j = eq + 1;
    while (j < text.length && text[j] !== ':') {
      if (text[j] === '\\' && (text[j + 1] === '\\' || text[j + 1] === ':')) { value += text[j + 1]; j += 2; continue; }
      if (text[j] === '\\') break;
      value += text[j++];
    }
    props[name] = value;
    i = j;
  }
  return props;
}

/** Shapes of an Occlusion field; anything that is not a shape is dropped. */
export function parseOcclusionField(field: string): EditorShape[] {
  const out: EditorShape[] = [];
  const re = /\{\{c(\d+(?:\s*,\s*\d+)*)::image-occlusion:((?:(?!\}\})[\s\S])*)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(field)) !== null) {
    const [ordinal, ...alsoOn] = m[1].split(',').map(n => parseInt(n.trim(), 10));
    const body = m[2];
    const colon = body.indexOf(':');
    const kind = (colon < 0 ? body : body.slice(0, colon)) as OcclusionKind;
    if (!KINDS.includes(kind)) continue;
    out.push({ id: nextId++, ordinal, alsoOn, kind, props: colon < 0 ? {} : parseProps(body.slice(colon)) });
  }
  return out;
}

/** Anki's floatToDisplay: up to 4 decimals, no leading zero. */
export function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '.0000';
  return n.toFixed(4).replace(/^(-?)0+/, '$1').replace(/0+$/, '').replace(/\.$/, '');
}

export function serializeOcclusionField(shapes: EditorShape[]): string {
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
  return [...shapes]
    .sort((a, b) => a.ordinal - b.ordinal || a.id - b.id)
    .map(s => `{{c${[s.ordinal, ...s.alsoOn].join(',')}::${PREFIX}${s.kind}${Object.entries(s.props).map(([k, v]) => `:${k}=${esc(v)}`).join('')}}}`)
    .join('<br>');
}

export const num = (v: string | undefined) => (v === undefined || v === '' ? 0 : Number(v) || 0);

export function polygonPoints(v: string | undefined): Array<[number, number]> {
  return (v ?? '').split(' ').flatMap(p => {
    const [x, y] = p.split(',').map(Number);
    return Number.isFinite(x) && Number.isFinite(y) ? [[x, y] as [number, number]] : [];
  });
}

/** Bounding box of a shape as fractions of the image. */
export function bounds(s: EditorShape): { left: number; top: number; width: number; height: number } {
  const p = s.props;
  if (s.kind === 'rect') return { left: num(p.left), top: num(p.top), width: num(p.width), height: num(p.height) };
  if (s.kind === 'ellipse') return { left: num(p.left), top: num(p.top), width: 2 * num(p.rx), height: 2 * num(p.ry) };
  if (s.kind === 'polygon') {
    const pts = polygonPoints(p.points);
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const dx = p.left ? num(p.left) - minX : 0, dy = p.top ? num(p.top) - minY : 0;
    return { left: minX + dx, top: minY + dy, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
  }
  return { left: num(p.left), top: num(p.top), width: 0.12, height: 0.05 };
}

/** The shape moved by (dx, dy). */
export function moved(s: EditorShape, dx: number, dy: number): EditorShape {
  const p = { ...s.props };
  if (s.kind === 'polygon') {
    p.points = polygonPoints(p.points).map(([x, y]) => `${fmt(x + dx)},${fmt(y + dy)}`).join(' ');
    if (p.left) p.left = fmt(num(p.left) + dx);
    if (p.top) p.top = fmt(num(p.top) + dy);
  } else {
    p.left = fmt(num(p.left) + dx);
    p.top = fmt(num(p.top) + dy);
  }
  return { ...s, props: p };
}

export function newRect(ordinal: number, left: number, top: number, width: number, height: number, oi: boolean): EditorShape {
  const props: Record<string, string> = { left: fmt(left), top: fmt(top), width: fmt(width), height: fmt(height) };
  if (oi) props.oi = '1';
  return { id: nextId++, ordinal, alsoOn: [], kind: 'rect', props };
}
