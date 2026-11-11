# Development instructions

## Scope and conventions

- Read only documentation and planning/completion reports relevant to the assigned task, including `docs/development.md` and reports in `docs/agent-reports/` as needed. Avoid unnecessary repository exploration. Plans describe decisions and proposals; check implementation and follow-up reports for superseding decisions. Do not implement later milestones without task authorization.
- Keep changes focused. Reuse existing components, state owners, validation policies and helpers; avoid parallel mechanisms, unrelated refactors and dependency changes unless needed for the task.
- Follow nearby code conventions. Use existing design tokens, Phosphor icons and Norwegian user-facing terminology. Preserve keyboard access, accessible names, draft guards and usable scrolling/layout at laptop sizes.
- Active GMI Validator V2 lives under `src/lib/validation-v2/`; legacy JSON rules are not its rule owner. Keep feature-specific architecture and acceptance decisions in their reports, not here.
- **Language:** Use English for all AI-agent communication, progress updates, terminal summaries, planning documents, and completion reports. Use Norwegian for application UI text and other end-user-facing content. Preserve established Norwegian field names and technical terminology where appropriate.

## Source and data safety

- Treat contractor files and private/reference corpora as read-only. Use synthetic fixtures for tracked tests; do not copy private file contents, identifying values or secrets into code, fixtures, logs or reports. See `SECURITY.md` and `docs/privacy.md`.
- Preserve immutable original GMI bytes and source identity. Use the existing source-preserving patch/verification/export path for revised copies; never reconstruct an export by serializing the parsed display model. No-op output must be byte-identical; bytes outside intended patches must remain unchanged, including encoding, line endings, geometry and unknown sections.
- Preserve editability, stale-source, preview, approval and export verification gates. Fail closed with an explanation when safety cannot be verified; never silently repair or normalize source data.
- Respect `.gitattributes`, byte-exact fixtures and manifests. Do not regenerate fixtures, alter expected hashes or relax safety assertions merely to make tests pass. Explain deliberate contract changes and retain equivalent safety coverage.
- Keep file processing local under existing privacy contracts. Keep server secrets server-side and render untrusted attributes as text, not interpolated HTML.

## Verification

- Keep verification proportional to the change. For code changes, run focused behavior/regression tests with `node --test <test-files>` and lint affected JS/MJS files with `npx --no-install eslint <files>`. Require broader regression tests and `npm run build` for consequential application changes, especially shared editing, validation and source-safety logic, and when the task's acceptance gates require them. Use appropriately scoped checks for small or documentation-only changes; the full serial command is `node --test --test-concurrency=1 "tests/*.test.mjs"`.
- For UI changes, scope browser and visual checks to the affected behavior. For consequential workflow or layout changes, use the existing browser harness and inspect screenshots at relevant sizes, including 1280×720 and 1366×768. Use a fresh production build for production-workflow tests; configure required harness variables and run shared-server browser tests serially. Use a free port and stop only processes you started.
- Report passed, failed and skipped checks separately. Establish evidence before calling a failure pre-existing; historical counts are not an exemption. Do not equate skipped/private-corpus tests or synthetic automation with real-file/manual acceptance. Record blocked checks and remaining acceptance work.
- Run `git diff --check`. Documentation-only work needs relevant content/link checks, not application builds.

## Completion and Git

- At the start, verify repository, branch, HEAD and working-tree status. Preserve existing changes and concurrent agents' files. Avoid shared build output or servers in use by another task; use an isolated workspace when necessary.
- Do not automatically synchronize or change branches. Do not reset, clean, stash, restore or overwrite others' changes. Commit, push, merge, rebase, deploy or change Git refs only when authorized by the user. When a commit is authorized, stage only this task's files.
- Save a concise, uniquely timestamped report in `docs/agent-reports/`; mark planning drafts clearly. Include scope/outcome, changed files, commands/results, deviations, remaining risks/manual acceptance, and Git status/publication actions. Separate observed facts from recommendations and unverified assumptions. Keep detailed feature decisions there rather than expanding this file.
