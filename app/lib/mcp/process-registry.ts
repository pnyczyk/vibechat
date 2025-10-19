import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import type { McpServerDefinition } from './config';

export type ServerLifecycleStatus =
  | 'starting'
  | 'running'
  | 'restarting'
  | 'stopped'
  | 'error';

export interface ExitSnapshot {
  code: number | null;
  signal: NodeJS.Signals | null;
  at: number;
}

interface ServerProcessState {
  definition: McpServerDefinition;
  process?: ChildProcessWithoutNullStreams;
  status: ServerLifecycleStatus;
  restarts: number;
  lastExit?: ExitSnapshot;
  lastStartedAt?: number;
}

export interface ServerStatusSnapshot {
  id: string;
  definition: McpServerDefinition;
  status: ServerLifecycleStatus;
  restarts: number;
  lastExit?: ExitSnapshot;
  lastStartedAt?: number;
  pid?: number;
}

export class ProcessRegistry {
  private readonly processes = new Map<string, ServerProcessState>();

  ensure(definition: McpServerDefinition): ServerProcessState {
    const existing = this.processes.get(definition.id);
    if (existing) {
      existing.definition = definition;
      return existing;
    }

    const state: ServerProcessState = {
      definition,
      status: 'starting',
      restarts: 0,
    };
    this.processes.set(definition.id, state);
    return state;
  }

  update(
    id: string,
    updates: Partial<Omit<ServerProcessState, 'definition'>>,
  ): ServerProcessState | undefined {
    const current = this.processes.get(id);
    if (!current) {
      return undefined;
    }

    Object.assign(current, updates);
    return current;
  }

  incrementRestarts(id: string): number {
    const current = this.processes.get(id);
    if (!current) {
      throw new Error(`Cannot increment restarts for unknown server "${id}"`);
    }

    current.restarts += 1;
    return current.restarts;
  }

  remove(id: string): void {
    this.processes.delete(id);
  }

  get(id: string): ServerProcessState | undefined {
    return this.processes.get(id);
  }

  list(): ServerStatusSnapshot[] {
    return Array.from(this.processes.entries()).map(([id, state]) => ({
      id,
      definition: state.definition,
      status: state.status,
      restarts: state.restarts,
      lastExit: state.lastExit,
      lastStartedAt: state.lastStartedAt,
      pid: state.process?.pid,
    }));
  }
}
