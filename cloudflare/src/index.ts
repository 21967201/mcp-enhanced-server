import { Hono } from "hono";

const app = new Hono();

const tasks = new Map<string, { id: string; status: string; result?: unknown; createdAt: string }>();

app.get("/health", (c) =>
  c.json({ status: "ok", name: "mcp-enhanced-server", version: "1.0.0", protocol: "2025-03-26" })
);

app.all("/mcp", async (c) => {
  if (c.req.method === "GET") {
    return new Response("MCP Enhanced Server - use POST for JSON-RPC", { status: 200 });
  }

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  if (body.method === "initialize") {
    return c.json({
      jsonrpc: "2.0", id: body.id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "mcp-enhanced-server", version: "1.0.0" },
      },
    });
  }

  if (body.method === "notifications/initialized") {
    return new Response(null, { status: 204 });
  }

  if (body.method === "tools/list") {
    return c.json({ jsonrpc: "2.0", id: body.id, result: { tools: TOOLS } });
  }

  if (body.method === "tools/call") {
    const result = await handleToolCall(body.params?.name, body.params?.arguments || {});
    return c.json({ jsonrpc: "2.0", id: body.id, result });
  }

  if (body.method === "ping") {
    return c.json({ jsonrpc: "2.0", id: body.id, result: {} });
  }

  return c.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: `Method not found: ${body.method}` } });
});

const TOOLS = [
  { name: "read_file", description: "Read file contents from the server", inputSchema: { type: "object", properties: { path: { type: "string", description: "File path to read" } }, required: ["path"] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Read File" } },
  { name: "write_file", description: "Write content to a file (DESTRUCTIVE - overwrites existing)", inputSchema: { type: "object", properties: { path: { type: "string", description: "File path" }, content: { type: "string", description: "Content" } }, required: ["path", "content"] }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Write File" } },
  { name: "list_directory", description: "List directory contents", inputSchema: { type: "object", properties: { path: { type: "string", description: "Directory path" } }, required: ["path"] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Directory" } },
  { name: "delete_file", description: "Delete a file (DESTRUCTIVE, NON-IDEMPOTENT)", inputSchema: { type: "object", properties: { path: { type: "string", description: "File path" } }, required: ["path"] }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false, title: "Delete File" } },
  { name: "search_code", description: "Search for a pattern in code files using regex", inputSchema: { type: "object", properties: { directory: { type: "string" }, pattern: { type: "string" } }, required: ["directory", "pattern"] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true, title: "Search Code" } },
  { name: "run_command", description: "Execute a shell command (DESTRUCTIVE)", inputSchema: { type: "object", properties: { command: { type: "string" }, cwd: { type: "string" } }, required: ["command"] }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: "Run Command" } },
  { name: "confirm_action", description: "Request user confirmation before destructive action (Elicitation)", inputSchema: { type: "object", properties: { action: { type: "string" }, riskLevel: { type: "string", enum: ["low", "medium", "high", "critical"] } }, required: ["action"] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Confirm Action" } },
  { name: "request_input", description: "Request additional input from user (Elicitation)", inputSchema: { type: "object", properties: { prompt: { type: "string" }, inputType: { type: "string", enum: ["text", "number", "boolean", "choice"] } }, required: ["prompt", "inputType"] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Request Input" } },
  { name: "task_status", description: "Get async task status", inputSchema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Task Status" } },
  { name: "task_cancel", description: "Cancel a running task", inputSchema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Cancel Task" } },
  { name: "task_list", description: "List all tasks", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Tasks" } },
  { name: "batch_process", description: "Start batch processing (returns task ID)", inputSchema: { type: "object", properties: { items: { type: "array", items: { type: "string" } }, operation: { type: "string", enum: ["uppercase", "lowercase", "reverse", "count"] } }, required: ["items", "operation"] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Batch Process" } },
];

async function handleToolCall(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "read_file": return { content: [{ type: "text", text: `[Cloudflare Edge] Read: ${args.path}` }] };
    case "write_file": return { content: [{ type: "text", text: `[Cloudflare Edge] Write: ${args.path} (${(args.content as string)?.length ?? 0} bytes)` }] };
    case "list_directory": return { content: [{ type: "text", text: `[Cloudflare Edge] List: ${args.path}` }] };
    case "delete_file": return { content: [{ type: "text", text: `[Cloudflare Edge] Delete: ${args.path} (sandboxed)` }] };
    case "search_code": return { content: [{ type: "text", text: `[Cloudflare Edge] Search "${args.pattern}" in ${args.directory}` }] };
    case "run_command": return { content: [{ type: "text", text: `[Cloudflare Edge] Command: ${args.command} (sandboxed)` }] };
    case "confirm_action": return { content: [{ type: "text", text: `Confirmation requested: ${args.action} (risk: ${args.riskLevel || "medium"}). Client should present to user.` }] };
    case "request_input": return { content: [{ type: "text", text: `Input requested: ${args.prompt} (type: ${args.inputType}). Client should present to user.` }] };
    case "task_status": {
      const t = tasks.get(args.taskId as string);
      if (!t) return { content: [{ type: "text", text: `Task not found: ${args.taskId}` }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(t, null, 2) }] };
    }
    case "task_cancel": {
      const t = tasks.get(args.taskId as string);
      if (t) t.status = "cancelled";
      return { content: [{ type: "text", text: t ? `Task ${args.taskId} cancelled` : `Task ${args.taskId} not found` }] };
    }
    case "task_list": {
      return { content: [{ type: "text", text: tasks.size > 0 ? JSON.stringify([...tasks.values()], null, 2) : "No tasks" }] };
    }
    case "batch_process": {
      const items = args.items as string[];
      const op = args.operation as string;
      const id = crypto.randomUUID();
      const results = items.map((i) => {
        switch (op) { case "uppercase": return i.toUpperCase(); case "lowercase": return i.toLowerCase(); case "reverse": return i.split("").reverse().join(""); case "count": return `"${i}" has ${i.length} chars`; default: return i; }
      });
      tasks.set(id, { id, status: "completed", result: { operation: op, results, total: items.length }, createdAt: new Date().toISOString() });
      return { content: [{ type: "text", text: JSON.stringify({ taskId: id, status: "completed", results, total: items.length }, null, 2) }] };
    }
    default: return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
}

export default app;
