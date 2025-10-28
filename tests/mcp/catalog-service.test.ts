/** @jest-environment node */

import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { PassThrough } from 'node:stream';

import { McpCatalogService } from '@/app/lib/mcp/catalog-service';
import type { McpServerManager } from '@/app/lib/mcp/serverManager';
import { McpToolPolicy } from '@/app/lib/mcp/tool-policy';
import { setMcpTelemetryHandlerForTesting } from '@/app/lib/mcp/telemetry';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: number;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id?: number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

const latestProtocolVersion = '2025-06-18';

let telemetryEvents: unknown[] = [];

beforeEach(() => {
  telemetryEvents = [];
  setMcpTelemetryHandlerForTesting((event) => {
    telemetryEvents.push(event);
  });
});

afterEach(() => {
  setMcpTelemetryHandlerForTesting(null);
  jest.clearAllMocks();
});

const createRpcProcess = (
  handlers: Record<string, (request: JsonRpcRequest) => JsonRpcResponse | void>,
  options: { pid?: number } = {},
): ChildProcessWithoutNullStreams => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  const proc = new EventEmitter() as ChildProcessWithoutNullStreams;
  Object.assign(proc, {
    stdin,
    stdout,
    stderr,
    pid: options.pid ?? Math.floor(Math.random() * 10_000),
    kill: jest.fn().mockReturnValue(true),
  });

  stdin.on('data', (chunk) => {
    const messages = chunk
      .toString('utf-8')
      .split('\n')
      .filter(Boolean);

    for (const raw of messages) {
      const parsed = JSON.parse(raw) as JsonRpcRequest;
      const handler = handlers[parsed.method];
      if (!handler) {
        continue;
      }
      const response = handler(parsed);
      if (!response) {
        continue;
      }
      stdout.write(`${JSON.stringify(response)}\n`);
    }
  });

  return proc;
};

describe('McpCatalogService', () => {
  it('aggregates tools from running servers and filters unauthorized entries', async () => {
    const manager = {
      start: jest.fn().mockResolvedValue(undefined),
      getRuntimeServers: jest.fn(() => [
        {
          id: 'server-a',
          definition: {
            id: 'server-a',
            command: 'codex-tasks',
            args: ['mcp'],
            enabled: true,
          },
          status: 'running' as const,
          restarts: 0,
          pid: 321,
          process: createRpcProcess(
            {
              initialize: (request) => ({
                jsonrpc: '2.0',
                id: request.id ?? null,
                result: {
                  protocolVersion: latestProtocolVersion,
                  capabilities: { tools: {} },
                  serverInfo: { name: 'mock-a', version: '1.0.0' },
                },
              }),
              'notifications/initialized': () => undefined,
              'tools/list': (request) => ({
                jsonrpc: '2.0',
                id: request.id ?? null,
                result: {
                  tools: [
                    {
                      name: 'Summarize',
                      description: 'Summaries',
                      inputSchema: { type: 'object', properties: {} },
                      annotations: { permissions: ['read'] },
                    },
                    {
                      name: 'Restricted',
                      inputSchema: { type: 'object', properties: {} },
                      annotations: { authorized: false },
                    },
                  ],
                },
              }),
            },
            { pid: 321 },
          ),
        },
        {
          id: 'server-b',
          definition: {
            id: 'server-b',
            command: 'other',
            args: [],
            enabled: true,
          },
          status: 'running' as const,
          restarts: 0,
          pid: 654,
          process: createRpcProcess(
            {
              initialize: (request) => ({
                jsonrpc: '2.0',
                id: request.id ?? null,
                result: {
                  protocolVersion: latestProtocolVersion,
                  capabilities: { tools: {} },
                  serverInfo: { name: 'mock-b', version: '1.0.0' },
                },
              }),
              'notifications/initialized': () => undefined,
              'tools/list': (request) => ({
                jsonrpc: '2.0',
                id: request.id ?? null,
                result: {
                  tools: [
                    {
                      name: 'Translate',
                      inputSchema: { type: 'object', properties: {} },
                    },
                  ],
                },
              }),
            },
            { pid: 654 },
          ),
        },
      ]),
    } as unknown as McpServerManager;

    const service = new McpCatalogService({
      manager,
      requestTimeoutMs: 100,
    });

    const result = await service.getCatalog();

    expect(manager.start).toHaveBeenCalledTimes(1);
    expect(result.tools).toHaveLength(2);
    expect(result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'server-a:Summarize',
          name: 'Summarize',
          permissions: ['read'],
          transport: 'stdio',
        }),
        expect.objectContaining({
          id: 'server-b:Translate',
          name: 'Translate',
          permissions: [],
        }),
      ]),
    );
    expect(
      telemetryEvents.find(
        (event) =>
          typeof event === 'object' &&
          event !== null &&
          (event as { type?: string }).type === 'catalog_handshake',
      ),
    ).toBeDefined();
  });

  it('waits for MCP servers to expose tools during startup before returning catalog', async () => {
    let listCalls = 0;
    const process = createRpcProcess({
      initialize: (request) => ({
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {
          protocolVersion: latestProtocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'warmup', version: '1.0.0' },
        },
      }),
      'notifications/initialized': () => undefined,
      'tools/list': (request) => {
        listCalls += 1;
        return {
          jsonrpc: '2.0',
          id: request.id ?? null,
          result: {
            tools:
              listCalls < 2
                ? []
                : [
                    {
                      name: 'Stabilize',
                      description: 'becomes available after warmup',
                      inputSchema: { type: 'object', properties: {} },
                    },
                  ],
          },
        };
      },
    });

    const manager = {
      start: jest.fn().mockResolvedValue(undefined),
      getRuntimeServers: jest.fn(() => [
        {
          id: 'warmup',
          definition: { id: 'warmup', command: 'cmd', args: [], enabled: true },
          status: 'running' as const,
          restarts: 0,
          pid: 42,
          process,
        },
      ]),
    } as unknown as McpServerManager;

    const service = new McpCatalogService({
      manager,
      requestTimeoutMs: 100,
      startupTimeoutMs: 500,
      startupPollIntervalMs: 10,
    });

    const result = await service.getCatalog();

    expect(manager.start).toHaveBeenCalledTimes(1);
    expect(listCalls).toBeGreaterThanOrEqual(2);
    expect(result.tools).toEqual([
      expect.objectContaining({
        id: 'warmup:Stabilize',
        name: 'Stabilize',
      }),
    ]);
  });

  it('caches catalog responses within TTL and refreshes after expiry', async () => {
    const firstProcess = createRpcProcess({
      initialize: (request) => ({
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {
          protocolVersion: latestProtocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'mock', version: '1.0.0' },
        },
      }),
      'notifications/initialized': () => undefined,
      'tools/list': (request) => ({
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {
          tools: [
            {
              name: 'Echo',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        },
      }),
    });

    const manager = {
      start: jest.fn().mockResolvedValue(undefined),
      getRuntimeServers: jest
        .fn()
        .mockReturnValue([
          {
            id: 'server-a',
            definition: { id: 'server-a', command: 'cmd', args: [], enabled: true },
            status: 'running' as const,
            restarts: 0,
            pid: 100,
            process: firstProcess,
          },
        ]),
    } as unknown as McpServerManager;

    let currentTime = 0;
    const service = new McpCatalogService({
      manager,
      cacheTtlMs: 1_000,
      requestTimeoutMs: 100,
      now: () => currentTime,
    });

    const first = await service.getCatalog();
    expect(first.tools).toHaveLength(1);
    expect(first.tools[0].name).toBe('Echo');
    expect(manager.getRuntimeServers).toHaveBeenCalledTimes(1);

    currentTime += 500;
    const second = await service.getCatalog();
    expect(second.tools[0].name).toBe('Echo');
    expect(manager.getRuntimeServers).toHaveBeenCalledTimes(1);

    const refreshedProcess = createRpcProcess(
      {
        initialize: (request) => ({
          jsonrpc: '2.0',
          id: request.id ?? null,
          result: {
            protocolVersion: latestProtocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: 'mock', version: '1.0.1' },
          },
        }),
        'notifications/initialized': () => undefined,
        'tools/list': (request) => ({
          jsonrpc: '2.0',
          id: request.id ?? null,
          result: {
            tools: [
              {
                name: 'Echo2',
              inputSchema: { type: 'object', properties: {} },
              },
            ],
          },
        }),
      },
      { pid: 101 },
    );

    currentTime += 1_200;
    manager.getRuntimeServers.mockReturnValueOnce([
      {
        id: 'server-a',
        definition: { id: 'server-a', command: 'cmd', args: [], enabled: true },
        status: 'running' as const,
        restarts: 0,
        pid: 101,
        process: refreshedProcess,
      },
    ]);

    const third = await service.getCatalog();
    expect(third.tools[0].name).toBe('Echo2');
    expect(manager.getRuntimeServers).toHaveBeenCalledTimes(2);
  });

  it('excludes revoked tools from catalog results', async () => {
    const process = createRpcProcess({
      initialize: (request) => ({
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {
          protocolVersion: latestProtocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'mock', version: '1.0.0' },
        },
      }),
      'notifications/initialized': () => undefined,
      'tools/list': (request) => ({
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {
          tools: [
            { name: 'Keep', inputSchema: { type: 'object', properties: {} } },
            { name: 'Drop', inputSchema: { type: 'object', properties: {} } },
          ],
        },
      }),
    });

    const manager = {
      start: jest.fn().mockResolvedValue(undefined),
      getRuntimeServers: jest.fn().mockReturnValue([
        {
          id: 'server-a',
          definition: { id: 'server-a', command: 'cmd', args: [], enabled: true },
          status: 'running' as const,
          restarts: 0,
          pid: 1,
          process,
        },
      ]),
    } as unknown as McpServerManager;

    const policy = new McpToolPolicy();
    policy.revoke(['server-a:Drop']);

    const service = new McpCatalogService({
      manager,
      policy,
      requestTimeoutMs: 100,
    });

    const result = await service.getCatalog();
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].id).toBe('server-a:Keep');
  });

  it('logs and recovers when tools/list times out', async () => {
    const manager = {
      start: jest.fn().mockResolvedValue(undefined),
      getRuntimeServers: jest.fn().mockReturnValue([
        {
          id: 'server-a',
          definition: {
            id: 'server-a',
            command: 'cmd',
            args: [],
            enabled: true,
          },
          status: 'running' as const,
          restarts: 0,
          pid: 1,
          process: createRpcProcess({
            initialize: (request) => ({
              jsonrpc: '2.0',
              id: request.id ?? null,
              result: {
                protocolVersion: latestProtocolVersion,
                capabilities: { tools: {} },
                serverInfo: { name: 'timeout', version: '1.0.0' },
              },
            }),
            'notifications/initialized': () => undefined,
            'tools/list': () => undefined,
          }),
        },
      ]),
    } as unknown as McpServerManager;

    const warn = jest.fn();
    const service = new McpCatalogService({
      manager,
      requestTimeoutMs: 50,
      logger: { warn },
      startupTimeoutMs: 100,
      startupPollIntervalMs: 10,
    });

    const result = await service.getCatalog();
    expect(result.tools).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to collect tools from "server-a"'),
    );
  });
});
