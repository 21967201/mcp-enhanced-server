import type { PromptManager, PromptResult } from "./manager.js";

export function registerBuiltinPrompts(promptManager: PromptManager): void {
  promptManager.register(
    {
      name: "code_review",
      title: "Code Review",
      description: "Review code for quality, bugs, and improvements",
      arguments: [
        { name: "code", description: "The code to review", required: true },
        { name: "language", description: "Programming language of the code" },
      ],
    },
    async (args): Promise<PromptResult> => ({
      description: "Code review prompt",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please review the following ${args.language || ""} code for quality, bugs, security issues, and suggest improvements:\n\n${args.code}`,
          },
        },
      ],
    })
  );

  promptManager.register(
    {
      name: "explain_code",
      title: "Explain Code",
      description: "Explain what a piece of code does",
      arguments: [
        { name: "code", description: "The code to explain", required: true },
        { name: "detail_level", description: "Level of detail: brief, normal, detailed" },
      ],
    },
    async (args): Promise<PromptResult> => ({
      description: "Code explanation prompt",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please explain the following code${args.detail_level ? ` at a ${args.detail_level} level` : ""}:\n\n${args.code}`,
          },
        },
      ],
    })
  );

  promptManager.register(
    {
      name: "generate_tests",
      title: "Generate Tests",
      description: "Generate unit tests for the given code",
      arguments: [
        { name: "code", description: "The code to generate tests for", required: true },
        { name: "framework", description: "Test framework to use (jest, vitest, pytest, etc.)" },
      ],
    },
    async (args): Promise<PromptResult> => ({
      description: "Test generation prompt",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Generate ${args.framework ? args.framework + " " : ""}unit tests for the following code. Include edge cases and error scenarios:\n\n${args.code}`,
          },
        },
      ],
    })
  );

  promptManager.register(
    {
      name: "debug_error",
      title: "Debug Error",
      description: "Debug an error in code",
      arguments: [
        { name: "code", description: "The code with the error", required: true },
        { name: "error", description: "The error message or stack trace", required: true },
      ],
    },
    async (args): Promise<PromptResult> => ({
      description: "Debug error prompt",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I have the following code:\n\n${args.code}\n\nAnd I'm getting this error:\n\n${args.error}\n\nPlease help me debug and fix the issue.`,
          },
        },
      ],
    })
  );
}