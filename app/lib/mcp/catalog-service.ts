import { McpServerManager } from './serverManager';
import { McpClientPool } from './client-pool';
import { McpToolPolicy } from './tool-policy';
import { getMcpRuntime } from './runtime';
import { recordCatalogHandshake } from './telemetry';

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
  clientPool?: McpClientPool;
  policy?: McpToolPolicy;
  logger?: McpCatalogServiceLogger;
  cacheTtlMs?: number;
  requestTimeoutMs?: number;
  now?: () => number;
}

const DEFAULT_CACHE_TTL = 5_000;
const DEFAULT_REQUEST_TIMEOUT = 400;

export class McpCatalogService {
  private readonly logger: Required<McpCatalogServiceLogger>;

  private readonly cacheTtlMs: number;

  private readonly requestTimeoutMs: number;

  private readonly manager: McpServerManager;

  private readonly clientPool: McpClientPool;

  private readonly policy: McpToolPolicy;

  private readonly now: () => number;

  private cache?: { expiresAt: number; payload: McpCatalogPayload };

  private managerStarted = false;

  constructor(options: McpCatalogServiceOptions = {}) {
    const logger: Required<McpCatalogServiceLogger> = {
      debug: options.logger?.debug ?? (() => {}),
      warn: options.logger?.warn ?? console.warn.bind(console),
    };

    if (options.manager || options.clientPool || options.policy) {
      const requestTimeout =
        options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT;
      this.manager = options.manager ?? new McpServerManager();
      this.clientPool =
        options.clientPool ??
        new McpClientPool({
          requestTimeoutMs: requestTimeout,
          logger,
        });
      this.policy = options.policy ?? new McpToolPolicy();
    } else {
      const runtime = getMcpRuntime();
      this.manager = runtime.manager;
      this.clientPool = runtime.clientPool;
      this.policy = runtime.policy;
    }
    this.logger = logger;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT;
    this.now = options.now ?? Date.now;
  }

  async getCatalog(): Promise<McpCatalogPayload> {
    const startedAt = this.now();

    await this.ensureManagerStarted();

    try {
      const now = this.now();
      if (this.cache && this.cache.expiresAt > now) {
        this.logger.debug?.('[mcp-catalog] serving cached catalog');
        recordCatalogHandshake({
          type: 'catalog_handshake',
          durationMs: this.now() - startedAt,
          toolCount: this.cache.payload.tools.length,
          cacheHit: true,
          success: true,
          collectedAt: this.cache.payload.collectedAt,
        });
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
        tools: tools.filter((tool) => !this.policy.isRevoked(tool.id)),
        collectedAt: this.now(),
      };

      this.cache = {
        payload,
        expiresAt: payload.collectedAt + this.cacheTtlMs,
      };
      recordCatalogHandshake({
        type: 'catalog_handshake',
        durationMs: this.now() - startedAt,
        toolCount: payload.tools.length,
        cacheHit: false,
        success: true,
        collectedAt: payload.collectedAt,
      });
      return payload;
    } catch (error) {
      recordCatalogHandshake({
        type: 'catalog_handshake',
        durationMs: this.now() - startedAt,
        toolCount: 0,
        cacheHit: false,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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

    const client = await this.clientPool.getClient(
      server.definition,
      process,
      server.pid ?? process.pid ?? undefined,
    );

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
}

let instance: McpCatalogService | null = null;

export function getCatalogService(): McpCatalogService {
  if (!instance) {
    instance = new McpCatalogService();
  }
  return instance;
}
