import { promises as fs } from "node:fs";
import path from "node:path";
import type { ActionRecord, AttemptRecord, TimelineEvent } from "../types/action.types.js";
import type { ActionFilter } from "../types/runtime.types.js";
import type { RuntimeStorage } from "./storage.interface.js";

interface FileDb {
  actions: Record<string, ActionRecord>;
  actionsByKey: Record<string, string>;
  attempts: Record<string, AttemptRecord[]>;
  timeline: Record<string, TimelineEvent[]>;
  locks: string[];
}

export class FileStorage implements RuntimeStorage {
  private readonly filePath: string;
  private data: FileDb = {
    actions: {},
    actionsByKey: {},
    attempts: {},
    timeline: {},
    locks: []
  };
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  public constructor(filePath = path.resolve(".runtime-data/runtime.json")) {
    this.filePath = filePath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.data = JSON.parse(raw) as FileDb;
    } catch {
      await this.persist();
    }

    this.loaded = true;
  }

  private async persist(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });

      const tempPath = `${this.filePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
      const payload = JSON.stringify(this.data, null, 2);

      await fs.writeFile(tempPath, payload, "utf8");
      await fs.rename(tempPath, this.filePath);
    });

    return this.writeChain;
  }

  public async createAction(record: ActionRecord): Promise<void> {
    await this.ensureLoaded();

    if (record.idempotencyKey && this.data.actionsByKey[record.idempotencyKey]) {
      throw new Error(`Duplicate idempotency key: ${record.idempotencyKey}`);
    }

    this.data.actions[record.id] = structuredClone(record);

    if (record.idempotencyKey) {
      this.data.actionsByKey[record.idempotencyKey] = record.id;
    }

    await this.persist();
  }

  public async updateAction(record: ActionRecord): Promise<void> {
    await this.ensureLoaded();
    this.data.actions[record.id] = structuredClone(record);

    if (record.idempotencyKey) {
      this.data.actionsByKey[record.idempotencyKey] = record.id;
    }

    await this.persist();
  }

  public async getAction(actionId: string): Promise<ActionRecord | null> {
    await this.ensureLoaded();
    const value = this.data.actions[actionId];
    return value ? structuredClone(value) : null;
  }

  public async getActionByIdempotencyKey(key: string): Promise<ActionRecord | null> {
    await this.ensureLoaded();
    const actionId = this.data.actionsByKey[key];
    return actionId ? structuredClone(this.data.actions[actionId] ?? null) : null;
  }

  public async listActions(filter?: ActionFilter): Promise<ActionRecord[]> {
    await this.ensureLoaded();

    return Object.values(this.data.actions)
      .filter((item) => !filter?.status || item.status === filter.status)
      .filter((item) => !filter?.name || item.name === filter.name)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => structuredClone(item));
  }

  public async listPendingActions(): Promise<ActionRecord[]> {
    await this.ensureLoaded();
    const valid = new Set(["pending", "running", "retry_scheduled", "waiting_confirmation"]);

    return Object.values(this.data.actions)
      .filter((item) => valid.has(item.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((item) => structuredClone(item));
  }

  public async createAttempt(record: AttemptRecord): Promise<void> {
    await this.ensureLoaded();
    const list = this.data.attempts[record.actionId] ?? [];
    list.push(structuredClone(record));
    this.data.attempts[record.actionId] = list;
    await this.persist();
  }

  public async finishAttempt(record: AttemptRecord): Promise<void> {
    await this.ensureLoaded();
    const list = this.data.attempts[record.actionId] ?? [];
    const index = list.findIndex((item) => item.id === record.id);

    if (index >= 0) {
      list[index] = structuredClone(record);
    } else {
      list.push(structuredClone(record));
    }

    this.data.attempts[record.actionId] = list;
    await this.persist();
  }

  public async appendTimelineEvent(event: TimelineEvent): Promise<void> {
    await this.ensureLoaded();
    const list = this.data.timeline[event.actionId] ?? [];
    list.push(structuredClone(event));
    this.data.timeline[event.actionId] = list;
    await this.persist();
  }

  public async listTimeline(actionId: string): Promise<TimelineEvent[]> {
    await this.ensureLoaded();
    return (this.data.timeline[actionId] ?? []).map((item) => structuredClone(item));
  }

  public async acquireActionLock(actionId: string): Promise<boolean> {
    await this.ensureLoaded();

    if (this.data.locks.includes(actionId)) {
      return false;
    }

    this.data.locks.push(actionId);
    await this.persist();
    return true;
  }

  public async releaseActionLock(actionId: string): Promise<void> {
    await this.ensureLoaded();
    this.data.locks = this.data.locks.filter((item) => item !== actionId);
    await this.persist();
  }
}