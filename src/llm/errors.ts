export class LlmTimeoutError extends Error {
  constructor(message = "LLM request timed out.") {
    super(message);
    this.name = "LlmTimeoutError";
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }

  if (error instanceof Error) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }

  return false;
}
