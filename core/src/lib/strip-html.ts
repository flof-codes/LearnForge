/**
 * Zero-dependency HTML stripper for building embedding text.
 */

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function stripHtml(html: string): string {
  return (
    html
      // Remove <script>...</script> and <style>...</style> blocks
      .replace(/<script[\s>][\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s>][\s\S]*?<\/style>/gi, "")
      // Remove all remaining HTML tags
      .replace(/<[^>]*>/g, " ")
      // Decode named HTML entities
      .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITY_MAP[m] ?? m)
      // Decode numeric HTML entities
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      // Collapse whitespace and trim
      .replace(/\s+/g, " ")
      .trim()
  );
}
