import { McpClientPool } from './client-pool';
import { McpResourceTracker } from './resource-tracker';
import { McpServerManager } from './serverManager';
import { McpToolPolicy } from './tool-policy';

export interface McpRuntime {
  manager: McpServerManager;
  clientPool: McpClientPool;
  policy: McpToolPolicy;
}

type GlobalMcpState = {
  runtime: McpRuntime | null;
  startPromise: Promise<void> | null;
  tracker: McpResourceTracker | null;
  trackerStartPromise: Promise<McpResourceTracker> | null;
};

const globalState = globalThis as typeof globalThis & {
  __vibechatMcpState?: GlobalMcpState;
};

function getGlobalState(): GlobalMcpState {
  if (!globalState.__vibechatMcpState) {
    globalState.__vibechatMcpState = {
      runtime: null,
      startPromise: null,
      tracker: null,
      trackerStartPromise: null,
    };
  }
  return globalState.__vibechatMcpState;
}

function createRuntime(): McpRuntime {
  const manager = new McpServerManager();
  const clientPool = new McpClientPool({ requestTimeoutMs: 2_000 });
  const policy = new McpToolPolicy();

  return { manager, clientPool, policy };
}

export function getMcpRuntime(): McpRuntime {
  const state = getGlobalState();
  if (!state.runtime) {
    state.runtime = createRuntime();
  }
  return state.runtime;
}

export function getMcpResourceTracker(): McpResourceTracker {
  const state = getGlobalState();
  if (!state.tracker) {
    const instance = getMcpRuntime();
    state.tracker = new McpResourceTracker({
      manager: instance.manager,
      clientPool: instance.clientPool,
      ensureServersStarted: ensureMcpServersStarted,
    });
  }
  return state.tracker;
}

export function ensureMcpServersStarted(): Promise<void> {
  const state = getGlobalState();
  const instance = getMcpRuntime();
  if (!state.startPromise) {
    state.startPromise = instance.manager
      .start()
      .then(() => {
        void ensureMcpResourceTrackerStarted();
      })
      .catch((error) => {
        state.startPromise = null;
        throw error;
      });
  }
  return state.startPromise;
}

export async function ensureMcpResourceTrackerStarted(): Promise<McpResourceTracker> {
  const state = getGlobalState();
  if (!state.trackerStartPromise) {
    const tracker = getMcpResourceTracker();
    state.trackerStartPromise = tracker.start().then(() => tracker).catch((error) => {
      state.trackerStartPromise = null;
      throw error;
    });
  }
  return state.trackerStartPromise;
}

export function setMcpRuntimeForTesting(next: McpRuntime | null): void {
  const state = getGlobalState();
  state.runtime = next;
  state.startPromise = null;
  state.tracker = null;
  state.trackerStartPromise = null;
}

export function setMcpResourceTrackerForTesting(
  next: McpResourceTracker | null,
): void {
  const state = getGlobalState();
  state.tracker = next;
  state.trackerStartPromise = null;
}
