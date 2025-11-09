/** @jest-environment node */

import { EventEmitter } from 'node:events';

import type {
  McpResourceTracker,
  ResourceUpdateEvent,
} from '@/app/lib/mcp/resource-tracker';

class MockTracker
  extends EventEmitter
  implements Pick<McpResourceTracker, 'start' | 'stop'>
{
  start = jest.fn().mockResolvedValue(undefined);

  stop = jest.fn().mockResolvedValue(undefined);
}

class SseCollector {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;

  private readonly decoder = new TextDecoder();

  private buffer = '';

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }

  async next(count: number): Promise<unknown[]> {
    const events: unknown[] = [];
    while (events.length < count) {
      const { done, value } = await this.reader.read();
      if (done) {
        break;
      }
      this.buffer += this.decoder.decode(value, { stream: true });
      const frames = this.buffer.split('\n\n');
      this.buffer = frames.pop() ?? '';
      for (const frame of frames) {
        if (!frame.trim() || frame.startsWith(':')) {
          continue;
        }
        const dataLines = frame
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice(6));
        if (!dataLines.length) {
          continue;
        }
        events.push(JSON.parse(dataLines.join('')));
        if (events.length === count) {
          return events;
        }
      }
    }
    return events;
  }

  async readRaw() {
    return this.reader.read();
  }
}

async function importRouteWithTracker(tracker: MockTracker) {
  jest.resetModules();
  const { setMcpResourceTrackerForTesting } = await import('@/app/lib/mcp/runtime');
  setMcpResourceTrackerForTesting(tracker as unknown as McpResourceTracker);
  return import('@/app/api/mcp/resource-events/route');
}

describe('mcp resource events SSE route', () => {
  it('streams handshake + updates and cleans up after tracker stops', async () => {
    const tracker = new MockTracker();
    const { GET } = await importRouteWithTracker(tracker);

    const response = await GET(
      new Request('http://test/api/mcp/resource-events', {
        method: 'GET',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('x-reconnect-after')).toBe('5000');

    const body = response.body;
    expect(body).not.toBeNull();
    const collector = new SseCollector(body as ReadableStream<Uint8Array>);

    const [handshake] = await collector.next(1);
    expect(handshake).toMatchObject({ type: 'handshake' });

    const updateEvent: ResourceUpdateEvent = {
      type: 'resource_update',
      serverId: 'server-alpha',
      resourceUri: 'mcp://resource/demo',
      receivedAt: Date.now(),
    };

    tracker.emit('resource_update', updateEvent);

    const [update] = await collector.next(1);
    expect(update).toMatchObject({
      type: 'resource_update',
      serverId: 'server-alpha',
      resourceUri: 'mcp://resource/demo',
    });

    tracker.emit('tracker_stopped');

    const [stopped] = await collector.next(1);
    expect(stopped).toMatchObject({ type: 'tracker_stopped' });

    const doneResult = await collector.readRaw();
    expect(doneResult.done).toBe(true);
    expect(tracker.listenerCount('resource_update')).toBe(0);
    expect(tracker.listenerCount('resource_error')).toBe(0);
  });
});
