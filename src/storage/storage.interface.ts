import type { ActionRecord, AttemptRecord, TimelineEvent } from "../types/action.types.js";
import type { ActionFilter } from "../types/runtime.types.js";

export interface RuntimeStorage {
  createAction(record: ActionRecord): Promise<void>;
  updateAction(record: ActionRecord): Promise<void>;
  getAction(actionId: string): Promise<ActionRecord | null>;
  getActionByIdempotencyKey(key: string): Promise<ActionRecord | null>;
  listActions(filter?: ActionFilter): Promise<ActionRecord[]>;
  listPendingActions(): Promise<ActionRecord[]>;
  createAttempt(record: AttemptRecord): Promise<void>;
  finishAttempt(record: AttemptRecord): Promise<void>;
  appendTimelineEvent(event: TimelineEvent): Promise<void>;
  listTimeline(actionId: string): Promise<TimelineEvent[]>;
  acquireActionLock(actionId: string): Promise<boolean>;
  releaseActionLock(actionId: string): Promise<void>;
}
