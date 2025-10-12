# vibechat

Codex CLI slash-command prompts should read this file to preload project rules before generating code.
Store the prompts under `~/.codex/prompts/` so `/sdd:*` commands can reference it.

**All AI-generated code must follow these guidelines.**

## Tech Stack

### Primary Language & Runtime
- Language: TypeScript
- Runtime: Node.js 20.x
- Package Manager: npm

### Frameworks & Libraries
- Web Framework: Next.js 15 (App Router)
- Database: None yet (SQLite planned; Redis under evaluation)
- ORM/Query Builder: None defined
- Testing Framework: Jest (unit/integration), Playwright (E2E)

### Additional Tools
- React 19 for UI rendering
- `@openai/agents` for voice/chat orchestration
- Zod for runtime schema validation

## Coding Standards

### Style & Formatting
- Style Guide: Airbnb TypeScript conventions
- Formatter: Prettier (single source of truth)
- Linter: ESLint with Next.js defaults
- Max Line Length: 100 characters

### Code Patterns
- Naming Conventions: `camelCase` for variables/functions, `PascalCase` for components/types
- File Organization: Feature-first within `app/` routes; colocate helpers next to usage
- Import Order: External packages, absolute aliases, then relative modules

### Best Practices
- Prefer functional React components with hooks
- Use async/await for asynchronous flows; avoid promise chaining
- Validate inputs at API boundaries with Zod schemas
- Handle errors explicitly; no silent failures

## Testing Requirements

### Coverage
- Minimum Coverage: 80% line coverage across unit and integration suites
- Enforce Coverage: Manual review (add CI gate when tooling exists)

### Test Types
- Unit Tests: Required for shared utilities and core voice/chat logic
- Integration Tests: Required for API routes and agent orchestration flows
- E2E Tests: Required for critical chat/voice user journeys via Playwright

### Testing Approach
- Test Framework: Jest (unit/integration), Playwright (E2E)
- Mocking: Use Jest mocks for external services; prefer contract tests for agents
- Test Location: `tests/` for unit/integration, `tests/e2e/` for Playwright specs

### Running Tests
- Command: `npm test` (configure Jest + coverage)
- Watch Mode: `npm test -- --watch`
- CI Command: `npm test -- --ci` (add Playwright run once configured)
- E2E: `npm run test:e2e` (spins Next dev server with mocked realtime session)

### Telemetry
- Toggle runtime telemetry with `NEXT_PUBLIC_ENABLE_TELEMETRY=1`; default is disabled in dev, test, and CI.

## Architecture Principles

### Layers
- Modular Next.js App Router with route handlers, UI components, and background agent services
- Client components focus on presentation; server components manage data/org orchestration

### Separation of Concerns
- Business logic encapsulated in service modules separate from UI and API handlers
- Agent integrations isolated in dedicated adapters for replaceability

### Dependencies
- Data/control flow inward from UI → services → external integrations
- Use dependency injection patterns for agent/tool clients to simplify testing

### Error Handling
- Centralize HTTP error responses via utilities; surface actionable messages to clients
- Fail fast on invalid agent responses and log diagnostic details for observability

## Constraints & Limitations

### Performance
- Voice session setup/API responses should complete within 200ms server-side target
- Prefetch critical assets to keep interactive-ready under 2s on broadband

### Security
- Enforce authentication before invoking background agents or voice APIs
- Validate all user input and agent responses to prevent prompt injection or misuse

### Accessibility
- Comply with WCAG 2.1 Level AA for text/voice fallback experiences

### Browser/Platform Support
- Support latest two major versions of Chrome, Firefox, and Safari on desktop and mobile

## Additional Guidelines

### Documentation
- Update SDD specs/tasks alongside feature work; keep `sdd/features.md` current
- Add focused README sections when introducing new agent capabilities

### GitHub Sync Workflow
- Start every coding session by running `gh issue status` and `gh pr status` to understand active work and before answering status questions.
- Search before creating new work: `gh issue list --label sdd --search "<keywords>"` to avoid duplicates.
- Use `/sdd:*` outputs to drive GitHub updates immediately after generating specs or tasks.
- Keep local notes in `/tmp/*.md` and pass them with `gh issue create --body-file <path>` or `gh issue comment`.

### SDD ↔ GitHub Mapping
- `spec drafted` → issue labelled `todo`; `tasks in progress` → issue labelled `in-progress`.
- While implementing `/sdd:implement`, comment on the issue with status notes and link to the task.
- When implementation completes, open a PR and add `Closes #<issue-number>` plus the current SDD task id.
- After merge, run `gh issue edit <issue-number> --state closed` to finish the workflow.
- Track every SDD task as a GitHub issue using GitHub CLI (`gh issue` commands) and keep status in sync as work progresses.

### Issue Creation Standards
- Titles follow `SDD: <feature>`; include scope, acceptance criteria, and test notes in the body template.
- Always add labels `sdd` and a feature label such as `feature/voice`, and assign the current developer.
- Capture markdown in a temporary file via here-doc before calling `gh issue create`.
- Reference related specs, tasks, and telemetry tickets directly in the issue description.

### Branching & Pull Requests
- Always branch from `main` using `feat/<issue-number>-<slug>` (e.g. `feat/123-voice-prefetch`).
- Document test evidence in the PR description, including `npm test` and `npm run test:e2e` results.
- Ensure every PR description links the corresponding issue and mentions outstanding checklist items.
- Keep commits scoped to the issue context and follow Conventional Commits.
- Require PR review before merging into main.

### In-Progress Updates
- When starting implementation, comment on the issue with the `/sdd:implement` task id and branch name.
- Post brief daily progress notes with blockers; include command output summaries when relevant.
- After opening a PR, update the issue with the PR URL and adjust labels from `in-progress` to `review`.
- Once merged, add a closing summary comment before setting the issue state to closed.

### Other
- Instrument key voice/chat flows with telemetry for future tuning

## SDD Workflow

This project uses Spec-Driven Development (SDD). See sdd/README.md for full workflow guide.

Commands:
- /sdd:spec [name] - Create feature specification
- /sdd:tasks [name] - Generate implementation tasks
- /sdd:implement [name] [task-id] - Implement single task

Documentation:
- sdd/README.md - Workflow overview
- sdd/docs/spec-guide.md - How to write specs
- sdd/docs/tasks-guide.md - Task decomposition strategy
- sdd/docs/implement-guide.md - Implementation workflow

Principles:
- Specs define WHAT and WHY (requirements)
- Tasks break down HOW (implementation steps, 8-20 per feature)
- Tests embedded in implementation tasks (not separate)
- Context always loaded: AGENTS.md + spec + task details
