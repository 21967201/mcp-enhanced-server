export interface ElicitationRequest {
  id: string;
  message: string;
  schema: Record<string, unknown>;
  requestId: string;
}

export interface ElicitationResponse {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>;
}

export class ElicitationManager {
  private pendingRequests = new Map<
    string,
    {
      resolve: (response: ElicitationResponse) => void;
      request: ElicitationRequest;
    }
  >();

  createRequest(
    message: string,
    schema: Record<string, unknown>
  ): {
    request: ElicitationRequest;
    response: Promise<ElicitationResponse>;
  } {
    const id = crypto.randomUUID();
    const requestId = crypto.randomUUID();

    const request: ElicitationRequest = {
      id,
      message,
      schema,
      requestId,
    };

    let resolveFunc!: (response: ElicitationResponse) => void;
    const response = new Promise<ElicitationResponse>((resolve) => {
      resolveFunc = resolve;
    });

    this.pendingRequests.set(id, { resolve: resolveFunc, request });
    return { request, response };
  }

  respond(id: string, response: ElicitationResponse): boolean {
    const pending = this.pendingRequests.get(id);
    if (!pending) return false;
    pending.resolve(response);
    this.pendingRequests.delete(id);
    return true;
  }

  getPending(id: string): ElicitationRequest | undefined {
    return this.pendingRequests.get(id)?.request;
  }

  cancelAll(): void {
    for (const [id, pending] of this.pendingRequests) {
      pending.resolve({ action: "cancel" });
      this.pendingRequests.delete(id);
    }
  }
}