import { McpClientPool } from './client-pool';
import { McpResourceTracker } from './resource-tracker';
import { McpServerManager } from './serverManager';
import { McpToolPolicy } from './tool-policy';

export interface McpRuntime {
  manager: McpServerManager;
  clientPool: McpClientPool;
  policy: McpToolPolicy;
}

let runtime: McpRuntime | null = null;
let startPromise: Promise<void> | null = null;
let resourceTracker: McpResourceTracker | null = null;

function createRuntime(): McpRuntime {
  const manager = new McpServerManager();
  const clientPool = new McpClientPool({ requestTimeoutMs: 2_000 });
  const policy = new McpToolPolicy();

  return { manager, clientPool, policy };
}

export function getMcpRuntime(): McpRuntime {
  if (!runtime) {
    runtime = createRuntime();
  }
  return runtime;
}

export function getMcpResourceTracker(): McpResourceTracker {
  if (!resourceTracker) {
    const instance = getMcpRuntime();
    resourceTracker = new McpResourceTracker({
      manager: instance.manager,
      clientPool: instance.clientPool,
      ensureServersStarted: ensureMcpServersStarted,
    });
  }
  return resourceTracker;
}

export function ensureMcpServersStarted(): Promise<void> {
  const instance = getMcpRuntime();
  if (!startPromise) {
    startPromise = instance.manager.start().catch((error) => {
      // Reset so subsequent calls can retry after a failure.
      startPromise = null;
      throw error;
    });
  }
  return startPromise;
}

export async function ensureMcpResourceTrackerStarted(): Promise<McpResourceTracker> {
  const tracker = getMcpResourceTracker();
  await tracker.start();
  return tracker;
}

export function setMcpRuntimeForTesting(next: McpRuntime | null): void {
  runtime = next;
  startPromise = null;
  resourceTracker = null;
}

export function setMcpResourceTrackerForTesting(
  next: McpResourceTracker | null,
): void {
  resourceTracker = next;
}
