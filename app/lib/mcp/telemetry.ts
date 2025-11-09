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

type ResourceTrackerTelemetryEvent = {
  type: 'resource_tracker';
  serverId: string;
  resourceUri?: string;
  event:
    | 'refresh_failed'
    | 'retry_scheduled'
    | 'read_failed'
    | 'unsupported';
  attempt?: number;
  delayMs?: number;
  reason?: string;
  error?: string;
};

export type McpTelemetryEvent =
  | CatalogHandshakeEvent
  | InvocationTelemetryEvent
  | AdminTelemetryEvent
  | ResourceTrackerTelemetryEvent;

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

export function recordResourceTrackerEvent(
  event: ResourceTrackerTelemetryEvent,
): void {
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
