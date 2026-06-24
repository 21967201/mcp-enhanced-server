import { Hono } from "hono";
import type { Env } from "./types.js";
import { TaskManagerD1 } from "./tasks.js";

const SERVER_NAME = "mcp-enhanced-server";
const SERVER_VERSION = "2.0.0";
const PROTOCOL_VERSION = "2025-03-26";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) =>
  c.json({ status: "ok", name: SERVER_NAME, version: SERVER_VERSION, protocol: PROTOCOL_VERSION, transport: "streamable-http" })
);

app.post("/mcp", async (c) => {
  const authToken = c.env.MCP_AUTH_TOKEN;
  if (authToken) {
    const auth = c.req.header("Authorization");
    if (auth !== `Bearer ${authToken}`) {
      return c.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Unauthorized" } }, 401);
    }
  }

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);

  const id = body.id;
  const method = body.method;
  const params = body.params || {};

  try {
    const result = await handleRequest(c.env, method, params);
    return c.json({ jsonrpc: "2.0", id, result });
  } catch (err: any) {
    return c.json({ jsonrpc: "2.0", id, error: { code: -32603, message: err.message || "Internal error" } });
  }
});

app.get("/mcp", (c) => c.json({ status: "ok", name: SERVER_NAME, version: SERVER_VERSION }));

async function handleRequest(env: Env, method: string, params: any) {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          prompts: { listChanged: true },
        },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      };

    case "notifications/initialized":
      return {};

    case "ping":
      return {};

    case "tools/list":
      return { tools: getToolsList() };

    case "tools/call":
      return await handleToolCall(env, params.name, params.arguments || {});

    case "resources/list":
      return { resources: getResourcesList() };

    case "resources/read":
      return await handleResourceRead(env, params.uri);

    case "resources/subscribe":
      return {};

    case "prompts/list":
      return { prompts: getPromptsList() };

    case "prompts/get":
      return await handlePromptGet(params.name, params.arguments || {});

    default:
      throw new Error(`Method not found: ${method}`);
  }
}

function getResourcesList() {
  return [
    { uri: "mcp://server/info", name: "server-info", title: "Server Information", description: "Server name, version, features", mimeType: "application/json" },
    { uri: "mcp://server/config", name: "config-info", title: "Server Configuration", description: "Current configuration", mimeType: "application/json" },
  ];
}

async function handleResourceRead(env: Env, uri: string) {
  switch (uri) {
    case "mcp://server/info":
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ name: SERVER_NAME, version: SERVER_VERSION, environment: env.ENVIRONMENT || "production", features: ["tools", "resources", "prompts", "elicitation", "tasks", "streamable-http", "auth"] }, null, 2) }] };
    case "mcp://server/config":
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ environment: env.ENVIRONMENT || "production", authEnabled: !!env.MCP_AUTH_TOKEN, d1Enabled: !!env.DB }, null, 2) }] };
    default:
      throw new Error(`Resource not found: ${uri}`);
  }
}

function getPromptsList() {
  return [
    { name: "code_review", title: "Code Review", description: "Review code for quality, bugs, and improvements", arguments: [{ name: "code", description: "The code to review", required: true }, { name: "language", description: "Programming language" }] },
    { name: "debug_error", title: "Debug Error", description: "Debug an error in code", arguments: [{ name: "code", description: "The code with the error", required: true }, { name: "error", description: "The error message", required: true }] },
    { name: "explain_code", title: "Explain Code", description: "Explain what code does", arguments: [{ name: "code", description: "The code to explain", required: true }] },
    { name: "generate_tests", title: "Generate Tests", description: "Generate unit tests", arguments: [{ name: "code", description: "The code to test", required: true }, { name: "framework", description: "Test framework" }] },
  ];
}

async function handlePromptGet(name: string, args: Record<string, string>) {
  switch (name) {
    case "code_review":
      return { description: "Code review prompt", messages: [{ role: "user", content: { type: "text", text: `Please review the following ${args.language || ""} code:\n\n${args.code}` } }] };
    case "debug_error":
      return { description: "Debug error prompt", messages: [{ role: "user", content: { type: "text", text: `Code:\n${args.code}\n\nError:\n${args.error}\n\nHelp debug and fix.` } }] };
    case "explain_code":
      return { description: "Explain code prompt", messages: [{ role: "user", content: { type: "text", text: `Please explain this code:\n\n${args.code}` } }] };
    case "generate_tests":
      return { description: "Generate tests prompt", messages: [{ role: "user", content: { type: "text", text: `Generate ${args.framework ? args.framework + " " : ""}unit tests for:\n\n${args.code}` } }] };
    default:
      throw new Error(`Prompt not found: ${name}`);
  }
}

function getToolsList() {
  return [
    { name: "read_file", description: "Read file contents (sandboxed in Cloudflare Workers)", inputSchema: { type: "object", properties: { path: { type: "string", description: "File path to read" } }, required: ["path"] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Read File" } },
    { name: "write_file", description: "Write content to a file (sandboxed)", inputSchema: { type: "object", properties: { path: { type: "string", description: "File path" }, content: { type: "string", description: "Content" } }, required: ["path", "content"] }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Write File" } },
    { name: "confirm_action", description: "Request user confirmation before destructive action", inputSchema: { type: "object", properties: { action: { type: "string", description: "Action description" }, riskLevel: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Risk level" } }, required: ["action"] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Confirm Action" } },
    { name: "request_input", description: "Request additional input from user", inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Question" }, inputType: { type: "string", enum: ["text", "number", "boolean", "choice"], description: "Input type" } }, required: ["prompt", "inputType"] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Request Input" } },
    { name: "task_status", description: "Get async task status", inputSchema: { type: "object", properties: { taskId: { type: "string", description: "Task ID" } }, required: ["taskId"] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Task Status" } },
    { name: "task_cancel", description: "Cancel a running task", inputSchema: { type: "object", properties: { taskId: { type: "string", description: "Task ID" } }, required: ["taskId"] }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Cancel Task" } },
    { name: "task_list", description: "List all tasks", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Tasks" } },
    { name: "batch_process", description: "Start batch processing", inputSchema: { type: "object", properties: { items: { type: "array", items: { type: "string" }, description: "Items" }, operation: { type: "string", enum: ["uppercase", "lowercase", "reverse", "count"], description: "Operation" } }, required: ["items", "operation"] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Batch Process" } },
    { name: "get_weather", description: "Get weather data (structured output demo)", inputSchema: { type: "object", properties: { location: { type: "string", description: "City name" } }, required: ["location"] }, outputSchema: { type: "object", properties: { temperature: { type: "number" }, conditions: { type: "string" }, humidity: { type: "number" } }, required: ["temperature", "conditions", "humidity"] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true, title: "Get Weather" } },
    { name: "list_available_resources", description: "List all MCP resources as resource links", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Resources" } },
  ];
}

async function handleToolCall(env: Env, name: string, args: Record<string, unknown>) {
  const taskManager = env.DB ? new TaskManagerD1(env.DB) : null;

  switch (name) {
    case "read_file":
      return { content: [{ type: "text", text: `[Cloudflare Worker] Read file: ${args.path} (sandboxed)` }] };
    case "write_file":
      return { content: [{ type: "text", text: `[Cloudflare Worker] Write to ${args.path}: ${(args.content as string)?.length ?? 0} bytes (sandboxed)` }] };
    case "confirm_action":
      return { content: [{ type: "text", text: `Confirmation requested: ${args.action} (risk: ${args.riskLevel || "medium"}). Client should handle via elicitation.` }] };
    case "request_input":
      return { content: [{ type: "text", text: `Input requested: ${args.prompt} (type: ${args.inputType}). Client should handle via elicitation.` }] };

    case "task_status": {
      if (!taskManager) return { content: [{ type: "text", text: "D1 not available" }], isError: true };
      const task = await taskManager.get(args.taskId as string);
      if (!task) return { content: [{ type: "text", text: `Task not found: ${args.taskId}` }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify({ id: task.id, status: task.status, progress: task.progress_current ? { current: task.progress_current, total: task.progress_total, message: task.progress_message } : undefined, result: task.status === "completed" ? JSON.parse(task.result || "null") : undefined, pollIntervalMs: task.poll_interval_ms }, null, 2) }] };
    }

    case "task_cancel": {
      if (!taskManager) return { content: [{ type: "text", text: "D1 not available" }], isError: true };
      const cancelled = await taskManager.cancel(args.taskId as string);
      return { content: [{ type: "text", text: cancelled ? `Task ${args.taskId} cancelled` : `Could not cancel ${args.taskId}` }] };
    }

    case "task_list": {
      if (!taskManager) return { content: [{ type: "text", text: "D1 not available" }], isError: true };
      const tasks = await taskManager.list();
      return { content: [{ type: "text", text: tasks.length > 0 ? JSON.stringify(tasks.map((t) => ({ id: t.id, status: t.status, createdAt: t.created_at })), null, 2) : "No tasks" }] };
    }

    case "batch_process": {
      if (!taskManager) return { content: [{ type: "text", text: "D1 not available" }], isError: true };
      const items = args.items as string[];
      const operation = args.operation as string;
      const id = crypto.randomUUID();
      await taskManager.create(id, { ttlMs: 300000, pollIntervalMs: 500 });
      const results = items.map((item) => {
        switch (operation) { case "uppercase": return item.toUpperCase(); case "lowercase": return item.toLowerCase(); case "reverse": return item.split("").reverse().join(""); case "count": return `"${item}" has ${item.length} characters`; default: return item; }
      });
      await taskManager.updateStatus(id, "completed", { operation, results, total: items.length });
      return { content: [{ type: "text", text: JSON.stringify({ taskId: id, status: "completed", results, total: items.length }, null, 2) }] };
    }

    case "get_weather": {
      const data = { temperature: Math.round((22.5 + Math.random() * 10 - 5) * 10) / 10, conditions: ["Partly cloudy", "Sunny", "Overcast", "Rainy"][Math.floor(Math.random() * 4)], humidity: Math.round(50 + Math.random() * 30) };
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    }

    case "list_available_resources":
      return { content: [{ type: "resource_link", uri: "mcp://server/info", name: "server-info", description: "Server information", mimeType: "application/json" }, { type: "resource_link", uri: "mcp://server/config", name: "config-info", description: "Server configuration", mimeType: "application/json" }] };

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
}

export default app;
