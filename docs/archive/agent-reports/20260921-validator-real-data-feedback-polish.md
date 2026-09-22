# Validator 2.0 real-data feedback polish

## Implemented

1. `S_HYPERLINK` supplied on `LOK` and `TOP` now groups into one presentation diagnostic only when it is the same attachment-link unexpected-value policy. The group uses the union of deduplicated exact ObjectRefs, so two LOK plus three TOP objects renders one `FEIL · 5 OBJEKTER` card and hands the exact five-object scope to the existing table workflow.
2. `Bredde` has a new canonical `OPTIONAL_SUPPORTED` applicability state for `INR`: missing and valid supplied values pass; invalid supplied values fail. Other Tema behavior is unchanged.
3. `Adkomst` on `SLU` is optional supported: missing and valid supplied values pass; invalid supplied values fail. KUM remains missing = Sjekk, valid = Pass, invalid = Feil.
4. Existing Ledning handling is scoped to the canonical `Stedfestingsårsak` code `UENDR` only, and only to canonical fields `wallThickness` (Tykkelse), `sdr` (SDR), and `ringStiffness` (Ringstivhet). A missing value that would otherwise fail now produces Sjekk with explicit existing-infrastructure wording. Valid supplied values retain normal Pass behavior; invalid supplied values remain Feil; `dimension` and other fields remain unchanged.

   Evidence: `src/data/validation-v2/authoritative-value-tables.js` defines `UENDR` as “Uendret” and describes it as an existing wholly/partly exposed object with prior inadequate positioning. The canonical field registry maps `Tykkelse` to `wallThickness`, `SDR` to `sdr`, and `Ringstivhet` to `ringStiffness`; the active line rules identify these as the relevant required/value controls. No other positioning-cause codes were included because the repository source does not establish the same unchanged/legacy meaning. `FJERN`, `FLYTT_DELV`, and `FLYTT_HELT` remain outside this exception.
5. Compact table headers now calculate whether their allocated column width constrains the visible label and append `…` when it does. Existing single-line and contextual two-line behavior, compact sizing, and full-name title tooltips are retained.

## Files changed

- `src/components/LayerDataTable.js`
- `src/lib/validation-v2/contracts.js`
- `src/lib/validation-v2/diagnostics.js`
- `src/lib/validation-v2/fieldPolicy.js`
- `src/lib/validation-v2/registry/pointFieldApplicability.js`
- `src/lib/validation-v2/validationRunner.js`
- `tests/validationV2RealDataPolish.test.mjs`
- `tests/validationV2PointFieldApplicability.test.mjs`
- `tests/validationV2GmiV32Batch2.test.mjs`

## Verification

- Focused changed-area tests: `node --test tests/validationV2RealDataPolish.test.mjs tests/validationV2PointFieldApplicability.test.mjs tests/validationV2GmiV32Batch4.test.mjs tests/validationV2Diagnostics.test.mjs` — 50 passed, 0 failed.
- Complete Validator suite: `node --test tests/validationV2*.test.mjs` — 256 passed, 0 failed.
- Build: `npm run build` — passed. Existing Browserslist data-age warning only.
- `git diff --check` — passed.

No commit, push, deployment, branch switch, production change, or dependency change occurred. The pre-existing modifications to `docs/validation-v2/validator-v2-v32-manual-decisions.md` and `tests/fixtures/validationV2GmiV32Batch2.mjs`, plus the pre-existing untracked research files, were preserved and not modified by this work. No generated build artifacts were introduced.
