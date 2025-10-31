# vibechat - Features Checklist

This document tracks all planned features for vibechat.

## Legend
- [ ] Pending
- [x] Completed
- [-] Blocked/Postponed

---

### [ ] mcp-tools
Integrate Model Context Protocol tooling into the voice agent including catalog hydration, invocation pipeline, telemetry, admin controls, and E2E coverage.
- **Priority:** High
- **Dependencies:** ui-overhaul
- **Notes:** Tasks T001–T002 completed previously; T003–T009 implemented on branch `feat/45-50-mcp-integration` pending review.

---

## Features

### [x] ui-overhaul
Revamp chat interface for richer voice + text interactions
- **Priority:** High
- **Dependencies:** None
- **Notes:** Focus on seamless transcript and voice controls

---

### [ ] ui-streamlining-and-cleanup
Refine the full-viewport chat canvas with lightning entry, minimalist controls, and theme flexibility
- **Priority:** High
- **Dependencies:** ui-overhaul
- **Notes:** Tasks T001–T007 landed; telemetry, E2E refresh, and regression sweep remain

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
