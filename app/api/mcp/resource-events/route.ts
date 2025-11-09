import { NextResponse } from 'next/server';

import { ensureMcpResourceTrackerStarted } from '@/app/lib/mcp/runtime';
import type {
  McpResourceTracker,
  ResourceErrorEvent,
  ResourceUpdateEvent,
} from '@/app/lib/mcp/resource-tracker';

export const runtime = 'nodejs';

const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_DELAY_MS = 5_000;

void ensureMcpResourceTrackerStarted().catch((error) => {
  console.error('[mcp-resource-events] failed to start tracker', error);
});

export async function GET(request: Request) {
  let tracker: McpResourceTracker;
  try {
    tracker = await ensureMcpResourceTrackerStarted();
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Resource tracker is unavailable',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const writeRaw = (line: string) => {
        controller.enqueue(encoder.encode(line));
      };

      const writeEvent = (event: Record<string, unknown>) => {
        writeRaw(`data: ${JSON.stringify(event)}\n\n`);
      };

      const writeComment = (comment: string) => {
        writeRaw(`: ${comment}\n\n`);
      };

      writeRaw(`retry: ${RECONNECT_DELAY_MS}\n\n`);
      writeEvent({ type: 'handshake', status: 'ready', timestamp: Date.now() });

      const updateListener = (event: ResourceUpdateEvent) => {
        writeEvent({
          type: 'resource_update',
          serverId: event.serverId,
          resourceUri: event.resourceUri,
          timestamp: event.receivedAt,
        });
      };

      const errorListener = (event: ResourceErrorEvent) => {
        writeEvent({
          type: 'resource_error',
          serverId: event.serverId,
          resourceUri: event.resourceUri,
          timestamp: event.receivedAt,
          reason: event.reason,
          error: event.error,
        });
      };

      let heartbeat: NodeJS.Timeout | null = null;
      let closed = false;

      const cleanupImpl = () => {
        if (closed) {
          return;
        }
        closed = true;
        tracker.off('resource_update', updateListener);
        tracker.off('resource_error', errorListener);
        tracker.off('tracker_stopped', handleTrackerStopped);
      request.signal.removeEventListener('abort', abortHandler);
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
      };

      const handleTrackerStopped = () => {
        writeEvent({ type: 'tracker_stopped', timestamp: Date.now() });
        cleanupImpl();
        controller.close();
      };

      const abortHandler = () => {
        writeEvent({
          type: 'stream_closed',
          reason: 'client_aborted',
          timestamp: Date.now(),
        });
        cleanupImpl();
        controller.close();
      };

      tracker.on('resource_update', updateListener);
      tracker.on('resource_error', errorListener);
      tracker.once('tracker_stopped', handleTrackerStopped);

      heartbeat = setInterval(() => {
        writeComment('heartbeat');
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener('abort', abortHandler);

      cleanup = cleanupImpl;
    },
    cancel() {
      cleanup?.();
      cleanup = null;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Reconnect-After': `${RECONNECT_DELAY_MS}`,
    },
  });
}

// No preview helper needed; SSE emits only identifiers so clients can fetch contents on demand.
