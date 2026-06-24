export interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
  MCP_AUTH_TOKEN?: string;
  MCP_ALLOWED_ORIGINS?: string;
}

export type TaskStatus =
  | "working"
  | "input_required"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaskRecord {
  id: string;
  status: TaskStatus;
  result: string | null;
  error: string | null;
  progress_current: number | null;
  progress_total: number | null;
  progress_message: string | null;
  input_requests: string | null;
  created_at: string;
  updated_at: string;
  ttl_ms: number;
  poll_interval_ms: number;
}