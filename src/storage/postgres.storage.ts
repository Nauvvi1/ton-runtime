import { Client } from "pg";
import type { ActionRecord, AttemptRecord, TimelineEvent } from "../types/action.types.js";
import type { ActionFilter } from "../types/runtime.types.js";
import type { RuntimeStorage } from "./storage.interface.js";

type JsonObject = Record<string, unknown>;

type ActionStatus = ActionRecord["status"];
type ConfirmStrategy = "submitted" | "confirmed";
type TimelineEventType = TimelineEvent["type"];

interface PostgresActionRow {
  id: string;
  name: string;
  status: ActionStatus;
  idempotency_key: string | null;
  input: unknown | null;
  metadata: JsonObject | null;
  tags: string[] | null;
  result: unknown | null;
  error: ActionRecord["error"] | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  attempt_count: number;
  max_retries: number;
  next_retry_at: string | null;
  confirm_strategy: ConfirmStrategy | null;
  ton_operation: ActionRecord["tonOperation"] | null;
}

interface PostgresTimelineRow {
  id: string;
  action_id: string;
  type: TimelineEventType;
  message: string;
  payload: JsonObject | null;
  timestamp: string;
}

export class PostgresStorage implements RuntimeStorage {
  private readonly client: Client;

  public constructor(connectionString: string) {
    this.client = new Client({ connectionString });
  }

  public async connect(): Promise<void> {
    await this.client.connect();
  }

  public async migrate(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS runtime_actions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        idempotency_key TEXT UNIQUE,
        input JSONB,
        metadata JSONB,
        tags JSONB,
        result JSONB,
        error JSONB,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        attempt_count INTEGER NOT NULL,
        max_retries INTEGER NOT NULL,
        next_retry_at TEXT,
        confirm_strategy TEXT,
        ton_operation JSONB
      );

      CREATE INDEX IF NOT EXISTS idx_runtime_actions_status
        ON runtime_actions(status);

      CREATE TABLE IF NOT EXISTS runtime_attempts (
        id TEXT PRIMARY KEY,
        action_id TEXT NOT NULL REFERENCES runtime_actions(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        error JSONB,
        duration_ms INTEGER
      );

      CREATE TABLE IF NOT EXISTS runtime_timeline (
        id TEXT PRIMARY KEY,
        action_id TEXT NOT NULL REFERENCES runtime_actions(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        payload JSONB,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runtime_locks (
        action_id TEXT PRIMARY KEY,
        locked_at TEXT NOT NULL
      );
    `);
  }

  private mapAction(row: PostgresActionRow): ActionRecord {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      ...(row.idempotency_key != null ? { idempotencyKey: row.idempotency_key } : {}),
      ...(row.input != null ? { input: row.input } : {}),
      ...(row.metadata != null ? { metadata: row.metadata } : {}),
      ...(row.tags != null ? { tags: row.tags } : {}),
      ...(row.result != null ? { result: row.result } : {}),
      ...(row.error != null ? { error: row.error } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.started_at != null ? { startedAt: row.started_at } : {}),
      ...(row.finished_at != null ? { finishedAt: row.finished_at } : {}),
      attemptCount: row.attempt_count,
      maxRetries: row.max_retries,
      ...(row.next_retry_at != null ? { nextRetryAt: row.next_retry_at } : {}),
      ...(row.confirm_strategy != null ? { confirmStrategy: row.confirm_strategy } : {}),
      ...(row.ton_operation != null ? { tonOperation: row.ton_operation } : {})
    };
  }

  public async createAction(record: ActionRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO runtime_actions (
        id,
        name,
        status,
        idempotency_key,
        input,
        metadata,
        tags,
        result,
        error,
        created_at,
        updated_at,
        started_at,
        finished_at,
        attempt_count,
        max_retries,
        next_retry_at,
        confirm_strategy,
        ton_operation
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      )`,
      [
        record.id,
        record.name,
        record.status,
        record.idempotencyKey ?? null,
        record.input ?? null,
        record.metadata ?? null,
        record.tags ?? null,
        record.result ?? null,
        record.error ?? null,
        record.createdAt,
        record.updatedAt,
        record.startedAt ?? null,
        record.finishedAt ?? null,
        record.attemptCount,
        record.maxRetries,
        record.nextRetryAt ?? null,
        record.confirmStrategy ?? null,
        record.tonOperation ?? null
      ]
    );
  }

  public async updateAction(record: ActionRecord): Promise<void> {
    await this.client.query(
      `UPDATE runtime_actions SET
        name=$2,
        status=$3,
        idempotency_key=$4,
        input=$5,
        metadata=$6,
        tags=$7,
        result=$8,
        error=$9,
        created_at=$10,
        updated_at=$11,
        started_at=$12,
        finished_at=$13,
        attempt_count=$14,
        max_retries=$15,
        next_retry_at=$16,
        confirm_strategy=$17,
        ton_operation=$18
      WHERE id=$1`,
      [
        record.id,
        record.name,
        record.status,
        record.idempotencyKey ?? null,
        record.input ?? null,
        record.metadata ?? null,
        record.tags ?? null,
        record.result ?? null,
        record.error ?? null,
        record.createdAt,
        record.updatedAt,
        record.startedAt ?? null,
        record.finishedAt ?? null,
        record.attemptCount,
        record.maxRetries,
        record.nextRetryAt ?? null,
        record.confirmStrategy ?? null,
        record.tonOperation ?? null
      ]
    );
  }

  public async getAction(actionId: string): Promise<ActionRecord | null> {
    const result = await this.client.query<PostgresActionRow>(
      `SELECT * FROM runtime_actions WHERE id=$1`,
      [actionId]
    );

    if (!result.rowCount || result.rows.length === 0) {
      return null;
    }

    return this.mapAction(result.rows[0]);
  }

  public async getActionByIdempotencyKey(key: string): Promise<ActionRecord | null> {
    const result = await this.client.query<PostgresActionRow>(
      `SELECT * FROM runtime_actions WHERE idempotency_key=$1`,
      [key]
    );

    if (!result.rowCount || result.rows.length === 0) {
      return null;
    }

    return this.mapAction(result.rows[0]);
  }

  public async listActions(filter?: ActionFilter): Promise<ActionRecord[]> {
    const conditions: string[] = [];
    const values: string[] = [];

    if (filter?.status) {
      values.push(filter.status);
      conditions.push(`status=$${values.length}`);
    }

    if (filter?.name) {
      values.push(filter.name);
      conditions.push(`name=$${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await this.client.query<PostgresActionRow>(
      `SELECT * FROM runtime_actions ${whereClause} ORDER BY created_at DESC`,
      values
    );

    return result.rows.map((row: PostgresActionRow) => this.mapAction(row));
  }

  public async listPendingActions(): Promise<ActionRecord[]> {
    const result = await this.client.query<PostgresActionRow>(
      `SELECT * FROM runtime_actions
       WHERE status IN ('pending', 'running', 'retry_scheduled', 'waiting_confirmation')
       ORDER BY created_at ASC`
    );

    return result.rows.map((row: PostgresActionRow) => this.mapAction(row));
  }

  public async createAttempt(record: AttemptRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO runtime_attempts (
        id,
        action_id,
        number,
        status,
        started_at,
        finished_at,
        error,
        duration_ms
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        record.id,
        record.actionId,
        record.number,
        record.status,
        record.startedAt,
        record.finishedAt ?? null,
        record.error ?? null,
        record.durationMs ?? null
      ]
    );
  }

  public async finishAttempt(record: AttemptRecord): Promise<void> {
    await this.client.query(
      `UPDATE runtime_attempts SET
        number=$3,
        status=$4,
        started_at=$5,
        finished_at=$6,
        error=$7,
        duration_ms=$8
      WHERE id=$1 AND action_id=$2`,
      [
        record.id,
        record.actionId,
        record.number,
        record.status,
        record.startedAt,
        record.finishedAt ?? null,
        record.error ?? null,
        record.durationMs ?? null
      ]
    );
  }

  public async appendTimelineEvent(event: TimelineEvent): Promise<void> {
    await this.client.query(
      `INSERT INTO runtime_timeline (
        id,
        action_id,
        type,
        message,
        payload,
        timestamp
      ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        event.id,
        event.actionId,
        event.type,
        event.message,
        event.payload ?? null,
        event.timestamp
      ]
    );
  }

  public async listTimeline(actionId: string): Promise<TimelineEvent[]> {
    const result = await this.client.query<PostgresTimelineRow>(
      `SELECT * FROM runtime_timeline WHERE action_id=$1 ORDER BY timestamp ASC`,
      [actionId]
    );

    return result.rows.map((row: PostgresTimelineRow): TimelineEvent => ({
      id: row.id,
      actionId: row.action_id,
      type: row.type,
      message: row.message,
      ...(row.payload != null ? { payload: row.payload } : {}),
      timestamp: row.timestamp
    }));
  }

  public async acquireActionLock(actionId: string): Promise<boolean> {
    const result = await this.client.query(
      `INSERT INTO runtime_locks (action_id, locked_at)
       VALUES ($1, NOW()::TEXT)
       ON CONFLICT DO NOTHING`,
      [actionId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  public async releaseActionLock(actionId: string): Promise<void> {
    await this.client.query(`DELETE FROM runtime_locks WHERE action_id=$1`, [actionId]);
  }
}