# TODO (snapshot)

Snapshot of the in-memory TODO list exported from the assistant task manager.

Date: 2025-12-24

## How this works

- The authoritative, live TODO list is maintained in-memory by the assistant using a task manager.
- This file is a snapshot for visibility and collaboration. Use it as a reference; update via PRs when you want persistent changes.

---

## Tasks

1. Define feature acceptance criteria — **not-started**

   - Write clear pass/fail criteria for each core feature (upload, parse, validate, report).

2. Define data model & error schema — **not-started**

   - Standardize validation error shape (e.g., `{ file, line, field, code, message }`).

3. Draft example `.gmi` fixtures & expected outputs — **not-started**

   - Create `tests/fixtures/*.gmi` and matching JSON expected outputs.

4. Design UI flow (upload → results → download) — **not-started**

   - Wireframe or step list for the user flow and success states.

5. Draft Copilot prompt templates for dev tasks — **not-started**

   - Create a few templates (Task/Context/Input/Output/Constraints) for common work.

6. Outline tests & CI plan — **not-started**

   - Define unit/integration tests and a GitHub Actions workflow to run build & tests.

7. Review and finalize `COPILOT_INSTRUCTIONS.md` edits — **not-started**

   - Incorporate acceptance criteria, prompt templates, and sample fixtures into the instructions file.

8. Export TODO to `TODO.md` in repo root — **completed**
   - Snapshot performed and file created (this file).

---

Notes

- Use this file for visibility; if you want the assistant to update task statuses persistently, tell me and I'll commit updated snapshots at milestones.
- The live, editable list remains in the assistant's in-memory task manager for quick iteration.
