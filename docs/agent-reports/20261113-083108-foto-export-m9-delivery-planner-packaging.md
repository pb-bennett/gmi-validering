# FOTO export M9 — coordinated delivery planning and packaging

Completed 2026-11-13. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, starting HEAD `42a2294550c5aeccd937d18dc88c16bc1602ead5`.

## Outcome and scope

Implemented a presentation-independent delivery service for modes A–D. Combined delivery produces verified revised GMI bytes, selected FOTO GML and the required original photographs in one ZIP. A blocked plan cannot produce a downloadable artifact. The imported GMI, photo records, delivery decisions and Rettinger history are not modified.

Confirmed the starting implementation before editing by inspecting the M7/M8 completion reports, combined-delivery planning report, FOTO export plans/reports, accepted Gemini compatibility reports, production services and tests. No M10 wizard, FOTO redesign, Validator change, Rettinger editing change, contextual Gjør om styling, dependency change, commit, push or deployment.

## Existing functionality reused

- M7 `planGmiHyperlinkRemoval` / `applyGmiHyperlinkRemoval`: exact occurrence/reference identity, source evidence checks, ordinal policy, exact authorization, one source-preserving application of removals and field corrections, independent verification.
- M8 canonical per-occurrence decisions, `getPhotoDeliverySnapshot` and `isPhotoDeliverySnapshotCurrent`.
- M3 editing registry, original source document, source rehash, immutable session identity, field-only export and effective Rettinger corrections.
- Existing FOTO snapshot, export rules, projection, profile semantics, metadata checks, attachment checksums and filename collision algorithm.
- Existing `serializePhotoExport` without any edits. Accepted Gemini UUIDv4 identifiers, timestamp omission/truncation/timezone handling, XYZ compatibility geometry and backslash links remain unchanged.
- Existing `fflate` pass-through ZIP behavior, extracted into one shared helper. No additional package dependencies.

## Changed files

| File | Purpose |
|---|---|
| `src/lib/delivery/index.mjs` | Public M9 service exports |
| `src/lib/delivery/deliveryPlan.mjs` | Snapshot capture, mode coordination, readiness, GML-before-removal gate, private revised bytes, source and attachment verification |
| `src/lib/delivery/deliveryAttachments.mjs` | Retained-reference resolution, exact reserved paths, shared files, collision planning and path safety |
| `src/lib/delivery/deliveryGml.mjs` | Strict XML parsing and output-to-plan record/geometry/link checks |
| `src/lib/delivery/deliveryPackage.mjs` | Standalone GMI / ordered ZIP generation with source rechecks |
| `src/lib/photos/export/exportZip.mjs` | Shared fixed-time, pass-through ZIP writer |
| `src/lib/photos/export/photoExportPackage.mjs` | Uses shared ZIP writer; established standalone layout remains unchanged |
| `src/lib/photos/export/photoExportPlan.mjs` | Optional occurrence IDs and preplanned attachments; validates attachment ownership, uniqueness and safe paths |
| `src/lib/photos/export/attachmentNames.mjs` | Existing naming algorithm extended with reserved names; shared filename safety and NFC/case-fold helpers |
| `tests/helpers/deliveryFixtures.mjs` | Synthetic integration fixture using the real loaded-source registry, FOTO session and Rettinger services |
| `tests/deliveryPlan.test.mjs` | 21 focused M9 tests |
| This report | Completion evidence and outstanding acceptance |

No existing tests, fixtures, manifests or expected hashes were changed.

## Service contract and delivery modes

`captureDeliverySnapshot({ mode, registry, handle, photoSession, photoLayerId, includeFieldChanges })` captures canonical owners. `buildDeliveryPlan(snapshot, configuration, { now, validateGml })` returns a frozen, issued plan with `status`, `errors`, `warnings`, `filename`, `mimeType`, `naming`, attachment inventory, counts and GMI verification/change summary. `buildDeliveryPackage(plan)` returns a Blob without starting a browser download or marking Rettinger changes downloaded.

`getDeliveryGmiBytes(plan)` returns a fresh copy; `getDeliveryGml(plan)` returns the reviewed serialized text. Both reject blocked, forged or stale plans. Source files are re-read and hashed by the package service; getters alone do not replace that final download gate.

| Mode | Behavior |
|---|---|
| `gmi-only` (A) | Existing field-only GMI export; applies Rettinger, never removes photo references. Does not require FOTO. Returns a standalone `.gmi` Blob. |
| `photos-only` (B) | Existing standalone FOTO scope: all placed occurrences, ignoring M8 decisions. Does not require a GMI registry. Returns GML + attachments ZIP. |
| `split` (C) | Original GMI plus authorized transfer removals, without field corrections. If any active ChangeSets exist, caller must explicitly pass `includeFieldChanges: false` at capture. |
| `combined` (D) | Same selections and attachments as C, with existing staged Rettinger corrections composed into the revised GMI by M7. |

C/D require a FOTO source bound to the same live loaded survey input and fingerprint. Direct FOTO-only GMI imports are insufficient. Transfers from another source block the entire plan. With no selected GML occurrences, C/D omit the GML; D with no transfers produces the same GMI bytes as A.

The optional additional `validateGml` callback must return `true`; it can impose stricter recipient checks but cannot bypass the built-in validation. It runs before M7 authorization. Production defaults use the built-in checks.

## ZIP structure and determinism

The existing timestamp/label naming contract is preserved: `YYYYMMDD-HHmmss[-label]`, Europe/Oslo. The logical Foto.gml artifact retains the established `<basename>.gml` filename; no serialization or naming migration was introduced.

```text
<basename>.zip
  <basename>.gmi
  <basename>.gml           # omitted when C/D have no selected GML occurrences
  Attachments/
    relevant photographs
```

Entry order is GMI, GML, then attachments sorted by path. GMI is written as raw bytes. ZIP entries use the existing fixed DOS timestamp, OS/attribute values and no image compression. No manifest/report is inserted into the ZIP.

Retained GMI links reserve their exact relative paths with backslashes mapped to ZIP slashes; the GMI values themselves are not rewritten. Shared retained/GML photographs reuse one `Attachments/<name>` entry when possible. GML-only names use the existing deterministic asset-ID hash suffix around reserved names, including reserved directory names. Equal content under distinct asset IDs is not merged. If an asset genuinely has several retained relative paths, each required path must be included; byte deduplication must not break those links.

Safe retained bare/deeper paths outside `Attachments/` are preserved at their original relative locations and produce `retained-path-outside-attachments` warnings, as planned. A shared GML asset without a compatible reserved `Attachments/<name>` path blocks rather than silently renaming or moving a kept link. This preserves the accepted Gemini path convention.

Rebuilding the same issued plan gives byte-identical ZIPs. New Gemini plans intentionally retain fresh UUIDv4 identities; reproducibility does not mean replacing accepted UUIDv4 generation with deterministic identifiers.

## Validation and safety decisions

- Selected transfer/include occurrences must each appear exactly once in the GML plan with the correct asset. Standalone's permitted omission of unplaced rows becomes a blocker for coordinated delivery.
- GML rules and serialization succeed before removal authorization. XML parsing, collection/member counts, unique GML IDs, feature/geometry identities, coordinates and attachment links must agree with the issued FOTO plan. This is not XSD certification; accepted Gemini timestamp omissions remain allowed.
- Retained photo associations are re-resolved against current assets and must agree with the source ledger. Missing/ambiguous/stale associations block.
- Selected and retained original photo files must be present/readable/nonempty; coordinated planning checks read size and hashes. Package construction rereads files and rejects changed checksums.
- Unlike the older plan's optional warning/confirmation proposal for missing retained photographs, this implementation blocks them, following this task's explicit prohibition on incomplete packages.
- Unsafe absolute, drive, UNC, URL, traversal, empty or unsafe path components block. Exact-path collisions across case/NFC variants and file/directory conflicts block. GML-only naming collisions are resolved deterministically.
- Snapshot liveness covers survey document/input, immutable editing session, FOTO occurrence membership, source state, placement, direction, metadata and M8 decisions. Checks surround asynchronous work. Original GMI is rehashed before/after package reads. Reset/unload/edits during generation refuse late output.
- Revised GMI bytes are held privately and copied on access. Blocked plans hold no downloadable GMI/XML. Existing M1/M7 verification preserves all source bytes outside intended field/reference patches.
- Scope is photographs. Non-photo links remain unchanged; the service does not fabricate or fetch external PDF/SOS attachments. Processing stays local.

## Verification results

Passed:

- `node --test tests/deliveryPlan.test.mjs`: **21 passed, 0 failed**. Covers all modes, combined ZIP, exact per-occurrence/shared decisions, unlinked inclusion, unplaced selection, failed GML validation, missing/unreadable/partial files, unsafe and reserved paths, collision renaming, Unicode ZIP EFS flags, exact unrelated GMI byte preservation, source/photo immutability, stale/foreign sources, forged plans, reset during reads and reproducible archive bytes.
- Relevant existing FOTO, GML parser, GMI editing/export and Rettinger regressions plus M9: **1,002 passed, 0 failed, 13 skipped**, 70 test files, serial execution. Existing golden/parity/Gemini identifier/timestamp/package tests passed.
- ESLint for every added/changed JS/MJS implementation and test file: **passed**, using `npx.cmd --no-install eslint ...`. Plain `npx` initially hit Windows PowerShell execution policy; `.cmd` resolved it without changing policy.
- Final `npm.cmd run build`: **passed**, including compile, TypeScript and static page generation. The initial sandboxed build could not fetch the existing Roboto Google font; the authorized network-enabled retry and final build passed. Existing Browserslist age warning remains.
- `git diff --check`: **passed** before report; repeated after report.

The reproducible regression selection was:

```powershell
$tests = @(Get-ChildItem tests -Filter '*.test.mjs' | Where-Object {
  $_.Name -match '^(photo|gmiEdit|gmiPhoto|geminiGmlParser|delivery)' -and
  -not (Select-String -LiteralPath $_.FullName -Pattern 'chromeHarness|PHOTO_UI_URL|PHOTO_WORKSPACE_UI_URL|GMI_EDIT_UI_URL' -Quiet)
} | ForEach-Object { $_.FullName })
node --test --test-concurrency=1 @tests
```

Failed separately; demonstrated baseline:

- Existing `node --test --test-force-exit tests/terrainPhotoGml.test.mjs`: Chrome timed out at `Runtime.enable` under the sandbox. Outside the sandbox, Chrome started but the harness failed to dynamically import `/tests/browser/photoSpatialChecks.mjs`.
- Repeated that exact browser test outside the sandbox against an isolated `git archive 42a2294 src tests package.json` copy with the existing dependencies linked: **same dynamic-import failure**. This establishes that failure at the requested starting commit, rather than inferring it from historical reports. No application assertions completed. The initial mixed baseline run was interrupted after its browser timeout left the test process alive; it is not reported as a completed passing suite.
- The unchanged browser harness was not repaired in this milestone. Its headless processes were closed by the harness. The isolated baseline copy and command logs are temporary artifacts outside the repository; no Git worktree/ref was created.

Skipped / not claimed:

- 13 opt-in/private-corpus checks in the completed regression selection. The suite also ran its available read-only Gemini reference comparator; no private values were copied into this change or report.
- Production UI screenshot checks and actual Gemini import acceptance were not performed. No UI changed, and the unified M9 download workflow is intentionally not exposed until M10. Synthetic tests are not real-delivery/manual acceptance.

## Remaining browser/manual acceptance; M10 and M11

1. Repair or configure the existing browser harness module-serving failure independently, then rerun GML browser coverage.
2. M10 should consume this service for its Innhold/Kontroll/Pakke wizard, render blockers/warnings and explicit split exclusion, enforce current-plan download and draft guards, and record completed field-download state only after an actual download starts. Add report download outside the ZIP. Do not duplicate patching, serialization or attachment planning in components.
3. On a fresh production build, check M10 controls/scrolling/keyboard access at 1280×720 and 1366×768. Exercise stale previews, split exclusion, missing originals, a shared photo with mixed decisions and failed package generation. Compare downloaded bytes with the reviewed service result.
4. M11: manually unpack and import a real approved combined package in Gemini, record import order/version and verify corrected GMI data, exact removed/retained links, retained photo opening, every Foto/GeoFoto record, shared-photo behavior, filenames, timestamp cases and no duplicate records. M7's `gemini-g4-unverified` warning remains; M9 does not claim to close that acceptance gate.
5. Full XSD/recipient certification and real-file acceptance remain distinct from this milestone's XML/record checks. Existing field encoding/editability limits remain unchanged.

## Git and publication

HEAD and branch unchanged. Task files remain unstaged/uncommitted. No stage, commit, push, merge, branch/ref change or deployment.

The three pre-existing untracked reports were left untouched:

- `20261111-085500-gmi-validator-rettinger-unified-workflow-planning.md`
- `20261111-092840-gmi-general-batch-editing-architecture.md`
- `20261111-093345-agents-instructions-proposal-DRAFT.md`

M9 stops here. M10 and M11 have not been started.
