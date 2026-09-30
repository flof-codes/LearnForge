import type { AttachedImage } from "@learnforge/core";

/**
 * A tool result with the card's pictures as MCP image blocks after the JSON
 * text, so the tutor can see what the learner sees. Audio and other files are
 * only listed in the JSON (`media`); a chat cannot play them.
 */
export function withCardMedia(payload: unknown, images: AttachedImage[]) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
      ...images.map(img => ({ type: "image" as const, data: img.base64, mimeType: img.mimeType })),
    ],
  };
}
