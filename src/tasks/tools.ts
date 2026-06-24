import { z } from "zod";
import type { ToolRegistry } from "../tools/registry.js";
import { TaskManager } from "./manager.js";

export function registerTaskTools(
  registry: ToolRegistry,
  taskManager: TaskManager
): void {
  registry.register({
    name: "task_status",
    description: "Get the status of an async task",
    inputSchema: z.object({
      taskId: z.string().describe("The task ID to check"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "Task Status",
    },
    handler: async (args) => {
      const { taskId } = args as { taskId: string };
      const task = taskManager.get(taskId);
      if (!task) {
        return {
          content: [{ type: "text", text: `Task not found: ${taskId}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: task.id,
                status: task.status,
                progress: task.progress,
                result: task.status === "completed" ? task.result : undefined,
                error: task.status === "failed" ? task.error : undefined,
                pollIntervalMs: task.pollIntervalMs,
              },
              null,
              2
            ),
          },
        ],
      };
    },
  });

  registry.register({
    name: "task_cancel",
    description: "Cancel a running async task",
    inputSchema: z.object({
      taskId: z.string().describe("The task ID to cancel"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
      title: "Cancel Task",
    },
    handler: async (args) => {
      const { taskId } = args as { taskId: string };
      const cancelled = taskManager.cancel(taskId);
      return {
        content: [
          {
            type: "text",
            text: cancelled
              ? `Task ${taskId} cancelled`
              : `Could not cancel task ${taskId} (not found or already terminal)`,
          },
        ],
      };
    },
  });

  registry.register({
    name: "task_list",
    description: "List all tasks and their statuses",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "List Tasks",
    },
    handler: async () => {
      const tasks = taskManager.list();
      return {
        content: [
          {
            type: "text",
            text:
              tasks.length > 0
                ? JSON.stringify(
                    tasks.map((t) => ({
                      id: t.id,
                      status: t.status,
                      createdAt: t.createdAt,
                    })),
                    null,
                    2
                  )
                : "No tasks",
          },
        ],
      };
    },
  });

  registry.register({
    name: "batch_process",
    description:
      "Start a batch processing task that handles multiple items asynchronously. " +
      "Returns a task ID for polling progress.",
    inputSchema: z.object({
      items: z
        .array(z.string())
        .describe("Array of items to process"),
      operation: z
        .enum(["uppercase", "lowercase", "reverse", "count"])
        .describe("Operation to perform on each item"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
      title: "Batch Process",
    },
    handler: async (args) => {
      const { items, operation } = args as {
        items: string[];
        operation: string;
      };

      const task = await taskManager.create({
        ttlMs: 300000, // 5 min
        pollIntervalMs: 500,
        execute: async (t, updateStatus, requestInput) => {
          const results: string[] = [];
          const total = items.length;

          for (let i = 0; i < items.length; i++) {
            if (t.status === "cancelled") return;

            let result: string;
            switch (operation) {
              case "uppercase":
                result = items[i].toUpperCase();
                break;
              case "lowercase":
                result = items[i].toLowerCase();
                break;
              case "reverse":
                result = items[i].split("").reverse().join("");
                break;
              case "count":
                result = `"${items[i]}" has ${items[i].length} characters`;
                break;
              default:
                result = items[i];
            }
            results.push(result);

            t.progress = {
              current: i + 1,
              total,
              message: `Processing item ${i + 1}/${total}`,
            };
            t.updatedAt = new Date();

            await new Promise((r) => setTimeout(r, 200));
          }

          updateStatus("completed", { operation, results, total });
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              taskId: task.id,
              status: task.status,
              pollIntervalMs: task.pollIntervalMs,
              message: "Batch processing started. Use task_status to check progress.",
            }),
          },
        ],
      };
    },
  });
}