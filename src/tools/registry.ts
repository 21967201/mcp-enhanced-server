import { z } from "zod";
import type { ToolAnnotation } from "./annotations.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  annotations?: ToolAnnotation;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: Record<string, unknown>;
  }>;
  isError?: boolean;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  list(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: ToolAnnotation;
  }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
      annotations: t.annotations,
    }));
  }

  async call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid arguments: ${parsed.error.message}`,
          },
        ],
        isError: true,
      };
    }

    return tool.handler(args);
  }
}

function zodToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  return zodToJsonSchemaImpl(schema);
}

function zodToJsonSchemaImpl(schema: z.ZodType<unknown>): Record<string, unknown> {
  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }
  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: zodToJsonSchemaImpl(schema.element) };
  }
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(schema.shape)) {
      properties[key] = zodToJsonSchemaImpl(value as z.ZodType<unknown>);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchemaImpl(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchemaImpl(schema.removeDefault());
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema.options };
  }
  return { type: "string" };
}