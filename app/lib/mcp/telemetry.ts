const telemetryFlag =
  process.env.NEXT_PUBLIC_ENABLE_TELEMETRY === '1' ||
  process.env.MCP_ENABLE_TELEMETRY === '1';

type CatalogHandshakeEvent = {
  type: 'catalog_handshake';
  durationMs: number;
  toolCount: number;
  cacheHit: boolean;
  success: boolean;
  error?: string;
  collectedAt?: number;
};

type InvocationTelemetryEvent = {
  type: 'invocation';
  invocationId: string;
  toolId: string;
  toolName: string;
  serverId: string;
  sessionId?: string;
  durationMs: number;
  status: 'success' | 'error' | 'cancelled';
  error?: string;
};

type AdminTelemetryEvent = {
  type: 'admin';
  action: 'revoke' | 'restore' | 'reload-config';
  tools?: string[];
  actor?: string;
};

export type McpTelemetryEvent =
  | CatalogHandshakeEvent
  | InvocationTelemetryEvent
  | AdminTelemetryEvent;

export type McpTelemetryHandler = (event: McpTelemetryEvent) => void;

const defaultHandler: McpTelemetryHandler = (event) => {
  if (!telemetryFlag) {
    return;
  }
  console.info('[mcp-telemetry]', event);
};

let handler: McpTelemetryHandler = defaultHandler;

export function recordCatalogHandshake(event: CatalogHandshakeEvent): void {
  handler(event);
}

export function recordInvocation(event: InvocationTelemetryEvent): void {
  handler(event);
}

export function recordAdminAction(event: AdminTelemetryEvent): void {
  handler(event);
}

export function setMcpTelemetryHandlerForTesting(
  next: McpTelemetryHandler | null,
): void {
  handler = next ?? defaultHandler;
}

export function isMcpTelemetryEnabled(): boolean {
  return telemetryFlag || handler !== defaultHandler;
}
