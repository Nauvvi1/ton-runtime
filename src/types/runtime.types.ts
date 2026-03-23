import type { Logger } from "pino";
import type { ActionRecord, AttemptRecord, TimelineEvent } from "./action.types.js";
import type { RuntimeStorage } from "../storage/storage.interface.js";
import type { TonAdapter, TonSendParams, TonSendResult } from "../ton/ton-adapter.interface.js";

export type BackoffStrategy = "fixed" | "exponential";

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  strategy: BackoffStrategy;
  jitter?: boolean;
}

export interface ExecutionConfig {
  resumeOnStartup?: boolean;
  actionTimeoutMs?: number;
  pollIntervalMs?: number;
  concurrency?: number;
}

export interface SafetyConfig {
  dryRun: boolean;
  maxSendTon: string;
  allowedNetworks?: string[];
  validateAddresses?: boolean;
  requireIdempotencyForTonActions?: boolean;
}

export interface TonRuntimeConfig {
  storage: RuntimeStorage;
  tonAdapter: TonAdapter;
  logger?: Logger;
  retry: RetryConfig;
  execution?: ExecutionConfig;
  metrics?: {
    enabled?: boolean;
  };
  safety: SafetyConfig;
}

export interface ExecuteOptions<TInput = unknown> {
  idempotencyKey?: string;
  input?: TInput;
  maxRetries?: number;
  timeoutMs?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  confirmStrategy?: "submitted" | "confirmed";
  retryPolicy?: Partial<RetryConfig>;
}

export interface ExecuteResult<TResult = unknown> {
  action: ActionRecord;
  result?: TResult;
  reused: boolean;
}

export interface ResumeSummary {
  resumedCount: number;
  actionIds: string[];
}

export interface RuntimeActionHandler<TResult = unknown, TInput = unknown> {
  (ctx: ExecutionContext<TInput>): Promise<TResult>;
}

export interface ExecutionContext<TInput = unknown> {
  action: ActionRecord<TInput>;
  attempt: AttemptRecord;
  logger: Logger;
  emit: (event: RuntimeEventName, payload: unknown) => void;
  storage: RuntimeStorage;
  ton: TonExecutionFacade;
  signal: AbortSignal;
  input?: TInput;
}

export type RuntimeEventName =
  | "action"
  | "attempt"
  | "timeline"
  | "payment"
  | "error"
  | "recovery";

export interface TonExecutionFacade {
  sendTon(params: TonSendParams): Promise<TonSendResult>;
  getBalance(address: string): Promise<string>;
  getTransactionStatus(operationId: string): Promise<"submitted" | "confirmed" | "failed" | "unknown">;
  validateAddress(address: string): Promise<boolean>;
  normalizeAddress(address: string): Promise<string>;
}

export interface ActionFilter {
  status?: string;
  name?: string;
}
