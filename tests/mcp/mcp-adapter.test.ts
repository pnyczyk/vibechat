/** @jest-environment node */

import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';

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

    const adapter = new McpAdapter({
      fetchCatalog,
      invokeTool,
      resourceEventsFetcher: () => Promise.resolve(createSseResponse([])),
      resourceEventsUrl: null,
    });
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

    adapter.detach();
    await flushAsync();
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

    const adapter = new McpAdapter({
      fetchCatalog,
      invokeTool,
      resourceEventsFetcher: () => Promise.resolve(createSseResponse([])),
      resourceEventsUrl: null,
    });
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

    adapter.detach();
    await flushAsync();
  });

  it('emits user messages when resource updates arrive via SSE', async () => {
    const session = createSession();
    const fetchCatalog = jest.fn().mockResolvedValue({ tools: [], collectedAt: Date.now() });
    const invokeTool = jest.fn();

    const sseResponse = createSseResponse([
      'retry: 5000\n\n',
      'data: {"type":"handshake","timestamp":1}\n\n',
      'data: {"type":"resource_update","serverId":"server-alpha","resourceUri":"mcp://resource/demo","timestamp":1700000100000}\n\n',
    ]);

    const resourceEventsFetcher = jest
      .fn()
      .mockResolvedValueOnce(sseResponse)
      .mockRejectedValue(new Error('end stream'));

    const adapter = new McpAdapter({
      fetchCatalog,
      invokeTool,
      resourceEventsFetcher,
      resourceEventsUrl: '/api/mcp/resource-events',
    });

    await adapter.attach(session as any);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const messageEvents = session.transport.sendEvent.mock.calls
      .map(([arg]) => arg)
      .filter(
        (event) =>
          event?.type === 'conversation.item.create' &&
          (event as any).item?.role === 'user',
      );

    expect(messageEvents).toHaveLength(1);
    expect(messageEvents[0]).toMatchObject({
      item: {
        content: [
          {
            text: expect.stringContaining(
              'Resource mcp://resource/demo updated for MCP server server-alpha',
            ),
          },
        ],
      },
    });

    adapter.detach();
    await flushAsync();
  });

  it('deduplicates resource update events with same timestamp', async () => {
    const session = createSession();
    const fetchCatalog = jest.fn().mockResolvedValue({ tools: [], collectedAt: Date.now() });
    const invokeTool = jest.fn();

    const sseResponse = createSseResponse([
      'data: {"type":"handshake","timestamp":1}\n\n',
      'data: {"type":"resource_update","serverId":"server-alpha","resourceUri":"mcp://resource/foo","timestamp":1700000200000}\n\n',
      'data: {"type":"resource_update","serverId":"server-alpha","resourceUri":"mcp://resource/foo","timestamp":1700000200000}\n\n',
    ]);

    const resourceEventsFetcher = jest
      .fn()
      .mockResolvedValueOnce(sseResponse)
      .mockRejectedValue(new Error('end stream'));

    const adapter = new McpAdapter({
      fetchCatalog,
      invokeTool,
      resourceEventsFetcher,
      resourceEventsUrl: '/api/mcp/resource-events',
    });

    await adapter.attach(session as any);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const userMessages = session.transport.sendEvent.mock.calls
      .map(([arg]) => arg)
      .filter(
        (event) =>
          event?.type === 'conversation.item.create' &&
          (event as any).item?.role === 'user',
      );

    expect(userMessages).toHaveLength(1);
    adapter.detach();
    await flushAsync();
  });
});

const encoder = new TextEncoder();

function createSseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));
