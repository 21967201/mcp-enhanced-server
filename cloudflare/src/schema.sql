CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'working',
  result TEXT,
  error TEXT,
  progress_current INTEGER,
  progress_total INTEGER,
  progress_message TEXT,
  input_requests TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  ttl_ms INTEGER NOT NULL DEFAULT 3600000,
  poll_interval_ms INTEGER NOT NULL DEFAULT 1000
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);