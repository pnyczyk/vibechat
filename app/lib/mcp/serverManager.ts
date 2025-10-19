import { spawn } from 'node:child_process';
import type {
  ChildProcessWithoutNullStreams,
  SpawnOptionsWithoutStdio,
} from 'node:child_process';

import {
  loadMcpConfig,
  type McpServerConfig,
  type McpServerDefinition,
} from './config';
import {
  ProcessRegistry,
  type ServerLifecycleStatus,
  type ServerStatusSnapshot,
} from './process-registry';

export interface McpServerManagerLogger {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
}

export interface McpServerManagerOptions {
  configPath?: string;
  logger?: McpServerManagerLogger;
  spawn?: (
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio,
  ) => ChildProcessWithoutNullStreams;
  loadConfig?: () => Promise<McpServerConfig>;
  backoff?: {
    initialMs?: number;
    maxMs?: number;
  };
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

const DEFAULT_BACKOFF_INITIAL = 1_000;
const DEFAULT_BACKOFF_MAX = 30_000;

type RestartTimer = NodeJS.Timeout;

export class McpServerManager {
  private readonly logger: Required<McpServerManagerLogger>;
  private readonly registry = new ProcessRegistry();
  private readonly restartTimers = new Map<string, RestartTimer>();
  private readonly stopping = new Set<string>();
  private readonly spawnFn: (
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio,
  ) => ChildProcessWithoutNullStreams;
  private readonly loadConfigFn: () => Promise<McpServerConfig>;
  private readonly backoffInitial: number;
  private readonly backoffMax: number;
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => number;
  private started = false;
  private shuttingDown = false;

  constructor(private readonly options: McpServerManagerOptions = {}) {
    const defaultLogger: Required<McpServerManagerLogger> = {
      info: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    this.logger = {
      info: options.logger?.info ?? defaultLogger.info,
      warn: options.logger?.warn ?? defaultLogger.warn,
      error: options.logger?.error ?? defaultLogger.error,
    };
    this.spawnFn = options.spawn ?? spawn;
    this.now = options.now ?? Date.now;
    this.loadConfigFn =
      options.loadConfig ??
      (async () =>
        loadMcpConfig({
          configPath: options.configPath,
          logger: this.logger,
        }));
    this.backoffInitial = options.backoff?.initialMs ?? DEFAULT_BACKOFF_INITIAL;
    this.backoffMax = options.backoff?.maxMs ?? DEFAULT_BACKOFF_MAX;
    this.env = { ...process.env, ...options.env };
  }

  async start(): Promise<void> {
    if (this.started) {
      this.logger.warn?.('[mcp-server-manager] start called more than once');
      return;
    }

    const config = await this.loadConfigFn();
    this.started = true;
    this.logger.info?.(
      `[mcp-server-manager] starting ${config.servers.length} configured servers`,
    );

    config.servers
      .filter((server) => server.enabled !== false)
      .forEach((server) => this.launchServer(server));
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.shuttingDown = true;
    for (const timer of this.restartTimers.values()) {
      clearTimeout(timer);
    }
    this.restartTimers.clear();

    const snapshots = this.registry.list();
    snapshots.forEach(({ id }) => {
      this.stopping.add(id);
    });

    snapshots.forEach(({ id }) => {
      const state = this.registry.get(id);
      if (!state?.process) {
        this.registry.update(id, { status: 'stopped' });
        return;
      }

      state.process.kill('SIGTERM');
      this.registry.update(id, {
        status: 'stopped',
        process: undefined,
      });
    });

    this.started = false;
    this.shuttingDown = false;
    this.logger.info?.('[mcp-server-manager] all servers stopped');
  }

  getStatuses(): ServerStatusSnapshot[] {
    return this.registry.list();
  }

  private launchServer(definition: McpServerDefinition) {
    const state = this.registry.ensure(definition);
    this.stopping.delete(definition.id);

    const child = this.spawnFn(definition.command, definition.args, {
      stdio: 'pipe',
      env: this.env,
    });

    this.registry.update(definition.id, {
      process: child,
      status: 'starting',
      lastStartedAt: this.now(),
    });

    child.once('spawn', () => {
      this.updateStatus(definition.id, 'running');
      this.logger.info?.(
        `[mcp-server-manager] server "${definition.id}" is running (pid ${child.pid ?? 'unknown'})`,
      );
    });

    child.once('error', (error) => {
      this.logger.error?.(
        `[mcp-server-manager] server "${definition.id}" error: ${String(
          error,
        )}`,
      );
      this.handleExit(definition, null, null);
    });

    child.once('exit', (code, signal) => {
      this.logger.warn?.(
        `[mcp-server-manager] server "${definition.id}" exited (code ${code}, signal ${signal ?? 'none'})`,
      );
      this.handleExit(definition, code, signal);
    });
  }

  private handleExit(
    definition: McpServerDefinition,
    code: number | null,
    signal: NodeJS.Signals | null,
  ) {
    const { id } = definition;
    const state = this.registry.get(id);
    if (!state) {
      return;
    }

    this.registry.update(id, {
      process: undefined,
      lastExit: { code, signal, at: this.now() },
    });

    if (this.shuttingDown || this.stopping.has(id)) {
      this.stopping.delete(id);
      this.registry.update(id, { status: 'stopped' });
      return;
    }

    const restarts = this.registry.incrementRestarts(id);
    this.updateStatus(id, 'restarting');

    const delay = Math.min(
      this.backoffInitial * 2 ** (restarts - 1),
      this.backoffMax,
    );

    this.logger.info?.(
      `[mcp-server-manager] scheduling restart for "${id}" in ${delay}ms (attempt ${restarts})`,
    );

    const existingTimer = this.restartTimers.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.restartTimers.delete(id);
      this.launchServer(definition);
    }, delay);

    this.restartTimers.set(id, timer);
  }

  private updateStatus(id: string, status: ServerLifecycleStatus) {
    this.registry.update(id, { status });
  }
}
