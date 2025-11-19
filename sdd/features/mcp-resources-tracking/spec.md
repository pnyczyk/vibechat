# Feature: MCP resources tracking

## Overview
Enable VibeChat to automatically mirror MCP resource updates from selected servers into the realtime agent pipeline. When a server opts in via config, the platform should list its resources, maintain live subscriptions, and surface human-readable update messages to the agent session so assistants always act on fresh data.

## Problem Statement
**What problem are we solving?**
Tool catalog sync keeps function definitions current, but MCP resource files (instructions, prompts, configs) can change without notice. Today VibeChat agents keep stale context until developers manually recycle the session or redeploy.

**Why now?**
Upcoming voice workflows depend on MCP-hosted instruction packs. Without automatic tracking we risk incorrect responses and extra operational toil every time a resource is edited. Shipping this ahead of the next agent demo avoids regressions and reduces manual restarts.

## User Stories

### Story 1: Opt-in resource tracking per server
**As a** developer configuring MCP servers
**I want to** flag which servers should broadcast resource changes
**So that** VibeChat only spends bandwidth on relevant feeds and stays within capabilities

**Acceptance Criteria:**
- [x] `config/mcp-servers.json` supports `trackResources` (default `false`) and rejects non-boolean values
- [x] Enabling the flag triggers `resources/list` + `resources/subscribe` for every resource exposed by that server within 5 seconds of process start
- [x] Removing or disabling the flag stops any active subscriptions within 5 seconds of reload/stop
- [x] Servers that lack MCP `resources` capability log a warning and skip tracking without crashing the manager

### Story 2: Consistent subscription lifecycle
**As a** platform operator
**I want to** keep subscriptions accurate when resources appear or vanish
**So that** the tracker never emits stale or missing updates

**Acceptance Criteria:**
- [x] `notifications/resources/list_changed` triggers a fresh list+subscribe cycle and replaces previous subscriptions atomically
- [x] Tracker retries transient failures (e.g., network) with exponential backoff capped at 30s and surfaces errors via telemetry
- [x] Duplicate notifications for the same resource URI within 2 seconds are de-duped to a single downstream update event
- [x] Tracker survives MCP server restarts by re-establishing subscriptions without manual intervention

### Story 3: Realtime agent notified of content updates
**As a** VibeChat assistant session participant
**I want** resource updates to post into the current realtime conversation
**So that** the assistant responds with the latest instructions or data without re-entry

**Acceptance Criteria:**
- [x] When a subscribed resource fires `notifications/resources/updated`, VibeChat emits a lightweight event containing `serverId`, `resourceUri`, and a timestamp within 3 seconds of receipt
- [x] The realtime adapter receives the event and immediately injects a transcript message formatted as `Resource <URI> updated for MCP server <serverId> at <timestamp>` (timestamp in ISO 8601) without blocking the notification path
- [x] Updates are also exposed via a server-sent events (SSE) endpoint so UI components can reflect resource activity

## Success Metrics
How will we measure if this feature is successful?

- 95% of resource updates from opted-in servers reach the realtime session within 3 seconds during load tests
- <2 tracker errors per hour in staging under normal MCP churn
- At least 3 internal teams adopt `trackResources=true` for their MCP servers within the first sprint

## Out of Scope
What are we explicitly NOT building in this feature?

- Editing MCP resources via VibeChat UI – remains managed in source repos/tools
- Persisting historical versions of resources – only the latest snapshot is forwarded
- Pushing updates to non-realtime channels (email, Slack, etc.) – scope limited to realtime agent + SSE feed

## Dependencies
What external factors does this feature depend on?

### External Dependencies
- MCP servers must implement `resources/list`, `resources/subscribe`, `resources/read`, and send `notifications/resources/*`
- OpenAI Realtime API must allow system/user messages injected programmatically during a session

### Internal Dependencies
- `McpServerManager` runtime for process lifecycle hooks and access to `McpClientPool`
- Telemetry pipeline to record tracker health and delivery latency

### Assumptions
- Resource contents are predominantly UTF-8 text; binary payloads can be summarized without degrading the agent experience
- Realtime sessions already handle injected system messages without extra UX changes

## Implementation Notes

- Tasks T001–T004 ship the config flag, tracker, SSE endpoint, and realtime adapter wiring. Task
  T005 closes the loop with documentation updates (README + AGENTS) and the Playwright spec
  `tests/e2e/mcp-resource-tracking.spec.ts` that simulates a tracker event over
  `/api/mcp/resource-events` and asserts the transcript message is delivered once a session is
  connected.
- Keep `sdd/features/mcp-resources-tracking/tasks.md` in sync with delivery status; Task T005 is now
  marked `Completed` so regressions should update the tracker accordingly.
