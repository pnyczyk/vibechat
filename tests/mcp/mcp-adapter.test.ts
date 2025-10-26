/** @jest-environment node */

import { EventEmitter } from 'node:events';

import {
  McpAdapter,
  type McpToolSummary,
  type RunEvent,
  type ToolEvent,
} from '@/app/lib/voice-agent/mcp-adapter';

const createSession = () => {
  const emitter = new EventEmitter();
  return {
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),
    transport: {
      sendEvent: jest.fn(),
    },
  };
};

describe('McpAdapter', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('fetches catalog on attach and updates session tools', async () => {
    const session = createSession();
    const fetchCatalog = jest.fn().mockResolvedValue({
      tools: [
        {
          id: 'server-a:Summarize',
          name: 'Summarize',
          description: 'sum',
          permissions: [],
          serverId: 'server-a',
          inputSchema: {},
        },
      ],
      collectedAt: Date.now(),
    });

    const invokeTool = jest.fn().mockResolvedValue(undefined);

    const adapter = new McpAdapter({ fetchCatalog, invokeTool });
    const events: Array<ToolEvent | RunEvent> = [];
    adapter.subscribe((event) => events.push(event));

    await adapter.attach(session as any);

    expect(fetchCatalog).toHaveBeenCalledTimes(1);
    expect(session.transport.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session.update',
      }),
    );
    expect(events.some((event) => event.type === 'tools-changed')).toBe(true);
  });

  it('starts invocation when transport emits mcp tool call', async () => {
    const session = createSession();
    const fetchCatalog = jest.fn().mockResolvedValue({
      tools: [
        {
          id: 'server-a:Summarize',
          name: 'Summarize',
          description: 'sum',
          permissions: [],
          serverId: 'server-a',
          inputSchema: {},
        },
      ],
      collectedAt: Date.now(),
    });

    const invokeTool = jest.fn(({ onEvent }) => {
      onEvent({ type: 'started' });
      onEvent({ type: 'completed', data: { text: 'done' } });
      return Promise.resolve();
    });

    const adapter = new McpAdapter({ fetchCatalog, invokeTool });
    const runEvents: RunEvent[] = [];
    adapter.subscribe((event) => {
      if (event.type === 'run-updated') {
        runEvents.push({ type: 'run-updated', run: { ...event.run } });
      }
    });

    await adapter.attach(session as any);

    session.emit('transport_event', {
      type: 'response.output_item.added',
      item: {
        type: 'mcp_tool_call',
        id: 'item-1',
        name: 'Summarize',
        arguments: JSON.stringify({ text: 'hello' }),
      },
    });

    expect(invokeTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: 'server-a:Summarize',
        grantedPermissions: expect.any(Array),
      }),
    );

    expect(runEvents.some((event) => event.run.status === 'success')).toBe(true);
  });
});
