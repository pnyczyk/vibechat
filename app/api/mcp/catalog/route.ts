import { NextResponse } from 'next/server';

import { getCatalogService } from '@/app/lib/mcp/catalog-service';

export const runtime = 'nodejs';

export async function GET() {
  try {
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
