# Vibechat

Vibechat is a Next.js 15 voice-first chat client that pairs the OpenAI Realtime Agent SDK with a modular MCP (Model Context Protocol) tool bridge. The app renders a conversational canvas, voice controls, and real-time telemetry while background services manage tool discovery and invocation.

## Getting Started

```bash
npm install
npm run dev
```

The development server runs on <http://localhost:3000>. Playwright E2E specs expect the dev server to be available when `npm run test:e2e` executes.

## Key Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js in development mode |
| `npm run build` | Build production assets |
| `npm run start` | Launch production build |
| `npm test` | Run Jest unit/integration suites |
| `npm run test:e2e` | Run Playwright scenarios (requires dev server) |

## MCP Integration

- **Server configuration:** Define MCP hosts in `config/mcp-servers.json`. Each entry includes `id`, `command`, `args`, and an optional `enabled` flag. The `McpServerManager` spawns and supervises processes with exponential backoff and supports hot reloads via the admin API.
- **Catalog service:** `GET /api/mcp/catalog` emits a cached snapshot of active tools enriched with permission scopes. Failures and cache hits emit telemetry via `recordCatalogHandshake`.
- **Invocation pipeline:** `POST /api/mcp/invoke` validates payloads, streams SSE updates, enforces permission scopes, and records latency metrics. Clients can cancel invocations with `DELETE /api/mcp/invoke?invocationId=<id>`.
- **Admin controls:** `POST /api/mcp/admin` accepts `revoke`, `restore`, or `reload-config` actions. Requests must include `Authorization: Bearer $MCP_ADMIN_TOKEN`. Revocations immediately cancel active invocations and flush the catalog cache.
- **Client adapter:** `app/lib/voice-agent/mcp-adapter.ts` hydrates the catalog when a realtime session attaches, registers hosted MCP tool definitions, listens for `mcp_tool_call` transport events, and mirrors progress into the UI (see the banner rendered by `ChatClient`).

## Telemetry

Set `NEXT_PUBLIC_ENABLE_TELEMETRY=1` (and optionally `MCP_ENABLE_TELEMETRY=1`) to stream structured events for catalog handshakes, tool invocations, and admin actions. During tests the telemetry handler is overridden to avoid polluting console output.

## Testing

- Jest specs live under `tests/` (see `tests/mcp/` for MCP coverage).
- Playwright specs reside in `tests/e2e/`; `tests/e2e/mcp-tools.spec.ts` exercises catalog hydration and a mocked invocation end-to-end.
- Run `npm run test:e2e` from a second terminal while the dev server is running.

## Security Notes

- Store MCP admin tokens and server commands in environment variables or deployment secrets.
- The admin API returns `403` unless `MCP_ADMIN_TOKEN` is configured and supplied in the Authorization header.
- Tool invocations inherit permission checks from descriptors; client requests include granted scopes so the invocation service can fail fast on missing permissions.
