# SDD Workflow Guide

Simplified Spec-Driven Development for vibechat

## What is SDD?

Spec-Driven Development flips traditional coding: instead of writing code then documenting it, you write clear specifications first, break them into tasks, then implement with AI assistance. The spec becomes your source of truth.

## The 4-Command Workflow

### 1. `/sdd:init`
**Initialize SDD workflow**

Sets up your project for spec-driven development:
- Detects project type (empty vs existing codebase)
- Auto-discovers tech stack, frameworks, testing tools (existing projects)
- Interviews you to create `AGENTS.md`
- Creates `sdd/features.md` backlog

**Run once** per project to set up the workflow.

### 2. `/sdd:spec [feature-name]`
**Create a feature specification**

Start by defining WHAT you want to build and WHY (not HOW - that comes from AGENTS.md).

```bash
/sdd:spec user-authentication
```

AI will brainstorm with you to create `sdd/features/user-authentication/spec.md` with:
- Problem statement
- User stories with acceptance criteria
- Success metrics
- What's out of scope
- Dependencies

**Focus:** Requirements and user value, not implementation.

---

### 3. `/sdd:tasks [feature-name]`
**Generate implementation tasks**

AI reads your AGENTS.md (tech stack, standards) and spec (requirements) to break work into bite-sized tasks.

```bash
/sdd:tasks user-authentication
```

Creates `sdd/features/user-authentication/tasks.md` with:
- T001, T002, T003... (numbered tasks)
- Each task: description, acceptance criteria, files affected
- Dependency tracking (what blocks what)
- Size estimates (1-3 days each)

**Output:** 5-15 specific, actionable tasks ready to implement.

---

### 4. `/sdd:implement [feature-name] [task-id]`
**Implement one task at a time**

AI loads full context (AGENTS.md + spec + task), writes code, runs tests, and shows you results.

```bash
/sdd:implement user-authentication T001
```

For each task:
1. **Implements** code following project standards
2. **Writes tests** per project requirements
3. **Verifies** acceptance criteria automatically
4. **Runs tests** and shows results
5. **Shows status** of all tasks (what's done, what's next)
6. **Asks your approval** before marking complete

**When all tasks done:** Shows celebration 🎉 with completion report.

---

## Your Project Standards

Edit `AGENTS.md` at your project root to define:
- **Tech Stack:** Language, frameworks, libraries
- **Coding Standards:** Style guide, patterns, conventions
- **Testing:** Coverage requirements, test frameworks
- **Architecture:** Layers, patterns, principles
- **Constraints:** Performance, security, accessibility

The AI follows these rules for every feature.

Run `mkdir -p ~/.codex/prompts && cp .codex/prompts/sdd-*.md ~/.codex/prompts/` so Codex CLI loads the `/sdd:*` slash commands.

---

## Example Workflow

```bash
# 1. Initialize (run once per project)
/sdd:init

# 2. Create feature spec (AI brainstorms with you)
/sdd:spec photo-albums

# 3. Generate tasks (AI breaks down into T001-T008)
/sdd:tasks photo-albums

# 4. Implement tasks one by one
/sdd:implement photo-albums T001
# Shows: verification + status + what's next

/sdd:implement photo-albums T002
# Shows: verification + status + what's next

/sdd:implement photo-albums T003
# Shows: verification + status + what's next

# ... continue until all tasks done ...

/sdd:implement photo-albums T008
# Shows: FEATURE COMPLETE with full report
```

---

## File Structure

```
sdd/
├── README.md                    # This file
├── features/
│   ├── photo-albums/
│   │   ├── spec.md              # What & why
│   │   └── tasks.md             # Implementation breakdown
│   └── user-authentication/
│       ├── spec.md
│       └── tasks.md
└── templates/                   # Templates for new specs/tasks
    ├── spec-template.md
    └── tasks-template.md
```

---

## Key Principles

### Quality Over Speed
- One task at a time with human review
- Automatic verification built-in
- Tests required (per project standards)

### Context is King
- Project standards always loaded (AGENTS.md)
- Spec always loaded (requirements)
- Task details always clear

### Transparency
- Status shown after every task
- Always know: what's done, what's next, how far to go
- No hidden state

### Simplicity
- 4 commands (not 40+)
- Visible directory (not hidden)
- Single tasks file per feature (not scattered)

---

## Tips

**Starting out?**
1. Fill out `AGENTS.md` carefully - this guides all AI work
2. Start with a small feature to learn the workflow
3. Review AI output carefully in early tasks

**For larger features:**
- Break into multiple smaller features if spec gets too large
- Keep user stories focused and independent
- Tasks naturally flow from well-written stories

**When stuck:**
- Check if `AGENTS.md` has enough detail
- Verify spec acceptance criteria are clear
- Make sure task descriptions are specific

---

## Comparison to Other Tools

| Aspect | Spec-Kit | CCPM | Agent-OS | **SDD** |
|--------|----------|------|----------|---------|
| Commands | 8 | 40+ | 5 | **4** |
| Phases | 6 | 5 | 5 | **4** |
| GitHub | Optional | Required | Optional | **Not included** |
| Constitution | Per-feature | Global | Global | **Global (one file)** |
| Status | Manual | Manual | Manual | **Automatic** |
| Verification | Manual | Manual | Manual | **Automatic** |
| Directory | Hidden `.specify/` | Hidden `.claude/` | Hidden `.agent-os/` | **Visible `sdd/`** |

**Philosophy:** Maximum clarity with minimum overhead.

---

## Getting Help

- Check `sdd/templates/` for spec/tasks examples
- Review existing features in `sdd/features/`
- Ensure `AGENTS.md` is complete
- Each command is self-documenting (read the command files in `.codex/prompts/`)

---

Built with [Copier](https://copier.readthedocs.io) • Inspired by Spec-Kit, CCPM, Agent-OS
