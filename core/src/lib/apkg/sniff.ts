/**
 * The media type of an imported file, decided by its bytes and never by its
 * name alone. Text assets (CSS, JS) are only recognised by extension and only
 * when the bytes look like text. Anything else is stored as
 * application/octet-stream: kept for a lossless round trip, never rendered.
 */

const startsWith = (b: Buffer, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString("latin1");

function looksLikeText(b: Buffer): boolean {
  const sample = b.subarray(0, 4096);
  return !sample.includes(0);
}

export function sniffMediaType(bytes: Buffer, filename: string): string {
  const b = bytes;
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE") return "audio/wav";
  if (ascii(b, 0, 2) === "BM" && b.length > 14) return "image/bmp";
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) return "image/tiff";
  if (ascii(b, 4, 8) === "ftyp") {
    const brand = ascii(b, 8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand.startsWith("M4A") || brand === "M4B ") return "audio/mp4";
    return "video/mp4";
  }
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return ext === "weba" ? "audio/webm" : "video/webm";
  if (ascii(b, 0, 4) === "OggS") return ext === "ogv" ? "video/ogg" : "audio/ogg";
  if (ascii(b, 0, 4) === "fLaC") return "audio/flac";
  if (ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (ascii(b, 0, 4) === "wOFF") return "font/woff";
  if (ascii(b, 0, 4) === "wOF2") return "font/woff2";
  if (startsWith(b, [0x00, 0x01, 0x00, 0x00]) || ascii(b, 0, 4) === "true") return "font/ttf";
  if (ascii(b, 0, 4) === "OTTO") return "font/otf";
  if (looksLikeText(b)) {
    const head = ascii(b, 0, 1024).trimStart().toLowerCase();
    if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
    if (ext === "css") return "text/css";
    if (ext === "js" || ext === "mjs") return "text/javascript";
  }
  return "application/octet-stream";
}

