import { McpServerManager } from './serverManager';
import { McpClientPool } from './client-pool';
import { McpToolPolicy } from './tool-policy';
import { ensureMcpServersStarted, getMcpRuntime } from './runtime';
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
  startupTimeoutMs?: number;
  startupPollIntervalMs?: number;
  now?: () => number;
}

const DEFAULT_CACHE_TTL = 5_000;
const DEFAULT_REQUEST_TIMEOUT = 2_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 5_000;
const DEFAULT_STARTUP_POLL_INTERVAL_MS = 200;

export class McpCatalogService {
  private readonly logger: Required<McpCatalogServiceLogger>;

  private readonly cacheTtlMs: number;

  private readonly requestTimeoutMs: number;

  private readonly startupTimeoutMs: number;

  private readonly startupPollIntervalMs: number;

  private readonly manager: McpServerManager;

  private readonly clientPool: McpClientPool;

  private readonly policy: McpToolPolicy;

  private readonly now: () => number;

  private cache?: { expiresAt: number; payload: McpCatalogPayload };

  private managerStarted = false;

  private readonly ensureServersStarted: () => Promise<void>;

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
      this.ensureServersStarted = async () => {
        if (!this.managerStarted) {
          await this.manager.start();
        }
      };
    } else {
      const runtime = getMcpRuntime();
      this.manager = runtime.manager;
      this.clientPool = runtime.clientPool;
      this.policy = runtime.policy;
      this.ensureServersStarted = ensureMcpServersStarted;
    }
    this.logger = logger;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT;
    this.startupTimeoutMs =
      options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    this.startupPollIntervalMs =
      options.startupPollIntervalMs ?? DEFAULT_STARTUP_POLL_INTERVAL_MS;
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

      const {
        collectedTools,
        rawCount,
        serverCount,
      } = await this.collectToolsWithWarmup();
      const tools = collectedTools.filter(
        (tool) => !this.policy.isRevoked(tool.id),
      );
      const payload: McpCatalogPayload = {
        tools,
        collectedAt: this.now(),
      };

      if (rawCount === 0 && serverCount > 0 && tools.length === 0) {
        this.logger.warn?.(
          '[mcp-catalog] returning empty tool catalog after startup timeout',
        );
      }

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
    await this.ensureServersStarted();
    this.managerStarted = true;
  }

  private async fetchTools(server: RuntimeServer): Promise<McpToolDescriptor[]> {
    const process = server.process;
    if (!process) {
      return [];
    }

    let client;
    try {
      client = await this.clientPool.getClient(
        server.definition,
        process,
        server.pid ?? process.pid ?? undefined,
      );
    } catch (error) {
      this.logger.warn?.(
        `[mcp-catalog] failed to connect to "${server.definition.id}": ${String(
          error,
        )}`,
      );
      this.clientPool.invalidate(server.definition.id);
      return [];
    }

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
      this.clientPool.invalidate(server.definition.id);
      return [];
    }
  }

  private async collectToolsWithWarmup() {
    const deadline = this.now() + this.startupTimeoutMs;
    let attempt = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const runtimeServers = this.manager
        .getRuntimeServers()
        .filter(
          (server) =>
            (server.status === 'running' || server.status === 'starting') &&
            Boolean(server.process?.stdin),
        );

      if (runtimeServers.length === 0) {
        const now = this.now();
        if (now >= deadline) {
          return {
            collectedTools: [] as McpToolDescriptor[],
            rawCount: 0,
            serverCount: 0,
          };
        }

        const backoff = Math.min(
          this.startupPollIntervalMs * 2 ** attempt,
          this.startupTimeoutMs,
        );
        const delayMs = Math.min(backoff, Math.max(0, deadline - now));
        attempt += 1;
        await this.delay(delayMs);
        continue;
      }

      const results = await Promise.all(
        runtimeServers.map((server) => this.fetchTools(server)),
      );
      const flat = results.flat();
      const rawCount = flat.length;
      if (rawCount > 0) {
        return {
          collectedTools: flat,
          rawCount,
          serverCount: runtimeServers.length,
        };
      }

      const now = this.now();
      if (now >= deadline) {
        return {
          collectedTools: flat,
          rawCount,
          serverCount: runtimeServers.length,
        };
      }

      const backoff = Math.min(
        this.startupPollIntervalMs * 2 ** attempt,
        this.startupTimeoutMs,
      );
      const delayMs = Math.min(backoff, Math.max(0, deadline - now));
      attempt += 1;
      await this.delay(delayMs);
    }
  }

  private async delay(durationMs: number): Promise<void> {
    if (durationMs <= 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, durationMs);
    });
  }
}

let instance: McpCatalogService | null = null;

export function getCatalogService(): McpCatalogService {
  if (!instance) {
    instance = new McpCatalogService();
  }
  return instance;
}
