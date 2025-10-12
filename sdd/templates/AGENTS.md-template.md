# vibechat

This file provides AI coding agents with project-specific instructions.

See: https://agents.md/

**All AI-generated code must follow these guidelines.**

## Project Overview

[Brief description of what this project does, who it's for, and what problems it solves. Keep to 1-2 paragraphs, 80-150 words.]

Example: "vibechat is a [type of application] for [target users]. It provides [key features] using [main technologies]. The goal is to [primary objective]."

## Tech Stack

### Primary Language & Runtime
- Language: [e.g., JavaScript/TypeScript, Python, Rust, Go]
- Runtime: [e.g., Node.js 20.x, Python 3.11+, Rust 1.75+]
- Package Manager: [e.g., npm, pnpm, poetry, cargo]

### Frameworks & Libraries
- Web Framework: [e.g., Next.js 14, Django 5.0, Actix-web]
- Database: [e.g., PostgreSQL 16, MongoDB 7.0, SQLite]
- ORM/Query Builder: [e.g., Prisma, SQLAlchemy, Diesel]
- Testing Framework: [e.g., Vitest, pytest, cargo test]

### Additional Tools
- [List other key dependencies]

## Coding Standards

### Style & Formatting
- Style Guide: [e.g., Airbnb JavaScript, PEP 8, Rust official]
- Formatter: [e.g., Prettier, Black, rustfmt]
- Linter: [e.g., ESLint, Ruff, Clippy]
- Max Line Length: [e.g., 80, 100, 120]

### Code Patterns
- Naming Conventions: [e.g., camelCase for vars, PascalCase for classes]
- File Organization: [e.g., feature-based, layer-based]
- Import Order: [e.g., external, internal, relative]

### Best Practices
- [e.g., Prefer functional programming patterns]
- [e.g., Use async/await, avoid callbacks]
- [e.g., Immutability by default]
- [e.g., Explicit error handling, no silent failures]

## Testing Requirements

### Coverage
- Minimum Coverage: [e.g., 80% line coverage]
- Enforce Coverage: [yes/no, fail build if below threshold]

### Test Types
- Unit Tests: [e.g., Required for all business logic]
- Integration Tests: [e.g., Required for API endpoints]
- E2E Tests: [e.g., Required for critical user flows]

### Testing Approach
- Test Framework: [as defined in Tech Stack]
- Mocking: [e.g., Use Jest mocks, pytest fixtures]
- Test Location: [e.g., Colocated with source, separate tests/ dir]

### Running Tests
- Command: [e.g., `npm test`, `pytest`, `cargo test`]
- Watch Mode: [e.g., `npm test -- --watch`]
- CI Command: [e.g., `npm run test:ci`]

## Architecture Principles

### Layers
- [e.g., MVC pattern, Clean Architecture, Hexagonal]
- [Describe layer responsibilities]

### Separation of Concerns
- [e.g., Business logic separate from framework]
- [e.g., Data access through repository pattern]

### Dependencies
- [e.g., Dependencies flow inward, domain has no external deps]
- [e.g., Use dependency injection]

### Error Handling
- [e.g., Use Result types, avoid exceptions for flow control]
- [e.g., Validate at boundaries, fail fast]

## Constraints & Limitations

### Performance
- [e.g., API response time < 200ms]
- [e.g., Database queries must be indexed]

### Security
- [e.g., Input validation required for all user input]
- [e.g., Use parameterized queries, no string concatenation]
- [e.g., Authentication required for all API endpoints except X]

### Accessibility
- [e.g., WCAG 2.1 Level AA compliance]

### Browser/Platform Support
- [e.g., Chrome/Firefox/Safari last 2 versions]
- [e.g., Mobile responsive required]

## Additional Guidelines

### Documentation
- [e.g., JSDoc comments for public APIs]
- [e.g., README for each module]

### Git Workflow
- [e.g., Feature branches, PR required]
- [e.g., Commit message format: conventional commits]

### Other
- [Any other project-specific rules]

## SDD Workflow

This project uses Spec-Driven Development (SDD). See sdd/README.md for full workflow guide.

Commands:
- `/prompts:sdd-spec [name]` - Create feature specification
- `/prompts:sdd-tasks [name]` - Generate implementation tasks
- `/prompts:sdd-implement [name] [task-id]` - Implement single task

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
