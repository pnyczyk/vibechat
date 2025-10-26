/** @jest-environment node */

import { McpToolPolicy } from '@/app/lib/mcp/tool-policy';

describe('MCP admin route', () => {
  let runtimeReset: ((instance: unknown) => void) | null = null;
  let invocationReset: ((instance: unknown) => void) | null = null;
  let telemetryReset: ((handler: unknown) => void) | null = null;

  afterEach(() => {
    telemetryReset?.(null);
    runtimeReset?.(null);
    invocationReset?.(null);
    runtimeReset = null;
    invocationReset = null;
    telemetryReset = null;
    delete process.env.MCP_ADMIN_TOKEN;
    jest.resetModules();
  });

  it('rejects unauthorized requests', async () => {
    process.env.MCP_ADMIN_TOKEN = 'unit-test-token';
    jest.resetModules();
    const { setMcpTelemetryHandlerForTesting } = await import('@/app/lib/mcp/telemetry');
    telemetryReset = setMcpTelemetryHandlerForTesting;
    setMcpTelemetryHandlerForTesting(() => {});

    const { POST } = await import('@/app/api/mcp/admin/route');
    const response = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ action: 'reload-config' }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it('revokes tools, cancels invocations, and logs telemetry', async () => {
    process.env.MCP_ADMIN_TOKEN = 'test-token';
    jest.resetModules();

    const policy = new McpToolPolicy();
    const telemetry: unknown[] = [];
    const { setMcpTelemetryHandlerForTesting } = await import('@/app/lib/mcp/telemetry');
    telemetryReset = setMcpTelemetryHandlerForTesting;
    setMcpTelemetryHandlerForTesting((event) => telemetry.push(event));

    const cancelByTool = jest.fn();

    const { setInvocationServiceForTesting } = await import('@/app/lib/mcp/invocation-service');
    invocationReset = setInvocationServiceForTesting;
    setInvocationServiceForTesting({
      cancelByTool,
      invoke: jest.fn(),
      cancel: jest.fn(),
    } as any);

    const reload = jest
      .fn()
      .mockResolvedValue({ started: [], stopped: [], restarted: [] });

    const { setMcpRuntimeForTesting } = await import('@/app/lib/mcp/runtime');
    runtimeReset = setMcpRuntimeForTesting;
    setMcpRuntimeForTesting({
      policy,
      clientPool: {} as any,
      manager: {
        start: jest.fn().mockResolvedValue(undefined),
        getRuntimeServers: jest.fn(() => []),
        reload,
      } as any,
    });

    const { getCatalogService } = await import('@/app/lib/mcp/catalog-service');
    const catalogService = getCatalogService();
    const invalidateSpy = jest.spyOn(catalogService, 'invalidateCache');

    const { POST } = await import('@/app/api/mcp/admin/route');
    const response = await POST(
      new Request('http://test', {
        method: 'POST',
        headers: { authorization: 'Bearer test-token' },
        body: JSON.stringify({
          action: 'revoke',
          tools: ['server-a:tool-z'],
          reason: 'test-reason',
          actor: 'unit-test',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(cancelByTool).toHaveBeenCalledWith(['server-a:tool-z']);
    expect(invalidateSpy).toHaveBeenCalled();
    const json = await response.json();
    expect(json.status).toBe('revoked');
    expect(policy.listRevoked()).toContain('server-a:tool-z');
    expect(telemetry.length).toBeGreaterThan(0);
  });
});
