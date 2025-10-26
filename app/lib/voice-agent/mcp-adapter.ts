import type { RealtimeSession } from '@openai/agents/realtime';

type TransportEvent = {
  type: string;
  [key: string]: unknown;
};

export type McpToolSummary = {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  serverId: string;
};

export type ToolRunStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled';

export interface ToolRunState {
  runId: string;
  toolId: string;
  toolName: string;
  serverId: string;
  status: ToolRunStatus;
  message?: string;
  output?: unknown;
  startedAt: number;
  completedAt?: number;
}

export interface CatalogResponse {
  tools: {
    id: string;
    name: string;
    description?: string;
    permissions: string[];
    serverId: string;
    inputSchema: unknown;
  }[];
  collectedAt: number;
}

export interface InvokeEvent {
  type: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled';
  data?: unknown;
  message?: string;
}

export interface InvokeOptions {
  invocationId: string;
  toolId: string;
  payload: unknown;
  onEvent: (event: InvokeEvent) => void;
  grantedPermissions?: string[];
}

export type CatalogFetcher = () => Promise<CatalogResponse>;
export type ToolInvoker = (options: InvokeOptions) => Promise<void>;

export interface McpAdapterOptions {
  fetchCatalog?: CatalogFetcher;
  invokeTool?: ToolInvoker;
  grantedPermissions?: () => string[];
}

const defaultCatalogFetcher: CatalogFetcher = async () => {
  const response = await fetch('/api/mcp/catalog', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load catalog (${response.status})`);
  }
  return response.json();
};

const defaultInvoker: ToolInvoker = async ({
  invocationId,
  toolId,
  payload,
  onEvent,
  grantedPermissions,
}) => {
  const controller = new AbortController();
  const response = await fetch('/api/mcp/invoke', {
    method: 'POST',
    body: JSON.stringify({
      invocationId,
      toolId,
      input: payload,
      grantedPermissions,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    signal: controller.signal,
  });

  if (!response.ok || !response.body) {
    const error = await response.text();
    onEvent({ type: 'failed', message: error || 'Invocation failed' });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      if (!part.startsWith('data:')) {
        continue;
      }
      const payloadLine = part.slice(5).trim();
      if (!payloadLine) {
        continue;
      }
      try {
        const event = JSON.parse(payloadLine) as {
          type: string;
          [key: string]: unknown;
        };
        switch (event.type) {
          case 'started':
            onEvent({ type: 'started' });
            break;
          case 'progress':
            onEvent({ type: 'progress', data: event });
            break;
          case 'completed':
            onEvent({
              type: 'completed',
              data: event,
            });
            break;
          case 'cancelled':
            onEvent({ type: 'cancelled', message: String(event.reason ?? '') });
            break;
          case 'error':
          case 'failed':
            onEvent({ type: 'failed', message: String(event.error ?? '') });
            break;
          case 'final':
            onEvent({ type: 'completed', data: event.outcome });
            break;
          default:
            break;
        }
      } catch (error) {
        onEvent({ type: 'failed', message: String(error) });
      }
    }
  }
};

export type ToolEvent = {
  type: 'tools-changed';
  tools: McpToolSummary[];
};

export type RunEvent = {
  type: 'run-updated';
  run: ToolRunState;
};

type Listener = (event: ToolEvent | RunEvent) => void;

export class McpAdapter {
  private readonly fetchCatalog: CatalogFetcher;

  private readonly invokeTool: ToolInvoker;

  private readonly listeners = new Set<Listener>();

  private readonly runs = new Map<string, ToolRunState>();

  private tools: McpToolSummary[] = [];

  private session: RealtimeSession | null = null;

  private readonly grantedPermissions?: () => string[];

  private readonly handler = (event: TransportEvent) =>
    this.handleTransportEvent(event);

  constructor(options: McpAdapterOptions = {}) {
    this.fetchCatalog = options.fetchCatalog ?? defaultCatalogFetcher;
    this.invokeTool = options.invokeTool ?? defaultInvoker;
    this.grantedPermissions = options.grantedPermissions;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener({ type: 'tools-changed', tools: this.tools });
    this.runs.forEach((run) => listener({ type: 'run-updated', run }));
    return () => {
      this.listeners.delete(listener);
    };
  }

  async attach(session: RealtimeSession): Promise<void> {
    if (this.session === session) {
      return;
    }
    this.detach();
    this.session = session;
    session.on('transport_event', this.handler);
    await this.refreshCatalog();
  }

  detach(): void {
    if (!this.session) {
      return;
    }
    this.session.off('transport_event', this.handler);
    this.session = null;
  }

  processTransportEventForTesting(event: TransportEvent): void {
    this.handleTransportEvent(event);
  }

  async refreshCatalog(): Promise<void> {
    try {
      const response = await this.fetchCatalog();
      this.tools = response.tools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        permissions: tool.permissions,
        serverId: tool.serverId,
      }));
      this.broadcast({ type: 'tools-changed', tools: this.tools });
      this.updateSessionTools();
    } catch (error) {
      console.warn('[mcp-adapter] Failed to refresh catalog', error);
    }
  }

  private handleTransportEvent(event: TransportEvent) {
    if (event.type === 'response.output_item.added') {
      const item = event.item as Record<string, unknown> | undefined;
      if (item?.type === 'mcp_tool_call' || item?.type === 'mcp_call') {
        this.startInvocationFromEvent(event, item);
      }
    }
  }

  private startInvocationFromEvent(
    event: TransportEvent,
    item: Record<string, unknown>,
  ) {
    const invocationId = String(item.id ?? event.item_id ?? event.event_id ?? Date.now());
    const toolName = String(item.name ?? 'unknown');
    const argumentsText = String(item.arguments ?? '{}');
    const tool = this.tools.find((entry) => entry.name === toolName);
    if (!tool) {
      console.warn('[mcp-adapter] Tool not found in catalog', toolName);
      return;
    }

    const run: ToolRunState = {
      runId: invocationId,
      toolId: tool.id,
      toolName: tool.name,
      serverId: tool.serverId,
      status: 'running',
      message: 'Running tool…',
      startedAt: Date.now(),
    };

    this.runs.set(run.runId, run);
    this.broadcast({ type: 'run-updated', run });

    let parsedArgs: unknown = null;
    try {
      parsedArgs = JSON.parse(argumentsText || 'null');
    } catch (error) {
      run.status = 'error';
      run.message = 'Invalid tool arguments';
      this.broadcast({ type: 'run-updated', run });
      return;
    }

    const permissions = this.grantedPermissions?.() ?? [];

    void this.invokeTool({
      invocationId,
      toolId: tool.id,
      payload: parsedArgs,
      grantedPermissions: permissions,
      onEvent: (invokeEvent) => {
        this.handleInvocationEvent(run, invokeEvent);
      },
    }).catch((error) => {
      run.status = 'error';
      run.completedAt = Date.now();
      run.message = error instanceof Error ? error.message : String(error);
      this.broadcast({ type: 'run-updated', run });
    });
  }

  private handleInvocationEvent(run: ToolRunState, event: InvokeEvent): void {
    switch (event.type) {
      case 'started':
      case 'progress':
        run.status = 'running';
        run.message =
          event.type === 'progress'
            ? String(event.message ?? 'Running…')
            : 'Running tool…';
        break;
      case 'completed':
        run.status = 'success';
        run.completedAt = Date.now();
        run.message = 'Completed';
        run.output = event.data;
        this.emitToolResult(run, event.data);
        break;
      case 'failed':
        run.status = 'error';
        run.completedAt = Date.now();
        run.message = event.message ?? 'Tool failed';
        break;
      case 'cancelled':
        run.status = 'cancelled';
        run.completedAt = Date.now();
        run.message = event.message ?? 'Invocation cancelled';
        break;
      default:
        break;
    }
    this.broadcast({ type: 'run-updated', run });
  }

  private emitToolResult(run: ToolRunState, data: unknown) {
    const session = this.session;
    if (!session) {
      return;
    }
    try {
      session.transport.sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'mcp_tool_call',
          status: 'completed',
          name: run.toolName,
          output: JSON.stringify(data ?? null),
        },
      } as unknown as Record<string, unknown>);
      session.transport.sendEvent({ type: 'response.create' } as Record<
        string,
        unknown
      >);
    } catch (error) {
      console.warn('[mcp-adapter] Failed to emit tool result', error);
    }
  }

  private updateSessionTools(): void {
    const session = this.session;
    if (!session || this.tools.length === 0) {
      return;
    }

    const grouped = new Map<string, string[]>();
    this.tools.forEach((tool) => {
      const list = grouped.get(tool.serverId) ?? [];
      list.push(tool.name);
      grouped.set(tool.serverId, list);
    });

    const toolsConfig = Array.from(grouped.entries()).map(([serverId, names]) => ({
      type: 'mcp',
      server_label: serverId,
      allowed_tools: names,
      require_approval: 'never',
    }));

    try {
      session.transport.sendEvent({
        type: 'session.update',
        session: {
          type: 'realtime',
          tools: toolsConfig,
        },
      } as unknown as Record<string, unknown>);
    } catch (error) {
      console.warn('[mcp-adapter] Failed to update session tools', error);
    }
  }

  private broadcast(event: ToolEvent | RunEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
