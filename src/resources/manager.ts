export interface Resource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

type ResourceSubscriber = (uri: string) => void;

export class ResourceManager {
  private resources = new Map<string, Resource>();
  private templates = new Map<string, ResourceTemplate>();
  private providers = new Map<string, (uri: string) => Promise<ResourceContent>>();
  private templateProviders = new Map<string, (uri: string, params: Record<string, string>) => Promise<ResourceContent>>();
  private subscribers = new Map<string, Set<ResourceSubscriber>>();
  private listChangedCallbacks: Array<() => void> = [];

  registerResource(resource: Resource, provider: (uri: string) => Promise<ResourceContent>): void {
    this.resources.set(resource.uri, resource);
    this.providers.set(resource.uri, provider);
  }

  registerTemplate(template: ResourceTemplate, provider: (uri: string, params: Record<string, string>) => Promise<ResourceContent>): void {
    this.templates.set(template.uriTemplate, template);
    this.templateProviders.set(template.uriTemplate, provider);
  }

  onListChanged(callback: () => void): void {
    this.listChangedCallbacks.push(callback);
  }

  async list(cursor?: string, limit = 100): Promise<{ resources: Resource[]; nextCursor?: string }> {
    const all = Array.from(this.resources.values());
    const offset = cursor ? parseInt(atob(cursor), 10) : 0;
    const page = all.slice(offset, offset + limit);
    const nextCursor = offset + limit < all.length ? btoa(String(offset + limit)) : undefined;
    return { resources: page, nextCursor };
  }

  async listTemplates(cursor?: string, limit = 100): Promise<{ templates: ResourceTemplate[]; nextCursor?: string }> {
    const all = Array.from(this.templates.values());
    const offset = cursor ? parseInt(atob(cursor), 10) : 0;
    const page = all.slice(offset, offset + limit);
    const nextCursor = offset + limit < all.length ? btoa(String(offset + limit)) : undefined;
    return { templates: page, nextCursor };
  }

  async read(uri: string): Promise<ResourceContent | null> {
    const provider = this.providers.get(uri);
    if (provider) return provider(uri);

    for (const [templateUri, templateProvider] of this.templateProviders) {
      const params = this.matchTemplate(templateUri, uri);
      if (params) return templateProvider(uri, params);
    }

    return null;
  }

  subscribe(uri: string, callback: ResourceSubscriber): boolean {
    if (!this.subscribers.has(uri)) {
      this.subscribers.set(uri, new Set());
    }
    this.subscribers.get(uri)!.add(callback);
    return true;
  }

  unsubscribe(uri: string, callback: ResourceSubscriber): boolean {
    const subs = this.subscribers.get(uri);
    if (!subs) return false;
    return subs.delete(callback);
  }

  notifyUpdate(uri: string): void {
    const subs = this.subscribers.get(uri);
    if (subs) {
      for (const cb of subs) cb(uri);
    }
  }

  notifyListChanged(): void {
    for (const cb of this.listChangedCallbacks) cb();
  }

  removeResource(uri: string): boolean {
    const deleted = this.resources.delete(uri);
    this.providers.delete(uri);
    if (deleted) this.notifyListChanged();
    return deleted;
  }

  private matchTemplate(template: string, uri: string): Record<string, string> | null {
    const templateParts = template.split("/");
    const uriParts = uri.split("/");
    if (templateParts.length !== uriParts.length) return null;

    const params: Record<string, string> = {};
    for (let i = 0; i < templateParts.length; i++) {
      const tp = templateParts[i];
      const up = uriParts[i];
      if (tp.startsWith("{") && tp.endsWith("}")) {
        params[tp.slice(1, -1)] = decodeURIComponent(up);
      } else if (tp !== up) {
        return null;
      }
    }
    return params;
  }
}