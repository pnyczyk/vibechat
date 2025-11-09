/** @jest-environment node */

import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { McpResourceTracker } from '@/app/lib/mcp/resource-tracker';
import type { McpClientPool } from '@/app/lib/mcp/client-pool';
import type { McpServerDefinition } from '@/app/lib/mcp/config';
import type { RuntimeServerSnapshot } from '@/app/lib/mcp/process-registry';
import type { McpServerManager } from '@/app/lib/mcp/serverManager';
import {
  setMcpResourceTrackerForTesting,
  setMcpRuntimeForTesting,
} from '@/app/lib/mcp/runtime';
import { setMcpTelemetryHandlerForTesting } from '@/app/lib/mcp/telemetry';

type TestClient = Client & {
  trigger: (method: string, payload?: Record<string, unknown>) => void;
};

describe('McpResourceTracker', () => {
  let telemetryEvents: unknown[] = [];

  beforeEach(() => {
    jest.useFakeTimers();
    telemetryEvents = [];
    setMcpTelemetryHandlerForTesting((event) => {
      telemetryEvents.push(event);
    });
    setMcpRuntimeForTesting(null);
    setMcpResourceTrackerForTesting(null);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    setMcpTelemetryHandlerForTesting(null);
  });

  it('subscribes to resources and emits updates for tracked servers', async () => {
    const client = createMockClient();
    client.listResources.mockResolvedValue({
      resources: [createResource('mcp://resource/alpha')],
      nextCursor: null,
    });

    const manager = createManager();
    const server = createRuntimeServer();
    manager.setServers([server]);

    const tracker = createTracker({ client, manager });
    const events: unknown[] = [];
    tracker.on('resource_update', (event) => events.push(event));

    await tracker.start();
    await flushAsync();

    expect(client.subscribeResource).toHaveBeenCalledWith({
      uri: 'mcp://resource/alpha',
    });

    client.trigger('notifications/resources/updated', {
      method: 'notifications/resources/updated',
      params: { uri: 'mcp://resource/alpha' },
    });

    await flushAsync();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      serverId: server.definition.id,
      resourceUri: 'mcp://resource/alpha',
    });
  });

  it('refreshes subscriptions when list changes', async () => {
    const client = createMockClient();
    client.listResources
      .mockResolvedValueOnce({
        resources: [createResource('mcp://resource/alpha')],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        resources: [createResource('mcp://resource/beta')],
        nextCursor: null,
      });

    const manager = createManager();
    manager.setServers([createRuntimeServer()]);

    const tracker = createTracker({ client, manager });
    await tracker.start();
    await flushAsync();

    expect(client.subscribeResource).toHaveBeenCalledWith({
      uri: 'mcp://resource/alpha',
    });

    client.trigger('notifications/resources/list_changed', {
      method: 'notifications/resources/list_changed',
    });

    await flushAsync();

    expect(client.unsubscribeResource).toHaveBeenCalledWith({
      uri: 'mcp://resource/alpha',
    });
    expect(client.subscribeResource).toHaveBeenCalledWith({
      uri: 'mcp://resource/beta',
    });
  });

  it('deduplicates rapid update notifications within the configured window', async () => {
    let now = 0;
    const advanceTime = async (ms: number) => {
      now += ms;
      jest.advanceTimersByTime(ms);
      await flushAsync();
    };

    const client = createMockClient();
    client.listResources.mockResolvedValue({
      resources: [createResource('mcp://resource/alpha')],
      nextCursor: null,
    });

    const manager = createManager();
    manager.setServers([createRuntimeServer()]);

    const tracker = createTracker({ client, manager, now: () => now });
    const handler = jest.fn();
    tracker.on('resource_update', handler);

    await tracker.start();
    await flushAsync();

    client.trigger('notifications/resources/updated', {
      method: 'notifications/resources/updated',
      params: { uri: 'mcp://resource/alpha' },
    });
    await flushAsync();

    client.trigger('notifications/resources/updated', {
      method: 'notifications/resources/updated',
      params: { uri: 'mcp://resource/alpha' },
    });
    await flushAsync();

    expect(handler).toHaveBeenCalledTimes(1);

    await advanceTime(2_100);

    client.trigger('notifications/resources/updated', {
      method: 'notifications/resources/updated',
      params: { uri: 'mcp://resource/alpha' },
    });
    await flushAsync();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('schedules retries with exponential backoff when refresh fails', async () => {
    let now = 0;
    const client = createMockClient();
    client.listResources
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue({
        resources: [createResource('mcp://resource/alpha')],
        nextCursor: null,
      });

    const manager = createManager();
    manager.setServers([createRuntimeServer()]);

    const tracker = createTracker({
      client,
      manager,
      now: () => now,
      retryInitialMs: 100,
    });

    await tracker.start();
    await flushAsync();

    expect(client.subscribeResource).not.toHaveBeenCalled();
    expect(telemetryEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource_tracker',
          event: 'retry_scheduled',
        }),
      ]),
    );

    now += 100;
    jest.advanceTimersByTime(100);
    await flushAsync();

    expect(client.subscribeResource).toHaveBeenCalledWith({
      uri: 'mcp://resource/alpha',
    });
  });

  it('tears down subscriptions when a server stops tracking resources', async () => {
    const client = createMockClient();
    client.listResources.mockResolvedValue({
      resources: [createResource('mcp://resource/alpha')],
      nextCursor: null,
    });

    const manager = createManager();
    const server = createRuntimeServer();
    manager.setServers([server]);

    const tracker = createTracker({ client, manager });
    await tracker.start();
    await flushAsync();

    expect(client.subscribeResource).toHaveBeenCalledTimes(1);

    manager.setServers([]);
    jest.advanceTimersByTime(1_000);
    await flushAsync();

    expect(client.unsubscribeResource).toHaveBeenCalledWith({
      uri: 'mcp://resource/alpha',
    });
    expect(client.removeNotificationHandler).toHaveBeenCalledWith(
      'notifications/resources/updated',
    );
  });
});

const createTracker = ({
  client,
  manager = createManager(),
  now = () => Date.now(),
  retryInitialMs,
}: {
  client: TestClient;
  manager?: ReturnType<typeof createManager>;
  now?: () => number;
  retryInitialMs?: number;
}): McpResourceTracker => {
  const clientPool: McpClientPool = {
    getClient: jest.fn().mockResolvedValue(client),
  } as unknown as McpClientPool;

  return new McpResourceTracker({
    manager: manager as unknown as McpServerManager,
    clientPool,
    ensureServersStarted: jest.fn().mockResolvedValue(undefined),
    pollIntervalMs: 1_000,
    dedupeWindowMs: 2_000,
    retryInitialMs,
    now,
  });
};

const createManager = () => {
  let servers: RuntimeServerSnapshot[] = [];
  const getRuntimeServers = jest.fn(() => servers);
  return {
    getRuntimeServers,
    setServers(next: RuntimeServerSnapshot[]) {
      servers = next;
    },
  };
};

const createRuntimeServer = (
  overrides: Partial<RuntimeServerSnapshot> = {},
): RuntimeServerSnapshot => {
  const definition: McpServerDefinition = {
    id: overrides.definition?.id ?? 'server-a',
    command: 'cmd',
    args: [],
    description: 'Mock server',
    enabled: true,
    workingDirectory: process.cwd(),
    trackResources: true,
    ...overrides.definition,
  } as McpServerDefinition;

  return {
    id: definition.id,
    definition,
    status: 'running',
    restarts: 0,
    lastExit: undefined,
    lastStartedAt: Date.now(),
    pid: overrides.pid ?? 1234,
    process: createMockProcess(overrides.pid ?? 1234),
    ...overrides,
  } as RuntimeServerSnapshot;
};

const createMockProcess = (pid: number) => {
  const proc = new EventEmitter() as ChildProcessWithoutNullStreams;
  Object.assign(proc, {
    pid,
    stdin: undefined,
    stdout: undefined,
    stderr: undefined,
    kill: jest.fn().mockReturnValue(true),
  });
  return proc;
};

const createMockClient = (): TestClient => {
  const handlers = new Map<string, (payload?: Record<string, unknown>) => void>();
  const client: Partial<Client> & { trigger: TestClient['trigger'] } = {
    listResources: jest.fn(),
    subscribeResource: jest.fn().mockResolvedValue(undefined),
    unsubscribeResource: jest.fn().mockResolvedValue(undefined),
    readResource: jest.fn().mockResolvedValue({ contents: [] }),
    setNotificationHandler: jest
      .fn()
      .mockImplementation((schema: any, handler: (payload: any) => void) => {
        handlers.set(schema.shape.method.value, handler);
      }),
    removeNotificationHandler: jest
      .fn()
      .mockImplementation((method: string) => {
        handlers.delete(method);
      }),
    trigger: (method: string, payload?: Record<string, unknown>) => {
      const handler = handlers.get(method);
      handler?.(payload ?? {});
    },
  };

  return client as TestClient;
};

const createResource = (uri: string) => ({
  uri,
  name: uri,
  mimeType: 'text/plain',
});

const flushAsync = async () => {
  // Give pending async tasks (promise chains + timers) plenty of chances
  // to resolve so tracker refreshes complete before assertions run.
  for (let i = 0; i < 20; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};
