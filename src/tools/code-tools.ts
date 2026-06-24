import { z } from "zod";
import type { ToolRegistry } from "../tools/registry.js";

export function registerCodeTools(registry: ToolRegistry): void {
  registry.register({
    name: "search_code",
    description: "Search for a pattern in code files using regex",
    inputSchema: z.object({
      directory: z.string().describe("Directory to search in"),
      pattern: z.string().describe("Regex pattern to search for"),
      filePattern: z
        .string()
        .optional()
        .default("*.{ts,js,py,java,go}")
        .describe("Glob pattern for file filtering"),
      maxResults: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of results"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      title: "Search Code",
    },
    handler: async (args) => {
      const { directory, pattern, maxResults } = args as {
        directory: string;
        pattern: string;
        maxResults: number;
      };
      try {
        const regex = new RegExp(pattern, "g");
        const fs = await import("fs/promises");
        const path = await import("path");

        const results: string[] = [];

        async function walk(dir: string): Promise<void> {
          if (results.length >= maxResults) return;
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (results.length >= maxResults) return;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              await walk(fullPath);
            } else if (entry.isFile()) {
              try {
                const content = await fs.readFile(fullPath, "utf-8");
                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                  if (results.length >= maxResults) return;
                  if (regex.test(lines[i])) {
                    results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
                  }
                  regex.lastIndex = 0;
                }
              } catch {
                // skip binary/unreadable files
              }
            }
          }
        }

        await walk(directory);
        return {
          content: [
            {
              type: "text",
              text:
                results.length > 0
                  ? results.join("\n")
                  : `No matches found for pattern: ${pattern}`,
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text",
              text: `Error searching code: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  });

  registry.register({
    name: "run_command",
    description:
      "Execute a shell command. This is a DESTRUCTIVE operation with side effects.",
    inputSchema: z.object({
      command: z.string().describe("The command to execute"),
      cwd: z.string().optional().describe("Working directory for the command"),
      timeout: z
        .number()
        .optional()
        .default(30000)
        .describe("Timeout in milliseconds"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      title: "Run Command",
    },
    handler: async (args) => {
      const { command, cwd, timeout } = args as {
        command: string;
        cwd?: string;
        timeout: number;
      };
      try {
        const { exec } = await import("child_process");
        const result = await new Promise<string>((resolve, reject) => {
          exec(
            command,
            { cwd, timeout },
            (error, stdout, stderr) => {
              if (error) {
                reject(
                  new Error(
                    `Command failed: ${error.message}\nstderr: ${stderr}`
                  )
                );
              } else {
                resolve(stdout || stderr);
              }
            }
          );
        });
        return {
          content: [{ type: "text", text: result || "(no output)" }],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text",
              text: `Error running command: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}