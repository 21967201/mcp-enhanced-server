import { z } from "zod";
import type { ToolRegistry } from "./registry.js";

export function registerFileTools(registry: ToolRegistry): void {
  registry.register({
    name: "read_file",
    description: "Read the contents of a file from the local filesystem",
    inputSchema: z.object({
      path: z.string().describe("Absolute path to the file to read"),
      encoding: z.string().optional().default("utf-8").describe("File encoding"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      title: "Read File",
    },
    handler: async (args) => {
      const { path } = args as { path: string };
      try {
        const fs = await import("fs/promises");
        const content = await fs.readFile(path, "utf-8");
        return {
          content: [{ type: "text", text: content }],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text",
              text: `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  });

  registry.register({
    name: "write_file",
    description:
      "Write content to a file on the local filesystem. This is a DESTRUCTIVE operation that will overwrite existing files.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path to the file to write"),
      content: z.string().describe("Content to write to the file"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      title: "Write File",
    },
    handler: async (args) => {
      const { path, content } = args as { path: string; content: string };
      try {
        const fs = await import("fs/promises");
        await fs.mkdir(await import("path").then((p) => p.dirname(path)), {
          recursive: true,
        });
        await fs.writeFile(path, content, "utf-8");
        return {
          content: [{ type: "text", text: `Successfully wrote to ${path}` }],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text",
              text: `Error writing file: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  });

  registry.register({
    name: "list_directory",
    description: "List the contents of a directory",
    inputSchema: z.object({
      path: z.string().describe("Absolute path to the directory to list"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      title: "List Directory",
    },
    handler: async (args) => {
      const { path } = args as { path: string };
      try {
        const fs = await import("fs/promises");
        const entries = await fs.readdir(path, { withFileTypes: true });
        const result = entries
          .map((e) => `${e.isDirectory() ? "DIR " : "FILE"} ${e.name}`)
          .join("\n");
        return {
          content: [{ type: "text", text: result || "(empty directory)" }],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing directory: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  });

  registry.register({
    name: "delete_file",
    description:
      "Delete a file from the local filesystem. This is a DESTRUCTIVE and NON-IDEMPOTENT operation.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path to the file to delete"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      title: "Delete File",
    },
    handler: async (args) => {
      const { path } = args as { path: string };
      try {
        const fs = await import("fs/promises");
        await fs.unlink(path);
        return {
          content: [{ type: "text", text: `Successfully deleted ${path}` }],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting file: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}