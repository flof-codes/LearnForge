/**
 * Anki fields, templates and CSS name media by filename (`<img src="a b.png">`,
 * `[sound:x.mp3]`, `url("_font.woff2")`). Import stores each file once and
 * rewrites every reference to `/images/<id>`, the form LearnForge keeps in the
 * database. Names are compared after undoing the encodings Anki's editor and
 * exporters use: HTML entities, percent-encoding and Unicode normalization.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

export function normalizeMediaName(ref: string): string {
  let s = decodeEntities(ref.trim());
  try {
    s = decodeURIComponent(s);
  } catch {
    /* a literal % stays as it is */
  }
  return s.normalize("NFC");
}

const isExternal = (v: string) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(v.trim());

export type MediaLookup = (normalizedName: string) => string | undefined;

/** `/images/<id>` for a known file, undefined otherwise. */
function urlFor(ref: string, lookup: MediaLookup): string | undefined {
  if (!ref || isExternal(ref)) return undefined;
  const id = lookup(normalizeMediaName(ref));
  return id ? `/images/${id}` : undefined;
}

/**
 * Rewrites media references in HTML or CSS. `[sound:x]` becomes an audio
 * element; unknown names and external URLs are left untouched. Returns the
 * new text and the ids that were referenced.
 */
export function rewriteMediaRefs(text: string, lookup: MediaLookup): { text: string; used: Set<string> } {
  const used = new Set<string>();
  const hit = (url: string) => { used.add(url.slice("/images/".length)); return url; };

  let out = text.replace(/\[sound:([^\]]+)\]/g, (whole, name: string) => {
    const url = urlFor(name, lookup);
    return url ? `<audio controls src="${hit(url)}"></audio>` : whole;
  });
  out = out.replace(/(\b(?:src|href|data|poster)\s*=\s*)(["'])([^"']*)\2/gi, (whole, attr: string, q: string, value: string) => {
    const url = urlFor(value, lookup);
    return url ? `${attr}${q}${hit(url)}${q}` : whole;
  });
  out = out.replace(/(\b(?:src|href)\s*=\s*)([^\s"'<>=`]+)/gi, (whole, attr: string, value: string) => {
    const url = urlFor(value, lookup);
    return url ? `${attr}"${hit(url)}"` : whole;
  });
  out = out.replace(/\burl\(\s*(["']?)([^"')]+)\1\s*\)/gi, (whole, q: string, value: string) => {
    const url = urlFor(value, lookup);
    return url ? `url(${q}${hit(url)}${q})` : whole;
  });
  return { text: out, used };
}
