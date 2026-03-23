\# TASK\_PROTOCOL



Before doing any implementation work on this project, follow these rules strictly.



\## 1. Read project memory first

Always read these files before making meaningful changes:



\- TASK\_PROTOCOL.md

\- CLAUDE.md

\- docs/PROJECT\_STATE.md

\- docs/ARCHITECTURE\_DECISIONS.md

\- docs/IMPLEMENTATION\_LOG.md



Treat them as the project source of truth.



\## 2. Respect existing architecture

Do not ignore previously accepted decisions.

Do not invent a new architecture if the project memory already defines the direction.

Do not silently replace approved stack or structure.



\## 3. Before changing code

You must:

\- inspect the current repository structure

\- understand the exact task scope

\- check for conflicts with accepted decisions

\- make a brief implementation plan first



\## 4. During implementation

You must:

\- stay strictly inside scope

\- avoid unrelated refactors

\- avoid architecture changes without explicit approval

\- avoid database schema changes outside SQL migrations

\- avoid changing previously accepted behavior silently



\## 5. After implementation

You must:

\- show exact changed files

\- explain what was changed

\- provide a short verification summary

\- stop after the requested task

\- not continue automatically into the next task



\## 6. Project memory update rule

If the task result is completed and accepted, update the relevant memory files:



\- docs/PROJECT\_STATE.md

\- docs/ARCHITECTURE\_DECISIONS.md (only if a real architecture decision was made)

\- docs/IMPLEMENTATION\_LOG.md



\## 7. Memory update constraints

Memory updates must be:

\- short

\- factual

\- structured



Do not:

\- invent completed work

\- mark anything as accepted unless it was actually accepted

\- casually rewrite history

\- remove important earlier decisions without explicit approval



\## 8. Priority rule

If there is any conflict:

1\. TASK\_PROTOCOL.md

2\. CLAUDE.md

3\. docs/PROJECT\_STATE.md

4\. docs/ARCHITECTURE\_DECISIONS.md

5\. docs/IMPLEMENTATION\_LOG.md



\## 9. Working style

Use a controlled engineering approach.

Prefer correctness over creativity.

Protect consistency.

Stay within the approved system.



\## 10. PROJECT\_STATE freshness rule

After every accepted task, docs/PROJECT\_STATE.md must be updated.

"Next Recommended Step" must always reflect the actual next approved implementation step — not a stale or speculative one.

Do not leave "Next Recommended Step" pointing to work that was already completed.



\## 11. IMPLEMENTATION\_LOG archiving rule

When docs/IMPLEMENTATION\_LOG.md becomes too large to read comfortably, older accepted entries must be moved to docs/archive/IMPLEMENTATION\_LOG\_archive\_NNN.md.

Do not delete project history — archive it.

Do not archive entries that have not been accepted and verified.

