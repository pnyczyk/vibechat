# Implement Guide: Task Implementation Workflow

## Writing Principles

**IMPORTANT:** Read `sdd/docs/documentation-guide.md` for concise reporting principles (state outcome, not process).

## Pre-Implementation Validation

### 1. Check Feature Exists
Verify `sdd/features/{feature-name}/spec.md` exists. If not: "Feature not found. Create first: /sdd-spec {feature-name}"

### 2. Check Tasks File Exists
Verify `sdd/features/{feature-name}/tasks.md` exists. If not: "Tasks not found. Generate first: /sdd-tasks {feature-name}"

### 3. Parse Task
Read `sdd/features/{feature-name}/tasks.md` and extract for {task-id}: status, dependencies, files, description, acceptance criteria, implementation notes.

### 4. Check Task Status
If Completed: ask "Task {task-id} already completed. Re-implement? (yes/no)"

### 5. Check Dependencies
If dependencies incomplete, show: "Task {task-id} blocked by: T001, T003. Complete dependencies first." Stop execution.

### 6. Confirm Git Workflow Alignment
- Work from a feature branch named `feature/{feature-name}-{task-id}` (or equivalent). If on `main`, create the branch before continuing.
- Ensure there is an open GitHub issue tracking the task (e.g., `[UI Overhaul] T001 ...`). Link subsequent commits/PR to that issue.
- Plan to raise a PR from the feature branch back to `main` after changes pass review.

## Context Loading

Load always:

1. **AGENTS.md** (auto-added): tech stack, standards, testing, architecture
2. **Feature spec** `sdd/features/{feature-name}/spec.md`: user stories, acceptance criteria, goals, dependencies
3. **Task details** from tasks.md: description, acceptance criteria, files, implementation notes
4. **Existing code**: read files listed in task; understand how task fits codebase

## Implementation

### Code Changes
- Follow project standards from AGENTS.md
- Address each acceptance criterion
- Keep changes focused (this task only)
- Quality code: meaningful names, comments for complex logic, error handling, edge cases
- Reference the associated GitHub issue in commits/PR description per project rules.

### Testing
- Use test framework from AGENTS.md
- Cover acceptance criteria
- All tests must pass (new and existing)
- Types: unit (business logic), integration (API/DB), E2E (critical flows)

### Documentation
Update as needed: inline comments, API docs, README. Keep in sync with code.

## Automatic Verification

Run automatically (never skip):

### 1. Run Tests
Execute test command from AGENTS.md. Show:
```
Tests: 12 passed, 0 failed, 0 skipped
Coverage: 87% (target: 80%)
```
If failures: show clearly, don't mark complete, ask how to proceed.

### 2. Check Acceptance Criteria
Verify each criterion met. Show:
```
Task {task-id} Acceptance Criteria:
  ✓ User model has email field
  ✓ Email validation enforced
  ✓ Password hashing uses bcrypt
```
If any failed: don't mark complete, ask how to proceed.

### 3. Validate Spec Coverage
Show which user story implemented and remaining work:
```
Implements User Story #2
Criteria 1-2 addressed, criterion 3 needs T005
```

### 4. Code Quality
Run linter/formatter if defined. Show:
```
Linter: No issues
Formatter: Compliant
```
If issues: show clearly, offer to fix.

## Implementation Summary

```
Task {task-id} Complete

Changes:
  • src/models/user.js (created, +95)
  • tests/models/user.test.js (created, +132)
  • src/utils/validation.js (+23 -5)

Verification:
  • Acceptance criteria: 3/3 met
  • Tests: 12 new, all passing
  • Coverage: 89% (target: 80%)
  • Code quality: compliant
  • Implements User Story #2

Summary: Created User model with validation and bcrypt hashing per security requirements. All tests passing.

Notes (if any):
  • Rate limiting out of scope
  • Email service in T005

Before handing off for review, open/prepare a PR from your feature branch referencing the GitHub issue; do not merge without review.
```

## User Review & Approval

Ask:
```
Does this meet your expectations? (yes/no)

yes: Mark task {task-id} "Completed" and show feature status
no: Let me know what needs adjustment
```

Only proceed after explicit approval.

## Update Task Status

On approval:
1. Update tasks.md: "Pending" → "Completed"
2. Confirm: "Task {task-id} marked completed"

## Show Feature Status (Always)

After every completion:

```
Feature: {feature-name}
Progress: 5/8 (62%)

Pending:
  • T001: Setup database (blocks T003)
  • T007: Drag-and-drop UI
  • T008: Integration testing

Completed:
  • T002: User model
  • T003: Validation
  • T004: API endpoint
  • T005: Password hashing
  • T006: User service

Next: T001 (no dependencies, ready)
Command: /sdd-implement {feature-name} T001
```

## Feature Completion (Automatic)

When all tasks completed:

```
FEATURE COMPLETE: {feature-name}

Tasks: 8/8 (100%)
Tests: 87 passing, 0 failures
Coverage: 91% (target: 80%)

User Stories:
  • User registration
  • Secure login
  • Password reset
  • Email verification

Quality: Code compliant, linter clean, security validated

Final Checklist:
  - [ ] Code review
  - [ ] Staging tests
  - [ ] UAT
  - [ ] Security review
  - [ ] Docs approved
  - [ ] Production ready

Feature complete. Review checklist before deployment.
```

## Guidelines

**Quality Over Speed:**
- Don't skip tests or verification
- Human review required (no auto-approve)
- One task at a time
- Status changes ONLY after user approval

**Good Implementation:**
- Meets all acceptance criteria
- Follows project standards
- Tests passing, coverage met
- Focused on task only
- Clear, readable code
- Error handling per standards

**Avoid:**
- Skipping tests
- Ignoring standards
- Scope creep
- Broken tests
- Missing verification

**Error Handling:**
If implementation/tests fail or criteria not met:
- Show clear error (what failed, why)
- Don't change task status
- Ask user how to proceed
- Only mark "Completed" after approval

**Status Updates (Never Skip):**
After every task:
- Show completed/pending/next
- Show progress percentage
- Critical for transparency
