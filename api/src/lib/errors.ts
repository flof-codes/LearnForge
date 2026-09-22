// Core errors (NotFoundError, ValidationError) are re-exported from @learnforge/core
export { NotFoundError, ValidationError } from "@learnforge/core";

// HTTP-specific errors (only used in API)
export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  /** Machine-readable discriminator, e.g. TOKEN_REVOKED so a device can drop a stored token. */
  readonly code?: string;
  constructor(message = "Unauthorized", code?: string) {
    super(message);
    this.name = "UnauthorizedError";
    this.code = code;
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  /**
   * Machine-readable discriminator. The web UI has to tell "trial expired" and
   * "e-mail not verified" apart to show the right call to action, and both are
   * plain 403s on the same routes.
   */
  readonly code?: string;
  constructor(message = "Forbidden", code?: string) {
    super(message);
    this.name = "ForbiddenError";
    this.code = code;
  }
}
