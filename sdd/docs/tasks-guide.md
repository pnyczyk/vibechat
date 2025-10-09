# Tasks Guide: Task Decomposition Strategy

## Writing Principles

**IMPORTANT:** Read `sdd/docs/documentation-guide.md` for concise writing principles (DRY, omit obvious info, combine related items).

## Validation

1. **Check spec exists:** `sdd/features/{feature-name}/spec.md`
   - If not found: "Feature not found: {feature-name}. Create spec first: /sdd-spec {feature-name}"

2. **Check AGENTS.md exists** at project root
   - If not found: "AGENTS.md not found. Run /sdd-init first."

## Load Context

### Read Project Standards
Load AGENTS.md to understand tech stack, coding standards, testing requirements, and architecture.

Informs HOW tasks will be implemented.

### Read Feature Spec
Load `sdd/features/{feature-name}/spec.md` to understand user stories, acceptance criteria, dependencies, and scope.

Informs WHAT tasks need to be created.

## Task Decomposition

### Analysis Process

1. **Map User Stories to Tasks:**
   - Each user story → 1-3 tasks
   - Keep tasks focused and independently testable

2. **Identify Natural Dependencies:**
   - Setup → Data → Service → API → UI → Integration
   - Combine infrastructure with implementation (reduce artificial dependencies):
     - **Models + migrations together** (migration untestable without model)
     - API client generation with UI task using it
     - Documentation embedded in implementation
     - Configuration with feature needing it

3. **Consider Tech Stack:**
   - Use specific frameworks from AGENTS.md
   - Follow architecture patterns
   - Account for database migrations if using ORM

4. **Keep Tasks Small and Focused:**
   - Independently testable
   - 15-30 minutes minimum to implement
   - Merge trivial tasks (one-liners) into related work
   - Break down if too large

5. **Identify Parallelization:**
   - Tasks modifying different files can run parallel
   - Example: Multiple models, API endpoints, components

6. **Target 8-20 Tasks:**
   - Sweet spot: 10-15 for typical feature

### Task Types (All Include Tests)

**Implementation tasks embed their own tests:**
- Setup: dependencies, configuration, project structure, DB migrations
- Data: models + migrations + unit tests
- Service: business logic + unit tests, data access + integration tests
- API: endpoints + integration tests, middleware + tests
- UI: components + tests, pages + integration tests, styling (visual verification)
- Integration: layer connections + integration tests, E2E flows + E2E tests

**Comprehensive test tasks (optional):**
- Only if spanning multiple implementation tasks
- Example: full E2E suites, performance/load testing, security audits

### Critical Considerations

Verify tasks address:
- **Security:** Auth, input validation, sensitive data handling, rate limiting
- **Audit:** Logging for sensitive operations, user notifications
- **Error Handling:** Graceful degradation, user-friendly messages, logging
- **Performance:** DB indexing, caching, query optimization

### Generate Tasks File

1. Read `sdd/templates/tasks-template.md` - SINGLE SOURCE OF TRUTH for format

2. Create `sdd/features/{feature-name}/tasks.md`:
   - Replace `[placeholders]` with task details
   - Number sequentially: T001, T002, T003...
   - Apply conciseness principles from documentation-guide.md
   - Order by dependencies: Setup → Foundation → Backend → Frontend → Integration

### Show Summary

```
Task Breakdown Complete: {feature-name}
Total Tasks: X

Parallelization: A parallel, B sequential

Dependency Chain:
T001 → [T002, T003, T004] → T005 → [T006, T007] → T008

Next: /sdd-implement {feature-name} T001
```

## Guidelines

### Task Quality Requirements
- Clear, action-oriented title
- Description (2-4 lines, apply documentation-guide.md principles)
- 3-5 testable acceptance criteria
- File paths (only if clarifying)
- Implementation notes (optional, only if non-obvious)
- Tests embedded (state outcome, not test structure)

### Common Mistakes to Avoid
- Too large (can't verify independently) or too trivial (< 15 min)
- Vague descriptions
- Tests as separate tasks (embed in implementation)
- Over-specific file paths
- Artificial dependencies (blocks parallelization)
- Missing security/audit/error handling

### Good Practice
- Independently verifiable tasks
- Merge trivial tasks into related work
- Question if dependencies are real or artificial
- Apply conciseness principles from documentation-guide.md
