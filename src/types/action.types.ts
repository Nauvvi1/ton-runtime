export type ActionStatus =
  | "pending"
  | "running"
  | "retry_scheduled"
  | "waiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled";

export type AttemptStatus = "running" | "failed" | "succeeded";

export type TimelineEventType =
  | "action.created"
  | "action.started"
  | "attempt.started"
  | "attempt.failed"
  | "attempt.succeeded"
  | "attempt.retry_scheduled"
  | "ton.tx_submitted"
  | "ton.tx_confirmed"
  | "action.completed"
  | "action.failed"
  | "action.resumed"
  | "action.idempotent_reused";

export interface ActionRecord<TInput = unknown, TResult = unknown> {
  id: string;
  name: string;
  status: ActionStatus;
  idempotencyKey?: string;
  input?: TInput;
  metadata?: Record<string, unknown>;
  tags?: string[];
  result?: TResult;
  error?: SerializedError;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  attemptCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  confirmStrategy?: "submitted" | "confirmed";
  tonOperation?: TonOperationReference;
}

export interface AttemptRecord {
  id: string;
  actionId: string;
  number: number;
  status: AttemptStatus;
  startedAt: string;
  finishedAt?: string;
  error?: SerializedError;
  durationMs?: number;
}

export interface TimelineEvent {
  id: string;
  actionId: string;
  type: TimelineEventType;
  message: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface TonOperationReference {
  operationId: string;
  txHash?: string;
  network: string;
  status: "submitted" | "confirmed" | "failed" | "unknown";
  submittedAt: string;
}
