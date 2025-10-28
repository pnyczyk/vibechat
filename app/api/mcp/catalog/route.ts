import { NextResponse } from 'next/server';

import { getCatalogService } from '@/app/lib/mcp/catalog-service';
import { ensureMcpServersStarted } from '@/app/lib/mcp/runtime';

export const runtime = 'nodejs';

void ensureMcpServersStarted().catch((error) => {
  console.error('[mcp-catalog] failed to start MCP servers during bootstrap', error);
});

export async function GET() {
  try {
    await ensureMcpServersStarted();
    const catalog = await getCatalogService().getCatalog();
    return NextResponse.json(catalog);
  } catch (error) {
    console.error('[mcp-catalog] failed to load catalog', error);
    return NextResponse.json(
      { error: 'Failed to load MCP tool catalog' },
      { status: 500 },
    );
  }
}
