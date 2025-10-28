import { randomUUID } from 'node:crypto';

import type { Progress } from '@modelcontextprotocol/sdk/types.js';
import Ajv from 'ajv';
import { z } from 'zod';

import { getCatalogService } from './catalog-service';
import type { McpCatalogService, McpToolDescriptor } from './catalog-service';
import type { McpClientPool } from './client-pool';
import type { McpServerManager } from './serverManager';
import { getMcpRuntime } from './runtime';
import type { McpToolPolicy } from './tool-policy';
import { recordInvocation } from './telemetry';

export type InvocationStatus = 'success' | 'error' | 'cancelled';

export type InvocationEvent =
  | {
      type: 'started';
      invocationId: string;
      toolId: string;
      toolName: string;
      serverId: string;
      startedAt: number;
    }
  | {
      type: 'progress';
      invocationId: string;
      progress: Progress;
    }
  | {
      type: 'output';
      invocationId: string;
      content: unknown;
      isError: boolean;
    }
  | {
      type: 'completed';
      invocationId: string;
      durationMs: number;
      content: unknown;
      structuredContent: unknown;
    }
  | {
      type: 'cancelled';
      invocationId: string;
      durationMs: number;
      reason: 'revoked' | 'request' | 'timeout';
    }
  | {
      type: 'failed';
      invocationId: string;
      durationMs: number;
      error: string;
      code?: string | number;
    };

export interface InvocationRequest {
  toolId: string;
  input: unknown;
  invocationId?: string;
  sessionId?: string;
  grantedPermissions?: string[];
  timeoutMs?: number;
}

export interface InvocationHandlers {
  onEvent?: (event: InvocationEvent) => void;
}

export interface InvocationOutcome {
  status: InvocationStatus;
  invocationId: string;
  durationMs: number;
  result?: unknown;
  structuredContent?: unknown;
  error?: string;
}

interface ActiveInvocation {
  controller: AbortController;
  toolId: string;
  startedAt: number;
  reason?: 'revoked' | 'request';
}

export interface McpInvocationServiceOptions {
  manager?: McpServerManager;
  clientPool?: McpClientPool;
  catalogService?: McpCatalogService;
  policy?: McpToolPolicy;
  requestTimeoutMs?: number;
  ajv?: Ajv;
  now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

const RelaxedCallToolResultSchema = z
  .object({
    content: z.array(z.object({}).passthrough()).optional(),
    structuredContent: z.unknown().optional(),
    isError: z.boolean().optional(),
    output: z.unknown().optional(),
    formatted: z.unknown().optional(),
  })
  .passthrough();

export class McpInvocationService {
  private readonly manager: McpServerManager;

  private readonly clientPool: McpClientPool;

  private readonly catalogService: McpCatalogService;

  private readonly policy: McpToolPolicy;

  private readonly requestTimeoutMs: number;

  private readonly ajv: Ajv;

  private readonly now: () => number;

  private readonly active = new Map<string, ActiveInvocation>();

  private readonly schemaCache = new Map<string, Ajv.ValidateFunction>();

  constructor(options: McpInvocationServiceOptions = {}) {
    if (
      options.manager ||
      options.clientPool ||
      options.catalogService ||
      options.policy
    ) {
      this.manager = options.manager ?? getMcpRuntime().manager;
      this.clientPool = options.clientPool ?? getMcpRuntime().clientPool;
      this.catalogService =
        options.catalogService ?? getCatalogService();
      this.policy = options.policy ?? getMcpRuntime().policy;
    } else {
      const runtime = getMcpRuntime();
      this.manager = runtime.manager;
      this.clientPool = runtime.clientPool;
      this.catalogService = getCatalogService();
      this.policy = runtime.policy;
    }

    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.ajv =
      options.ajv ??
      new Ajv({
        allErrors: true,
        strict: false,
      });
    this.now = options.now ?? Date.now;

    this.policy.subscribe((revoked) => {
      this.handleRevocations(new Set(revoked));
    });
  }

  async invoke(
    request: InvocationRequest,
    handlers: InvocationHandlers = {},
  ): Promise<InvocationOutcome> {
    const invocationId = request.invocationId ?? randomUUID();
    const startedAt = this.now();
    const [serverId, toolName] = this.parseToolId(request.toolId);
    const sessionId = request.sessionId;

    let controller: AbortController | null = null;
    let abortTimeout: NodeJS.Timeout | null = null;
    try {
      if (this.policy.isRevoked(request.toolId)) {
        const durationMs = this.now() - startedAt;
        handlers.onEvent?.({
          type: 'cancelled',
          invocationId,
          durationMs,
          reason: 'revoked',
        });
        recordInvocation({
          type: 'invocation',
          invocationId,
          toolId: request.toolId,
          toolName,
          serverId,
          sessionId,
          durationMs,
          status: 'cancelled',
          error: 'Tool is revoked',
        });
        return {
          status: 'cancelled',
          invocationId,
          durationMs,
          error: 'Tool is revoked',
        };
      }

      const descriptor = await this.findDescriptor(request.toolId);
      this.assertPermissions(descriptor, request.grantedPermissions);
      const payload = this.validateInput(descriptor, request.input);

      const runtimeServer = this.manager
        .getRuntimeServers()
        .find(
          (server) =>
            server.definition.id === serverId && server.status === 'running',
        );

      if (!runtimeServer || !runtimeServer.process) {
        throw new Error(`MCP server "${serverId}" is not available`);
      }

      const timeoutMs = request.timeoutMs ?? this.requestTimeoutMs;
      controller = new AbortController();
      abortTimeout = setTimeout(() => {
        controller?.abort(new Error('Invocation timed out'));
      }, timeoutMs);
      this.active.set(invocationId, {
        controller,
        toolId: request.toolId,
        startedAt,
      });

      handlers.onEvent?.({
        type: 'started',
        invocationId,
        toolId: request.toolId,
        toolName,
        serverId,
        startedAt,
      });

      const client = await this.clientPool.getClient(
        runtimeServer.definition,
        runtimeServer.process,
        runtimeServer.pid ?? runtimeServer.process.pid,
      );

      const result = await client.callTool(
        {
          name: toolName,
          arguments: payload ?? null,
        },
        RelaxedCallToolResultSchema,
        {
          signal: controller.signal,
          timeout: timeoutMs,
          onprogress: (progress) =>
            handlers.onEvent?.({
              type: 'progress',
              invocationId,
              progress,
            }),
        },
      );

      if (result.isError ?? false) {
        const durationMs = this.now() - startedAt;
        const errorMessage =
          typeof result.message === 'string'
            ? result.message
            : 'Tool execution failed';
        handlers.onEvent?.({
          type: 'failed',
          invocationId,
          durationMs,
          error: errorMessage,
          code: result.code,
        });
        recordInvocation({
          type: 'invocation',
          invocationId,
          toolId: request.toolId,
          toolName,
          serverId,
          sessionId,
          durationMs,
          status: 'error',
          error: errorMessage,
        });
        return {
          status: 'error',
          invocationId,
          durationMs,
          error: errorMessage,
        };
      }

      const durationMs = this.now() - startedAt;
      handlers.onEvent?.({
        type: 'output',
        invocationId,
        content:
          result.output ?? result.formatted ?? result.structuredContent ?? null,
        isError: false,
      });
      handlers.onEvent?.({
        type: 'completed',
        invocationId,
        durationMs,
        content: result.output ?? result.formatted ?? null,
        structuredContent: result.structuredContent ?? null,
      });
      recordInvocation({
        type: 'invocation',
        invocationId,
        toolId: request.toolId,
        toolName,
        serverId,
        sessionId,
        durationMs,
        status: 'success',
      });

      return {
        status: 'success',
        invocationId,
        durationMs,
        result: result.output ?? result.formatted ?? null,
        structuredContent: result.structuredContent ?? null,
      };
    } catch (error) {
      const durationMs = this.now() - startedAt;
      const activeEntry = this.active.get(invocationId);
      const reason = activeEntry?.reason ?? 'request';

      if (controller?.signal.aborted) {
        const cancelledReason = reason === 'revoked' ? 'revoked' : 'request';
        handlers.onEvent?.({
          type: 'cancelled',
          invocationId,
          durationMs,
          reason: cancelledReason,
        });
        recordInvocation({
          type: 'invocation',
          invocationId,
          toolId: request.toolId,
          toolName,
          serverId,
          sessionId,
          durationMs,
          status: 'cancelled',
          error:
            cancelledReason === 'revoked'
              ? 'Tool invocation revoked by admin'
              : 'Invocation cancelled',
        });
        return {
          status: 'cancelled',
          invocationId,
          durationMs,
          error:
            cancelledReason === 'revoked'
              ? 'Tool invocation revoked by admin'
              : 'Invocation cancelled',
        };
      }

      const message =
        error instanceof Error ? error.message : `Invocation failed: ${error}`;
      handlers.onEvent?.({
        type: 'failed',
        invocationId,
        durationMs,
        error: message,
      });
      recordInvocation({
        type: 'invocation',
        invocationId,
        toolId: request.toolId,
        toolName,
        serverId,
        sessionId,
        durationMs,
        status: 'error',
        error: message,
      });
      return {
        status: 'error',
        invocationId,
        durationMs,
        error: message,
      };
    } finally {
      if (abortTimeout) {
        clearTimeout(abortTimeout);
      }
      this.active.delete(invocationId);
    }
  }

  cancel(invocationId: string): boolean {
    const entry = this.active.get(invocationId);
    if (!entry) {
      return false;
    }
    entry.reason = 'request';
    entry.controller.abort();
    return true;
  }

  cancelByTool(toolIds: readonly string[]): void {
    const set = new Set(toolIds);
    for (const [invocationId, entry] of this.active.entries()) {
      if (set.has(entry.toolId)) {
        entry.reason = 'revoked';
        entry.controller.abort();
      }
    }
  }

  private async findDescriptor(toolId: string): Promise<McpToolDescriptor> {
    const catalog = await this.catalogService.getCatalog();
    const descriptor = catalog.tools.find((tool) => tool.id === toolId);
    if (!descriptor) {
      throw new Error(`Tool "${toolId}" not found in catalog`);
    }
    return descriptor;
  }

  private assertPermissions(
    descriptor: McpToolDescriptor,
    granted: string[] | undefined,
  ): void {
    if (!descriptor.permissions || descriptor.permissions.length === 0) {
      return;
    }
    const grantedSet = new Set(granted ?? []);
    const missing = descriptor.permissions.filter(
      (permission) => !grantedSet.has(permission),
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing required permissions: ${missing
          .map((permission) => `"${permission}"`)
          .join(', ')}`,
      );
    }
  }

  private validateInput(
    descriptor: McpToolDescriptor,
    input: unknown,
  ): unknown {
    if (
      descriptor.inputSchema === null ||
      typeof descriptor.inputSchema === 'undefined'
    ) {
      return input ?? null;
    }

    const validator = this.getValidator(descriptor);
    const valid = validator(input ?? null);
    if (!valid) {
      const message =
        validator.errors?.map((err) => err.message).join(', ') ??
        'Invalid tool input';
      throw new Error(message);
    }
    return input ?? null;
  }

  private getValidator(descriptor: McpToolDescriptor) {
    const cacheKey = descriptor.id;
    const cached = this.schemaCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const validate = this.ajv.compile(
      descriptor.inputSchema ?? { type: 'object' },
    );
    this.schemaCache.set(cacheKey, validate);
    return validate;
  }

  private parseToolId(toolId: string): [string, string] {
    const parts = toolId.split(':');
    if (parts.length !== 2) {
      throw new Error(`Invalid tool identifier "${toolId}"`);
    }
    return [parts[0], parts[1]];
  }

  private handleRevocations(revoked: Set<string>): void {
    if (revoked.size === 0) {
      return;
    }
    const activeToolIds = new Set(
      Array.from(this.active.values()).map((entry) => entry.toolId),
    );
    const toCancel = Array.from(activeToolIds).filter((toolId) =>
      revoked.has(toolId),
    );
    if (toCancel.length > 0) {
      this.cancelByTool(toCancel);
    }
  }
}

let invocationInstance: McpInvocationService | null = null;

export function getInvocationService(): McpInvocationService {
  if (!invocationInstance) {
    invocationInstance = new McpInvocationService();
  }
  return invocationInstance;
}

export function setInvocationServiceForTesting(
  instance: McpInvocationService | null,
): void {
  invocationInstance = instance;
}
