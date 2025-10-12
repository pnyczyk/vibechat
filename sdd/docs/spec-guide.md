# Spec Guide: Writing Feature Specifications

## Writing Principles

**IMPORTANT:** Read `sdd/docs/documentation-guide.md` for concise writing principles (DRY, omit obvious info, combine related items).

## Prerequisites

Requires AGENTS.md at project root defining tech stack, coding standards, testing requirements, and architecture.

If missing, run `/prompts:sdd-init` first.

## Validation

1. **Feature name:** kebab-case only
   - Valid: `user-auth`, `photo-albums`, `payment-v2`
   - Invalid: `UserAuth`, `photo_albums`, `Payment V2`

2. **Check existing:** If `sdd/features/{feature-name}/` exists, ask "Feature '{feature-name}' exists. Overwrite? (yes/no)"
   - Only proceed with explicit 'yes'

## Process

### Interactive Brainstorming

Ask clarifying questions to understand:

**Problem & Context:**
- What problem does this solve?
- Who are the affected users?
- Why now?
- What happens if we don't build this?

**User Stories:**
- Main user flows?
- Required actions?
- Value delivered?
- Success definition per flow?

**Scope:**
- What's included?
- What's NOT included (out of scope)?
- Dependencies on other systems/features?
- Success metrics?

### Generate Specification

1. Create directory: `sdd/features/{feature-name}/`

2. Read `sdd/templates/spec-template.md` - the SINGLE SOURCE OF TRUTH for format

3. Create `sdd/features/{feature-name}/spec.md`:
   - Replace all `[placeholders]` with brainstorming content
   - Follow template structure exactly
   - Apply conciseness principles from documentation-guide.md

### Completion

Show summary:
- Number of user stories
- Key success metrics
- Main dependencies

Suggest next step:
```
Feature spec created: sdd/features/{feature-name}/spec.md

Next: /prompts:sdd-tasks {feature-name}
```

## Guidelines

**Focus on WHAT and WHY, not HOW:**
- WHAT: What the feature does
- WHY: Why users need it
- NOT HOW: Tech implementation (from AGENTS.md)

**User story structure:**
- Clear actor, action, benefit
- 2-5 measurable acceptance criteria
- Apply conciseness rules from documentation-guide.md

**Out of scope:**
- List only non-obvious exclusions
- Prevents scope creep

**Keep it user-focused:**
- User perspective, not technical jargon
- Focus on value delivered
