# vibechat - Features Checklist

This document tracks all planned features for vibechat.

## Legend
- [ ] Pending
- [x] Completed
- [-] Blocked/Postponed

---

### [x] mcp-tools
Integrate Model Context Protocol tooling into the voice agent including catalog hydration, invocation pipeline, telemetry, admin controls, and E2E coverage.
- **Priority:** High
- **Dependencies:** ui-overhaul
- **Notes:** Tasks T001–T009 landed on `main`; GH issues/PRs closed 2025-10-31 after verification.

---

## Features

### [x] ui-overhaul
Revamp chat interface for richer voice + text interactions
- **Priority:** High
- **Dependencies:** None
- **Notes:** Focus on seamless transcript and voice controls

---

### [x] ui-streamlining-and-cleanup
Refine the full-viewport chat canvas with lightning entry, minimalist controls, and theme flexibility
- **Priority:** High
- **Dependencies:** ui-overhaul
- **Notes:** Tasks T001–T010 merged to `main`; final telemetry, docs, and regression sweep completed 2025-10-31.

---

**Recommended Starting Point:**
1. Replace example-feature with your first real feature
2. Run `/prompts:sdd-spec <feature-name>` to create specification

---

## Notes

- This checklist should be updated as features are completed
- Feature names must use kebab-case format (lowercase-with-hyphens)
- Feature names match directory names in `sdd/features/`
- Dependencies listed are key blockers, not exhaustive
