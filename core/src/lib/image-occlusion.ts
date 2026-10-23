import { ValidationError } from "./errors.js";

/**
 * Anki's image occlusion syntax, as written by Anki 23.10+ into the
 * `Occlusion` field of its stock "Image Occlusion" note type:
 *
 *   {{c1::image-occlusion:rect:left=.3762:top=.52:width=.114:height=.052:oi=1}}
 *
 * The cloze number is the card; several shapes may share one. Positions and
 * sizes are fractions (0–1) of the image. Shapes: `rect` (left, top, width,
 * height), `ellipse` (left, top = bounding box corner; rx, ry as fractions of
 * width and height), `polygon` (points "x,y x,y …"; left/top move its bounding
 * box), `text` (a label drawn on the image, cloze number 0, never asked).
 * Optional: `angle` (rotation in 1/10000 turns, around left/top), `fill`, and
 * `oi=1` ("hide all, guess one": the other shapes stay covered too).
 * Values escape `\` and `:` with a backslash. Mirrors rslib/src/image_occlusion
 * and ts/routes/image-occlusion in Anki.
 */

export const OCCLUSION_PREFIX = "image-occlusion:";
export const OCCLUSION_SHAPES = ["rect", "ellipse", "polygon", "text"] as const;
export type OcclusionShapeKind = typeof OCCLUSION_SHAPES[number];

export interface OcclusionShape {
  shape: string;
  props: Record<string, string>;
}

/** Parses the text after `image-occlusion:`; null when it has no shape name. Unknown names are kept, as Anki does. */
export function parseOcclusionShape(text: string): OcclusionShape | null {
  const colon = text.indexOf(":");
  if (colon < 0) return null;
  const shape = text.slice(0, colon);
  const props: Record<string, string> = {};
  let i = colon;
  while (i < text.length && text[i] === ":") {
    const eq = text.indexOf("=", i + 1);
    if (eq < 0) break;
    const name = text.slice(i + 1, eq);
    let value = "";
    let j = eq + 1;
    while (j < text.length && text[j] !== ":") {
      if (text[j] === "\\" && (text[j + 1] === "\\" || text[j + 1] === ":")) { value += text[j + 1]; j += 2; continue; }
      if (text[j] === "\\") break; // a lone backslash ends parsing, as in Anki
      value += text[j++];
    }
    props[name] = value;
    i = j;
  }
  return { shape, props };
}

/** Writes one shape back into Anki's syntax. */
export function occlusionToCloze(ordinal: number, shape: OcclusionShape): string {
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
  const props = Object.entries(shape.props).map(([k, v]) => `:${k}=${esc(v)}`).join("");
  return `{{c${ordinal}::${OCCLUSION_PREFIX}${shape.shape}${props}}}`;
}

const num = (v: string | undefined, fallback = 0) => {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function polygonPoints(value: string | undefined): Array<[number, number]> {
  return (value ?? "").split(" ").flatMap(pair => {
    const [x, y] = pair.split(",");
    if (x === undefined || y === undefined) return [];
    const px = Number(x), py = Number(y);
    return Number.isFinite(px) && Number.isFinite(py) ? [[px, py] as [number, number]] : [];
  });
}

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pct = (n: number) => `${+(n * 100).toFixed(4)}%`;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\))$/i;

/** Anki stores angles in 1/10000 turns. */
const storedAngleToDeg = (v: string | undefined) => (num(v) % 10000) / 10000 * 360;

/**
 * Renders one occlusion span the way Anki's cloze renderer does — a `<div>`
 * with the class `cloze` (asked, front), `cloze-highlight` (asked, back) or
 * `cloze-inactive` and Anki's `data-*` attributes — plus inline percentages,
 * so the shape sits on the image with CSS alone and scales with it.
 */
export function renderOcclusionSpan(text: string, ordinals: number[], active: boolean, back: boolean): string {
  const parsed = parseOcclusionShape(text);
  if (!parsed || !(OCCLUSION_SHAPES as readonly string[]).includes(parsed.shape)) return "";
  const { shape, props } = parsed;
  const cls = (!back && active) || ordinals.includes(0) ? "cloze" : !active ? "cloze-inactive" : "cloze-highlight";

  const data: string[] = [`data-ordinal="${ordinals.join(",")}"`, `data-shape="${shape}"`];
  for (const k of ["left", "top", "width", "height", "rx", "ry", "points", "angle", "fill", "text", "scale"]) {
    if (props[k]) data.push(`data-${k}="${escAttr(props[k])}"`);
  }
  if (props.oi) data.push(`data-occludeinactive="${escAttr(props.oi)}"`);
  if (props.fs) data.push(`data-font-size="${escAttr(props.fs)}"`);

  const left = num(props.left), top = num(props.top);
  const style: string[] = [];
  const fill = props.fill && SAFE_COLOR.test(props.fill) ? props.fill : null;
  if (fill) style.push(`--io-fill:${fill}`);
  const angle = storedAngleToDeg(props.angle);
  const rotate = angle ? `;transform:rotate(${+angle.toFixed(3)}deg)` : "";
  let inner = "";
  if (shape === "rect") {
    style.push(`left:${pct(left)};top:${pct(top)};width:${pct(num(props.width))};height:${pct(num(props.height))}${rotate}`);
  } else if (shape === "ellipse") {
    style.push(`left:${pct(left)};top:${pct(top)};width:${pct(2 * num(props.rx))};height:${pct(2 * num(props.ry))}${rotate}`);
  } else if (shape === "polygon") {
    const points = polygonPoints(props.points);
    if (points.length < 3) return "";
    // Anki moves the polygon so its bounding box starts at left/top.
    const minX = Math.min(...points.map(p => p[0])), minY = Math.min(...points.map(p => p[1]));
    const dx = props.left ? left - minX : 0, dy = props.top ? top - minY : 0;
    const pts = points.map(([x, y]) => `${+(x + dx).toFixed(5)},${+(y + dy).toFixed(5)}`).join(" ");
    inner = `<svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"><polygon points="${pts}"/></svg>`;
  } else {
    const scale = num(props.scale, 1) || 1;
    style.push(`left:${pct(left)};top:${pct(top)};--io-fs:${+(num(props.fs, 0.04) * scale).toFixed(5)}${rotate}`);
    inner = escAttr(props.text ?? "").replace(/\n/g, "<br>");
  }
  return `<div class="${cls}" ${data.join(" ")}${style.length ? ` style="${style.join(";")}"` : ""}>${inner}</div>`;
}

export interface ParsedOcclusion { ordinals: number[]; shape: OcclusionShape }

/** Validates an `Occlusion` field written by a client: known shapes, numbers in 0–1, at least one asked shape. */
export function validateOcclusionField(shapes: ParsedOcclusion[]): void {
  const inRange = (v: string | undefined, name: string, required: boolean) => {
    if (v === undefined || v === "") {
      if (required) throw new ValidationError(`Occlusion: ${name} is required`);
      return;
    }
    const n = Number(v);
    // A little slack: Anki lets a shape hang over the image edge.
    if (!Number.isFinite(n) || n < -0.5 || n > 1.5) throw new ValidationError(`Occlusion: ${name}=${v} must be a fraction of the image (0–1)`);
  };
  let asked = 0;
  for (const { ordinals, shape } of shapes) {
    const p = shape.props;
    if (!(OCCLUSION_SHAPES as readonly string[]).includes(shape.shape)) throw new ValidationError(`Occlusion: unknown shape "${shape.shape}"`);
    if (shape.shape === "rect") for (const k of ["left", "top", "width", "height"]) inRange(p[k], k, true);
    if (shape.shape === "ellipse") for (const k of ["left", "top", "rx", "ry"]) inRange(p[k], k, true);
    if (shape.shape === "polygon") {
      const pts = polygonPoints(p.points);
      if (pts.length < 3) throw new ValidationError("Occlusion: a polygon needs at least three points");
      for (const [x, y] of pts) { inRange(String(x), "points", true); inRange(String(y), "points", true); }
    }
    if (shape.shape === "text") { inRange(p.left, "left", true); inRange(p.top, "top", true); continue; }
    if (ordinals.some(n => n > 0)) asked++;
  }
  if (asked === 0) throw new ValidationError("Occlusion: at least one shape {{c1::image-occlusion:…}} is required");
}
