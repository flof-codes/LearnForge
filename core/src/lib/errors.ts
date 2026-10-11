export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * A study ticket that was valid when it was served and no longer is: the card
 * was answered somewhere else, or its question was replaced. A client drops
 * the card and goes on; `code` lets it tell this from a real mistake.
 */
export class StaleTicketError extends ValidationError {
  readonly code = "QUESTION_STALE";
  constructor(message: string) {
    super(message);
    this.name = "StaleTicketError";
  }
}
