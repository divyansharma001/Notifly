import { UnrecoverableError } from "bullmq";

// A send failure that retrying cannot fix — a bad recipient, a rejected payload,
// a missing/invalid API key. Subclassing BullMQ's UnrecoverableError means the
// moment a provider throws this, BullMQ STOPS retrying and fails the job on this
// attempt (no waiting out all 5 attempts on something doomed to fail identically).
//
// The subclass (rather than sniffing err.name) gives the worker a type-safe
// `err instanceof PermanentError` signal so it can mark the row `failed`
// immediately instead of the misleading `retrying`.
export class PermanentError extends UnrecoverableError {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}
