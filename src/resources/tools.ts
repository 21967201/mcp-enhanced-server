import { z } from "zod";
import type { ToolRegistry } from "../tools/registry.js";
import { ResourceManager } from "./manager.js";

export function registerResourceTools(registry: ToolRegistry, resourceManager: ResourceManager): void {
  registry.register({
    name: "read_resource",
    description: "Read the contents of a resource by URI",
    inputSchema: z.object({
      uri: z.string().describe("URI of the resource to read"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "Read Resource",
    },
    handler: async (args) => {
      const { uri } = args as { uri: string };
      const content = await resourceManager.read(uri);
      if (!content) {
        return {
          content: [{ type: "text", text: `Resource not found: ${uri}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "resource",
            resource: {
              uri: content.uri,
              mimeType: content.mimeType,
              ...(content.text ? { text: content.text } : {}),
              ...(content.blob ? { blob: content.blob } : {}),
            },
          },
        ],
      };
    },
  });

  registry.register({
    name: "list_resources",
    description: "List all available resources",
    inputSchema: z.object({
      cursor: z.string().optional().describe("Pagination cursor"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "List Resources",
    },
    handler: async (args) => {
      const { cursor } = args as { cursor?: string };
      const result = await resourceManager.list(cursor);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  });

  registry.register({
    name: "subscribe_resource",
    description: "Subscribe to updates for a specific resource",
    inputSchema: z.object({
      uri: z.string().describe("URI of the resource to subscribe to"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "Subscribe Resource",
    },
    handler: async (args) => {
      const { uri } = args as { uri: string };
      const subscribed = resourceManager.subscribe(uri, () => {});
      return {
        content: [
          {
            type: "text",
            text: subscribed ? `Subscribed to resource: ${uri}` : `Failed to subscribe to: ${uri}`,
          },
        ],
      };
    },
  });
}