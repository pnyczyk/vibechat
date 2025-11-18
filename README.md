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

## Realtime Agent Instructions

- Author the assistant system prompt in `config/instructions.md`. The API route `GET /api/realtime-token` reads the file, injects the text into the session request sent to OpenAI, and caches it based on file mtime.
- If the file is missing or empty the token route responds with an error, preventing stale or insecure instructions from reaching production. Update the markdown file and redeploy to roll out new guidance without touching the client bundle.

## MCP Integration

### Server configuration

- Define MCP hosts in `config/mcp-servers.json`. Each entry includes `id`, `command`, `args`, an
  optional `enabled` flag, and the `trackResources` toggle (default `false`).
- Set `trackResources=true` only for servers that expose `resources/list`, `resources/subscribe`,
  and `resources/read`. The tracker kicks off a list + subscribe cycle within ~5 seconds of
  process start and tears it down the moment the flag is removed or the server stops.
- Restart `npm run dev` (or deploy) after toggling the flag so the process registry reloads
  commands. Watch `/tmp/vibechat-dev.log` for `[mcp-resource-tracker]` lines confirming
  subscriptions.

Example entry with tracking enabled:

```json
{
  "id": "instruction-packs",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/srv/instructions"],
  "workingDirectory": "/srv/instructions",
  "enabled": true,
  "trackResources": true
}
```

### Resource tracker & SSE feed

- The tracker emits `resource_update` events whenever an opted-in server sends
  `notifications/resources/updated`. Updates fan out to the realtime session (via `McpAdapter`) and
  to a dedicated SSE endpoint at `GET /api/mcp/resource-events`.
- SSE semantics:
  - Clients **must** send `Accept: text/event-stream`. Every stream begins with `retry: <ms>` plus a
    `{ "type": "handshake", "status": "ready" }` payload.
  - Event payloads include only `serverId`, `resourceUri`, `timestamp`, and optional
    `reason`/`error` fields for failures. Fetch contents directly from the MCP server if you need
    the resource body.
  - Example probe:

    ```bash
    curl -N -H "Accept: text/event-stream" \
      http://localhost:3000/api/mcp/resource-events
    ```

- Telemetry: when `NEXT_PUBLIC_ENABLE_TELEMETRY=1` or `MCP_ENABLE_TELEMETRY=1`, the tracker logs
  `resource_tracker` events to help correlate refresh failures (`event=refresh_failed`), retries, or
  unsupported servers.
- Troubleshooting checklist:
  1. SSE returns 500 → check `/tmp/vibechat-dev.log` for tracker startup errors and confirm the
     server exposes `resources/*` methods.
  2. No transcript message → ensure the voice session is connected (SSE attaches only after
     `ChatClient` attaches to a session) and confirm the resource URI differs from previously
     delivered timestamps (events with the same timestamp are deduped).
  3. High churn → set `trackResources` to `false`; the tracker unsubscribes within 5 seconds.

- Playwright coverage: `tests/e2e/mcp-resource-tracking.spec.ts` validates that SSE updates reach
  the transcript when a realtime session is active.

### Catalog, invocation, and admin APIs

- **Catalog service:** `GET /api/mcp/catalog` emits a cached snapshot of active tools enriched with
  permission scopes. Failures and cache hits emit telemetry via `recordCatalogHandshake`.
- **Invocation pipeline:** `POST /api/mcp/invoke` validates payloads, streams SSE updates, enforces
  permission scopes, and records latency metrics. Clients can cancel invocations with
  `DELETE /api/mcp/invoke?invocationId=<id>`.
- **Admin controls:** `POST /api/mcp/admin` accepts `revoke`, `restore`, or `reload-config`
  actions. Requests must include `Authorization: Bearer $MCP_ADMIN_TOKEN`. Revocations immediately
  cancel active invocations and flush the catalog cache.
- **Client adapter:** `app/lib/voice-agent/mcp-adapter.ts` hydrates the catalog when a realtime
  session attaches, registers hosted MCP tool definitions, listens for `mcp_tool_call` transport
  events, consumes the resource SSE feed, and mirrors progress into the UI (see the summary + tool
  runs rendered by `ChatClient`).

## Telemetry

Set `NEXT_PUBLIC_ENABLE_TELEMETRY=1` (and optionally `MCP_ENABLE_TELEMETRY=1`) to stream structured events for catalog handshakes, tool invocations, and admin actions. During tests the telemetry handler is overridden to avoid polluting console output.
- Markdown viewer instrumentation publishes `session_markdown_rendered` (document id, title, bytes,
  latency in ms) whenever the `show_markdown` tool updates the canvas and
  `session_markdown_engagement` once a document stays open for ≥5 seconds. See
  `tests/chat/markdown-telemetry.test.tsx` for reference expectations.

## Testing

- Jest specs live under `tests/` (see `tests/mcp/` for MCP coverage).
- Playwright specs reside in `tests/e2e/`; `tests/e2e/mcp-tools.spec.ts` exercises catalog hydration and a mocked invocation end-to-end.
- `tests/e2e/mcp-resource-tracking.spec.ts` keeps the SSE bridge honest by simulating a tracker
  event and asserting the transcript message delivery once a realtime session connects.
- Run `npm run test:e2e` from a second terminal while the dev server is running.

## Security Notes

- Store MCP admin tokens and server commands in environment variables or deployment secrets.
- The admin API returns `403` unless `MCP_ADMIN_TOKEN` is configured and supplied in the Authorization header.
- Tool invocations inherit permission checks from descriptors; client requests include granted scopes so the invocation service can fail fast on missing permissions.
