import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Hono } from "hono";
import type { Env } from "./types.js";
import { TaskManagerD1 } from "./tasks.js";

const SERVER_NAME = "mcp-enhanced-server";
const SERVER_VERSION = "2.0.0";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    name: SERVER_NAME,
    version: SERVER_VERSION,
    transport: "streamable-http",
  })
);

const mcpHandler = async (c: any) => {
  const authToken = c.env.MCP_AUTH_TOKEN;
  if (authToken) {
    const auth = c.req.header("Authorization");
    if (auth !== `Bearer ${authToken}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }
  }

  const origin = c.req.header("Origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const allowedHosts = (c.env.MCP_ALLOWED_ORIGINS || "").split(",").filter(Boolean);
      if (
        originUrl.hostname !== "localhost" &&
        originUrl.hostname !== "127.0.0.1" &&
        !allowedHosts.includes(originUrl.hostname)
      ) {
        return c.json({ error: "Forbidden: invalid origin" }, 403);
      }
    } catch {
      return c.json({ error: "Forbidden: invalid origin" }, 403);
    }
  }

  const server = createMcpServer(c.env);
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);

  const req = new Request(c.req.url, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  });

  const res = await transport.handleRequest(req);
  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
};

app.post("/mcp", mcpHandler);
app.get("/mcp", mcpHandler);

function createMcpServer(env: Env): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const taskManager = env.DB ? new TaskManagerD1(env.DB) : null;

  server.registerResource(
    "server-info",
    "mcp://server/info",
    {
      title: "Server Information",
      description: "Information about this MCP server",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({
          name: SERVER_NAME,
          version: SERVER_VERSION,
          environment: env.ENVIRONMENT || "production",
          features: ["tools", "resources", "prompts", "elicitation", "tasks", "streamable-http", "auth"],
        }, null, 2),
      }],
    })
  );

  server.registerResource(
    "config-info",
    "mcp://server/config",
    {
      title: "Server Configuration",
      description: "Current server configuration",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({
          environment: env.ENVIRONMENT || "production",
          authEnabled: !!env.MCP_AUTH_TOKEN,
          d1Enabled: !!env.DB,
        }, null, 2),
      }],
    })
  );

  server.registerPrompt(
    "code_review",
    {
      title: "Code Review",
      description: "Review code for quality, bugs, and improvements",
      argsSchema: {
        code: z.string().describe("The code to review"),
        language: z.string().optional().describe("Programming language"),
      },
    },
    async ({ code, language }) => ({
      messages: [{
        role: "user",
        content: { type: "text", text: `Please review the following ${language || ""} code:\n\n${code}` },
      }],
    })
  );

  server.registerPrompt(
    "debug_error",
    {
      title: "Debug Error",
      description: "Debug an error in code",
      argsSchema: {
        code: z.string().describe("The code with the error"),
        error: z.string().describe("The error message"),
      },
    },
    async ({ code, error }) => ({
      messages: [{
        role: "user",
        content: { type: "text", text: `Code:\n${code}\n\nError:\n${error}\n\nHelp debug and fix.` },
      }],
    })
  );

  server.registerTool(
    "read_file",
    {
      description: "Read file contents (sandboxed in Cloudflare Workers)",
      inputSchema: { path: z.string().describe("File path to read") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Read File" },
    },
    async ({ path }) => ({
      content: [{ type: "text", text: `[Cloudflare Worker] Read file: ${path} (sandboxed - use for API integration)` }],
    })
  );

  server.registerTool(
    "write_file",
    {
      description: "Write content to a file (sandboxed in Cloudflare Workers)",
      inputSchema: {
        path: z.string().describe("File path to write"),
        content: z.string().describe("Content to write"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Write File" },
    },
    async ({ path, content }) => ({
      content: [{ type: "text", text: `[Cloudflare Worker] Write to ${path}: ${content.length} bytes (sandboxed)` }],
    })
  );

  server.registerTool(
    "confirm_action",
    {
      description: "Request user confirmation before a destructive action",
      inputSchema: {
        action: z.string().describe("Action description"),
        riskLevel: z.enum(["low", "medium", "high", "critical"]).optional().describe("Risk level"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Confirm Action" },
    },
    async ({ action, riskLevel }) => ({
      content: [{ type: "text", text: `Confirmation requested for: ${action} (risk: ${riskLevel || "medium"}). Client should handle via elicitation/create.` }],
    })
  );

  server.registerTool(
    "request_input",
    {
      description: "Request additional input from the user",
      inputSchema: {
        prompt: z.string().describe("Question to ask"),
        inputType: z.enum(["text", "number", "boolean", "choice"]).describe("Expected input type"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Request Input" },
    },
    async ({ prompt, inputType }) => ({
      content: [{ type: "text", text: `Input requested: ${prompt} (type: ${inputType}). Client should handle via elicitation/create.` }],
    })
  );

  if (taskManager) {
    server.registerTool(
      "task_status",
      {
        description: "Get the status of an async task",
        inputSchema: { taskId: z.string().describe("Task ID") },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Task Status" },
      },
      async ({ taskId }) => {
        const task = await taskManager.get(taskId);
        if (!task) return { content: [{ type: "text", text: `Task not found: ${taskId}` }], isError: true };
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              id: task.id,
              status: task.status,
              progress: task.progress_current ? { current: task.progress_current, total: task.progress_total, message: task.progress_message } : undefined,
              result: task.status === "completed" ? JSON.parse(task.result || "null") : undefined,
              error: task.status === "failed" ? JSON.parse(task.error || "null") : undefined,
              pollIntervalMs: task.poll_interval_ms,
            }, null, 2),
          }],
        };
      }
    );

    server.registerTool(
      "task_cancel",
      {
        description: "Cancel a running async task",
        inputSchema: { taskId: z.string().describe("Task ID to cancel") },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Cancel Task" },
      },
      async ({ taskId }) => {
        const cancelled = await taskManager.cancel(taskId);
        return { content: [{ type: "text", text: cancelled ? `Task ${taskId} cancelled` : `Could not cancel task ${taskId}` }] };
      }
    );

    server.registerTool(
      "task_list",
      {
        description: "List all tasks",
        inputSchema: {},
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Tasks" },
      },
      async () => {
        const tasks = await taskManager.list();
        return {
          content: [{
            type: "text",
            text: tasks.length > 0 ? JSON.stringify(tasks.map((t) => ({ id: t.id, status: t.status, createdAt: t.created_at })), null, 2) : "No tasks",
          }],
        };
      }
    );

    server.registerTool(
      "batch_process",
      {
        description: "Start a batch processing task",
        inputSchema: {
          items: z.array(z.string()).describe("Items to process"),
          operation: z.enum(["uppercase", "lowercase", "reverse", "count"]).describe("Operation to perform"),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Batch Process" },
      },
      async ({ items, operation }) => {
        const id = crypto.randomUUID();
        await taskManager.create(id, { ttlMs: 300000, pollIntervalMs: 500 });
        const results = items.map((item) => {
          switch (operation) {
            case "uppercase": return item.toUpperCase();
            case "lowercase": return item.toLowerCase();
            case "reverse": return item.split("").reverse().join("");
            case "count": return `"${item}" has ${item.length} characters`;
            default: return item;
          }
        });
        await taskManager.updateStatus(id, "completed", { operation, results, total: items.length });
        return {
          content: [{ type: "text", text: JSON.stringify({ taskId: id, status: "completed", results, total: items.length }, null, 2) }],
        };
      }
    );
  }

  server.registerTool(
    "get_weather",
    {
      description: "Get current weather data for a location",
      inputSchema: { location: z.string().describe("City name or zip code") },
      outputSchema: {
        temperature: z.number().describe("Temperature in celsius"),
        conditions: z.string().describe("Weather conditions"),
        humidity: z.number().describe("Humidity percentage"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true, title: "Get Weather" },
    },
    async ({ location }) => {
      const data = {
        temperature: Math.round((22.5 + Math.random() * 10 - 5) * 10) / 10,
        conditions: ["Partly cloudy", "Sunny", "Overcast", "Rainy"][Math.floor(Math.random() * 4)],
        humidity: Math.round(50 + Math.random() * 30),
      };
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    }
  );

  server.registerTool(
    "list_available_resources",
    {
      description: "List all available MCP resources as resource links",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Available Resources" },
    },
    async () => ({
      content: [
        { type: "resource_link" as const, uri: "mcp://server/info", name: "server-info", description: "Server information", mimeType: "application/json" },
        { type: "resource_link" as const, uri: "mcp://server/config", name: "config-info", description: "Server configuration", mimeType: "application/json" },
      ],
    })
  );

  return server;
}

export default app;
