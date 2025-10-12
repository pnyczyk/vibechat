# Init Guide: Initialize SDD Workflow

## Writing Principles

**IMPORTANT:** Read `sdd/docs/documentation-guide.md` for concise writing principles (DRY, omit obvious info).

## Purpose

Initialize SDD workflow:
1. AGENTS.md - project standards
2. `sdd/features.md` - feature backlog

## Phase 1: Detect Project Type

Use Glob to search for: `package.json`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `.csproj`, `.sln`, `Gemfile`

**If none found:** Empty project - ask all questions
**If found:** Existing project - auto-discover, show values, confirm/edit

## Phase 2: Create AGENTS.md

### Check Existing
If AGENTS.md exists: ask "Overwrite? (yes/no)". Only proceed with 'yes'. Otherwise skip to Phase 3.

### Read Template
Read `sdd/templates/AGENTS.md-template.md` - SINGLE SOURCE OF TRUTH for structure.

### Interactive Questioning
**Empty project:** Ask for info
**Existing project:** Show discovered values, confirm/edit

#### Section 1: Project Overview
**Existing:** Read README.md, extract description, ask "Use this? (yes/edit/skip)"
**Empty:** Ask for 1 paragraph (80-120 words) describing purpose, users, goals

#### Section 2: Tech Stack
**Existing - Auto-discover:**
- Language/runtime from package.json, pyproject.toml, Cargo.toml, go.mod
- Package manager from lock files (package-lock.json → npm, pnpm-lock.yaml → pnpm, etc.)
- Frameworks from dependencies
- Database from dependencies or docker-compose.yml

Show discovered, ask "Confirm? (yes/edit)"

**Empty:** Ask for language, package manager, frameworks, database

#### Section 3: Coding Standards
**Existing - Auto-discover:**
- Formatter from .prettierrc, pyproject.toml [tool.black], .rustfmt.toml, .clang-format
- Linter from .eslintrc.*, pyproject.toml [tool.ruff], clippy.toml
- Style guide from linter config

Show discovered, ask confirmation

**Empty:** Ask for style guide/formatter/linter

#### Section 4: Testing
**Existing - Auto-discover:**
- Framework from package.json devDeps (jest, vitest, playwright), pyproject.toml (pytest), Cargo.toml
- Coverage from config files
- Location from directory structure (__tests__/, tests/, test/)

Show discovered, ask confirmation

**Empty:** Ask for framework, coverage, location

#### Section 5: Architecture
**Existing - Discover hints:**
- Scan dirs for patterns: src/controllers/models/views → MVC, src/domain/application/infrastructure → Clean
- Show hints, ask user to describe

**Empty:** Ask for architecture description

#### Section 6: Constraints (Optional)
Ask for: performance, security, accessibility, browser/platform support. Skip if none.

### Generate AGENTS.md
1. Read template `sdd/templates/AGENTS.md-template.md`
2. Replace placeholders with collected info
3. Write to project root

## Phase 3: Create sdd/features.md

### Check Existing
If exists: ask "Overwrite? (yes/no)". Skip to completion if no.

### Create & Generate
1. Create `sdd/` directory if needed
2. Read template `sdd/templates/features-template.md` - SINGLE SOURCE OF TRUTH
3. Ask: "List features to track (comma-separated) or enter for empty"
4. If features provided: parse, ask status/priority/dependencies/description for each
5. Write to `sdd/features.md`

## Phase 4: Completion

```
SDD Workflow Initialized

Created:
- AGENTS.md
- sdd/features.md (X features)

Next:
1. Review AGENTS.md
2. Add features to sdd/features.md
3. /prompts:sdd-spec <feature-name>
```

## Guidelines

**Auto-Discovery:**
- Show confidence level ("fairly confident" vs "might be")
- Always allow edits
- Cross-check sources
- Handle missing data gracefully

**Interactive Questioning:**
- One section at a time
- Provide examples
- Accept "skip" for optional
- Confirm before writing

**Error Handling:**
- File read failures: show clear error
- Permission issues: suggest fix
- Partial completion: don't leave incomplete files
