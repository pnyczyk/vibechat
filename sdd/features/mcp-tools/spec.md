# Feature: MCP tools

## Overview
Enable the client-side voice agent to discover and execute server-provided Model Context Protocol (MCP) tools so conversations can call rich capabilities without leaving the browser. Establish a resilient handshake, invocation pipeline, and telemetry loop that keep tool use fast, observable, and permission-aware while the backend distributes all configured MCP servers.

## Problem Statement
**What problem are we solving?**
The voice agent currently lacks a way to call server-hosted tools, forcing manual intervention and blocking planned automations that depend on structured tool execution.

**Why now?**
Upcoming voice workflows rely on MCP integrations already being packaged on the server; shipping this bridge lets the agent leverage them immediately and keeps parity with the tools roadmap.

## User Stories

### Story 1: Discover MCP Tool Catalog
**As a** voice chat participant  
**I want to** have the agent automatically load the available MCP tools when my session starts  
**So that** the conversation can use the right capabilities without extra setup

**Acceptance Criteria:**
- [x] Client initiates an MCP handshake on session connect and receives the active tool catalog within 500ms
- [x] Tool metadata includes identifiers, input schemas, configured transport (stdio), and permission scopes needed for invocation
- [x] Catalog aggregates every MCP server defined in configuration so the client sees the complete tool set
- [x] Unauthorized or disabled tools are omitted, and errors surface via existing session diagnostics

### Story 2: Invoke Tools During Conversation
**As a** voice chat participant  
**I want to** let the agent run MCP tools in response to conversation context  
**So that** tasks complete without me leaving the chat

**Acceptance Criteria:**
- [x] Agent requests to run a tool are sent through MCP with validated payloads matching the advertised schema
- [x] Tool execution responses stream back to the agent and surface to the user within 1s median round trip
- [x] Failures return actionable messages (no silent drops) and log telemetry without interrupting the session
- [x] Tool runs respect user/session permissions before execution

### Story 3: Observe and Control Tool Usage
**As a** support engineer  
**I want to** monitor tool usage and halt problematic executions  
**So that** we maintain safety and can debug issues quickly

**Acceptance Criteria:**
- [x] Telemetry events capture tool name, latency, outcome (success/error), and correlation ids
- [x] Admin or support interface exposes a kill-switch endpoint to revoke a tool mid-session
- [x] Revoked tools stop appearing in the catalog within 60s and active executions are cancelled gracefully

### Story 4: Configure MCP Servers
**As a** platform engineer  
**I want to** define MCP servers through a versioned config file  
**So that** the backend can launch tool hosts consistently across environments

**Acceptance Criteria:**
- [x] Config file lists each MCP server as a shell command with arguments; stdio transport is the only supported mode initially
- [x] Backend loads the config at startup, validates entries, and surfaces misconfigurations via deployment logs
- [x] Any server enabled in the config becomes available to connected clients without requiring redeploys

## Success Metrics
How will we measure if this feature is successful?

- ≥95% of sessions complete MCP tool catalog handshake on first attempt
- Tool invocation median round-trip latency ≤ 1s with 99th percentile ≤ 3s
- Support tickets about “tool unavailable” or “tool hung” decrease by 40% within two sprints

## Out of Scope
What are we explicitly NOT building in this feature?

- Manual user interface for choosing specific tools — agent selects tools autonomously for now
- Authoring new MCP tools — assumes tools are already integrated server-side
- Offline or mobile-native clients — scope limited to the existing browser-based voice agent
- MCP transports beyond stdio — network socket or HTTP modes defer to future work

## Dependencies
What external factors does this feature depend on?

### External Dependencies
- MCP protocol endpoints stay available and stable for discovery and invocation
- Tool providers uphold their SLAs so executions finish within target latency

### Internal Dependencies
- Voice agent session management and transport layers support MCP handshake messages
- Telemetry pipeline handles new tool usage events and kill-switch audits
- Backend configuration loader parses the MCP server command file and spawns stdio transports

### Assumptions
- Server distributes only vetted tools with accurate schemas and permission data
- Authentication context is already established before MCP handshake begins
- Operations teams can reload MCP server configuration without disrupting active voice sessions
