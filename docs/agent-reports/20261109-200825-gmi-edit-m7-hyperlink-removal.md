# GMI editing M7: source-preserving hyperlink removal composer

Date: 2026-11-09. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, starting commit `e5096b2` (clean).
Scope: **Milestone M7 only**, a pure library. The sources are `docs/agent-reports/20261108-gmi-editing-combined-delivery-planning.md` (§§2.5, 4.1, 7.1–7.3, 9.2, 9.3, 10, Q3) and the M0/M1/M2 reports.

Not changed:
- Rettinger, Validator and FOTO UI;
- photo session and FOTO state (no `deliveryIntent`, which is M8);
- standalone FOTO export;
- the M1 engine, M2 session and ChangeSet code, `GMIParser`, `hyperlinkFilenames.mjs`, `gmiPhotoSource.mjs`;
- all fixtures and manifests;
- the M5B refinement and M5C implementations, which are still awaiting manual browser acceptance.

No commit, no push.

---

## 1. Files changed

| File | Status | Purpose |
|---|---|---|
| `src/lib/gmi-edit/hyperlinkRemoval.mjs` | new | Planner, composer/applier and independent reference verifier |
| `src/lib/gmi-edit/index.mjs` | changed | Exports the M7 API. Earlier exports are unchanged. |
| `tests/gmiEditHyperlinkRemoval.test.mjs` | new | 14 synthetic tests and 1 opt-in private-corpus test |
| `tests/helpers/gmiHyperlinkRemovalFixtures.mjs` | new | In-memory synthetic GMI builder, plus FOTO evidence helpers that mirror how the photo session stores a source |
| `tests/gmiEditProduction.test.mjs` | changed | Import-boundary test: lists `hyperlinkRemoval.mjs` and allows it exactly two outside imports, `../hyperlinkFilenames.mjs` and `../photos/gmiPhotoSource.mjs` |
| this report | new | |

**Reuse.** No new hyperlink parser was written. Grammar comes from `extractHyperlinkOccurrences`. Reference and object identity, image classification and the occurrence key format come from `createGmiPhotoSource` and the FOTO ledger. Cell resolution and identity guards come from M1's `resolveGmiCell`. Encoding comes from M1's `validateGmiFieldLexeme`. Splicing and verification come from M1's `editGmiFields`. M2 state comes from `compileGmiEffectiveEdits` and `getGmiProposedState`.

## 2. Public API

```js
import {
  planGmiHyperlinkRemoval, applyGmiHyperlinkRemoval, verifyGmiHyperlinkRemoval,
  isGmiHyperlinkRemovalPlan, gmiHyperlinkSelectionKey,
  GMI_HYPERLINK_FIELD, GMI_HYPERLINK_ORDINAL_POLICIES, GMI_HYPERLINK_REMOVAL_STATUS,
} from '@/lib/gmi-edit/index.mjs';

const plan = planGmiHyperlinkRemoval(originalDocument, {
  photoSource,                 // FOTO GMI source as stored in the photo session (id, fingerprint,
                               // objectsByKey, references, associationLedger, loadedBinding?)
  selections,                  // transfer occurrences: { sourceFingerprint, objectKey, assetId,
                               // referenceIds, key|occurrenceKey?, sourceId? } — an M8 occurrence fits
  ordinalPolicy: 'renumber',   // default; or 'preserve'
  session,                     // optional M2 edit session (same document)
  acceptedAssetIds,            // optional: every selected asset must be in it
  associationLedger,           // optional; defaults to photoSource.associationLedger
});
// plan.status: 'ready' | 'empty' | 'blocked'

const result = applyGmiHyperlinkRemoval(plan, {
  session,                                              // required if the plan was made with one
  authorization: { selectionKeys: [/* exactly plan.selections[].selectionKey */] },
});
// { ok: true, bytes, document, identical, planKey, counts, fieldEditCount,
//   verification: { field: <M1 summary>, hyperlink: <reference summary> } }
// or { ok: false, stage: 'authorize'|'compose'|'plan'|'apply'|'verify'|'verify-hyperlinks', rejections }
```

**Plan contents.** The plan is deep-frozen and registered in a private WeakMap, so copies are refused with `not-a-removal-plan`.

| Field | Content |
|---|---|
| `basis` | `documentFingerprint`, `documentSize`, `photoSourceId`, `photoSourceFingerprint`, and `session: {stateKey, effectiveKey, fieldEditCount} \| null` |
| `selections[]` | Normalized and sorted: `selectionKey` (= the FOTO `occurrence.key`), `sourceFingerprint`, `objectKey`, `assetId`, sorted `referenceIds` |
| `cells[]` | One entry per `S_HYPERLINK` cell, sorted point → line, then by source index. Each entry has:<br>• `key`, `scope`, `sourceIndex`, `objectId`, `guid`, `objectKey`, `start`/`end` (source byte span)<br>• `original` and `proposed` lexemes<br>• `removedReferences[]`: `referenceId`, `selectionKey`, `assetId`, `wrapperOrdinal`, `wrapperNumber`, `memberOrdinal`, `referenceRaw`, `rawWrapper`, `rawMember`, `filename`, `bare`<br>• `retainedReferences[]`<br>• `removedWrappers`, `retainedWrappers`<br>• `ordinalChanges[]` = `{wrapperOrdinal, from, to}` |
| `edits[]` | M1 edits `{target{scope, sourceIndex, field:'S_HYPERLINK', objectId, guid}, expected: original, lexeme: proposed}` |
| `counts` | `selections`, `cells`, `removedReferences`, `retainedReferencesInCells`, `removedWrappers`, `retainedWrappersInCells`, `clearedCells`, `ordinalChanges`, `blockers`, `warnings` |
| `warnings[]` | `photo-linked-elsewhere` (`assetId`, `retainedObjectKeys`), `gemini-g4-unverified` (always present when cells exist), `original-ordinals-not-contiguous`, `identical-wrapper-text-in-value` |
| `blockers[]` | `{code, selectionKey?, referenceId?, detail?}`, sorted |
| `planKey` | Deterministic identity of basis, selections, edits and status |

A **blocked plan has no cells and no edits**. A plan never holds bytes.

`verifyGmiHyperlinkRemoval(document, outputDocument, plan)` is exported so M9 and tests can re-prove any output on their own.

## 3. Reference identity and reconciliation rules

A selection is removable only if **every** check below passes. Any failure blocks the **whole plan**.

**Global checks**

| Check | Code |
|---|---|
| The document is editable and intact and has a fingerprint (`loadGmiSourceDocument`) | `document-not-editable`, `source-bytes-mutated`, `document-fingerprint-unavailable` |
| The FOTO source is a GMI source, its fingerprint equals the document fingerprint, and its binding is live (when `loadedBinding` exists) | `invalid-photo-source`, `photo-source-fingerprint-mismatch`, `photo-source-not-live` |
| The ledger has `associationsById` and `reverseIndexes.byReferenceId` | `invalid-association-ledger` |
| **Fresh evidence**: `createGmiPhotoSource(document.parser)` has the same reference and object counts as the supplied source | `photo-source-evidence-mismatch` |
| The session, when given, belongs to this document, compiles, and its M2 proposal verifies | `session-document-mismatch`, `session-not-compilable`, `session-proposal-failed` |

**Per selection (occurrence identity)**

| Check | Code |
|---|---|
| Well-formed, and not duplicated | `invalid-selection*`, `duplicate-selection`, `duplicate-selection-reference` |
| `selectionKey = JSON.stringify([sourceFingerprint, objectKey, assetId])` equals the supplied `key`/`occurrenceKey` | `occurrence-key-mismatch` |
| `sourceFingerprint` equals the document fingerprint, and `sourceId` equals the FOTO source id | `stale-source-fingerprint`, `photo-source-mismatch` |
| A **confident** ledger edge `[sourceId, objectKey, assetId]` exists | `association-not-confident` |
| The selected `referenceIds` **equal** the edge's `referenceIds`. This is the ledger's occurrence grouping, so partial or extra sets are refused. | `reference-set-mismatch` |
| The asset is in `acceptedAssetIds` (when that is given) | `asset-not-accepted` |
| The supplied object evidence (`geometryScope`, `sourceIndex`, `parserId`, `guid`, `hyperlinkRaw`) equals the fresh evidence | `object-not-found`, `object-evidence-mismatch` |

**Per reference**

| Check | Code |
|---|---|
| The ledger resolution is `confident`, for this asset and this object | `reference-not-confident`, `reference-asset-mismatch`, `reference-object-mismatch` |
| The supplied reference equals the fresh reference in `objectKey`, `key`, `referenceRaw`, `rawMember`, `rawWrapper`, `wrapperOrdinal`, `wrapperNumber`, `memberOrdinal`, `rawStart`/`rawEnd`, `wrapperStart`/`wrapperEnd`, `filename` and `targetValid`. Session `${source.id}:` id prefixes are mapped. | `reference-unknown`, `reference-evidence-mismatch` (detail = field) |
| A `link` member with a valid **image** target (`classifyPhotoFile` through the evidence factory) | `reference-not-link`, `reference-not-image`, `reference-directory-only`, `reference-target-invalid` |
| Not claimed by two selections | `reference-claimed-twice` |

**Per cell (current source state)**

| Check | Code |
|---|---|
| `resolveGmiCell(scope, sourceIndex, 'S_HYPERLINK', objectId, guid)` succeeds. This means the field is physically present, unique and editable, the object is regular, and the identity guards pass. | `hyperlink-cell-not-editable` (detail = M1 code) |
| The cell lexeme equals the FOTO `hyperlinkRaw` | `hyperlink-lexeme-mismatch` |
| With a session, the verified M2 proposal leaves this `S_HYPERLINK` lexeme unchanged | `hyperlink-changed-by-field-edits` |
| `extractHyperlinkOccurrences` is re-run on the cell lexeme: one source, valid grammar | `invalid-hyperlink-grammar` |
| The re-extracted link has the same wrapper and member ordinal, the same `rawWrapper`, `referenceRaw` and `rawMember`, and the same member and wrapper spans, and the slices of the lexeme equal the raw text | `reference-not-in-current-lexeme`, `raw-wrapper-mismatch`, `reference-raw-mismatch`, `reference-span-mismatch` |
| Exactly one `link` in the wrapper | `multi-link-wrapper` |
| A bare value is the only member and is one unambiguous path (§4) | `bare-value-not-single-path` |
| Every unselected link in the same value with the same target name is **confidently owned by a different asset** | `ambiguous-duplicate-reference` |
| Separators are whitespace only, and ordinals are digits | `unsupported-wrapper-separator`, `unsupported-wrapper-ordinal` |
| Lexeme self-check (below) | `removal-self-check-failed` |
| The new lexeme is encodable under the M1 policy for the file's encoding class | `retained-lexeme-not-encodable` (detail = M1 code) |

The lexeme self-check re-extracts the new lexeme. Retained members, including raw text and metadata, must be unchanged and in order. Wrapper text must be unchanged except for the planned digits.

**Filenames are never matched across the GMI.** A reference is addressed only by `(objectKey, wrapperOrdinal, memberOrdinal)` within its own cell. Filename equality is used only to *detect* ambiguous duplicate ownership inside one value, and only ever to refuse.

## 4. Grammar cases

**Supported:**

| Case | Result |
|---|---|
| Wrapper removed at the first, middle or last position, or as the only wrapper; 1–7 wrappers | Wrapper plus its following whitespace removed (identical to the M0 oracle `planWrapperRemoval`). All wrappers removed → `''`. |
| Retained wrappers with `sign` metadata | Byte-identical, except for permitted ordinal digits |
| No trailing space after the last wrapper | Removing the last wrapper leaves the preceding separator as the new tail. This is the documented rule "wrapper + following whitespace" and matches the oracle. |
| Leading space before the first wrapper | Preserved while any wrapper remains |
| Bare single path (`Attachments\x.jpg`, `x.jpg`) | Cleared to `''` |
| Mixed photo/PDF/SOS value | Only the selected photo wrappers are removed. PDF and SOS links are never candidates. |
| Same file twice in one value, both in one ledger edge | Both removed |
| Deeper relative paths, files without GUIDs (`point:<i>` object keys) | Supported |

**Blocked:**
- multi-link wrappers;
- invalid grammar;
- directory-only, PDF, SOS and other non-image targets;
- ambiguous or unmatched references;
- a bare value that looks like several paths (`a.jpg b.jpg`), contains `"`, `(`, `)`, `,` or `;`, or contains a second drive path;
- `,` or `;` wrapper separators (theoretical in GMI);
- a retained lexeme that M1 cannot encode. This covers a Windows-1252-only character such as 0x86 in a retained wrapper in a single-byte file, or any non-ASCII text retained in a UTF-8-likely file. M1's safeguard is not weakened. Removing the wrapper that *carries* such a byte is allowed.

## 5. Ordinal policy (Q3)

- **`renumber` (default):** retained wrappers are renumbered contiguously from 1, in source order. Only the digits between `h:` and `(` change, and only when the number differs. The `h:` prefix keeps its original case. Each change is listed in `ordinalChanges`.
- **`preserve`:** wrapper text is byte-identical, so gaps remain.

The policy is explicit in the plan, part of `planKey`, and enforced by the independent verifier:
- under `preserve`, any change to a wrapper's raw text fails;
- under `renumber`, the output wrappers must be numbered `1..n`, counted over every wrapper.

An invalid policy blocks the plan. If the original ordinals were not contiguous, the plan carries the `original-ordinals-not-contiguous` warning (never seen in the corpus).

**Gemini VA:** neither form has been accepted. Every non-empty plan carries the `gemini-g4-unverified` warning. A successful reparse by our parser is not a compatibility claim.

## 6. Composition with M2 field edits

The boundary I chose: **M7 plans against the immutable original, and only applies once, combined.**

1. **Plan.** `planGmiHyperlinkRemoval(session.document, {…, session})`:
   - records `basis.session = {stateKey, effectiveKey}`;
   - requires the verified M2 proposal (`getGmiProposedState`) to leave every targeted `S_HYPERLINK` lexeme unchanged.

   `expected` lexemes and spans always refer to the original. The FOTO fingerprint identifies exactly that document, so no stale offsets can arise from earlier patches.
2. **Apply.** `applyGmiHyperlinkRemoval(plan, {session, authorization})`:
   - recompiles the session's effective edits and refuses a different `effectiveKey` (`stale-session-state`);
   - asserts that M2 edits and removals are disjoint and that M2 has no `S_HYPERLINK` edit (`field-edit-overlaps-hyperlink`);
   - runs **one** `editGmiFields(original, [...m2Edits, ...removalEdits])`, i.e. one plan → splice → full M1 verification;
   - runs `verifyGmiHyperlinkRemoval`.
3. **Mismatched sessions are refused.** A plan made with a session refuses to apply without one (`session-required`). A plan made without a session refuses to apply with one (`session-not-in-plan-basis`).

The revised bytes therefore equal "original + M2 field edits + removals", verified as a single change set. The original and the M2 proposal are not modified. M7 does **not** stage a ChangeSet and does not change the Rettinger history. The M2 guard (`field-owned-by-photo-delivery`) is unchanged; a test re-asserts it.

## 7. How M9 should consume this (atomic contract)

1. Take a snapshot: the original document (with fingerprint), the current M2 session value, the FOTO source with its ledger, and the M8 transfer occurrences.
2. Call `planGmiHyperlinkRemoval`. If the plan is `blocked`, the combined delivery is blocked, and the blockers name each selection and code.
3. Plan the combined GML for **exactly** `plan.selections`. Use the plan's `removedReferences` (`assetId`, `filename`, `referenceRaw`) and the `photo-linked-elsewhere` warnings to decide which attachments are packaged. Assets that keep any link stay in `Attachments`.
4. Only when the GML plan succeeded for every selection, call `applyGmiHyperlinkRemoval(plan, {session, authorization: {selectionKeys}})`. The keys must match the plan exactly (`missing-authorization`, `authorization-mismatch`). A plan cannot remove a link without this attestation, and there is no partial-success path.
5. If anything changes in between, re-plan. M9's own snapshot liveness (T13) remains M9's responsibility. M7 detects a changed M2 state, a mutated source and any evidence drift.

No successful result exists unless every selected reference was removed and proven removed. No reference outside the selections can be removed: the verifier fails with `reference-removed-outside-plan` or `unaffected-hyperlink-changed`.

## 8. Verification layers

| Layer | What it proves |
|---|---|
| Planner self-check | Re-extraction of every new lexeme: retained members and metadata are unchanged; wrappers differ only in the planned digits |
| M1 `editGmiFields` (unchanged) | Byte containment, line and segment identity, reparse equality outside the targets, structure, EOL, BOM and encoding class, malformed lines |
| `verifyGmiHyperlinkRemoval` (independent of the planned lexemes) | `createGmiPhotoSource` is rebuilt for the original and the output. Object keys and identities are the same. Per object, the output references equal the original references minus exactly the selected reference ids, in order, with the same raw member, metadata, filename and target validity. Retained wrappers are unchanged apart from digits, and the ordinal policy holds. Unaffected `S_HYPERLINK` lexemes are identical. Removed and total counts match. |
| Tests: M0 reference verifier (`verifyCellChanges`) and a raw byte rebuild | Independent of all production code: the output equals the original with only the planned `S_HYPERLINK` spans replaced |

## 9. Tests and results

Synthetic tests in `tests/gmiEditHyperlinkRemoval.test.mjs`:

| # | Covers |
|---|---|
| 1 | First, middle, last and only wrapper; M0 oracle equality; `sign` preservation; both policies |
| 2 | Every confident wrapper position of every family in `hyperlink-families` (53 edges × 2 policies = 106 verified removals, compared exactly with the M0 oracle) |
| 3 | Renumber and preserve values exact; `ordinalChanges`; invalid policy |
| 4 | Bare relative and bare filename cleared; mixed bare text rejected |
| 5 | Multi-link rejection; photo/PDF/SOS mixed value keeps PDF and SOS; forged PDF, SOS, directory-only and invalid-grammar selections; ambiguous and unmatched |
| 6 | Stale fingerprint, occurrence key, foreign document, missing fingerprint, object identity (sourceIndex, GUID, parserId, hyperlinkRaw), raw wrapper, referenceRaw, ordinal, span, stale ledger grouping, not live, source id, accepted assets, duplicate selection |
| 7 | Shared photo, line + point: each direction, both, `photo-linked-elsewhere` |
| 8 | Duplicate references in one value (both removed); partial selection refused; contradictory ledger → `ambiguous-duplicate-reference` |
| 9 | M2 composition (point Merknad + line SDR + removal) in one verified output, M0-contained; stale, missing and unexpected session; M2 `S_HYPERLINK` guard intact |
| 10 | Empty selection: byte-identical; with M2 edits it equals the M2 proposal |
| 11 | CRLF, LF, no-GUID, quotes, cp1252, UTF-8 fixtures; Latin-1 byte preserved; LF twin equals CRLF modulo EOL; C1 and UTF-8 non-ASCII blocked when retained |
| 12 | Atomic rejection; exact authorization; deterministic `planKey`, cells and bytes across forward, reversed and shuffled input |
| 13 | Inputs are not mutated; reimport references = original minus removed |
| 14 | The independent verifier rejects a mismatched output, a policy mismatch and an unmodified original |

**Test runs:**

| Run | Result |
|---|---|
| `node --test tests/gmiEditHyperlinkRemoval.test.mjs` | 15 tests: **14 pass, 0 fail, 1 skipped** (corpus without env) |
| Same, with `GMI_EDIT_CORPUS` = REF_FILES; Downloads; `C:\temp\gmi-photo-test` | **1 pass.** 244 files, 175 unique, 174 editable. 43 have confident image references under synthetic one-asset-per-basename photos. 43/43 plans are ready (0 blocked) and verified by M1, the M7 verifier and the M0 reference verifier. 1,125 references were removed from 1,093 cells, 951 of them cleared, with 108 ordinal changes. 43 `photo-linked-elsewhere` warnings, 0 failures. All 244 corpus file hashes are unchanged, and every source document is intact. Counts only. |
| GMI/FOTO/hyperlink regression subset (`gmi*`, `photo*`, `hyperlink*`, `validationV2Gmi*`, `validationV2SyntheticGmiFixtures*`) | 1209 tests: **1107 pass, 0 fail**, 102 skipped (opt-in suites) |
| Full suite `node --test tests/*.test.mjs` | 1959 tests: **1849 pass, 7 fail**, 103 skipped. The 7 are exactly the known baseline: `appInfoUiContract` (1), `statsUiContract` (2), `terrainPhotoGml` optional real corpus (1), `validationV2WorkspaceInspector` (3). **No new regression.** |
| `npx eslint --max-warnings 0` on `src/lib/gmi-edit/`, the new test and helper, and `gmiEditProduction.test.mjs` | Clean |
| `npm run build` | Success |

**Mutation check** (temporary, reverted, and the restored file was byte-compared with a backup). I disabled 17 guards one at a time:
- stale fingerprint, edge required, reference-set equality;
- object evidence, reference evidence;
- multi-link, bare safety, duplicate ambiguity, encodability;
- renumbering, separator preservation;
- authorization, stale session;
- verifier count, verifier preserve-policy;
- selection sorting, atomic blocking.

Each mutation made at least one test fail. The first pass found one blind spot: the separator mutation survived because the all-positions test checked only self-consistency. That test now compares exactly with the M0 oracle, and the mutation is caught.

**Fixtures.** I added no committed fixture files, so the M0 manifest stays authoritative. The M0 `hyperlink-families` fixture already holds every observed grammar variant: all 12 `realGrammarFamilies` shapes, bare, PDF, SOS, directory-only, deeper paths, no trailing space, leading space, multi-link and invalid. The other cases are built in memory by `gmiHyperlinkRemovalFixtures.mjs`: duplicates, gaps, C1, UTF-8, LF/CRLF twins and mixed bare text.

## 10. Remaining limitations

1. **Gemini VA gate G4 is outstanding**, for both `renumber` and `preserve`. Run it before M9/M10 leave "eksperimentell". If Gemini rejects renumbering, switch the default; the flag already exists.
2. **UTF-8-likely files** with non-ASCII text in a *retained* wrapper, and single-byte files with Windows-1252-only bytes in a retained wrapper, cannot be planned. The cause is M1's encoding policy, which re-validates every replacement lexeme. A future, separately reviewed M1 extension could accept replacement bytes that are a proven byte subsequence of the original cell. I did not do that here.
3. **Line objects.** Removal works for any object with a confident ledger edge. However, `photoSession.planGmiAssociations` creates FOTO occurrences only for point objects with a position. Line-linked photos therefore have no M8 occurrence to select yet. That is M8's decision.
4. **Direct FOTO GMI sources** keep no bytes (planning §2.5, Q16). M7 needs a `GmiSourceDocument` with a fingerprint, which in practice means a survey-layer GMI.
5. **Legacy alias columns** (`S_HYPERLINK_punkt`) are not handled. Only the exact `S_HYPERLINK` column is targeted, and others give `hyperlink-cell-not-editable` (`field-absent`). None of these were observed.
6. **Performance.** Each apply runs M1 verification, about 1.3 s on the largest real file, plus two evidence rebuilds. M9 should apply once per delivery, not per selection.
7. **Corpus coverage** uses synthetic photos matched by basename, because no real photo sets are loaded. Real ledger behaviour (ambiguous copies, relative paths) is covered by the synthetic tests.

## 11. Recommendation and next milestone

**M7 can be accepted as a library.** Selected, confidently associated photograph references are removed only from the exact selected occurrences, and the result is verified at the byte, field, parser and reference levels. Every unselected link, other field and unrelated byte stays unchanged. Every unsafe or ambiguous case fails explicitly, with no partial output, and the original is never modified.

**Next:** M8 (FOTO `deliveryIntent` on occurrences). Its occurrence objects already carry the fields M7 accepts (`key`, `sourceFingerprint`, `objectKey`, `assetId`, `referenceIds`, `sourceId`). After that comes M9, which consumes the plan, authorize and apply contract in §7. Run Gemini G4 in parallel.

`git status`: modified `src/lib/gmi-edit/index.mjs` and `tests/gmiEditProduction.test.mjs`. New: `src/lib/gmi-edit/hyperlinkRemoval.mjs`, `tests/gmiEditHyperlinkRemoval.test.mjs`, `tests/helpers/gmiHyperlinkRemovalFixtures.mjs` and this report.
