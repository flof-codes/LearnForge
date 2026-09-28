/** File extension on disk per stored media type. Files are named `<id><ext>`; the route that serves them uses the same map. */
const EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tif",
  "image/avif": ".avif",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/webm": ".weba",
  "audio/flac": ".flac",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
  "font/woff": ".woff",
  "font/woff2": ".woff2",
  "font/ttf": ".ttf",
  "font/otf": ".otf",
  "text/css": ".css",
  "text/javascript": ".js",
  "application/octet-stream": ".bin",
};

export function extFromMime(mime: string): string {
  return EXTENSIONS[mime] ?? "";
}
