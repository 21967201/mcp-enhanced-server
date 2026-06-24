export interface Prompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text" | "image" | "audio" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: Record<string, unknown>;
  };
}

export interface PromptResult {
  description?: string;
  messages: PromptMessage[];
}

export class PromptManager {
  private prompts = new Map<string, Prompt>();
  private providers = new Map<string, (args: Record<string, string>) => Promise<PromptResult>>();
  private listChangedCallbacks: Array<() => void> = [];

  register(prompt: Prompt, provider: (args: Record<string, string>) => Promise<PromptResult>): void {
    this.prompts.set(prompt.name, prompt);
    this.providers.set(prompt.name, provider);
  }

  onListChanged(callback: () => void): void {
    this.listChangedCallbacks.push(callback);
  }

  async list(cursor?: string, limit = 100): Promise<{ prompts: Prompt[]; nextCursor?: string }> {
    const all = Array.from(this.prompts.values());
    const offset = cursor ? parseInt(atob(cursor), 10) : 0;
    const page = all.slice(offset, offset + limit);
    const nextCursor = offset + limit < all.length ? btoa(String(offset + limit)) : undefined;
    return { prompts: page, nextCursor };
  }

  async get(name: string, args: Record<string, string> = {}): Promise<PromptResult | null> {
    const provider = this.providers.get(name);
    if (!provider) return null;

    const prompt = this.prompts.get(name);
    if (prompt?.arguments) {
      for (const arg of prompt.arguments) {
        if (arg.required && !args[arg.name]) {
          throw new Error(`Missing required argument: ${arg.name}`);
        }
      }
    }

    return provider(args);
  }

  remove(name: string): boolean {
    const deleted = this.prompts.delete(name);
    this.providers.delete(name);
    if (deleted) {
      for (const cb of this.listChangedCallbacks) cb();
    }
    return deleted;
  }
}