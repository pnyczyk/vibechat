# Feature: Realtime agent instructions config

## Overview
Keep the realtime agent's system prompt in a repository-managed markdown file so product teams can update guidance without touching the client bundle. The backend should inject the prompt when minting realtime session tokens so the text never traverses the browser, reducing leakage risk.

## Problem Statement
**What problem are we solving?**
Hardcoding instructions inside `app/chat-client.tsx` forces code changes for every copy edit and exposes the guidance to anyone with access to developer tools.

**Why now?**
Voice/agent copy needs frequent iteration and security reviews. Moving the prompt server-side lets docs-only contributors adjust messaging while ensuring production sessions always pick up the latest approved text without redeploying the client.

## User Stories

### Story 1: Manage instructions from config
**As a** developer or PM stewarding the assistant tone
**I want to** edit a markdown file in version control
**So that** I can roll out prompt changes with review history and without touching React code

**Acceptance Criteria:**
- `config/instructions.md` stores the canonical instructions and supports markdown formatting.
- Server endpoints read + cache the file, surfacing a clear error if it is missing or empty.
- Documentation highlights where the file lives and how to update it.

### Story 2: Keep instructions off the client
**As a** security reviewer
**I want to** inject the instructions at the point where the backend requests a realtime client secret
**So that** the text never needs to ship to or persist within the browser bundle.

**Acceptance Criteria:**
- `/api/realtime-token` reads the config file and includes the instructions in the session payload it sends to OpenAI.
- Client-side code no longer embeds the string or requests it separately.
- If instructions fail to load, the endpoint returns a 500 error explaining the problem and the UI surfaces that failure.

## Success Metrics
- Prompt copy updates require only editing `config/instructions.md` and redeploying backend nodes.
- Realtime instructions no longer appear in client bundles, devtools network traces, or static analysis outputs.
- Token endpoint errors for missing/empty instructions are observable and actionable.

## Out of Scope
- Runtime UI for editing instructions (still via git for now).
- Multi-tenant prompt selection.
- Version pinning per environment.

## Dependencies
- Requires OpenAI Realtime API support for `session.instructions` (already available).
- Build/deploy pipeline must ship the markdown file alongside server code.

## Assumptions
- Markdown fits current prompt needs; no localization yet.
- File size remains small (<5 KB), so naive caching suffices.
