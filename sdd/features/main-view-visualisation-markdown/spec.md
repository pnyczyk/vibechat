# Feature: Main view visualisation: Markdown

## Overview
Enable the VibeChat realtime agent to render rich Markdown responses directly in the main session view so users can consume structured content without leaving the conversation. Provide a built-in tool `show_markdown` for the agent, and a dedicated, scrollable viewer that preserves formatting for text, tables, and math to keep complex agent answers legible and actionable.

## Problem Statement
**What problem are we solving?**
Agents can already compose Markdown, but the main view is empty and useless at this point

**Why now?**
Voice and chat sessions increasingly rely on structured agent output. Delivering a native Markdown experience unblocks upcoming knowledge workflows and prevents user churn during the current UI refresh cycle.

## User Stories

### Story 1: Render agent Markdown in-session
**As a** VibeChat participant
**I want to** see agent Markdown responses rendered in the main view
**So that** I immediately understand structured guidance without switching contexts

**Acceptance Criteria:**
- [x] When the realtime agent emits Markdown content, the main view tool renders headings, lists, inline formatting, and code blocks with styling that matches design tokens.
- [x] Rendering completes within 200 ms after the agent payload is received, preserving conversation scroll position.
- [x] Telemetry logs a `session_markdown_rendered` event with payload size and render latency for every successful render.

### Story 2: Support complex Markdown layout basics
**As a** VibeChat participant handling detailed outputs
**I want to** review tables and math expressions produced by the agent
**So that** I can act on structured data inside the session window

**Acceptance Criteria:**
- [x] Tables render with header emphasis, responsive column widths, and horizontal scrolling when width exceeds viewport.
- [x] LaTeX-style math blocks render via the existing math renderer with accessible fallback text.
- [x] The viewer allows vertical scrolling independent from chat history and indicates overflow with a visual affordance.

## Success Metrics
How will we measure if this feature is successful?

- 90% of Markdown render events complete under 200 ms (telemetry).
- Markdown viewer engagement (open duration ≥ 5 s) occurs in at least 60% of sessions where agents emit structured content.
- Markdown legibility-related support tickets drop by 50% within one month of launch.

## Out of Scope
What are we explicitly NOT building in this feature?

- Other text or media formats (e.g., HTML embeds, images, audio) — tracked for later multimedia tooling.
- Direct server-driven content injection bypassing the agent — slated for future API integrations.
- Layout management features such as split screen, grids, or multi-window arrangements — deferred to layout initiative.

## Dependencies
What external factors does this feature depend on?

### External Dependencies
- Realtime agent payloads must deliver Markdown content via `@openai/agents` without breaking syntax.
- Markdown rendering relies on the math rendering library already approved for accessibility.

### Internal Dependencies
- UI tool slotting within the main view must be available through the voice/chat orchestration shell.
- Telemetry pipeline must accept the new `session_markdown_rendered` event and fields (`payloadBytes`, `renderLatencyMs`).

### Assumptions
- Agents sanitize Markdown to prevent unsafe HTML; existing sanitization utilities remain in place.
- Participants access the feature on browsers that already meet the project’s supported versions, ensuring CSS features such as sticky overflow indicators work consistently.
