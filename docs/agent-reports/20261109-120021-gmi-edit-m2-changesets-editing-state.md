# GMI editing M2: ChangeSets, editing state, proposed dataset, eligibility and diff

Date: 2026-11-09. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, starting commit `627e315`.
Scope: **Milestone M2 only**, from `docs/agent-reports/20261108-gmi-editing-combined-delivery-planning.md` (§5, §9.2, §10). It builds on M0 (`20261109-110929-…`) and M1 (`20261109-113731-…`).

Not changed:
- no UI, session registry, download service, Validator buttons, column addition, hyperlink removal or FOTO intent;
- the M1 engine (`sourceDocument`, `sourceIndex`, `encoding`, `targets`, `patch`, `verify`), `GMIParser`, all fixtures and their manifests;
- no original GMI file.

No commit, no push.

---

## 1. Changed files

| File | Status | Purpose |
|---|---|---|
| `src/lib/gmi-edit/changeSet.mjs` | new | ChangeSet model: modes, conflict policies, skip reasons, column-ownership guard, deterministic cell order, effective-cell computation and the frozen ChangeSet builder. |
| `src/lib/gmi-edit/session.mjs` | new | Immutable session values. Covers ChangeSet creation (generic, single-object, batch), stage, undo, redo, discard one, discard all, effective-edit compilation and inspection. |
| `src/lib/gmi-edit/proposed.mjs` | new | One verified M1 application per effective state, an explicit proposed-result cache, app-shaped datasets and memoized `runGmiValidationV2` revalidation. |
| `src/lib/gmi-edit/eligibility.mjs` | new | Batch eligibility for SDR, pressure class and ring stiffness, evaluated on the current proposed dataset through Validator applicability. |
| `src/lib/gmi-edit/diff.mjs` | new | `diffGmiDatasets(original, proposed)` (T17). |
| `src/lib/gmi-edit/index.mjs` | changed | Exports the M2 API (the M1 exports are unchanged). |
| `src/lib/validation-v2/validationRunner.js` | changed | Pure refactor plus one export. The run-context build moved out of `runGmiValidationV2` into a private `createGmiRunContext`, with no behaviour change. New `evaluateGmiRuleApplicability(input, ruleId)` (§6). |
| `tests/gmiEditChangeSets.test.mjs` | new | 19 M2 tests and 1 opt-in private-corpus test. |
| `tests/gmiEditProduction.test.mjs` | changed | The M1 import-boundary test listed exactly the seven M1 files, so it now lists the M2 files as well. M1 core files may still import only M1 siblings and `../parsing/`. Only `proposed.mjs` and `eligibility.mjs` may import `../validation-v2/`. |
| this report | new | |

**Module boundaries.** I kept the five proposed modules and made one adaptation. The public ChangeSet constructors (`createGmiFieldChangeSet`, `createGmiObjectCorrection`, `createGmiBatchCorrection`) live in `session.mjs`, not `changeSet.mjs`. A ChangeSet must be built against one exact session state, which includes its effective cells, its history identity and its id sequence. Putting the constructors in `changeSet.mjs` would create a `changeSet ↔ session` import cycle. `changeSet.mjs` keeps the model and the pure builder (`buildGmiChangeSet`). The dependency graph has no cycles: `changeSet` ← `session` ← `proposed` ← `eligibility`, and `diff` stands alone.

## 2. Public M2 API and usage

```js
import {
  createGmiSourceDocument, createGmiEditSession,
  createGmiObjectCorrection, createGmiBatchCorrection, createGmiFieldChangeSet,
  stageGmiChangeSet, undoGmiEdit, redoGmiEdit, discardGmiChangeSet, discardAllGmiEdits,
  evaluateGmiBatchEligibility, getGmiProposedState, getGmiProposedBytes,
  revalidateGmiEditSession, diffGmiDatasets, getGmiDocumentDataset,
  getGmiEditCell, listGmiEditCells, summarizeGmiEditSession, compileGmiEffectiveEdits,
} from '@/lib/gmi-edit/index.mjs';

const document = createGmiSourceDocument(bytes);              // M1, immutable
let session = createGmiEditSession(document, { layerId });   // immutable value

// Single object (object editor): explicit overwrite, identity guards.
const one = createGmiObjectCorrection(session, {
  scope: 'line', sourceIndex: 2, objectId: 3, guid,
  values: { Material: 'PE100', Merknad: 'Rettet' },
  mode: 'overwrite', label: 'Material PE100 · Linje 3',
});
if (one.ok) session = stageGmiChangeSet(session, one.changeSet).session;

// Batch from eligibility (SDR fill, default fill-missing).
const eligibility = evaluateGmiBatchEligibility(session, { canonicalFieldId: 'sdr' });
// eligibility.eligible / .skipped (reason per object) / .counts
const batch = createGmiBatchCorrection(session, { lexeme: '11.0', eligibility, label: 'Fyll SDR 11.0' });
session = stageGmiChangeSet(session, batch.changeSet).session;

// Proposed copy (verified once by M1, then cached), diff and revalidation.
const proposed = getGmiProposedState(session);   // { ok, identical, editCount, edits, document, dataset, … }
const bytesOut = getGmiProposedBytes(proposed);  // fresh copy
const diff = diffGmiDatasets(getGmiDocumentDataset(document), proposed.dataset);
const { original, revised, summary } = revalidateGmiEditSession(session, { referenceDate: '2026-11-09' });

session = undoGmiEdit(session).session;           // also redoGmiEdit, discardGmiChangeSet(session, id), discardAllGmiEdits
```

| Function | Contract |
|---|---|
| `createGmiEditSession(doc, {layerId})` | Empty session `{kind, document, layerId, editable, changeSets, redo, stateKey}`. All of them are frozen. |
| `createGmiFieldChangeSet(session, {requests, mode, conflictPolicy, origin, label, createdAt})` | Generic builder. `requests = [{scope, sourceIndex, field, lexeme, objectId?, guid?}]`. Returns `{ok, changeSet}` or `{ok:false, rejections}`. |
| `createGmiObjectCorrection(session, {scope, sourceIndex, objectId?, guid?, values, …})` | Several columns of one object. `origin: 'object-editor'`. |
| `createGmiBatchCorrection(session, {field, lexeme, targets \| eligibility, …})` | One column and one lexeme across many objects. `origin: 'batch'`. |
| `stageGmiChangeSet(session, cs)` | `{ok, session, staged}`. `staged:false` means a valid no-op (nothing to apply). Otherwise `{ok:false, code}`. |
| `undoGmiEdit` / `redoGmiEdit` / `discardGmiChangeSet` / `discardAllGmiEdits` | `{ok, session, …}` or `{ok:false, code}`. |
| `compileGmiEffectiveEdits(session)` | `{ok, edits, effectiveKey}`: the one M1 edit list. |
| `getGmiEditCell(session, {scope, sourceIndex, field})` | `original`, `proposed`, `changed`, `touched`, `reserved` and the per-ChangeSet `history`. |
| `listGmiEditCells(session)` / `summarizeGmiEditSession(session)` | Changed and reverted cells, and counts (including `canUndo`/`canRedo`). |
| `evaluateGmiBatchEligibility(session, {canonicalFieldId, mode, targets?, cache?})` | §6. |
| `getGmiProposedState(session, {cache?})` / `getGmiProposedBytes(p)` | §7, §8. |
| `getGmiDocumentDataset(doc)` | The app-shaped dataset (`toObject()` minus `warningSummary`, like `layer.data`). One stable object per document. |
| `validateGmiDataset(dataset, {layerId, referenceDate})` / `revalidateGmiEditSession(session, …)` | Memoized `runGmiValidationV2`. |
| `diffGmiDatasets(original, proposed)` | §7. |
| `createGmiProposedCache({maxEntriesPerDocument})` / `defaultGmiProposedCache` | §8. |

Rejections are data with codes only, never file content. Programming errors throw `TypeError`: a non-document, a non-session, or an invalid `layerId`/`referenceDate`.

## 3. ChangeSet and conflict semantics

A ChangeSet is deep-frozen and records the following fields:
- `id` (`cs-<n>`; the sequence is per session lineage and never reused);
- `origin`, `label`, `createdAt` (supplied by the caller; the library stays deterministic);
- `mode`, `conflictPolicy` and `basis.stateKey`;
- `cells[]` = `{key, scope, sourceIndex, field, position, objectId, guid, original, previous, next, overwrote, overwritesPopulated}`;
- `skipped[]` (with `reason`, `current` and `conflictsWith`), `unchanged[]` and `conflicts[]` (with `with` and `resolution`);
- the optional `eligibility` summary;
- `counts` = `{requested, applied, skipped, unchanged, conflicting, overwritten, populatedOverwrites, skippedByReason}`.

**Resolution happens once, at build time,** against the exact session state, as in planning §5.2. Selections become explicit cells. A later undo or discard never widens or narrows a set.

Per requested cell (`current` = effective value; *touched* = changed by an earlier active set):

1. `next === current` → **unchanged** (a valid no-op, not a conflict, even when an earlier set proposed the same value).
2. Touched, policy **`skip` (default)** → skipped `conflict` with `conflictsWith: [ids]`, and listed in `conflicts` as `skipped`.
3. Touched, policy **`replace` (explicit)** → applied. `overwrote: {changeSetId, lexeme}` is set and the cell is listed as `replaced`. Exception: in `fill-missing` mode a populated *delivered* value is still protected (skipped `populated`).
4. Untouched, mode **`fill-missing` (default)** and the delivered value is populated → skipped `populated`.
5. Otherwise → applied. **`overwrite` must be requested explicitly**, and it reports `overwritesPopulated`.

Whole-set rejections:
- invalid spec, mode or policy; no requests;
- read-only document;
- invalid, unknown or stale targets: `unknown-scope`, `invalid-source-index`, `object-not-found`, `object-identity-mismatch` (`objectId`/`guid` guards);
- `field-absent`, `unnamed-field`, `duplicate-field-name`, `duplicate-target`;
- any lexeme the M1 encoding policy refuses (`lexeme-semicolon`, `lexeme-not-string`, …);
- reserved columns (§5).

Objects with irregular source structure (`object-not-editable`) are **skipped** with a reason, not rejected, so a batch over a file with a few irregular objects still works. **No column is ever added**: a column missing from the source is always `field-absent`.

Staging refuses the following:
- anything not built by this library (`not-a-change-set`; copies and spread objects included);
- a set built on another session lineage (`foreign-change-set`) or another document (`document-mismatch`);
- a set built on a different history state (`stale-change-set`);
- a set that is already active.

The **effective value** of a cell is the `next` of the last active set that contains it, otherwise the original. The **effective edits** are one edit per cell whose proposed value differs from the delivered lexeme: `{target (+objectId/guid guards), expected: <original source lexeme>, lexeme: <final>}`. They are ordered deterministically (point, then line; then source index; then column position). Reverted cells produce no edit. Because cells are keyed, overlap is impossible by construction. `compileGmiEffectiveEdits` asserts it anyway, and re-asserts column ownership, before anything reaches M1.

**History for the future Rettinger UI:**
- `session.changeSets` is the ordered change list, with labels, origins and counts;
- `getGmiEditCell(...).history` shows every set that touched a cell, with previous → next;
- `listGmiEditCells` separates changed cells from reverted ones.

## 4. Undo, redo and discard

Sessions are immutable values, and every transition returns a new session. Earlier session values, the ChangeSets and the source document are never modified (tested).

| Operation | Behaviour |
|---|---|
| `stage` | Appends the set and clears redo. |
| `undo` | Moves the last active set onto the redo stack. The resulting `stateKey` equals the state the set was built on. |
| `redo` | Re-appends the top of the redo stack. It checks that the set's basis equals the current state, which is always true after an undo. |
| `discard(id)` | Removes any active set. Effective values are recomputed from the remaining sets. Redo is cleared, because those sets were built on a history that no longer exists. `affected` lists later sets whose conflict decisions referred to the discarded set. Their cells are not widened: cells that were skipped stay skipped. |
| `discard all` | No sets and no redo. The proposed copy is the original, byte-identical. |

Every state is recomputed from the history (never from earlier output). Undo followed by redo, or reverting a cell to its original value, leads to an effective state that has already been computed, so it is served from the cache.

## 5. Field ownership

`isGmiFieldEditReservedColumn(field)` matches any column whose trimmed, upper-cased name starts with `S_HYPERLINK`. This covers `s_hyperlink` and the legacy alias `S_HYPERLINK_punkt`. Ordinary field editing refuses these columns with the code `field-owned-by-photo-delivery`, at every level:
- generic requests, including when they are mixed with valid fields (the whole set is rejected);
- single-object corrections (also when clearing a link);
- batch corrections;
- eligibility (`canonicalFieldId: 'attachmentLink'`, or any binding that resolves to a reserved column);
- skip records smuggled in through the generic path, which are stripped;
- staging, which re-checks the cells of registered sets;
- the final effective-edit compilation.

There is no option to switch the guard off. ChangeSets cannot be forged: they are deep-frozen and registered in a private WeakMap. Read-only inspection still shows the column, marked `reserved: true`. **M1 is unchanged.** `editGmiFields` still patches `S_HYPERLINK` for the future M7 composer, and a test asserts this.

## 6. Batch eligibility (T6) and Validator integration

**Validator seam.** `getDiagnosticApplicability` depends on the full policy context: Tema identity, hydraulic class, material validity and the rule's own evaluation (`NOT_EVALUATED` → `UNRESOLVED`). To avoid duplicating it, I moved the context build out of `runGmiValidationV2` into a private `createGmiRunContext`, which is a pure extraction. `runGmiValidationV2` is otherwise byte-for-byte the same code path, and all Validator suites pass.

The new export `evaluateGmiRuleApplicability(input, ruleId)` runs only that rule through the existing `createRuleResult`. It returns, per object, `{objectRef, state, reasonCode, applicability (= diagnosticFacts.coverageApplicability), presence}`, plus the schema binding. This is the "small exported helper" the planning report anticipated.

**`evaluateGmiBatchEligibility(session, {canonicalFieldId, mode, targets})`**
- **Allow-list**: `sdr` → `innmaling.line.sdr.valid`, `pressureClass` → `innmaling.line.pressure-class.valid`, `ringStiffness` → `innmaling.line.ring-stiffness.valid`. Other fields return `unsupported-field`. The M5 allow-list and UI build on this. It is not a general auto-fix system, and it never chooses a value.
- **Evaluated on the current proposed dataset**: `getGmiProposedState(session).dataset`. A Material or Tema corrected earlier makes an object eligible (tested on lines 4 and 6), and an earlier SDR fill counts as populated.
- **Column**: the Validator schema binding on that dataset. `FIELD_ABSENT` returns `field-absent`, and any other non-`BOUND` state returns `field-binding-unresolved`. **No column is added.**
- **Categories**: `APPLICABLE` objects are eligible when the cell is editable and either missing (default `fill-missing`) or any value (explicit `overwrite`, flagged `overwrite: true`). The others are skipped:
  - `NOT_APPLICABLE` → `not-applicable`;
  - `UNRESOLVED`, `EXPECTED` (special hydraulic class) and anything else → `unresolved`, with `applicability` recorded;
  - populated cells in fill mode → `populated`;
  - irregular objects → `object-not-editable`;
  - explicit targets outside the rule's scope → `out-of-scope`.
- **Missing** means `trim() === ''`, which is parser-equivalent and therefore the same as the Validator's `VALUE_MISSING`. Each entry reports `original`, `current`, `missing` and `changedBy`.
- **Counts**: `{total, applicable, notApplicable, unresolved, missing, populated, previouslyChanged, eligible, skipped, skippedByReason}`.
- **Binding**: the result is bound to the exact session state. `createGmiBatchCorrection` refuses `stale-eligibility`, `foreign-eligibility`, `invalid-eligibility` (copies), `eligibility-mode-mismatch` and `eligibility-field-mismatch`. The ChangeSet keeps the eligibility skip records and an eligibility summary, so the full outcome stays in history.

The synthetic test layer confirms the policy:
- SDR: PE under VL (missing or whitespace) is eligible; populated is skipped; SP/PVC and VL/BET are not applicable; missing material, invalid material, missing Tema and VLVAR are unresolved.
- Trykklasse: eligible under PRESSURE Tema regardless of material.

## 7. Integration with M1, proposed dataset and diff

`getGmiProposedState(session)` runs the following steps:
1. Compile the effective edits.
2. If there are none, return the **original document itself** (`identical: true`, `verification: null`). This is P1: identical bytes, with no decode or encode.
3. Otherwise make **one** `editGmiFields(originalDocument, edits)` call (plan → splice → independent verify), always against the immutable original.
4. The result's `document` is M1's `verification.outputDocument`, a reconciled and frozen source document of the verified bytes. Its `dataset` is that document's parser in app shape (stable identity, so its `datasetRevision` is stable).

On M1 failure, the result is `{ok:false, stage, rejections}` and has no bytes. Previously patched output is never patched again.

**Revalidation** uses the unchanged pathway: `runGmiValidationV2({layerId, dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate})`, memoized per dataset, layer and date. `revalidateGmiEditSession` returns the original and revised runs and their summary deltas. The test shows that the revised run is identical (summary and every outcome state) to a run on an independent reparse of the downloaded bytes (T14). The original and revised runs have different `datasetRevision`s.

**`diffGmiDatasets(original, proposed)`** compares the two produced datasets. It does not use the history, so cancelled, superseded and reverted changes cannot appear.
- **Changes**: for every attribute whose *source lexeme* differs, it reports `{scope, sourceIndex, objectId, guid, field, position, original, proposed, originalValue, proposedValue}`. Lexemes are authoritative, so `11.0` → `11` is a change even though the parsed values are equal.
- **Structural**: all other differences are listed here, namely header, warnings, object count, `id`/`type`/`guid`/`extent`, coordinates and column set. A field-only edit has none, and every M2 test asserts that.
- **Order**: deterministic.
- **Oracle check**: every M2 test's proposal is also checked by the independent **M0 reference verifier** (`verifyCellChanges`).

## 8. Caching and performance

- `createGmiProposedCache({maxEntriesPerDocument = 4})` is a small LRU per source document, keyed by the **effective edit signature** (`effectiveKey`), not by history. `defaultGmiProposedCache` is shared, and callers or tests can pass their own.
- **Invalidation is explicit**: `invalidate(document)`, `clear()`, plus LRU eviction. `stats()` reports `{hits, misses, computations, invalidations, integrityEvictions}`.
- **Guarantees on a hit**: the cached results are the frozen M1-verified output documents. On every hit, the integrity tokens of both the source and the cached output are re-checked. A mismatch evicts the entry and recomputes, and the recompute then fails closed in M1 (`source-bytes-mutated`; tested by mutating the private buffer behind a warm cache). Bytes are handed out only as copies.
- **Session-level memoization**: effective cells and compiled edits are memoized per session value (WeakMap). Eligibility applicability and validation runs are memoized per dataset.

Largest real file (1.7 MB, 5,331 points / 2,077 lines; 500-cell overwrite batch, because this file has no SDR column):

| Operation | Time |
|---|---|
| Document load (M1) | 0.78–0.93 s |
| Proposed state, no edits (identity path, builds the dataset once) | 0.10 s |
| Build batch ChangeSet (500 objects) / stage | 4.5 ms / 0.2 ms |
| **Proposed state, first (one verified M1 run)** | **1.33 s** |
| Proposed state, cached | **3.4 ms per call** (two integrity re-hashes of 1.7 MB) |
| After undo + redo (cache hit) | 4.0 ms |
| Summary + cell listing | 0.1 ms per pair |
| SDR eligibility (applicability for one rule) | 0.45–0.51 s, then memoized per dataset |
| `diffGmiDatasets` | 81 ms |
| Revalidation, original + proposed, first | 8.5 s (two full existing Validator runs), then memoized (3.5 ms) |

The cache stats for that run were 1,005 hits and 2 computations. The M1 verifier runs only on a new effective state.

Note for M4: hold the current proposed result per session value in view state rather than calling the getter on every render. The 3.4 ms integrity re-check is cheap, but it is not free. Full revalidation of the largest file costs about 4 s per dataset; this is the existing Validator's cost, and M2 adds nothing to it. It should stay an explicit user action, or be debounced.

## 9. Test results

| Run | Result |
|---|---|
| `node --test tests/gmiEditChangeSets.test.mjs` | 20 tests: **19 pass, 0 fail, 1 skipped** (corpus without env) |
| Same, with `GMI_EDIT_CORPUS` = REF_FILES; Downloads; `C:\temp\gmi-photo-test` | **1 pass.** 244 files, 175 unique, **174 editable** and 1 read-only (as in M1). In 29 files, 180 SDR cells were filled from eligibility; the others have no applicable-and-missing SDR. Every editable file also received an object correction (174). **174/174 exact diffs, 174/174 cache hits, 174/174 revalidated, 0 failures, 244/244 files unchanged.** Max first proposed 1.44 s, max cached 3.2 ms. Counts only. |
| GMI/FOTO/Validator subset (`gmi*`, `photo*`, `hyperlink*`, `validationV2*`) | 1236 tests: 1136 pass, **4 fail**, 96 skipped. 3 are the known `validationV2WorkspaceInspector` baseline. 1 was `photoEditCommit` "repeated GMI occurrences … committed independently", which passed 5/5 when rerun in isolation and passed in the full-suite run. It is an intermittent FOTO direction-timestamp assertion under parallel load, and imports no code changed here. |
| Full suite `node --test tests/*.test.mjs` | 1877 tests: **1773 pass, 7 fail, 97 skipped**. The 7 failures are exactly the known baseline: `appInfoUiContract` (1), `statsUiContract` (2), `terrainPhotoGml` optional real corpus (1), `validationV2WorkspaceInspector` (3). **No new regression.** |
| `npx eslint --max-warnings 0` on `src/lib/gmi-edit/`, `validationRunner.js`, both gmi-edit test files | Clean |
| `npm run build` | Success |

Coverage of the requested cases, by test in `tests/gmiEditChangeSets.test.mjs`:

| Case | Test |
|---|---|
| Single-object correction | single-object correction (byte-equal to a direct M1 application) |
| Fill-missing default / explicit overwrite | fill-missing is the default; SDR eligibility |
| Multi-object batch, irregular objects skipped | multi-object batch correction |
| Multiple edits to the same field → one M1 edit | multiple edits to the same cell |
| Default skip / explicit replace, reproducibility | conflicts |
| No-op values | an unchanged proposed value |
| Undo, redo, discard one, discard all | undo, redo, discard… |
| Revert to original | reverting a field |
| Stale, foreign, mismatched, guard-mismatched, absent-column, invalid-lexeme, read-only | stale, foreign and incompatible…; stale source bytes |
| `S_HYPERLINK` on every path; M1 capability kept | S_HYPERLINK is rejected… |
| Missing vs populated SDR; applicable, inapplicable, unresolved; reason counts; overwrite | SDR eligibility; pressure-class eligibility |
| Eligibility recomputed after staged edits; bound to state | eligibility is evaluated on the current proposed dataset |
| Exact diff; superseded and cancelled not reported; lexeme-exact; structural | diffGmiDatasets…; every test via `assertProposedExact` |
| No header, geometry, GUID or unrelated field change | `diff.structural === []` and the M0 oracle in every proposal |
| Revalidation and caching; explicit invalidation | T14; proposed results are memoized… |
| No source mutation | the original source document…; every M0 fixture test |

Acceptance criteria:
- **T6**: eligibility tests.
- **T7**: conflicts, undo, redo and discard. The module-cell overlap part is covered by column ownership; a composer-level disjointness assertion is M9.
- **T14 (field part)**: reparse, photo-source references unchanged, and the Validator equal to the independent run.
- **T17**: diff tests.

## 10. Remaining M3 prerequisites and notes

1. **Session registry (M3).** Keep one current session value per survey layer outside Zustand (`gmiEditSessions`). Zustand needs only a tick (`{layerId, stateKey, changeSetCount}`). Build the document with `loadGmiSourceDocument` (fingerprint) from `loadedGmiSources` bytes (`readBytes(ticket)`). Pass `layerId` to `createGmiEditSession` so validation runs carry the layer id.
2. **Cache lifecycle.** On layer removal or reset, call `defaultGmiProposedCache.invalidate(document)`. Entries are also held weakly by document. Use the default cache, or one cache per registry.
3. **Download (M3).** `getGmiProposedBytes(getGmiProposedState(session))` is the field-only `.gmi`. With no edits it returns the original bytes.
4. **Header/CRS.** Proposed datasets come from the document's own parser. They never contain the upload path's injected `COSYS_EPSG`. If M5 compares against `layer.data`, it should overlay `crsContext`. For a like-for-like comparison, use `getGmiDocumentDataset(document)` as the original.
5. **Discard and dependencies.** Discarding an earlier set, for example a Material correction, leaves later sets intact, for example an SDR fill that only became eligible because of it. `affected` reports conflict-based links only, not applicability dependencies. Revalidation exposes any consequence. M4 may want to warn when a discarded set precedes batch sets that used eligibility.
6. **`createdAt`.** M2 is deterministic and leaves `createdAt` to the caller (default `null`). M4 should pass a timestamp.
7. **Validator runtime.** About 4 s per full run on the largest file. Revalidation should be explicit or debounced (§8).
8. **Unchanged from M1.** Gemini VA acceptance of patched files is still unverified (gates G1/G2). Windows-1252-only characters and TAB are refused.

## 11. Recommendation

**M2 can be accepted.**
- ChangeSets stage, resolve (skip by default, replace on request), undo, redo and discard deterministically as immutable values.
- Every proposed copy is compiled into one edit list against the original source lexemes. It is applied once and verified by M1, memoized by effective state, and checked again in tests by the independent M0 oracle.
- Batch eligibility reuses Validator applicability on the proposed dataset, protects populated values unless overwrite is explicit, and never adds columns.
- `S_HYPERLINK` cannot be changed through any field-editing path.
- The diff reports exactly the effective cell changes.
- The real corpus (174 editable files) and the full regression suite show no new failure.
- No original file or source document was modified.

`git status`:
- modified: `src/lib/gmi-edit/index.mjs`, `src/lib/validation-v2/validationRunner.js`, `tests/gmiEditProduction.test.mjs`;
- new: `src/lib/gmi-edit/{changeSet,session,proposed,eligibility,diff}.mjs`, `tests/gmiEditChangeSets.test.mjs`, this report.
