# Batch 1B.1 progress record (working file) — pure hyperlink transfer planner and verifier

2026-11-21, Europe/Oslo. Branch `feature/photo-workspace`, starting HEAD `7ee184d`. Working record; the completion report `20261121-*-hyperlink-transfer-batch1b1-completion.md` supersedes it.

- Start: branch/HEAD verified. Pre-existing status-only paths (five `tests/gmi*Ui.test.mjs`) left untouched.
- Read: AGENTS.md, Batch 1A and 1A.2 completion reports, roadmap Batch 1B rows.
- Investigated: extractor, FOTO evidence/ledger, M7 removal, M1 patch/targets/encoding/source index/source document/verify, M2 reserved-column guard and session compile, review-model decisions.
- Implemented `src/lib/gmi-edit/hyperlinkTransfer.mjs` (planner + proposal builder, reuses unchanged M7 for removal) and `src/lib/gmi-edit/hyperlinkTransferVerify.mjs` (independent verifier); barrel exports in `index.mjs`.
- Tests: `tests/gmiEditHyperlinkTransfer.test.mjs` 21/21 pass. Registered the two modules in the gmi-edit import-inventory contract (`tests/gmiEditProduction.test.mjs`, same allowed imports as M7); 12/12 pass.
- Lint of changed JS/MJS: exit 0.
- In progress: full serial Node suite (log `%TEMP%/gmi-1b1-node-full.log`); isolated build copy `%TEMP%/gmi-1b1-build` prepared (src identical, node_modules junction).
- Next: production build (webpack), focused browser smoke, `git diff --check`, completion report.
- Completed: full serial Node 2,349/0/156; fresh isolated webpack build passed; focused production browser 15/0/0 (port 3180, stopped); lint and `git diff --check` exit 0. See the completion report `20261121-123755-hyperlink-transfer-batch1b1-completion.md`.
