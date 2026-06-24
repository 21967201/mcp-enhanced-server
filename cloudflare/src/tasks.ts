import type { Env, TaskRecord, TaskStatus } from "./types.js";

export class TaskManagerD1 {
  constructor(private db: D1Database) {}

  async create(
    id: string,
    options: {
      ttlMs?: number;
      pollIntervalMs?: number;
    } = {}
  ): Promise<TaskRecord> {
    const ttlMs = options.ttlMs ?? 3600000;
    const pollIntervalMs = options.pollIntervalMs ?? 1000;

    await this.db
      .prepare(
        "INSERT INTO tasks (id, status, ttl_ms, poll_interval_ms) VALUES (?, 'working', ?, ?)"
      )
      .bind(id, ttlMs, pollIntervalMs)
      .run();

    return (await this.get(id))!;
  }

  async get(id: string): Promise<TaskRecord | null> {
    const result = await this.db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .bind(id)
      .first<TaskRecord>();
    return result ?? null;
  }

  async updateStatus(
    id: string,
    status: TaskStatus,
    result?: unknown,
    error?: { code: number; message: string }
  ): Promise<boolean> {
    const sets: string[] = ["status = ?", "updated_at = datetime('now')"];
    const binds: unknown[] = [status];

    if (result !== undefined) {
      sets.push("result = ?");
      binds.push(JSON.stringify(result));
    }
    if (error !== undefined) {
      sets.push("error = ?");
      binds.push(JSON.stringify(error));
    }

    binds.push(id);
    const stmt = `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`;
    const r = await this.db
      .prepare(stmt)
      .bind(...binds)
      .run();
    return r.meta.changes > 0;
  }

  async updateProgress(
    id: string,
    current: number,
    total: number,
    message?: string
  ): Promise<boolean> {
    const r = await this.db
      .prepare(
        "UPDATE tasks SET progress_current = ?, progress_total = ?, progress_message = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .bind(current, total, message ?? null, id)
      .run();
    return r.meta.changes > 0;
  }

  async cancel(id: string): Promise<boolean> {
    const r = await this.db
      .prepare(
        "UPDATE tasks SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND status NOT IN ('completed', 'failed', 'cancelled')"
      )
      .bind(id)
      .run();
    return r.meta.changes > 0;
  }

  async provideInput(
    id: string,
    input: Record<string, unknown>
  ): Promise<boolean> {
    const r = await this.db
      .prepare(
        "UPDATE tasks SET status = 'working', result = ?, input_requests = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'input_required'"
      )
      .bind(JSON.stringify(input), id)
      .run();
    return r.meta.changes > 0;
  }

  async list(limit = 50): Promise<TaskRecord[]> {
    const results = await this.db
      .prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?")
      .bind(limit)
      .all<TaskRecord>();
    return results.results;
  }

  async cleanup(): Promise<number> {
    const r = await this.db
      .prepare(
        "DELETE FROM tasks WHERE datetime(created_at, '+' || (ttl_ms / 1000) || ' seconds') < datetime('now')"
      )
      .run();
    return r.meta.changes;
  }
}