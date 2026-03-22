// Core errors (NotFoundError, ValidationError) are re-exported from @learnforge/core
export { NotFoundError, ValidationError } from "@learnforge/core";

// HTTP-specific errors (only used in API)
export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}
