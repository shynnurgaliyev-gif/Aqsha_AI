# TASK_PROTOCOL

## Workflow

```
Read context → Plan → Implement → QA → Document
```

### 1. Read context
Before non-trivial work: read `CLAUDE.md` and `docs/PROJECT_STATE.md`.
Understand what's already built. Avoid duplicating or contradicting prior decisions.

### 2. Plan
For any task touching more than 2 files: write a brief plan before changing code.
Plan = approach, files to change, risks. Keep it short.

### 3. Implement
- Stay inside requested scope; flag scope creep explicitly before expanding
- Follow domain rules from CLAUDE.md (money, SQL migrations, security)
- Prefer simple, explicit, typed code over clever abstractions
- Flag unexpected findings (design issues, bugs, risks) as you encounter them

### 4. QA — mandatory after every implementation
Spawn qa-agent to validate the result:

```
Agent tool → subagent_type: "qa-agent"
Prompt: "Verify [what was changed]. Changed files: [list]. Run typecheck + build for
affected packages. Review logic for [specific concerns if any]."
```

If QA returns FAIL → address all reported issues → re-spawn QA.
Task is complete only when QA returns PASS.

### 5. Document
After the task is accepted:
- Update `docs/PROJECT_STATE.md` (completed work table + next step)
- Add entry to `docs/IMPLEMENTATION_LOG.md` (one entry per task)
- Update `docs/ARCHITECTURE_DECISIONS.md` only if a real architectural decision was made

---

## Conflict Resolution Priority

1. Domain rules in `CLAUDE.md` (money, DB, security)
2. User's explicit request
3. Existing architectural decisions (`docs/ARCHITECTURE_DECISIONS.md`)
4. Agent judgment

---

## Documentation Rules

- `IMPLEMENTATION_LOG.md` entries: short, factual, structured. One per accepted task.
- Archive `IMPLEMENTATION_LOG.md` when it becomes too large to read comfortably
  → move older entries to `docs/archive/IMPLEMENTATION_LOG_archive_NNN.md`
- Do not mark work as accepted unless it passed QA and was confirmed by the user.
