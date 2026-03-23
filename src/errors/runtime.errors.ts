export class RuntimeError extends Error {
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  public constructor(message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;

    if (code !== undefined) {
      this.code = code;
    }

    if (details !== undefined) {
      this.details = details;
    }
  }
}

export class RetryableError extends RuntimeError {}
export class NonRetryableError extends RuntimeError {}
export class ValidationError extends NonRetryableError {}
export class TonTemporaryNetworkError extends RetryableError {}
export class TonTransactionPendingError extends RetryableError {}