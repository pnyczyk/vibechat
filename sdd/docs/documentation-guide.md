# Documentation Guide: Writing Concise Technical Documentation

## Core Principles

1. **DRY (Don't Repeat Yourself)** - the foundation of all rules below
2. **Omit obvious information** - readers have context
3. **Prefer bullets over paragraphs**
4. **Reference, don't duplicate**
5. **Say what's necessary, nothing more**

## User Stories

**Target:** 2-3 lines

**Bad:**
```
As an employee user of the system
I want to be able to view and edit my own personal user profile information
So that I can keep my information up to date and accurate in the system
```

**Good:**
```
As an employee
I want to view and edit my own profile
So that I can keep my information current
```

## Acceptance Criteria

**Target:** 3-5 items per story

### State positives, not exhaustive negatives
- **Bad:** Cannot access profiles, cannot delete accounts, cannot modify settings, cannot access admin
- **Good:** Restricted to own data only

### Omit obvious implications
- **Bad:** Email required, must be valid format, must be unique, cannot be null
- **Good:** Email required, validated, and unique

### Combine related items
- **Bad:** Password 8+ chars, must have number, must have special char, must have uppercase
- **Good:** Password: 8+ chars with number, special char, uppercase

## Task Descriptions

**Target:** 2-4 lines

**Bad:**
```
Create comprehensive User model with all necessary fields such as email,
password hash, role, timestamps. Implement proper validation following
AGENTS.md patterns.
```

**Good:**
```
Create User model with email, password, role, timestamps. Include validation.
```

## Test Criteria

State outcome, not test structure.

**Bad:**
```
- Unit tests verify email validation rejects invalid formats
- Integration tests verify model saves to database
```

**Good:**
```
- Email validation enforced (tested)
- Model persists correctly (integration test)
```

## Implementation Notes

**Make this section OPTIONAL**

**Skip when:**
- Requirement is straightforward
- Information already stated elsewhere

**Include when:**
- Specific non-obvious constraints exist
- Particular pattern/library must be used

**Bad:**
```
- Follow AGENTS.md patterns
- Use type hints
- Write clean code
```

**Good:**
```
- Use existing ValidationMixin for email validation
```

## Cross-References

Only include when adding specific value.

**Bad:**
```
Reference spec User Story #3. Follow AGENTS.md patterns.
```

**Good:**
```
Implements spec User Story #3
```

## Quality Check

Before finalizing, ask:
1. Can I remove this without losing meaning?
2. Am I repeating information from elsewhere? (DRY check)
3. Is this obvious from context?
4. Can I combine 3+ items into 1?
5. Using 10 words where 5 would work?

**Remember: Readers are intelligent. Say less.**
