import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  ReadBuffer,
  serializeMessage,
} from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

import type { McpServerDefinition } from './config';
import { McpServerManager } from './serverManager';

type RuntimeServer = ReturnType<McpServerManager['getRuntimeServers']>[number];

export interface McpToolDescriptor {
  id: string;
  name: string;
  description?: string;
  inputSchema: unknown;
  transport: 'stdio';
  permissions: string[];
  serverId: string;
}

export interface McpCatalogPayload {
  tools: McpToolDescriptor[];
  collectedAt: number;
}

export interface McpCatalogServiceLogger {
  debug?: (message: string) => void;
  warn?: (message: string) => void;
}

export interface McpCatalogServiceOptions {
  manager?: McpServerManager;
  logger?: McpCatalogServiceLogger;
  cacheTtlMs?: number;
  requestTimeoutMs?: number;
  now?: () => number;
}

const CLIENT_INFO = { name: 'vibechat-mcp-client', version: '0.1.0' };
const DEFAULT_CACHE_TTL = 5_000;
const DEFAULT_REQUEST_TIMEOUT = 400;

class ExistingProcessTransport implements Transport {
  sessionId?: string;

  onclose?: () => void;

  onerror?: (error: Error) => void;

  onmessage?: (message: JSONRPCMessage) => void;

  private readonly readBuffer = new ReadBuffer();

  private readonly stdoutHandler = (chunk: Buffer) => this.handleChunk(chunk);

  private readonly stdoutErrorHandler = (error: Error) =>
    this.onerror?.(error);

  private readonly processExitHandler = () => this.close().catch(() => {});

  private readonly processErrorHandler = (error: Error) =>
    this.onerror?.(error);

  private closed = false;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
  ) {}

  async start(): Promise<void> {
    if (!this.child.stdout || !this.child.stdin) {
      throw new Error('MCP server does not expose stdio streams');
    }

    this.child.stdout.on('data', this.stdoutHandler);
    this.child.stdout.on('error', this.stdoutErrorHandler);
    this.child.once('exit', this.processExitHandler);
    this.child.once('error', this.processErrorHandler);
  }

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if (this.closed || !this.child.stdin?.writable) {
      throw new Error('Cannot send message: transport not writable');
    }

    await new Promise<void>((resolve, reject) => {
      const payload = serializeMessage(message);
      const stdin = this.child.stdin;
      if (!stdin) {
        reject(new Error('Child process stdin not available'));
        return;
      }

      const writeSucceeded = stdin.write(payload);
      if (writeSucceeded) {
        resolve();
        return;
      }

      const cleanup = (error?: Error | null) => {
        stdin.removeListener('drain', onDrain);
        stdin.removeListener('error', onError);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const onDrain = () => cleanup();
      const onError = (error: Error) => cleanup(error);
      stdin.once('drain', onDrain);
      stdin.once('error', onError);
    });
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.child.stdout?.off('data', this.stdoutHandler);
    this.child.stdout?.off('error', this.stdoutErrorHandler);
    this.child.off('exit', this.processExitHandler);
    this.child.off('error', this.processErrorHandler);
    this.readBuffer.clear();
    this.onclose?.();
  }

  private handleChunk(chunk: Buffer) {
    this.readBuffer.append(chunk);

    while (true) {
      try {
        const message = this.readBuffer.readMessage();
        if (message === null) {
          break;
        }
        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(error as Error);
        break;
      }
    }
  }
}

export class McpCatalogService {
  private readonly logger: Required<McpCatalogServiceLogger>;

  private readonly cacheTtlMs: number;

  private readonly requestTimeoutMs: number;

  private readonly manager: McpServerManager;

  private readonly now: () => number;

  private cache?: { expiresAt: number; payload: McpCatalogPayload };

  private managerStarted = false;

  private readonly clients = new Map<
    string,
    {
      client: Client;
      transport: ExistingProcessTransport;
      pid?: number;
    }
  >();

  constructor(options: McpCatalogServiceOptions = {}) {
    this.manager = options.manager ?? new McpServerManager();
    this.logger = {
      debug: options.logger?.debug ?? (() => {}),
      warn: options.logger?.warn ?? console.warn.bind(console),
    };
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT;
    this.now = options.now ?? Date.now;
  }

  async getCatalog(): Promise<McpCatalogPayload> {
    await this.ensureManagerStarted();

    const now = this.now();
    if (this.cache && this.cache.expiresAt > now) {
      this.logger.debug?.('[mcp-catalog] serving cached catalog');
      return this.cache.payload;
    }

    const runtimeServers = this.manager
      .getRuntimeServers()
      .filter(
        (server) =>
          server.status === 'running' && Boolean(server.process?.stdin),
      );

    const results = await Promise.all(
      runtimeServers.map((server) => this.fetchTools(server)),
    );

    const tools = results.flat();
    const payload: McpCatalogPayload = {
      tools,
      collectedAt: this.now(),
    };

    this.cache = { payload, expiresAt: payload.collectedAt + this.cacheTtlMs };
    return payload;
  }

  invalidateCache(): void {
    this.cache = undefined;
  }

  private async ensureManagerStarted(): Promise<void> {
    if (this.managerStarted) {
      return;
    }
    await this.manager.start();
    this.managerStarted = true;
  }

  private async fetchTools(server: RuntimeServer): Promise<McpToolDescriptor[]> {
    const process = server.process;
    if (!process) {
      return [];
    }

    const client = await this.getOrCreateClient(server.definition, {
      process,
      pid: server.pid ?? process.pid ?? undefined,
    });

    try {
      const tools: McpToolDescriptor[] = [];
      let cursor: string | undefined;
      do {
        const response = await client.listTools(
          cursor ? { cursor } : undefined,
          { timeout: this.requestTimeoutMs },
        );

        (response.tools ?? [])
          .filter((tool) => tool.name)
          .forEach((tool) => {
            const annotations = (tool.annotations ??
              {}) as Record<string, unknown>;
            if (annotations.authorized === false) {
              return;
            }

            const permissions = Array.isArray(annotations.permissions)
              ? (annotations.permissions as unknown[]).filter(
                  (value): value is string => typeof value === 'string',
                )
              : [];

            tools.push({
              id: `${server.definition.id}:${tool.name}`,
              name: tool.name,
              description: tool.description ?? undefined,
              inputSchema:
                tool.inputSchema === undefined ? null : tool.inputSchema,
              permissions,
              transport: 'stdio',
              serverId: server.definition.id,
            });
          });

        cursor = response.nextCursor ?? undefined;
      } while (cursor);

      return tools;
    } catch (error) {
      this.logger.warn?.(
        `[mcp-catalog] failed to collect tools from "${server.definition.id}": ${String(
          error,
        )}`,
      );
      return [];
    }
  }

  private async getOrCreateClient(
    definition: McpServerDefinition,
    context: {
      process: ChildProcessWithoutNullStreams;
      pid?: number;
    },
  ): Promise<Client> {
    const existing = this.clients.get(definition.id);
    const currentPid = context.pid;

    if (existing && existing.pid === currentPid) {
      return existing.client;
    }

    if (existing) {
      await existing.client.close().catch(() => {});
      await existing.transport.close().catch(() => {});
      this.clients.delete(definition.id);
    }

    const transport = new ExistingProcessTransport(context.process);
    const client = new Client(CLIENT_INFO, {
      capabilities: {
        tools: {},
      },
    });

    transport.onclose = () => {
      this.clients.delete(definition.id);
    };
    transport.onerror = (error) => {
      this.logger.warn?.(
        `[mcp-catalog] transport error for "${definition.id}": ${String(
          error,
        )}`,
      );
    };

    await client.connect(transport, { timeout: this.requestTimeoutMs });
    this.clients.set(definition.id, { client, transport, pid: currentPid });
    return client;
  }
}

let instance: McpCatalogService | null = null;

export function getCatalogService(): McpCatalogService {
  if (!instance) {
    instance = new McpCatalogService();
  }
  return instance;
}
