import type { Logger } from "pino";
import { createLogger } from "../observability/logger.js";
import { RuntimeEmitter } from "../observability/emitter.js";
import { RuntimeMetrics } from "../metrics/metrics.js";
import { createId } from "../utils/ids.js";
import { getBackoffDelay } from "../utils/backoff.js";
import { nowIso, sleep } from "../utils/time.js";
import { runtimeConfigSchema } from "../validation/schemas.js";
import { ValidationError } from "../errors/runtime.errors.js";
import { validateTonAmount, validateTonSendInput } from "../validation/validators.js";
import type {
  ActionRecord,
  AttemptRecord,
  SerializedError,
  TimelineEvent,
  TonOperationReference
} from "../types/action.types.js";
import type {
  ActionFilter,
  ExecuteOptions,
  ExecuteResult,
  ExecutionContext,
  ResumeSummary,
  RuntimeActionHandler,
  RuntimeEventName,
  TonRuntimeConfig
} from "../types/runtime.types.js";
import type { TonSendParams, TonSendResult } from "../ton/ton-adapter.interface.js";

type HandlerRegistry = Map<string, RuntimeActionHandler>;

const serializeError = (error: unknown): SerializedError => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack !== undefined ? { stack: error.stack } : {})
    };
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : JSON.stringify(error)
  };
};

export class TonRuntime {
  private readonly config: TonRuntimeConfig;
  private readonly logger: Logger;
  private readonly emitter = new RuntimeEmitter();
  private readonly metrics = new RuntimeMetrics();
  private readonly registry: HandlerRegistry = new Map();

  public constructor(config: TonRuntimeConfig) {
    runtimeConfigSchema.parse({
      retry: config.retry,
      safety: config.safety
    });
    this.config = config;
    this.logger = config.logger ?? createLogger();
  }

  public registerAction(name: string, handler: RuntimeActionHandler): void {
    this.registry.set(name, handler);
  }

  public on(event: RuntimeEventName, listener: (payload: unknown) => void): void {
    this.emitter.on(event, listener);
  }

  public async execute<TResult = unknown, TInput = unknown>(
    actionName: string,
    handler: RuntimeActionHandler<TResult, TInput>,
    options: ExecuteOptions<TInput> = {}
  ): Promise<ExecuteResult<TResult>> {
    this.registerAction(actionName, handler as RuntimeActionHandler);

    if (options.idempotencyKey) {
      const existing = await this.config.storage.getActionByIdempotencyKey(options.idempotencyKey);
      if (existing) {
        await this.appendTimeline(existing.id, "action.idempotent_reused", "Idempotent action was reused", {
          idempotencyKey: options.idempotencyKey
        });

        return {
          action: existing,
          reused: true,
          ...(existing.result !== undefined ? { result: existing.result as TResult } : {})
        };
      }
    }

    const actionId = createId();
    const createdAt = nowIso();
    const updatedAt = nowIso();

    const record: ActionRecord<TInput, TResult> = {
      id: actionId,
      name: actionName,
      status: "pending",
      createdAt,
      updatedAt,
      attemptCount: 0,
      maxRetries: options.maxRetries ?? this.config.retry.maxRetries,
      confirmStrategy: options.confirmStrategy ?? "confirmed",
      ...(options.idempotencyKey !== undefined ? { idempotencyKey: options.idempotencyKey } : {}),
      ...(options.input !== undefined ? { input: options.input } : {}),
      ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
      ...(options.tags !== undefined ? { tags: options.tags } : {})
    };

    await this.config.storage.createAction(record);
    await this.appendTimeline(record.id, "action.created", "Action created", {
      actionName,
      ...(options.idempotencyKey !== undefined ? { idempotencyKey: options.idempotencyKey } : {})
    });
    this.metrics.recordActionCreated();

    const finalRecord = await this.runAction(record, handler, options);

    return {
      action: finalRecord,
      reused: false,
      ...(finalRecord.result !== undefined ? { result: finalRecord.result as TResult } : {})
    };
  }

  public async resumePending(): Promise<ResumeSummary> {
    const pending = await this.config.storage.listPendingActions();
    const resumedIds: string[] = [];
  
    for (const action of pending) {
      const handler = this.registry.get(action.name);
      if (!handler) {
        continue;
      }
  
      resumedIds.push(action.id);
      this.metrics.recordRecovered();
  
      const recoveredAction = { ...action };
  
      /**
       * Recovery rules:
       * 1. waiting_confirmation + tonOperation:
       *    continue polling confirmation
       * 2. running without tonOperation:
       *    process most likely crashed before handler finished,
       *    so restart execution from pending state
       * 3. retry_scheduled / pending:
       *    let runAction continue normally
       */
      if (recoveredAction.status === "running" && !recoveredAction.tonOperation) {
        recoveredAction.status = "pending";
      }
  
      await this.appendTimeline(recoveredAction.id, "action.resumed", "Action resumed after restart", {
        status: action.status,
        resumedAs: recoveredAction.status
      });
  
      const resumeOptions: ExecuteOptions<unknown> = {
        maxRetries: recoveredAction.maxRetries,
        ...(recoveredAction.idempotencyKey !== undefined ? { idempotencyKey: recoveredAction.idempotencyKey } : {}),
        ...(recoveredAction.input !== undefined ? { input: recoveredAction.input } : {}),
        ...(recoveredAction.confirmStrategy !== undefined
          ? { confirmStrategy: recoveredAction.confirmStrategy }
          : {})
      };
  
      await this.config.storage.releaseActionLock(recoveredAction.id);
      await this.runAction(recoveredAction, handler, resumeOptions);
    }
  
    return {
      resumedCount: resumedIds.length,
      actionIds: resumedIds
    };
  }

  public async getAction(actionId: string): Promise<ActionRecord | null> {
    return this.config.storage.getAction(actionId);
  }

  public async getActionByIdempotencyKey(key: string): Promise<ActionRecord | null> {
    return this.config.storage.getActionByIdempotencyKey(key);
  }

  public async listActions(filter?: ActionFilter): Promise<ActionRecord[]> {
    return this.config.storage.listActions(filter);
  }

  public async listTimeline(actionId: string): Promise<TimelineEvent[]> {
    return this.config.storage.listTimeline(actionId);
  }

  public getMetrics(): ReturnType<RuntimeMetrics["getSnapshot"]> {
    return this.metrics.getSnapshot();
  }

  public async destroy(): Promise<void> {
    return;
  }

  private async appendTimeline(
    actionId: string,
    type: TimelineEvent["type"],
    message: string,
    payload?: Record<string, unknown>
  ): Promise<void> {
    const event: TimelineEvent = {
      id: createId(),
      actionId,
      type,
      message,
      timestamp: nowIso(),
      ...(payload !== undefined ? { payload } : {})
    };

    await this.config.storage.appendTimelineEvent(event);
    this.emitter.emit("timeline", event);
  }

  private async updateAction(record: ActionRecord): Promise<void> {
    record.updatedAt = nowIso();
    await this.config.storage.updateAction(record);
    this.emitter.emit("action", record);
  }

  private buildTonFacade(action: ActionRecord) {
    return {
      sendTon: async (params: TonSendParams): Promise<TonSendResult> => {
        validateTonSendInput(params);
        validateTonAmount(params.amount, this.config.safety.maxSendTon);

        if (this.config.safety.requireIdempotencyForTonActions && !action.idempotencyKey) {
          throw new ValidationError("idempotencyKey is required for TON actions", "MISSING_IDEMPOTENCY_KEY");
        }

        if (this.config.safety.validateAddresses) {
          const valid = await this.config.tonAdapter.validateAddress(params.to);
          if (!valid) {
            throw new ValidationError(`Invalid TON address: ${params.to}`, "INVALID_ADDRESS");
          }
        }

        const normalized = await this.config.tonAdapter.normalizeAddress(params.to);

        if (this.config.safety.dryRun) {
          return {
            operationId: `dry-run-${createId()}`,
            submittedAt: nowIso(),
            network: this.config.tonAdapter.network,
            status: "submitted",
            txHash: "dry-run"
          };
        }

        return this.config.tonAdapter.sendTon({
          ...params,
          to: normalized
        });
      },
      getBalance: (address: string) => this.config.tonAdapter.getBalance(address),
      getTransactionStatus: (operationId: string) => this.config.tonAdapter.getTransactionStatus(operationId),
      validateAddress: (address: string) => this.config.tonAdapter.validateAddress(address),
      normalizeAddress: (address: string) => this.config.tonAdapter.normalizeAddress(address)
    };
  }

  private async runAction<TResult = unknown, TInput = unknown>(
    action: ActionRecord<TInput, TResult>,
    handler: RuntimeActionHandler<TResult, TInput>,
    options: ExecuteOptions<TInput>
  ): Promise<ActionRecord<TInput, TResult>> {
    const lock = await this.config.storage.acquireActionLock(action.id);
    if (!lock) {
      const fresh = await this.config.storage.getAction(action.id);
      return (fresh ?? action) as ActionRecord<TInput, TResult>;
    }

    try {
      let current: ActionRecord<TInput, TResult> = { ...action };
      const effectiveRetry = {
        ...this.config.retry,
        ...(options.retryPolicy ?? {}),
        maxRetries: options.maxRetries ?? current.maxRetries
      };

      const startedAt = current.startedAt ?? nowIso();
      current.startedAt = startedAt;
      
      if (current.status === "waiting_confirmation" && current.tonOperation) {
        current.status = "waiting_confirmation";
      } else {
        current.status = "running";
      }
      
      await this.updateAction(current);
      await this.appendTimeline(current.id, "action.started", "Action started", {
        actionName: current.name
      });

      while (true) {
        if (current.status === "waiting_confirmation" && current.tonOperation) {
          const confirmed = await this.waitForConfirmation(current);
          return confirmed as ActionRecord<TInput, TResult>;
        }

        const attempt: AttemptRecord = {
          id: createId(),
          actionId: current.id,
          number: current.attemptCount + 1,
          status: "running",
          startedAt: nowIso()
        };

        await this.config.storage.createAttempt(attempt);
        await this.appendTimeline(current.id, "attempt.started", "Attempt started", { attempt: attempt.number });
        this.emitter.emit("attempt", attempt);

        current.attemptCount = attempt.number;
        await this.updateAction(current);

        const controller = new AbortController();
        const timeoutMs = options.timeoutMs ?? this.config.execution?.actionTimeoutMs;
        const timer =
          timeoutMs && timeoutMs > 0
            ? setTimeout(() => controller.abort(new Error(`Action timed out after ${timeoutMs}ms`)), timeoutMs)
            : undefined;

        try {
          const ctx = {
            action: current,
            attempt,
            logger: this.logger.child({ actionId: current.id, attempt: attempt.number }),
            emit: (event: RuntimeEventName, payload: unknown) => this.emitter.emit(event, payload),
            storage: this.config.storage,
            ton: this.buildTonFacade(current),
            signal: controller.signal,
            ...(options.input !== undefined ? { input: options.input } : {})
          } as ExecutionContext<TInput>;

          const result = await handler(ctx);
          const tonResult = this.extractTonReference(result);

          attempt.status = "succeeded";
          attempt.finishedAt = nowIso();
          attempt.durationMs = new Date(attempt.finishedAt).getTime() - new Date(attempt.startedAt).getTime();
          await this.config.storage.finishAttempt(attempt);
          await this.appendTimeline(current.id, "attempt.succeeded", "Attempt succeeded", {
            attempt: attempt.number
          });

          if (tonResult) {
            current.tonOperation = tonResult;
            await this.appendTimeline(current.id, "ton.tx_submitted", "TON transaction submitted", {
              operationId: tonResult.operationId
            });
            this.emitter.emit("payment", tonResult);

            if ((options.confirmStrategy ?? current.confirmStrategy ?? "confirmed") === "confirmed") {
              current.status = "waiting_confirmation";
              current.result = result;
              await this.updateAction(current);
              const confirmed = await this.waitForConfirmation(current);
              return confirmed as ActionRecord<TInput, TResult>;
            }
          }

          current.status = "completed";
          current.result = result;
          current.finishedAt = nowIso();
          await this.updateAction(current);
          await this.appendTimeline(current.id, "action.completed", "Action completed");
          this.metrics.recordCompleted(
            new Date(current.finishedAt).getTime() - new Date(startedAt).getTime(),
            current.attemptCount
          );
          return current;
        } catch (error) {
          const serialized = serializeError(error);
          attempt.status = "failed";
          attempt.error = serialized;
          attempt.finishedAt = nowIso();
          attempt.durationMs = new Date(attempt.finishedAt).getTime() - new Date(attempt.startedAt).getTime();
          await this.config.storage.finishAttempt(attempt);
          this.emitter.emit("error", { actionId: current.id, error: serialized });

          const canRetry = current.attemptCount <= effectiveRetry.maxRetries;
          if (canRetry) {
            const delay = getBackoffDelay(current.attemptCount, effectiveRetry);
            current.status = "retry_scheduled";
            current.nextRetryAt = new Date(Date.now() + delay).toISOString();
            current.error = serialized;
            await this.updateAction(current);
            await this.appendTimeline(current.id, "attempt.retry_scheduled", "Retry scheduled", {
              attempt: current.attemptCount,
              delayMs: delay
            });
            this.metrics.recordRetry();
            await sleep(delay);
            current.status = "running";
            continue;
          }

          current.status = "failed";
          current.error = serialized;
          current.finishedAt = nowIso();
          await this.updateAction(current);
          await this.appendTimeline(current.id, "action.failed", "Action failed", {
            error: serialized.message
          });
          this.metrics.recordFailed(current.attemptCount);
          return current;
        } finally {
          if (timer) {
            clearTimeout(timer);
          }
        }
      }
    } finally {
      await this.config.storage.releaseActionLock(action.id);
    }
  }

  private extractTonReference(result: unknown): TonOperationReference | null {
    if (!result || typeof result !== "object") {
      return null;
    }

    const maybe = result as Partial<TonOperationReference>;
    if (!maybe.operationId || !maybe.submittedAt || !maybe.network || !maybe.status) {
      return null;
    }

    return {
      operationId: maybe.operationId,
      network: maybe.network,
      status: maybe.status,
      submittedAt: maybe.submittedAt,
      ...(maybe.txHash !== undefined ? { txHash: maybe.txHash } : {})
    };
  }

  private async waitForConfirmation(action: ActionRecord): Promise<ActionRecord> {
    const operationId = action.tonOperation?.operationId;
    if (!operationId) {
      return action;
    }

    const pollIntervalMs = this.config.execution?.pollIntervalMs ?? 1000;

    while (true) {
      const status = await this.config.tonAdapter.getTransactionStatus(operationId);

      if (status === "confirmed") {
        action.status = "completed";
        action.finishedAt = nowIso();

        if (action.tonOperation) {
          action.tonOperation.status = "confirmed";
        }

        await this.updateAction(action);
        await this.appendTimeline(action.id, "ton.tx_confirmed", "TON transaction confirmed", {
          operationId
        });
        await this.appendTimeline(action.id, "action.completed", "Action completed after confirmation");
        this.metrics.recordCompleted(
          new Date(action.finishedAt).getTime() - new Date(action.startedAt ?? action.createdAt).getTime(),
          action.attemptCount
        );
        return action;
      }

      if (status === "failed") {
        action.status = "failed";
        action.finishedAt = nowIso();
        action.error = {
          name: "TonTransactionFailed",
          message: `Transaction ${operationId} failed`
        };

        await this.updateAction(action);
        await this.appendTimeline(action.id, "action.failed", "Action failed during confirmation", {
          operationId
        });
        this.metrics.recordFailed(action.attemptCount);
        return action;
      }

      await sleep(pollIntervalMs);
    }
  }
}