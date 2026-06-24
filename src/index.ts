import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SERVER_NAME = "mcp-enhanced-server";
const SERVER_VERSION = "2.0.0";

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

// ==================== Resources ====================

server.registerResource(
  "server-info",
  "mcp://server/info",
  {
    title: "Server Information",
    description: "Information about this MCP server",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({
          name: SERVER_NAME,
          version: SERVER_VERSION,
          features: ["tools", "resources", "prompts", "elicitation", "tasks", "sampling", "streamable-http", "auth"],
        }, null, 2),
      },
    ],
  })
);

server.registerResource(
  "config-info",
  "mcp://server/config",
  {
    title: "Server Configuration",
    description: "Current server configuration and environment",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({
          transport: process.env.MCP_TRANSPORT || "stdio",
          port: process.env.MCP_PORT || "3000",
          host: process.env.MCP_HOST || "127.0.0.1",
          authEnabled: !!process.env.MCP_AUTH_TOKEN,
        }, null, 2),
      },
    ],
  })
);

// ==================== Prompts ====================

server.registerPrompt(
  "code_review",
  {
    title: "Code Review",
    description: "Review code for quality, bugs, and improvements",
    argsSchema: {
      code: z.string().describe("The code to review"),
      language: z.string().optional().describe("Programming language of the code"),
    },
  },
  async ({ code, language }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Please review the following ${language || ""} code for quality, bugs, security issues, and suggest improvements:\n\n${code}`,
        },
      },
    ],
  })
);

server.registerPrompt(
  "explain_code",
  {
    title: "Explain Code",
    description: "Explain what a piece of code does",
    argsSchema: {
      code: z.string().describe("The code to explain"),
      detail_level: z.string().optional().describe("Level of detail: brief, normal, detailed"),
    },
  },
  async ({ code, detail_level }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Please explain the following code${detail_level ? ` at a ${detail_level} level` : ""}:\n\n${code}`,
        },
      },
    ],
  })
);

server.registerPrompt(
  "generate_tests",
  {
    title: "Generate Tests",
    description: "Generate unit tests for the given code",
    argsSchema: {
      code: z.string().describe("The code to generate tests for"),
      framework: z.string().optional().describe("Test framework to use (jest, vitest, pytest, etc.)"),
    },
  },
  async ({ code, framework }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Generate ${framework ? framework + " " : ""}unit tests for the following code. Include edge cases and error scenarios:\n\n${code}`,
        },
      },
    ],
  })
);

server.registerPrompt(
  "debug_error",
  {
    title: "Debug Error",
    description: "Debug an error in code",
    argsSchema: {
      code: z.string().describe("The code with the error"),
      error: z.string().describe("The error message or stack trace"),
    },
  },
  async ({ code, error }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `I have the following code:\n\n${code}\n\nAnd I'm getting this error:\n\n${error}\n\nPlease help me debug and fix the issue.`,
        },
      },
    ],
  })
);

// ==================== Tools - File Operations ====================

server.registerTool(
  "read_file",
  {
    description: "Read the contents of a file from the local filesystem",
    inputSchema: {
      path: z.string().describe("Absolute path to the file to read"),
      encoding: z.string().optional().describe("File encoding (default: utf-8)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      title: "Read File",
    },
  },
  async ({ path }) => {
    try {
      const fs = await import("fs/promises");
      const content = await fs.readFile(path, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch (err: unknown) {
      return {
        content: [{ type: "text", text: `Error reading file: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "write_file",
  {
    description: "Write content to a file on the local filesystem. DESTRUCTIVE - overwrites existing files.",
    inputSchema: {
      path: z.string().describe("Absolute path to the file to write"),
      content: z.string().describe("Content to write to the file"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      title: "Write File",
    },
  },
  async ({ path, content }) => {
    try {
      const fs = await import("fs/promises");
      const pathMod = await import("path");
      await fs.mkdir(pathMod.dirname(path), { recursive: true });
      await fs.writeFile(path, content, "utf-8");
      return { content: [{ type: "text", text: `Successfully wrote to ${path}` }] };
    } catch (err: unknown) {
      return {
        content: [{ type: "text", text: `Error writing file: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "list_directory",
  {
    description: "List the contents of a directory",
    inputSchema: {
      path: z.string().describe("Absolute path to the directory to list"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      title: "List Directory",
    },
  },
  async ({ path }) => {
    try {
      const fs = await import("fs/promises");
      const entries = await fs.readdir(path, { withFileTypes: true });
      const result = entries.map((e) => `${e.isDirectory() ? "DIR " : "FILE"} ${e.name}`).join("\n");
      return { content: [{ type: "text", text: result || "(empty directory)" }] };
    } catch (err: unknown) {
      return {
        content: [{ type: "text", text: `Error listing directory: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "delete_file",
  {
    description: "Delete a file from the local filesystem. DESTRUCTIVE and NON-IDEMPOTENT.",
    inputSchema: {
      path: z.string().describe("Absolute path to the file to delete"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      title: "Delete File",
    },
  },
  async ({ path }) => {
    try {
      const fs = await import("fs/promises");
      await fs.unlink(path);
      return { content: [{ type: "text", text: `Successfully deleted ${path}` }] };
    } catch (err: unknown) {
      return {
        content: [{ type: "text", text: `Error deleting file: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// ==================== Tools - Code Operations ====================

server.registerTool(
  "search_code",
  {
    description: "Search for a pattern in code files using regex",
    inputSchema: {
      directory: z.string().describe("Directory to search in"),
      pattern: z.string().describe("Regex pattern to search for"),
      filePattern: z.string().optional().describe("Glob pattern for file filtering"),
      maxResults: z.number().optional().describe("Maximum number of results"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      title: "Search Code",
    },
  },
  async ({ directory, pattern, maxResults }) => {
    const limit = maxResults ?? 50;
    try {
      const regex = new RegExp(pattern, "g");
      const fs = await import("fs/promises");
      const pathMod = await import("path");
      const results: string[] = [];

      async function walk(dir: string): Promise<void> {
        if (results.length >= limit) return;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= limit) return;
          const fullPath = pathMod.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            await walk(fullPath);
          } else if (entry.isFile()) {
            try {
              const content = await fs.readFile(fullPath, "utf-8");
              const lines = content.split("\n");
              for (let i = 0; i < lines.length; i++) {
                if (results.length >= limit) return;
                if (regex.test(lines[i])) {
                  results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
                }
                regex.lastIndex = 0;
              }
            } catch { /* skip */ }
          }
        }
      }

      await walk(directory);
      return {
        content: [{ type: "text", text: results.length > 0 ? results.join("\n") : `No matches found for pattern: ${pattern}` }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text", text: `Error searching code: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "run_command",
  {
    description: "Execute a shell command. DESTRUCTIVE operation with side effects.",
    inputSchema: {
      command: z.string().describe("The command to execute"),
      cwd: z.string().optional().describe("Working directory for the command"),
      timeout: z.number().optional().describe("Timeout in milliseconds"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      title: "Run Command",
    },
  },
  async ({ command, cwd, timeout }) => {
    const ms = timeout ?? 30000;
    try {
      const { exec } = await import("child_process");
      const result = await new Promise<string>((resolve, reject) => {
        exec(command, { cwd, timeout: ms }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`Command failed: ${error.message}\nstderr: ${stderr}`));
          } else {
            resolve(stdout || stderr);
          }
        });
      });
      return { content: [{ type: "text", text: result || "(no output)" }] };
    } catch (err: unknown) {
      return {
        content: [{ type: "text", text: `Error running command: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// ==================== Tools - Elicitation ====================

server.registerTool(
  "confirm_action",
  {
    description: "Request user confirmation before a destructive or important action.",
    inputSchema: {
      action: z.string().describe("Description of the action requiring confirmation"),
      details: z.string().optional().describe("Additional details about the action"),
      riskLevel: z.enum(["low", "medium", "high", "critical"]).optional().describe("Risk level of the action"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "Confirm Action",
    },
  },
  async ({ action, details, riskLevel }) => {
    const level = riskLevel ?? "medium";
    return {
      content: [
        {
          type: "text",
          text: `⚠️ Confirmation required: ${action}${details ? `\nDetails: ${details}` : ""}\nRisk Level: ${level}\n\nClient should present this to the user for confirmation via elicitation/create.`,
        },
      ],
    };
  }
);

server.registerTool(
  "request_input",
  {
    description: "Request additional input from the user during tool execution.",
    inputSchema: {
      prompt: z.string().describe("The question to ask the user"),
      inputType: z.enum(["text", "number", "boolean", "choice"]).describe("Type of input expected"),
      choices: z.array(z.string()).optional().describe("Available choices when inputType is 'choice'"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "Request Input",
    },
  },
  async ({ prompt, inputType, choices }) => {
    return {
      content: [
        {
          type: "text",
          text: `📋 Input requested: ${prompt} (type: ${inputType}${choices ? `, choices: ${choices.join(", ")}` : ""})\n\nClient should present this to the user via elicitation/create.`,
        },
      ],
    };
  }
);

// ==================== Tools - Task Management ====================

interface Task {
  id: string;
  status: "working" | "completed" | "failed" | "cancelled";
  result?: unknown;
  error?: string;
  progress?: { current: number; total: number; message?: string };
  createdAt: Date;
  ttlMs: number;
  pollIntervalMs: number;
}

const tasks = new Map<string, Task>();

server.registerTool(
  "task_status",
  {
    description: "Get the status of an async task",
    inputSchema: {
      taskId: z.string().describe("The task ID to check"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "Task Status",
    },
  },
  async ({ taskId }) => {
    const task = tasks.get(taskId);
    if (!task) {
      return { content: [{ type: "text", text: `Task not found: ${taskId}` }], isError: true };
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          id: task.id,
          status: task.status,
          progress: task.progress,
          result: task.status === "completed" ? task.result : undefined,
          error: task.status === "failed" ? task.error : undefined,
          pollIntervalMs: task.pollIntervalMs,
        }, null, 2),
      }],
    };
  }
);

server.registerTool(
  "task_cancel",
  {
    description: "Cancel a running async task",
    inputSchema: {
      taskId: z.string().describe("The task ID to cancel"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
      title: "Cancel Task",
    },
  },
  async ({ taskId }) => {
    const task = tasks.get(taskId);
    if (!task || task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
      return { content: [{ type: "text", text: `Could not cancel task ${taskId}` }] };
    }
    task.status = "cancelled";
    return { content: [{ type: "text", text: `Task ${taskId} cancelled` }] };
  }
);

server.registerTool(
  "task_list",
  {
    description: "List all tasks and their statuses",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "List Tasks",
    },
  },
  async () => {
    const allTasks = Array.from(tasks.values());
    return {
      content: [{
        type: "text",
        text: allTasks.length > 0
          ? JSON.stringify(allTasks.map((t) => ({ id: t.id, status: t.status, createdAt: t.createdAt })), null, 2)
          : "No tasks",
      }],
    };
  }
);

server.registerTool(
  "batch_process",
  {
    description: "Start a batch processing task. Returns a task ID for polling.",
    inputSchema: {
      items: z.array(z.string()).describe("Array of items to process"),
      operation: z.enum(["uppercase", "lowercase", "reverse", "count"]).describe("Operation to perform"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
      title: "Batch Process",
    },
  },
  async ({ items, operation }) => {
    const id = crypto.randomUUID();
    const task: Task = {
      id,
      status: "working",
      createdAt: new Date(),
      ttlMs: 300000,
      pollIntervalMs: 500,
    };
    tasks.set(id, task);

    const results = items.map((item) => {
      switch (operation) {
        case "uppercase": return item.toUpperCase();
        case "lowercase": return item.toLowerCase();
        case "reverse": return item.split("").reverse().join("");
        case "count": return `"${item}" has ${item.length} characters`;
        default: return item;
      }
    });

    task.status = "completed";
    task.result = { operation, results, total: items.length };

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ taskId: id, status: "completed", results, total: items.length }, null, 2),
      }],
    };
  }
);

// ==================== Tools - Structured Output (outputSchema) ====================

server.registerTool(
  "get_weather",
  {
    description: "Get current weather data for a location",
    inputSchema: {
      location: z.string().describe("City name or zip code"),
    },
    outputSchema: {
      temperature: z.number().describe("Temperature in celsius"),
      conditions: z.string().describe("Weather conditions description"),
      humidity: z.number().describe("Humidity percentage"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      title: "Get Weather",
    },
  },
  async ({ location }) => {
    const data = {
      temperature: 22.5 + Math.random() * 10 - 5,
      conditions: ["Partly cloudy", "Sunny", "Overcast", "Rainy"][Math.floor(Math.random() * 4)],
      humidity: Math.round(50 + Math.random() * 30),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: data,
    };
  }
);

server.registerTool(
  "system_info",
  {
    description: "Get system information",
    inputSchema: {},
    outputSchema: {
      platform: z.string(),
      nodeVersion: z.string(),
      serverVersion: z.string(),
      uptime: z.number(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "System Info",
    },
  },
  async () => {
    const data = {
      platform: process.platform,
      nodeVersion: process.version,
      serverVersion: SERVER_VERSION,
      uptime: process.uptime(),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  }
);

// ==================== Tools - Resource Links ====================

server.registerTool(
  "list_available_resources",
  {
    description: "List all available MCP resources as resource links",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "List Available Resources",
    },
  },
  async () => {
    return {
      content: [
        {
          type: "resource_link",
          uri: "mcp://server/info",
          name: "server-info",
          description: "Server information",
          mimeType: "application/json",
        },
        {
          type: "resource_link",
          uri: "mcp://server/config",
          name: "config-info",
          description: "Server configuration",
          mimeType: "application/json",
        },
      ],
    };
  }
);

// ==================== Cleanup ====================

setInterval(() => {
  const now = Date.now();
  for (const [id, task] of tasks) {
    if (now - task.createdAt.getTime() > task.ttlMs) {
      tasks.delete(id);
    }
  }
}, 60000);

// ==================== Transport ====================

async function main() {
  const transportType = process.env.MCP_TRANSPORT || "stdio";

  if (transportType === "http") {
    const port = parseInt(process.env.MCP_PORT || "3000", 10);
    const host = process.env.MCP_HOST || "127.0.0.1";
    const authToken = process.env.MCP_AUTH_TOKEN;

    const { createServer } = await import("http");
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );

    const sessions = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>();

    const httpServer = createServer(async (req, res) => {
      const origin = req.headers.origin;
      if (origin) {
        try {
          const originUrl = new URL(origin);
          if (originUrl.hostname !== "localhost" && originUrl.hostname !== "127.0.0.1") {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Forbidden: invalid origin" }));
            return;
          }
        } catch {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Forbidden: invalid origin" }));
          return;
        }
      }

      if (authToken) {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${authToken}`) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
      }

      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", name: SERVER_NAME, version: SERVER_VERSION }));
        return;
      }

      if (req.url?.startsWith("/mcp")) {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let transport: InstanceType<typeof StreamableHTTPServerTransport>;

        if (sessionId && sessions.has(sessionId)) {
          transport = sessions.get(sessionId)!;
        } else {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
          });
          await server.connect(transport);
        }

        await transport.handleRequest(req, res);
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    httpServer.listen(port, host, () => {
      console.error(`[MCP Enhanced Server] Streamable HTTP on http://${host}:${port}/mcp`);
      console.error(`[MCP Enhanced Server] Health check: http://${host}:${port}/health`);
      if (authToken) console.error(`[MCP Enhanced Server] Authentication: enabled`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }

  console.error(`[MCP Enhanced Server] v${SERVER_VERSION} started`);
  console.error(`[MCP Enhanced Server] Features: Tools, Resources, Prompts, Elicitation, Tasks, Streamable HTTP, Auth, Sampling`);
}

main().catch((err) => {
  console.error("[MCP Enhanced Server] Fatal error:", err);
  process.exit(1);
});
