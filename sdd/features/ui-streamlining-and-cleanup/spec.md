# Feature: UI streamlining and cleanup

## Overview
Deliver an immersive full-viewport voice chat canvas that strips away visual clutter, keeps the control rail as a tight vertical icon stack on the right edge, and introduces a lightning-fast entry point plus theme flexibility. Maintain focus on the conversation while reinforcing a premium, minimal brand feel.

## Problem Statement
**What problem are we solving?**
The current UI leaves unused margins, exposes temporary labels and frames, and lacks a polished session entry, which dilutes focus and makes the experience feel unfinished.

**Why now?**
Aligning the interface with the streamlined interaction model before shipping new agent capabilities prevents rework, improves user confidence, and supports upcoming beta milestones.

## User Stories

### Story 1: Immersive Full-Viewport Canvas
**As a** voice chat participant
**I want to** have the conversation occupy the entire browser window horizontally and vertically
**So that** I stay focused on the session without distracting chrome

**Acceptance Criteria:**
- [ ] Root layout stretches to 100% viewport width/height without scroll bars on supported breakpoints
- [ ] Background canvas subtly dims when entry modal states are active and returns to neutral once connected
- [ ] No legacy padding gutters or placeholder panels remain visible on load

### Story 2: Minimal Edge-Aligned Controls
**As a** voice chat participant
**I want to** use a right-edge icon stack with zero extra labels, borders, or frames
**So that** I can act quickly without visual clutter

**Acceptance Criteria:**
- [x] Connect/disconnect (power), mute, transcript, voice indicator, and theme toggle icons align vertically flush to the right edge with consistent spacing
- [x] All textual labels, borders, and placeholder panels are removed while preserving accessible aria-label/tooltips that surface only on screen reader or long-press
- [x] Layout adapts to desktop ≥1024px and mobile ≤480px without icons drifting or wrapping

### Story 3: Lightning Entry Flow
**As a** voice chat participant
**I want to** start the session from a central lightning icon with the rest of the UI dimmed
**So that** the connect action is obvious and immediate

**Acceptance Criteria:**
- [ ] Initial state shows a large lightning icon centered on the canvas with a dimmed backdrop
- [ ] Clicking the icon provisions a realtime session and transitions to the standard control rail within 1s
- [ ] Once connected, the lightning icon is replaced by the power toggle in the rail, and disconnecting returns to the entry state

### Story 4: Voice Activity Indicator
**As a** voice chat participant
**I want to** see a subtle blue indicator that responds to AI speech levels
**So that** I can tell when the agent is active at a glance

**Acceptance Criteria:**
- [x] Voice activity indicator renders as a small blue circle that grows and brightens with audio levels
- [x] Idle state reduces opacity (25%) while active state reaches full opacity (100%) at 0.15+ audio level
- [x] Indicator performance stays under 10ms per animation frame in CI testing to avoid UI jank
- [x] Audio levels are scaled (0.15 = 100%) to match typical AI speech output range

### Story 5: One-Tap Theme Toggle
**As a** voice chat participant
**I want to** switch between light and dark modes via a rail icon
**So that** the interface adapts to my environment without hunting through menus

**Acceptance Criteria:**
- [ ] Sun/moon (or equivalent) icon toggles Material UI theme instantly with smooth transition
- [ ] Selected theme persists for the session and across reload within the same browser
- [ ] Theme toggle respects dimmed entry state and does not interrupt ongoing audio playback

## Success Metrics
How will we measure if this feature is successful?

- ≥90% of beta users report the connect action is “very easy” in post-session survey
- 80% of sampled sessions start within 5 seconds of page load (analytics)
- Support tickets referencing “clutter” or “hard to find controls” drop by 30% over two sprints

## Out of Scope
What are we explicitly NOT building in this feature?

- New conversation features or transcript behaviors—scope limited to presentation layer
- Alternate control placements (left rail, bottom bars) beyond what is described here
- Changes to audio streaming logic aside from triggering existing connect/disconnect handlers

## Dependencies
What external factors does this feature depend on?

### External Dependencies
- Material UI and icon packages continue to support required theming APIs

### Internal Dependencies
- Current realtime session APIs and handlers operate without modification
- Theme provider supports runtime light/dark toggling and persistence

### Assumptions
- Product design signs off on lightning icon styling and HAL indicator visual treatment
- Accessibility team approves removal of visible labels given retained aria support
