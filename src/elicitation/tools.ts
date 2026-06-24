import { z } from "zod";
import type { ToolRegistry } from "../tools/registry.js";
import { ElicitationManager } from "./manager.js";

export function registerElicitationTools(
  registry: ToolRegistry,
  elicitation: ElicitationManager
): void {
  registry.register({
    name: "confirm_action",
    description:
      "Request user confirmation before proceeding with a destructive or important action. " +
      "Pauses execution until the user accepts, declines, or cancels.",
    inputSchema: z.object({
      action: z.string().describe("Description of the action requiring confirmation"),
      details: z
        .string()
        .optional()
        .describe("Additional details about the action"),
      riskLevel: z
        .enum(["low", "medium", "high", "critical"])
        .optional()
        .default("medium")
        .describe("Risk level of the action"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "Confirm Action",
    },
    handler: async (args) => {
      const { action, details, riskLevel } = args as {
        action: string;
        details?: string;
        riskLevel: string;
      };

      const { request, response } = elicitation.createRequest(
        `Confirm: ${action}${details ? `\nDetails: ${details}` : ""}\nRisk Level: ${riskLevel}`,
        {
          type: "object",
          properties: {
            confirmed: {
              type: "boolean",
              description: "Whether to proceed with the action",
            },
            reason: {
              type: "string",
              description: "Reason for declining (optional)",
            },
          },
          required: ["confirmed"],
        }
      );

      const result = await response;

      if (result.action === "accept" && result.content) {
        const confirmed = (result.content as { confirmed: boolean }).confirmed;
        return {
          content: [
            {
              type: "text",
              text: confirmed
                ? `User confirmed action: ${action}`
                : `User declined action: ${action}. Reason: ${(result.content as { reason?: string }).reason || "Not specified"}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Action cancelled by user: ${action}`,
          },
        ],
        isError: true,
      };
    },
  });

  registry.register({
    name: "request_input",
    description:
      "Request additional input from the user during tool execution. " +
      "Useful when the tool needs clarification or missing parameters.",
    inputSchema: z.object({
      prompt: z.string().describe("The question to ask the user"),
      inputType: z
        .enum(["text", "number", "boolean", "choice"])
        .describe("Type of input expected"),
      choices: z
        .array(z.string())
        .optional()
        .describe("Available choices when inputType is 'choice'"),
      defaultValue: z
        .string()
        .optional()
        .describe("Default value if user doesn't provide one"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: "Request Input",
    },
    handler: async (args) => {
      const { prompt, inputType, choices, defaultValue } = args as {
        prompt: string;
        inputType: string;
        choices?: string[];
        defaultValue?: string;
      };

      const schemaProperties: Record<string, unknown> = {};
      switch (inputType) {
        case "number":
          schemaProperties.value = { type: "number" };
          break;
        case "boolean":
          schemaProperties.value = { type: "boolean" };
          break;
        case "choice":
          schemaProperties.value = {
            type: "string",
            enum: choices || [],
          };
          break;
        default:
          schemaProperties.value = { type: "string" };
      }

      const { response } = elicitation.createRequest(prompt, {
        type: "object",
        properties: schemaProperties,
        required: ["value"],
      });

      const result = await response;

      if (result.action === "accept" && result.content) {
        return {
          content: [
            {
              type: "text",
              text: `User input: ${JSON.stringify(result.content)}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: defaultValue
              ? `Using default value: ${defaultValue}`
              : "User cancelled input request",
          },
        ],
      };
    },
  });
}