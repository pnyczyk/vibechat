/** @jest-environment node */

import { EventEmitter } from 'node:events';


import { McpInvocationService } from '@/app/lib/mcp/invocation-service';
import type { InvocationEvent } from '@/app/lib/mcp/invocation-service';
import type { McpCatalogService } from '@/app/lib/mcp/catalog-service';
import type { McpClientPool } from '@/app/lib/mcp/client-pool';
import type { McpServerManager } from '@/app/lib/mcp/serverManager';
import { McpToolPolicy } from '@/app/lib/mcp/tool-policy';
import { setMcpTelemetryHandlerForTesting } from '@/app/lib/mcp/telemetry';

describe('McpInvocationService', () => {
  let events: InvocationEvent[];
  let telemetry: unknown[];

  beforeEach(() => {
    events = [];
    telemetry = [];
    setMcpTelemetryHandlerForTesting((event) => telemetry.push(event));
  });

  afterEach(() => {
    setMcpTelemetryHandlerForTesting(null);
    jest.clearAllMocks();
  });

  const createService = ({
    manager,
    clientPool,
    catalog,
    policy,
  }: {
    manager?: Partial<McpServerManager>;
    clientPool?: Partial<McpClientPool>;
    catalog?: Partial<McpCatalogService>;
    policy?: McpToolPolicy;
  } = {}) => {
    const defaultManager: Partial<McpServerManager> = {
      getRuntimeServers: jest.fn().mockReturnValue([
        {
          definition: {
            id: 'server-a',
            command: 'test',
            args: [],
            enabled: true,
          },
          status: 'running' as const,
          restarts: 0,
          pid: 1,
          process: new EventEmitter(),
        },
      ]),
    };

    const defaultClient = {
      callTool: jest.fn().mockResolvedValue({
        output: 'done',
        structuredContent: { ok: true },
        isError: false,
      }),
    };

    const defaultClientPool: Partial<McpClientPool> = {
      getClient: jest.fn().mockResolvedValue(defaultClient),
    };

    const defaultCatalog: Partial<McpCatalogService> = {
      getCatalog: jest.fn().mockResolvedValue({
        tools: [
          {
            id: 'server-a:tool-x',
            name: 'tool-x',
            description: 'test',
            inputSchema: { type: 'object', properties: {} },
            permissions: [],
            transport: 'stdio' as const,
            serverId: 'server-a',
          },
        ],
        collectedAt: Date.now(),
      }),
      invalidateCache: jest.fn(),
    };

    const service = new McpInvocationService({
      manager: (manager ?? defaultManager) as McpServerManager,
      clientPool: (clientPool ?? defaultClientPool) as McpClientPool,
      catalogService: (catalog ?? defaultCatalog) as McpCatalogService,
      policy: policy ?? new McpToolPolicy(),
      now: () => 1_000,
      requestTimeoutMs: 1_000,
    });

    return {
      service,
      client: defaultClient,
      clientPool: (clientPool ?? defaultClientPool) as {
        getClient: jest.Mock;
      },
      manager: (manager ?? defaultManager) as { getRuntimeServers: jest.Mock },
      catalog: (catalog ?? defaultCatalog) as {
        getCatalog: jest.Mock;
      },
    };
  };

  const handler = {
    onEvent: (event: InvocationEvent) => {
      events.push(event);
    },
  };

  it('invokes tool successfully and streams events', async () => {
    const { service, client } = createService();

    const outcome = await service.invoke(
      {
        toolId: 'server-a:tool-x',
        input: { query: 'hello' },
        invocationId: 'inv-1',
        sessionId: 'sess-1',
      },
      handler,
    );

    expect(client.callTool).toHaveBeenCalledWith(
      {
        name: 'tool-x',
        arguments: { query: 'hello' },
      },
      expect.anything(),
      expect.objectContaining({
        onprogress: expect.any(Function),
      }),
    );
    expect(outcome.status).toBe('success');
    expect(events.map((event) => event.type)).toEqual([
      'started',
      'output',
      'completed',
    ]);
    expect(
      telemetry.find(
        (event) =>
          typeof event === 'object' &&
          event !== null &&
          (event as { type?: string }).type === 'invocation' &&
          (event as { status?: string }).status === 'success',
      ),
    ).toBeDefined();
  });

  it('handles tool responses with array structuredContent', async () => {
    const client = {
      callTool: jest.fn().mockResolvedValue({
        structuredContent: [
          { id: 'task-1', state: 'STOPPED' },
          { id: 'task-2', state: 'RUNNING' },
        ],
        isError: false,
      }),
    };

    const clientPool: Partial<McpClientPool> = {
      getClient: jest.fn().mockResolvedValue(client),
    };

    const { service } = createService({ clientPool });

    const outcome = await service.invoke(
      {
        toolId: 'server-a:tool-x',
        input: {},
      },
      handler,
    );

    expect(client.callTool).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe('success');
    expect(
      events.some(
        (event) =>
          event.type === 'output' &&
          Array.isArray(
            (event as { content?: unknown }).content ?? undefined,
          ),
      ),
    ).toBe(true);
  });

  it('returns content responses when structuredContent is absent', async () => {
    const responseContent = [{ type: 'text', text: 'hello' }];
    const client = {
      callTool: jest.fn().mockResolvedValue({
        content: responseContent,
        isError: false,
      }),
    };

    const clientPool: Partial<McpClientPool> = {
      getClient: jest.fn().mockResolvedValue(client),
    };

    const { service } = createService({ clientPool });

    const outcome = await service.invoke(
      {
        toolId: 'server-a:tool-x',
        input: {},
      },
      handler,
    );

    expect(outcome.status).toBe('success');
    expect(outcome.result).toEqual(responseContent);

    const outputEvent = events.find(
      (event) => event.type === 'output',
    ) as { type: string; content?: unknown } | undefined;
    expect(outputEvent?.content).toEqual(responseContent);

    const completedEvent = events.find(
      (event) => event.type === 'completed',
    ) as { type: string; content?: unknown } | undefined;
    expect(completedEvent?.content).toEqual(responseContent);
  });

  it('fails when permissions missing', async () => {
    const catalog: Partial<McpCatalogService> = {
      getCatalog: jest.fn().mockResolvedValue({
        tools: [
          {
            id: 'server-a:secure',
            name: 'secure',
            description: 'secure',
            inputSchema: { type: 'object', properties: {} },
            permissions: ['write'],
            transport: 'stdio' as const,
            serverId: 'server-a',
          },
        ],
        collectedAt: Date.now(),
      }),
    };

    const { service } = createService({ catalog });

    const outcome = await service.invoke(
      {
        toolId: 'server-a:secure',
        input: {},
        invocationId: 'inv-2',
      },
      handler,
    );

    expect(outcome.status).toBe('error');
    expect(
      telemetry.find(
        (event) =>
          typeof event === 'object' &&
          event !== null &&
          (event as { type?: string }).type === 'invocation' &&
          (event as { status?: string }).status === 'error',
      ),
    ).toBeDefined();
  });

  it('cancels invocation when revoked mid-flight', async () => {
    const policy = new McpToolPolicy();
    const { service, clientPool } = createService({ policy });

    (clientPool.getClient as jest.Mock).mockImplementation(async () => ({
      callTool: (_request, _schema, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    }));

    const promise = service.invoke(
      {
        toolId: 'server-a:tool-x',
        input: {},
        invocationId: 'inv-3',
      },
      handler,
    );

    await new Promise((resolve) => setImmediate(resolve));
    policy.revoke(['server-a:tool-x']);
    const outcome = await promise;

    expect(outcome.status).toBe('cancelled');
  });

  it('supports manual cancellation', async () => {
    const { service, clientPool } = createService();

    const callTool = jest.fn(
      (_request, _schema, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );

    (clientPool.getClient as jest.Mock).mockResolvedValue({ callTool });

    const invocation = service.invoke(
      {
        toolId: 'server-a:tool-x',
        input: {},
        invocationId: 'inv-4',
      },
      handler,
    );

    await new Promise((resolve) => setImmediate(resolve));
    const cancelled = service.cancel('inv-4');
    expect(cancelled).toBe(true);

    const outcome = await invocation;
    expect(outcome.status).toBe('cancelled');
    expect(callTool).toHaveBeenCalled();
  });
});
