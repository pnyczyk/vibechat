import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getInvocationService } from '@/app/lib/mcp/invocation-service';
import { ensureMcpServersStarted } from '@/app/lib/mcp/runtime';

export const runtime = 'nodejs';

void ensureMcpServersStarted().catch((error) => {
  console.error('[mcp-invoke] failed to start MCP servers during bootstrap', error);
});

const invokeSchema = z.object({
  toolId: z.string().min(1, 'toolId is required'),
  input: z.unknown().optional(),
  invocationId: z.string().uuid().optional(),
  sessionId: z.string().optional(),
  grantedPermissions: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  let parsed: z.infer<typeof invokeSchema>;
  try {
    const json = await request.json();
    parsed = invokeSchema.parse(json);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Invalid request payload',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }

  try {
    await ensureMcpServersStarted();
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to start MCP servers',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  const service = getInvocationService();
  const invocationId = parsed.invocationId ?? crypto.randomUUID();
  const { signal } = request;

  const stream = new ReadableStream<Uint8Array>({
    start: (streamController) => {
      const encoder = new TextEncoder();

      const write = (event: unknown) => {
        const payload = `data: ${JSON.stringify(event)}\n\n`;
        streamController.enqueue(encoder.encode(payload));
      };

      const handlers = {
        onEvent: write,
      };

      const invokePromise = service
        .invoke({ ...parsed, invocationId }, handlers)
        .then((outcome) => {
          signal?.removeEventListener('abort', abort);
          write({ type: 'final', outcome });
          streamController.close();
        })
        .catch((error) => {
          signal?.removeEventListener('abort', abort);
          write({
            type: 'error',
            error:
              error instanceof Error ? error.message : 'Invocation failed',
          });
          streamController.close();
        });

      const abort = () => {
        signal?.removeEventListener('abort', abort);
        service.cancel(invocationId);
        invokePromise.catch(() => {});
      };

      signal?.addEventListener('abort', abort);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const invocationId = searchParams.get('invocationId');
  if (!invocationId) {
    return NextResponse.json(
      { error: 'invocationId is required' },
      { status: 400 },
    );
  }

  const service = getInvocationService();
  const cancelled = service.cancel(invocationId);
  return NextResponse.json({ cancelled });
}
