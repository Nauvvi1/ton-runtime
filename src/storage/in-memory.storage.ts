import type { ActionRecord, AttemptRecord, TimelineEvent } from "../types/action.types.js";
import type { ActionFilter } from "../types/runtime.types.js";
import type { RuntimeStorage } from "./storage.interface.js";

export class InMemoryStorage implements RuntimeStorage {
  private readonly actions = new Map<string, ActionRecord>();
  private readonly actionsByKey = new Map<string, string>();
  private readonly attempts = new Map<string, AttemptRecord[]>();
  private readonly timeline = new Map<string, TimelineEvent[]>();
  private readonly locks = new Set<string>();

  public async createAction(record: ActionRecord): Promise<void> {
    this.actions.set(record.id, structuredClone(record));
    if (record.idempotencyKey) {
      if (this.actionsByKey.has(record.idempotencyKey)) {
        throw new Error(`Duplicate idempotency key: ${record.idempotencyKey}`);
      }
      this.actionsByKey.set(record.idempotencyKey, record.id);
    }
  }

  public async updateAction(record: ActionRecord): Promise<void> {
    this.actions.set(record.id, structuredClone(record));
    if (record.idempotencyKey) {
      this.actionsByKey.set(record.idempotencyKey, record.id);
    }
  }

  public async getAction(actionId: string): Promise<ActionRecord | null> {
    return this.actions.has(actionId) ? structuredClone(this.actions.get(actionId)!) : null;
  }

  public async getActionByIdempotencyKey(key: string): Promise<ActionRecord | null> {
    const actionId = this.actionsByKey.get(key);
    return actionId ? structuredClone(this.actions.get(actionId) ?? null) : null;
  }

  public async listActions(filter?: ActionFilter): Promise<ActionRecord[]> {
    return Array.from(this.actions.values())
      .filter((item) => !filter?.status || item.status === filter.status)
      .filter((item) => !filter?.name || item.name === filter.name)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => structuredClone(item));
  }

  public async listPendingActions(): Promise<ActionRecord[]> {
    const valid = new Set(["pending", "running", "retry_scheduled", "waiting_confirmation"]);
    return Array.from(this.actions.values())
      .filter((item) => valid.has(item.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((item) => structuredClone(item));
  }

  public async createAttempt(record: AttemptRecord): Promise<void> {
    const list = this.attempts.get(record.actionId) ?? [];
    list.push(structuredClone(record));
    this.attempts.set(record.actionId, list);
  }

  public async finishAttempt(record: AttemptRecord): Promise<void> {
    const list = this.attempts.get(record.actionId) ?? [];
    const index = list.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      list[index] = structuredClone(record);
    } else {
      list.push(structuredClone(record));
    }
    this.attempts.set(record.actionId, list);
  }

  public async appendTimelineEvent(event: TimelineEvent): Promise<void> {
    const list = this.timeline.get(event.actionId) ?? [];
    list.push(structuredClone(event));
    this.timeline.set(event.actionId, list);
  }

  public async listTimeline(actionId: string): Promise<TimelineEvent[]> {
    return (this.timeline.get(actionId) ?? []).map((item) => structuredClone(item));
  }

  public async acquireActionLock(actionId: string): Promise<boolean> {
    if (this.locks.has(actionId)) {
      return false;
    }
    this.locks.add(actionId);
    return true;
  }

  public async releaseActionLock(actionId: string): Promise<void> {
    this.locks.delete(actionId);
  }
}
