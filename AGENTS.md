# GMI Validator agent instructions

## Execution policy

- Work directly in the current agent unless the user explicitly requests delegation.
- Do not spawn, delegate to, or orchestrate sub-agents automatically.
- Do not parallelize work through other agents.
- If a task is too large for one focused pass, stop and report that instead of delegating.

## Model workflow

The user selects the model for each task.

Typical workflow:

- Luna Medium: implementation
- Sol Medium: planning, review and debugging
- Luna High: difficult implementation only when explicitly selected
- Sol High: security, privacy and release review only when explicitly selected

Do not change model or delegate to another model automatically.

## Usage discipline

- Keep repository inspection focused on files relevant to the assigned task.
- Read referenced plans/reports instead of reconstructing or re-planning established work.
- Do not repeat broad repository audits during small implementation or correction tasks.
- Use targeted tests while implementing.
- Run the full repository suite/build once at the requested checkpoint, not repeatedly after minor edits unless necessary.
- Prefer concise command output and concise final reports.

## Git / production

- `main` is live production.
- Never merge, push, deploy or modify production configuration without explicit user approval.
- Do not commit unless explicitly requested.
- Preserve unrelated working-tree changes.
