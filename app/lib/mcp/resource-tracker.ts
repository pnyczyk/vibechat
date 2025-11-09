import { EventEmitter } from 'node:events';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema,
  type ReadResourceResult,
  type Resource,
} from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';

import type { McpClientPool } from './client-pool';
import type { McpServerDefinition } from './config';
import type { RuntimeServerSnapshot } from './process-registry';
import type { McpServerManager } from './serverManager';
import { recordResourceTrackerEvent } from './telemetry';

export type ResourceUpdateEvent = {
  type: 'resource_update';
  serverId: string;
  resourceUri: string;
  resource?: Resource;
  contents: ReadResourceResult['contents'];
  receivedAt: number;
};

export type ResourceErrorEvent = {
  type: 'resource_error';
  serverId: string;
  resourceUri?: string;
  receivedAt: number;
  reason: 'unsupported' | 'refresh' | 'subscription' | 'read';
  error: string;
};

type TrackerEvent = ResourceUpdateEvent | ResourceErrorEvent;

type TrackerEventName = TrackerEvent['type'];

export interface ResourceTrackerLogger {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
}

export interface McpResourceTrackerOptions {
  manager: McpServerManager;
  clientPool: McpClientPool;
  ensureServersStarted?: () => Promise<void>;
  logger?: ResourceTrackerLogger;
  pollIntervalMs?: number;
  dedupeWindowMs?: number;
  retryInitialMs?: number;
  retryMaxMs?: number;
  now?: () => number;
}

interface PendingRead {
  uri: string;
  attempt: number;
  timer?: NodeJS.Timeout;
  notificationTimestamp: number;
}

interface TrackedServerState {
  serverId: string;
  definition: McpServerDefinition;
  runtime?: RuntimeServerSnapshot;
  client: Client | null;
  pid?: number;
  subscriptions: Set<string>;
  resources: Map<string, Resource>;
  lastEmitAt: Map<string, number>;
  pendingReads: Map<string, PendingRead>;
  retryAttempt: number;
  retryTimer?: NodeJS.Timeout;
  pendingRefresh: Promise<void> | null;
  needsRefresh: boolean;
  disposed: boolean;
  unsupported: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_DEDUPE_WINDOW_MS = 2_000;
const DEFAULT_RETRY_INITIAL_MS = 500;
const DEFAULT_RETRY_MAX_MS = 30_000;

const DEFAULT_LOGGER: Required<ResourceTrackerLogger> = {
  info: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

export class McpResourceTracker extends EventEmitter {
  private readonly manager: McpServerManager;

  private readonly clientPool: McpClientPool;

  private readonly ensureServersStarted: () => Promise<void>;

  private readonly logger: Required<ResourceTrackerLogger>;

  private readonly pollIntervalMs: number;

  private readonly dedupeWindowMs: number;

  private readonly retryInitialMs: number;

  private readonly retryMaxMs: number;

  private readonly now: () => number;

  private pollTimer?: NodeJS.Timeout;

  private readonly tracked = new Map<string, TrackedServerState>();

  private syncing = false;

  private startPromise: Promise<void> | null = null;

  private started = false;

  constructor(options: McpResourceTrackerOptions) {
    super();
    this.manager = options.manager;
    this.clientPool = options.clientPool;
    this.ensureServersStarted =
      options.ensureServersStarted ?? (async () => {});
    this.logger = {
      info: options.logger?.info ?? DEFAULT_LOGGER.info,
      warn: options.logger?.warn ?? DEFAULT_LOGGER.warn,
      error: options.logger?.error ?? DEFAULT_LOGGER.error,
    };
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
    this.retryInitialMs = options.retryInitialMs ?? DEFAULT_RETRY_INITIAL_MS;
    this.retryMaxMs = options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS;
    this.now = options.now ?? Date.now;
  }

  override on(
    eventName: 'resource_update',
    listener: (event: ResourceUpdateEvent) => void,
  ): this;
  override on(
    eventName: 'resource_error',
    listener: (event: ResourceErrorEvent) => void,
  ): this;
  override on(eventName: TrackerEventName, listener: (event: TrackerEvent) => void) {
    return super.on(eventName, listener);
  }

  override emit(
    eventName: 'resource_update',
    payload: ResourceUpdateEvent,
  ): boolean;
  override emit(
    eventName: 'resource_error',
    payload: ResourceErrorEvent,
  ): boolean;
  override emit(eventName: TrackerEventName, payload: TrackerEvent): boolean {
    return super.emit(eventName, payload);
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = (async () => {
      await this.ensureServersStarted();
      if (!this.pollTimer) {
        this.pollTimer = setInterval(() => {
          void this.syncServers();
        }, this.pollIntervalMs);
      }
      await this.syncServers();
      this.started = true;
    })().finally(() => {
      this.startPromise = null;
    });

    await this.startPromise;
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.started = false;

    const serverIds = Array.from(this.tracked.keys());
    await Promise.all(serverIds.map((id) => this.disposeServer(id)));
  }

  private async syncServers(): Promise<void> {
    if (this.syncing) {
      return;
    }
    this.syncing = true;
    try {
      const runtimeServers = this.manager.getRuntimeServers();
      const eligible = new Map<string, RuntimeServerSnapshot>();
      for (const server of runtimeServers) {
        if (!this.isServerEligible(server)) {
          continue;
        }
        eligible.set(server.definition.id, server);
        await this.ensureServerTracking(server);
      }

      for (const [serverId] of this.tracked) {
        if (!eligible.has(serverId)) {
          await this.disposeServer(serverId);
        }
      }
    } finally {
      this.syncing = false;
    }
  }

  private isServerEligible(server: RuntimeServerSnapshot): boolean {
    return (
      Boolean(server.definition.trackResources) &&
      server.status === 'running' &&
      Boolean(server.process)
    );
  }

  private createState(server: RuntimeServerSnapshot): TrackedServerState {
    return {
      serverId: server.definition.id,
      definition: server.definition,
      runtime: server,
      client: null,
      pid: undefined,
      subscriptions: new Set(),
      resources: new Map(),
      lastEmitAt: new Map(),
      pendingReads: new Map(),
      retryAttempt: 0,
      retryTimer: undefined,
      pendingRefresh: null,
      needsRefresh: true,
      disposed: false,
      unsupported: false,
    };
  }

  private async ensureServerTracking(
    server: RuntimeServerSnapshot,
  ): Promise<void> {
    const serverId = server.definition.id;
    let state = this.tracked.get(serverId);
    if (!state) {
      state = this.createState(server);
      this.tracked.set(serverId, state);
    }

    state.definition = server.definition;
    state.runtime = server;

    if (state.unsupported) {
      return;
    }

    const pid = server.pid ?? server.process?.pid;

    if (!state.client || state.pid !== pid) {
      await this.attachClient(state, server);
      return;
    }

    if (state.needsRefresh) {
      state.needsRefresh = false;
      await this.refreshServer(state, server, 'sync');
    }
  }

  private async attachClient(
    state: TrackedServerState,
    server: RuntimeServerSnapshot,
  ): Promise<void> {
    await this.detachNotifications(state);
    state.client = null;
    state.pid = undefined;

    if (!server.process) {
      return;
    }

    try {
      const client = await this.clientPool.getClient(
        server.definition,
        server.process,
        server.pid ?? server.process.pid ?? undefined,
      );
      state.client = client;
      state.pid = server.pid ?? server.process.pid ?? undefined;
      this.attachNotifications(state);
      await this.refreshServer(state, server, 'initial');
    } catch (error) {
      this.handleRefreshError(state, server, 'client_connect', error);
    }
  }

  private attachNotifications(state: TrackedServerState): void {
    if (!state.client) {
      return;
    }

    state.client.setNotificationHandler(
      ResourceListChangedNotificationSchema,
      () => {
        state.needsRefresh = false;
        void this.refreshServer(state, state.runtime, 'list_changed');
      },
    );

    state.client.setNotificationHandler(
      ResourceUpdatedNotificationSchema,
      (notification) => {
        if (!notification.params?.uri) {
          return;
        }
        this.handleResourceUpdated(state, notification.params.uri);
      },
    );
  }

  private async detachNotifications(state: TrackedServerState): Promise<void> {
    if (!state.client) {
      return;
    }
    state.client.removeNotificationHandler(
      'notifications/resources/list_changed',
    );
    state.client.removeNotificationHandler('notifications/resources/updated');
  }

  private async refreshServer(
    state: TrackedServerState,
    server: RuntimeServerSnapshot | undefined,
    reason: 'initial' | 'sync' | 'list_changed' | 'retry',
  ): Promise<void> {
    if (state.disposed || state.unsupported) {
      return;
    }

    if (state.pendingRefresh) {
      return state.pendingRefresh;
    }

    const runtime = server ?? state.runtime;
    if (!runtime?.process || !state.client) {
      state.needsRefresh = true;
      return;
    }

    const refreshPromise = this.performRefresh(state, runtime, reason);
    state.pendingRefresh = refreshPromise;
    try {
      await refreshPromise;
    } finally {
      if (state.pendingRefresh === refreshPromise) {
        state.pendingRefresh = null;
      }
    }
  }

  private async performRefresh(
    state: TrackedServerState,
    server: RuntimeServerSnapshot,
    reason: string,
  ): Promise<void> {
    try {
      const resources = await this.fetchAllResources(state);
      await this.replaceSubscriptions(state, resources);
      state.retryAttempt = 0;
      state.needsRefresh = false;
    } catch (error) {
      if (this.isUnsupportedError(error)) {
        state.unsupported = true;
        this.emitError(state.serverId, 'unsupported', error);
        recordResourceTrackerEvent({
          type: 'resource_tracker',
          event: 'unsupported',
          serverId: state.serverId,
          error: this.formatError(error),
        });
        await this.disposeServer(state.serverId);
        return;
      }
      this.handleRefreshError(state, server, reason, error);
      throw error;
    }
  }

  private async fetchAllResources(
    state: TrackedServerState,
  ): Promise<Resource[]> {
    const client = state.client;
    if (!client) {
      return [];
    }

    const resources: Resource[] = [];
    let cursor: string | undefined;
    do {
      const params = cursor ? { cursor } : {};
      this.logger.info?.(
        `[mcp-resource-tracker] resources/list start server="${state.serverId}" ` +
          `cursor=${cursor ?? 'null'}`,
      );
      const result = await client.listResources(params);
      this.logger.info?.(
        `[mcp-resource-tracker] resources/list success server="${state.serverId}" ` +
          `count=${result.resources.length} next=${result.nextCursor ?? 'null'}`,
      );
      resources.push(...result.resources);
      cursor = result.nextCursor ?? undefined;
    } while (cursor);

    return resources;
  }

  private async replaceSubscriptions(
    state: TrackedServerState,
    resources: Resource[],
  ): Promise<void> {
    const client = state.client;
    if (!client) {
      return;
    }

    const nextResources = new Map<string, Resource>();
    const toAdd: string[] = [];
    const current = new Set(state.subscriptions);

    for (const resource of resources) {
      nextResources.set(resource.uri, resource);
      if (!state.subscriptions.has(resource.uri)) {
        toAdd.push(resource.uri);
      }
      current.delete(resource.uri);
    }

    const toRemove = Array.from(current.values());

    for (const uri of toAdd) {
      await this.safeSubscribe(client, state.serverId, uri);
    }

    for (const uri of toRemove) {
      await this.safeUnsubscribe(client, state.serverId, uri);
      state.lastEmitAt.delete(uri);
      this.clearPendingRead(state, uri);
    }

    state.subscriptions = new Set(nextResources.keys());
    state.resources = nextResources;
  }

  private handleResourceUpdated(
    state: TrackedServerState,
    uri: string,
  ): void {
    if (state.disposed || state.unsupported) {
      return;
    }

    this.logger.info?.(
      `[mcp-resource-tracker] notification resources/updated server="${state.serverId}" uri=${uri}`,
    );

    const now = this.now();
    const lastEmit = state.lastEmitAt.get(uri);
    if (lastEmit !== undefined && now - lastEmit < this.dedupeWindowMs) {
      return;
    }

    if (state.pendingReads.has(uri)) {
      return;
    }

    const pending: PendingRead = {
      uri,
      attempt: 0,
      notificationTimestamp: now,
    };
    state.pendingReads.set(uri, pending);
    this.logger.info?.(
      `[mcp-resource-tracker] queued resources/read server="${state.serverId}" uri=${uri}`,
    );
    void this.readResourceWithRetry(state, pending);
  }

  private async readResourceWithRetry(
    state: TrackedServerState,
    pending: PendingRead,
  ): Promise<void> {
    if (state.disposed || state.unsupported) {
      this.clearPendingRead(state, pending.uri);
      return;
    }

    const client = state.client;
    if (!client) {
      this.handleRefreshError(
        state,
        state.runtime,
        'read',
        new Error('Client unavailable'),
      );
      this.clearPendingRead(state, pending.uri);
      return;
    }

    try {
      this.logger.info?.(
        `[mcp-resource-tracker] resources/read start server="${state.serverId}" ` +
          `uri=${pending.uri} attempt=${pending.attempt + 1}`,
      );
      const result = await client.readResource({ uri: pending.uri });
      this.logger.info?.(
        `[mcp-resource-tracker] resources/read success server="${state.serverId}" ` +
          `uri=${pending.uri} contents=${result.contents.length}`,
      );
      this.emit('resource_update', {
        type: 'resource_update',
        serverId: state.serverId,
        resourceUri: pending.uri,
        resource: state.resources.get(pending.uri),
        contents: result.contents,
        receivedAt: this.now(),
      });
      state.lastEmitAt.set(pending.uri, this.now());
      this.clearPendingRead(state, pending.uri);
    } catch (error) {
      const delay = Math.min(
        this.retryInitialMs * 2 ** pending.attempt,
        this.retryMaxMs,
      );
      pending.attempt += 1;
      recordResourceTrackerEvent({
        type: 'resource_tracker',
        event: 'read_failed',
        serverId: state.serverId,
        resourceUri: pending.uri,
        attempt: pending.attempt,
        delayMs: delay,
        error: this.formatError(error),
      });
      this.logger.warn?.(
        `[mcp-resource-tracker] Failed to read resource "${pending.uri}" ` +
          `from "${state.serverId}": ${this.formatError(error)}. Retrying in ${delay}ms`,
      );
      pending.timer = setTimeout(() => {
        pending.timer = undefined;
        void this.readResourceWithRetry(state, pending);
      }, delay);
    }
  }

  private async disposeServer(serverId: string): Promise<void> {
    const state = this.tracked.get(serverId);
    if (!state) {
      return;
    }
    state.disposed = true;

    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = undefined;
    }

    for (const pending of state.pendingReads.values()) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
    }
    state.pendingReads.clear();

      await this.detachNotifications(state);

      const client = state.client;
      if (client && state.subscriptions.size > 0) {
        await Promise.allSettled(
          Array.from(state.subscriptions).map((uri) =>
            this.safeUnsubscribe(client, serverId, uri),
          ),
        );
      }

    state.subscriptions.clear();
    state.resources.clear();
    state.lastEmitAt.clear();

    this.tracked.delete(serverId);
  }

  private scheduleRetry(
    state: TrackedServerState,
    server: RuntimeServerSnapshot | undefined,
    reason: string,
    error: unknown,
  ): void {
    if (state.retryTimer || state.disposed) {
      return;
    }
    const attempt = state.retryAttempt;
    const delay = Math.min(this.retryInitialMs * 2 ** attempt, this.retryMaxMs);
    state.retryAttempt += 1;
    state.retryTimer = setTimeout(() => {
      state.retryTimer = undefined;
      state.needsRefresh = true;
      void this.refreshServer(state, server ?? state.runtime, 'retry');
    }, delay);

    const message = this.formatError(error);
    this.logger.warn?.(
      `[mcp-resource-tracker] ${reason} failed for "${state.serverId}": ${message}. ` +
        `Retrying in ${delay}ms (attempt ${state.retryAttempt})`,
    );
    recordResourceTrackerEvent({
      type: 'resource_tracker',
      event: 'retry_scheduled',
      serverId: state.serverId,
      delayMs: delay,
      attempt: state.retryAttempt,
      reason,
      error: message,
    });
  }

  private handleRefreshError(
    state: TrackedServerState,
    server: RuntimeServerSnapshot | undefined,
    reason: string,
    error: unknown,
  ): void {
    this.emitError(state.serverId, 'refresh', error);
    this.scheduleRetry(state, server, reason, error);
  }

  private emitError(
    serverId: string,
    reason: ResourceErrorEvent['reason'],
    error: unknown,
    resourceUri?: string,
  ) {
    this.emit('resource_error', {
      type: 'resource_error',
      serverId,
      resourceUri,
      receivedAt: this.now(),
      reason,
      error: this.formatError(error),
    });
  }

  private clearPendingRead(state: TrackedServerState, uri: string): void {
    const pending = state.pendingReads.get(uri);
    if (!pending) {
      return;
    }
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    state.pendingReads.delete(uri);
  }

  private isUnsupportedError(error: unknown): boolean {
    const message = this.formatError(error);
    return message.includes('does not support resources');
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return JSON.stringify(error);
  }

  private isIgnorableResponseShapeError(error: unknown): boolean {
    if (!(error instanceof ZodError)) {
      return false;
    }
    return error.issues.some(
      (issue) =>
        issue.code === 'unrecognized_keys' &&
        'keys' in issue &&
        Array.isArray((issue as { keys?: string[] }).keys) &&
        ((issue as { keys?: string[] }).keys?.includes('uri') ?? false),
    );
  }

  private async safeSubscribe(
    client: Client,
    serverId: string,
    uri: string,
  ): Promise<void> {
    try {
      this.logger.info?.(
        `[mcp-resource-tracker] -> resources/subscribe server="${serverId}" ` +
          `payload=${JSON.stringify({ uri })}`,
      );
      await client.subscribeResource({ uri });
      this.logger.info?.(
        `[mcp-resource-tracker] <- resources/subscribe server="${serverId}" ` +
          `response={}`,
      );
    } catch (error) {
      if (this.isIgnorableResponseShapeError(error)) {
        this.logger.warn?.(
          `[mcp-resource-tracker] subscribe response for "${uri}" on "${serverId}" ` +
            'contained unexpected keys; treating as success.',
        );
        return;
      }
      this.logger.error?.(
        `[mcp-resource-tracker] subscribe failed for "${uri}" on ` +
          `"${serverId}": ${this.formatError(error)}`,
      );
      throw error;
    }
  }

  private async safeUnsubscribe(
    client: Client,
    serverId: string,
    uri: string,
  ): Promise<void> {
    try {
      this.logger.info?.(
        `[mcp-resource-tracker] -> resources/unsubscribe server="${serverId}" ` +
          `payload=${JSON.stringify({ uri })}`,
      );
      await client.unsubscribeResource({ uri });
      this.logger.info?.(
        `[mcp-resource-tracker] <- resources/unsubscribe server="${serverId}" response={}`,
      );
    } catch (error) {
      if (this.isIgnorableResponseShapeError(error)) {
        this.logger.warn?.(
          `[mcp-resource-tracker] unsubscribe response for "${uri}" on "${serverId}" ` +
            'contained unexpected keys; treating as success.',
        );
        return;
      }
      this.logger.warn?.(
        `[mcp-resource-tracker] unsubscribe failed for "${uri}" on ` +
          `"${serverId}": ${this.formatError(error)}`,
      );
    }
  }
}
