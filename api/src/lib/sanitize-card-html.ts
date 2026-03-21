import { ValidationError } from "./errors.js";

const MAX_HTML_SIZE = 100 * 1024; // 100KB

export function validateCardHtml(html: string, fieldName: string): void {
  if (new TextEncoder().encode(html).length > MAX_HTML_SIZE) {
    throw new ValidationError(`${fieldName} exceeds maximum size of 100KB`);
  }
}
