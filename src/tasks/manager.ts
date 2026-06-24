export type TaskStatus =
  | "working"
  | "input_required"
  | "completed"
  | "failed"
  | "cancelled";

export interface Task {
  id: string;
  status: TaskStatus;
  result?: unknown;
  error?: { code: number; message: string };
  progress?: { current: number; total: number; message?: string };
  inputRequests?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  ttlMs: number;
  pollIntervalMs: number;
}

export interface TaskCreateOptions {
  ttlMs?: number;
  pollIntervalMs?: number;
  execute: (
    task: Task,
    updateStatus: (status: TaskStatus, result?: unknown) => void,
    requestInput: (schema: Record<string, unknown>) => Promise<Record<string, unknown>>
  ) => Promise<void>;
}

export class TaskManager {
  private tasks = new Map<string, Task>();
  private defaultTtlMs = 3600000; // 1 hour
  private defaultPollIntervalMs = 1000;

  async create(options: TaskCreateOptions): Promise<Task> {
    const id = crypto.randomUUID();
    const task: Task = {
      id,
      status: "working",
      createdAt: new Date(),
      updatedAt: new Date(),
      ttlMs: options.ttlMs ?? this.defaultTtlMs,
      pollIntervalMs: options.pollIntervalMs ?? this.defaultPollIntervalMs,
    };

    this.tasks.set(id, task);

    const updateStatus = (
      status: TaskStatus,
      result?: unknown
    ) => {
      task.status = status;
      task.updatedAt = new Date();
      if (result !== undefined) {
        task.result = result;
      }
    };

    const requestInput = async (
      schema: Record<string, unknown>
    ): Promise<Record<string, unknown>> => {
      task.status = "input_required";
      task.inputRequests = schema;
      task.updatedAt = new Date();

      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (task.status === "cancelled") {
            clearInterval(checkInterval);
            reject(new Error("Task cancelled"));
          }
          if (task.status === "working" && !task.inputRequests) {
            clearInterval(checkInterval);
            resolve(task.result as Record<string, unknown>);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error("Input request timed out"));
        }, 60000);
      });
    };

    options.execute(task, updateStatus, requestInput).catch((err: Error) => {
      task.status = "failed";
      task.error = { code: -1, message: err.message };
      task.updatedAt = new Date();
    });

    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  cancel(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
      return false;
    }
    task.status = "cancelled";
    task.updatedAt = new Date();
    return true;
  }

  provideInput(id: string, input: Record<string, unknown>): boolean {
    const task = this.tasks.get(id);
    if (!task || task.status !== "input_required") return false;
    task.result = input;
    task.inputRequests = undefined;
    task.status = "working";
    task.updatedAt = new Date();
    return true;
  }

  list(): Task[] {
    return Array.from(this.tasks.values());
  }

  cleanup(): void {
    const now = Date.now();
    for (const [id, task] of this.tasks) {
      if (now - task.createdAt.getTime() > task.ttlMs) {
        this.tasks.delete(id);
      }
    }
  }
}