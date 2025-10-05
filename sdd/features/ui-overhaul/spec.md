# Feature: ui-overhaul

## Overview
Deliver a clean voice-first chat surface with a minimalist canvas, Material UI components, and right-aligned controls so users can manage live sessions without clutter. The layout reserves space for future modules while enabling quick access to connection, mute, transcript toggles, and real-time voice feedback.

## Problem Statement
**What problem are we solving?**
The proof-of-concept UI lacks discoverable controls and wastes space, making live conversations feel ad hoc and hard to monitor.

**Why now?**
Improving usability unlocks upcoming agent tooling and ensures early users experience a production-ready interface before we layer new capabilities.

## User Stories

### Story 1: Connect to Conversation
**As a** voice chat participant
**I want to** connect or disconnect from the session with a single control
**So that** I can quickly join or leave without digging through menus

**Acceptance Criteria:**
- [ ] Icon stack shows a connect state when disconnected and a disconnect state when live using MUI iconography
- [ ] Activating the control triggers backend connect/disconnect actions with success feedback within 1s
- [ ] Error states display an inline toast message without collapsing the icon layout

### Story 2: Ongoing Voice Exchange
**As a** voice chat participant
**I want to** speak and hear responses while the interface stays focused and unobtrusive
**So that** the conversation feels natural and uninterrupted

**Acceptance Criteria:**
- [ ] Voice area remains dominant whitespace with no modal dialogs during active sessions
- [ ] Live status indicator persists while connected and muted state is off
- [ ] A bottom-right MUI indicator renders AI voice activity levels with responsive meter animation during playback

### Story 3: Mic Control
**As a** voice chat participant
**I want to** mute or unmute my microphone even while the agent is talking
**So that** I can manage audio privacy without stopping the session

**Acceptance Criteria:**
- [ ] Mute/unmute icon displays current state via distinct MUI icons and is clickable during agent speech
- [ ] Muting locally stops outgoing audio stream within 250ms
- [ ] Attempting to speak while muted surfaces a subtle reminder and keeps the session connected

### Story 4: Transcript & Text Input
**As a** voice chat participant
**I want to** open a translucent transcript drawer and send text messages when voice is inconvenient
**So that** I can review history and continue the conversation silently

**Acceptance Criteria:**
- [ ] Drawer slides in from the right, consumes no more than 30% viewport width, and overlays content with 80% opacity background using Material UI components
- [ ] Transcript lists the current session conversation in chronological order with newest entries visible without scrolling
- [ ] Text input in the drawer sends messages through the existing conversation pipeline with delivery confirmation

## Success Metrics
How will we measure if this feature is successful?

- Increase session completion rate (connect → disconnect without errors) by 20%
- At least 70% of beta users rate UI clarity ≥ 4/5
- Less than 5% of sessions report control confusion or mis-clicks via support tickets

## Out of Scope
What are we explicitly NOT building in this feature?

- Authentication flows - managed separately and unchanged by UI refresh
- Conversation persistence or history storage - future iterations will handle saving transcripts

## Dependencies
What external factors does this feature depend on?

### External Dependencies
- Realtime voice API remains available to supply agent audio streams

### Internal Dependencies
- Active conversation WebSocket/agent pipeline already delivers audio and transcript data

### Assumptions
- Transcripts for the current session are available in real time
- Material UI and MUI Icons packages are available for UI components and iconography
- Iconography assets or library components are ready for use
