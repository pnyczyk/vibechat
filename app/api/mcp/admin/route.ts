import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getInvocationService } from '@/app/lib/mcp/invocation-service';
import { getCatalogService } from '@/app/lib/mcp/catalog-service';
import { getMcpRuntime } from '@/app/lib/mcp/runtime';
import { recordAdminAction } from '@/app/lib/mcp/telemetry';

export const runtime = 'nodejs';

const adminSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('revoke'),
    tools: z.array(z.string().min(1)).min(1),
    reason: z.string().optional(),
    actor: z.string().optional(),
  }),
  z.object({
    action: z.literal('restore'),
    tools: z.array(z.string().min(1)).min(1),
    reason: z.string().optional(),
    actor: z.string().optional(),
  }),
  z.object({
    action: z.literal('reload-config'),
  }),
]);

function isAuthorized(request: Request): boolean {
  const token = process.env.MCP_ADMIN_TOKEN;
  if (!token) {
    return process.env.NODE_ENV === 'test';
  }
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${token}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  let body: z.infer<typeof adminSchema>;
  try {
    body = adminSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Invalid request payload',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }

  const runtime = getMcpRuntime();
  const catalogService = getCatalogService();
  const invocationService = getInvocationService();

  if (body.action === 'revoke') {
    runtime.policy.revoke(body.tools, {
      reason: body.reason,
      actor: body.actor,
    });
    invocationService.cancelByTool(body.tools);
    catalogService.invalidateCache();
    recordAdminAction({
      type: 'admin',
      action: 'revoke',
      tools: body.tools,
      actor: body.actor,
    });
    return NextResponse.json({
      status: 'revoked',
      tools: runtime.policy.listRevoked(),
    });
  }

  if (body.action === 'restore') {
    runtime.policy.restore(body.tools, {
      reason: body.reason,
      actor: body.actor,
    });
    catalogService.invalidateCache();
    recordAdminAction({
      type: 'admin',
      action: 'restore',
      tools: body.tools,
      actor: body.actor,
    });
    return NextResponse.json({
      status: 'restored',
      tools: runtime.policy.listRevoked(),
    });
  }

  const result = await runtime.manager.reload();
  catalogService.invalidateCache();
  recordAdminAction({
    type: 'admin',
    action: 'reload-config',
  });
  return NextResponse.json({ status: 'reloaded', result });
}
