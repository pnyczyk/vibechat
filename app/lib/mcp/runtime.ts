import { McpClientPool } from './client-pool';
import { McpServerManager } from './serverManager';
import { McpToolPolicy } from './tool-policy';

interface McpRuntime {
  manager: McpServerManager;
  clientPool: McpClientPool;
  policy: McpToolPolicy;
}

let runtime: McpRuntime | null = null;

function createRuntime(): McpRuntime {
  const manager = new McpServerManager();
  const clientPool = new McpClientPool({ requestTimeoutMs: 400 });
  const policy = new McpToolPolicy();

  return { manager, clientPool, policy };
}

export function getMcpRuntime(): McpRuntime {
  if (!runtime) {
    runtime = createRuntime();
  }
  return runtime;
}

export function setMcpRuntimeForTesting(next: McpRuntime | null): void {
  runtime = next;
}
