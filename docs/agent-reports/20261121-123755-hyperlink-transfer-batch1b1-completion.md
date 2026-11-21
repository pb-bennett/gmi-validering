# Batch 1B.1 completion — pure hyperlink transfer planner and independent verifier

2026-11-21, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `7ee184d` (unchanged). Continues [Batch 1A.2](20261121-095806-lok-top-pairing-review-batch1a2-completion.md) under Batch 1B of the [roadmap](20261120-154700-final-functional-reconciliation-release-planning.md). No subagents, private-corpus inspection, staging, commits, pushes, deployments, branch or dependency changes.

## Outcome and boundary

A pure, deterministic planner now relocates exact photograph reference groups from one point object's `S_HYPERLINK` cell to an explicitly chosen point object's `S_HYPERLINK` cell in the same loaded GMI source. An independent verifier checks the proposed bytes against the original.

- **Not wired.** No UI, store, FOTO session, delivery state, Rettinger history or export calls it; a contract test scans `src/` to enforce this. `PHOTO_LINK_REVIEW_WRITABLE` stays `false`. The accepted Batch 1A.2 pairing UI is unchanged.
- **No mutation.** Planning returns a frozen plan. `buildGmiHyperlinkTransferProposal` returns *new* proposed bytes for inspection and verification only. The original document, M2 session, FOTO source/ledger and inputs are never modified, and nothing is staged, published or recorded.
- **M7 removal behaviour is unchanged.** The removal half calls the existing `planGmiHyperlinkRemoval` as is.
- **No delivery coupling.** The plan carries no delivery intent and never touches the position → GML default.

## 1. Existing write contracts: what is reused and what is new

| Contract | Evidence | Use in 1B.1 |
|---|---|---|
| Hyperlink grammar: `extractHyperlinkOccurrences` (`src/lib/hyperlinkFilenames.mjs`) | Whole-value validated; wrappers `h:N(key:"value" …)`; members carry raw text, spans, `wrapperOrdinal`/`wrapperNumber`/`memberOrdinal`, metadata | Reused (planner layout check, verifier re-extraction). No new parser. |
| FOTO evidence and ledger: `createGmiPhotoSource`, `reviewGmiPhotoSource` | Reference id `objectKey:S_HYPERLINK:sourceIndex:wrapperOrdinal:memberOrdinal`; confident edges group every reference of one object/asset | Reused. Transfers are keyed exactly like M7 selections. |
| M7 removal: `planGmiHyperlinkRemoval` (`hyperlinkRemoval.mjs`) | Confident edge, complete edge reference set, fresh-evidence agreement, one-link wrappers, whitespace separators, `renumber`/`preserve`, encodability; [M7 report](20261109-200825-gmi-edit-m7-hyperlink-removal.md) §3–§5 | **Reused unchanged** for the removal half. Its blockers are passed through with the prefix `removal:`. |
| M7 `applyGmiHyperlinkRemoval` / `verifyGmiHyperlinkRemoval` | Assumes references only disappear (total = before − removed; unaffected cells identical) | **Not reusable.** An addition violates its invariants by design. A new verifier was needed. |
| M1 cell resolution, encoding, splice and verify (`targets.mjs`, `encoding.mjs`, `patch.mjs`, `verify.mjs`) | Exact span per (scope, sourceIndex, field); identity guards; `expected` original lexeme; one edit per cell (`duplicate-target`); strict encoding policy; independent reparse/byte proofs | Reused. An empty cell is an editable zero-length span (`start === end`), so empty recipients need no structural change. Absent columns are still refused (`field-absent`). |
| M2 reserved-column guard (`changeSet.mjs`, `compileGmiEffectiveEdits`) | Ordinary edits can never target `S_HYPERLINK*` | Unchanged. Proposals compose the session's field edits plus the transfer's cell edits in **one** `editGmiFields` call, as M7 does. |
| Addition and composition onto an existing cell | None existed | **New:** `hyperlinkTransfer.mjs` (composition) and `hyperlinkTransferVerify.mjs` (verifier). |

A valid removal planner does not imply a valid addition planner, so the addition grammar below is a separate, explicit contract.

## 2. Discovered S_HYPERLINK grammar and rules

Evidence: the extractor; the M0 fixture `tests/fixtures/gmi-edit/hyperlink-families.gmi` (synthetic copies of all 12 observed delivered families plus edge shapes); the M7 report §4–§5 and its tests.

- **Observed delivered form:** `h:1(link:"Attachments\<file>" sign:"<name>") h:2(link:"…") ` — one `link:` per wrapper, optional `sign:` metadata after it, a single space between wrappers and a trailing space. One family has no trailing space and one has a leading space. Ordinals are contiguous 1..n in every observed family.
- **Readable but not writable:** bare paths, multi-link wrappers, `,`/`;` separators, malformed wrappers, sign-only wrappers, non-image targets. M7 and the review model already block most of these; the transfer contract blocks all of them for both source and recipient.
- **Ordinals:** M7 `renumber` (the Gemini-tested default, `gemini-va-tested-import`) rewrites only the digits of retained wrappers in affected source cells. `preserve` is not supported for transfers (`ordinal-policy-unsupported`).
- **Encoding:** a lexeme is decoded byte-for-character. A Latin-1/ASCII file accepts U+0020–U+007E and U+00A0–U+00FF. A UTF-8 file accepts **ASCII only**, so any cell holding non-ASCII text (for example `sign:"Feltmåler"`) cannot be rewritten and blocks (`removal:retained-lexeme-not-encodable` or `transfer-lexeme-not-encodable`). This is the same limitation M7 has.

### Addition contract implemented

1. **Recipient cell** must be exactly `''` or whole wrappers: one link each, whitespace-only separators/leading/trailing, and original ordinals exactly 1..n. Anything else blocks with `recipient-hyperlink-shape` (detail `bare-value`, `invalid-grammar`, `multi-link-wrapper`, `wrapper-without-link`, `unsupported-separator`, `whitespace-only`) or `recipient-ordinals-not-contiguous`. Unrelated recipient digits are never renumbered.
2. **Incoming wrapper text** is the source wrapper's raw text verbatim (path, `sign:` and any other metadata, inner spacing, `h` case). Only the `h:N` digits are set to the new position. Paths are not rewritten: both objects are in the same GMI, so the attachment base is the same.
3. **Order:** incoming wrappers go after the last retained wrapper, ordered by source object (scope, source index), then by source wrapper/member ordinal. This is deterministic and independent of decision order.
4. **Separators:** each appended wrapper is preceded by one space. The recipient's original leading and trailing whitespace are kept. An originally empty recipient takes the trailing whitespace of the first incoming reference's source cell (the file's own convention). A cell emptied by M7 and then refilled (a cycle) keeps its own original trailing whitespace.
5. **Chains/cycles:** a cell that both loses and gains references starts from M7's proposed lexeme for that cell. That lexeme is computed from the original document; previously patched output is never re-patched. Each cell gets exactly **one** edit `{ expected: original, lexeme: composed }`.
6. **Repeated references** in one confident group move together (M7 eligibility). A partial group blocks (`removal:reference-set-mismatch`). Both copies arrive on the recipient (`repeated-references-carried` warning); nothing is deduplicated.

## 3. Planner interface

`planGmiHyperlinkTransfer(document, request)` → frozen plan.

**Input**

```js
{
  photoSource,          // FOTO GMI source as stored by the session: id, fingerprint, objectsByKey,
                        // references (id-prefixed), associationLedger, loadedBinding { live: true }
  transfers: [{         // one per «Flytt til punktobjekt» decision; never chosen automatically
    decisionKey?,       // review decision key, carried through
    sourceFingerprint, sourceId?, sourceObjectKey, assetId,
    referenceIds,       // the complete confident group (M7 rule)
    recipient: { objectKey, scope: 'point', sourceIndex, parserId, guid },   // all required guards
  }],
  photoState: { byAssetId: { [assetId]: {
    deliveryStatuses: string[],          // every occurrence must be 'keep-link'
    acceptedAlternativePosition: false,  // must be explicitly false
    occurrenceObjectKeys: string[],      // FOTO placements; recipient must not be among them
  } } },
  session?,             // M2 session; the plan records its effectiveKey
  expectedBasis?: { documentFingerprint?, photoSourceFingerprint?, sessionEffectiveKey? },
  ordinalPolicy?: 'renumber',
}
```

**Output** (`kind: 'gmi-hyperlink-transfer-plan'`)

- `status`: `ready`, `empty` or `blocked`. A blocked plan has no `cells`, `edits` or `transfers`.
- `basis`: `documentFingerprint`, `documentSize`, `photoSourceId`, `photoSourceFingerprint`, `liveBinding`, and `session` (`stateKey`, `effectiveKey`, `fieldEditCount`).
- `decisions`: a sorted copy of the input decisions. This is the verifier contract.
- `transfers[]`: `transferKey`, `decisionKey`, `assetId`, `fromObjectKey`, `toObjectKey`, `referenceIds`, and `outputReferenceIds` (predicted ids of the moved references in the proposed source).
- `cells[]`: `scope`, `sourceIndex`, `objectId`, `guid`, `objectKey`, `start`/`end`, `original`, `proposed`, `removedReferences[]`, `addedReferences[]` (`referenceId`, `outputReferenceId`, `transferKey`, `assetId`, `fromObjectKey`, `referenceRaw`, `filename`, `rawWrapper`, `proposedWrapper`, `wrapperNumber`) and `ordinalChanges[]` (from M7).
- `edits[]`: M1 edits, one per cell.
- `counts`: `transfers`, `cells`, `sourceCells`, `recipientCells`, `chainCells`, `movedReferences`, `blockers`, `warnings`.
- `warnings[]`: M7 warnings with `origin: 'removal'`, plus `recipient-existing-links-retained` and `repeated-references-carried`.
- `blockers[]`: sorted codes with `transferKey`/`objectKey`/`detail`.
- `planKey`: deterministic.

`buildGmiHyperlinkTransferProposal(plan, { session, authorization: { transferKeys } })`:

- Requires a registered (unforged), non-blocked plan with exact authorization, intact source bytes and, when the plan has a session basis, the same session effective state.
- Composes the field edits and the hyperlink edits in one M1 `editGmiFields` call (plan → splice → M1 verify), then runs the independent transfer verifier.
- Returns `{ ok, bytes, document, identical, planKey, fieldEditCount, verification }`, or `{ ok: false, stage, rejections }` with no bytes.
- An empty plan returns the original bytes unchanged.

## 4. Independent verifier

`verifyGmiHyperlinkTransfer(originalDocument, outputBytes, { photoSourceId, transfers, fieldEdits, documentFingerprint? })` lives in its own module.

**Independence:**

- It imports neither the planner nor M7.
- It never reads proposed lexemes.
- It works only from the original document, the output bytes and the caller's decisions.
- The only code it shares with the planner is production infrastructure: the parser (via a fresh source document), the extractor, the FOTO evidence factory and `resolveGmiCell`. Each is run separately on the original and on the output.

**Checks:**

1. **Structure.** The output is a reconciled, editable GMI. The header, field names, object keys, scopes, source indexes, parser ids, GUIDs, raw geometry and extents are unchanged.
2. **Contract.** Each reference exists on the named source in the original, is a wrapped `link:` and is claimed once. Recipients exist, are other point objects and match the identity guards. The basis fingerprint matches.
3. **References.** For each object, the output references equal the original references minus those moved out (in order) plus, on recipients, those moved in, in the contracted order. Raw member text, metadata, filename, target validity and the digit-free wrapper text must all match. Moved and total counts are conserved.
4. **Cells.** Changed cells contain only whole wrappers and whitespace, with ordinals 1..n. Every other `S_HYPERLINK` cell is identical.
5. **Fields.** Every other lexeme equals the original or the authorized field edit.
6. **Bytes.** Outside the authorized cell spans, the original and output bytes are identical and in order (CRLF/LF, encoding, unknown sections, geometry).

**Negative tests** confirm rejection of:

- dropped metadata, a wrong recipient, a lost reference, a duplicated reference, an unselected reference moved, an altered existing recipient reference, the wrong append order, non-contiguous ordinals, stray separators;
- an unrelated hyperlink or field changed;
- a coordinate, header, GUID or end-of-line byte changed;
- unchanged output for a move;
- a basis mismatch, a recipient-guard mismatch, a planner/verifier recipient disagreement, a double claim, and the wrong source-id prefix.

These are simulated planner defects: the edits go through the M1 engine and then into the verifier.

## 5. Supported and blocked scenarios

**Supported (verified):**

- LOK Punkt 293 → SLU Punkt 108;
- an empty recipient;
- a recipient with several links and metadata (leading/extra whitespace preserved);
- several photographs to one recipient from one or several sources;
- independent pairs;
- chains A→B→C, cycles and swaps;
- repeated references in one group;
- composition with staged M2 field edits;
- LF and CRLF files with Latin-1 metadata;
- no-op byte identity.

**Blocked (conservative Batch 1B.1 boundaries):**

| Situation | Code |
|---|---|
| Existing GML/Ikke decision on any occurrence of the photo | `delivery-conflict` |
| Accepted alternative position | `accepted-position` |
| FOTO facts not supplied | `photo-state-missing` |
| Photo already linked on the recipient (confident edge, original basis) | `recipient-already-links-photo` |
| Recipient already has a FOTO placement for the photo | `recipient-has-photo-placement` |
| Same filename, different/unresolved reference on the recipient | `recipient-filename-collision` |
| Same photo to one recipient twice | `duplicate-recipient-photo` |
| Missing, ambiguous or unsafe match | `removal:association-not-confident`, `removal:reference-not-confident`, `transfer-asset-missing` |
| Partial repeated group | `removal:reference-set-mismatch` |
| Unsupported source/recipient grammar | `source-hyperlink-shape`, `source-reference-bare`, `recipient-hyperlink-shape`, `recipient-ordinals-not-contiguous` |
| Alias hyperlink columns | `source-hyperlink-alias-columns`, `recipient-hyperlink-alias-columns` |
| FOTO-only / not live-bound source | `photo-source-not-live-bound` |
| Stale document, FOTO source or session | `stale-basis`, `removal:stale-source-fingerprint`, `stale-session-state` (proposal) |
| Recipient missing, self, not a point, guard mismatch, missing/duplicate GUID, invalid geometry | `recipient-missing`, `recipient-is-source`, `recipient-not-point`, `recipient-identity-mismatch`, `recipient-identity`, `recipient-geometry-invalid`, `recipient-identity-incomplete` |
| Non-encodable result (non-ASCII in UTF-8 files) | `transfer-lexeme-not-encodable`, `removal:retained-lexeme-not-encodable` |
| `preserve` ordinals | `ordinal-policy-unsupported` |

A recipient whose own links also change is **supported** when every decision is otherwise eligible: the cell gets one composed edit.

## 6. Verification

| Check | Result |
|---|---|
| Focused `node --test tests/gmiEditHyperlinkTransfer.test.mjs` | **21 passed, 0 failed, 0 skipped** |
| Neighbouring suites (M7 removal, all `gmiEdit*`, `photoHyperlinkReview`, `hyperlinkFilenames`, `deliveryPlan`), serial | First run: 269 passed, **1 failed**, 10 skipped. The failure was the gmi-edit import-inventory contract (`gmiEditProduction.test.mjs`), which lists every module. After the two modules were registered with M7's import allowance: 12/12 passed in that file. |
| Full serial Node `node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"` | **2,349 passed, 0 failed, 156 skipped** (2,505; 147.6 s) |
| Fresh isolated production build (`%TEMP%/gmi-1b1-build`, `src/` identical by `diff -rq`, `npm run build -- --webpack`) | Passed |
| Focused production browser, port 3180 (task-owned, stopped afterwards): `photoHyperlinkReviewUi.test.mjs`, `gmiEditWorkspaceUi.test.mjs` | **15 passed, 0 failed, 0 skipped** |
| Complete production browser suite | **Not run.** The app change is barrel exports of unreferenced pure modules: no UI, layout or runtime path changed, and the build plus the two nearest workflows cover bundling. |
| ESLint on the 5 affected JS/MJS files | Exit 0 |
| `git diff --check` | Exit 0 (LF/CRLF notices only, on pre-existing status-only paths) |

The seeded randomized test (30 rounds, chains and cycles included) requires every ready plan to pass the proposal verifier and the independent M0 byte oracle, and to conserve references.

Synthetic tests do not replace real-file or recipient (Gemini) acceptance.

Logs (local, synthetic only): `%TEMP%/gmi-1b1-node-full.log`, `%TEMP%/gmi-1b1-ui.log`, `%TEMP%/gmi-1b1-build/build.log`.

## 7. Decisions requiring user approval

1. **Append position and separators.** Incoming references go after existing ones, each preceded by one space; an empty recipient adopts the source cell's trailing whitespace. The alternative is to insert in some other order (for example by capture time).
2. **Gemini acceptance of added wrappers.** Real Gemini import evidence exists for M7 removal with `renumber`, not for appended wrappers or renumbered chain cells. This needs recipient gate A5 / a G4-style import trial before any writable release.
3. **Repeated references carried, not merged.** Two references to the same photo on one source both arrive on the recipient. The alternative, deduplicating to one, is a normalization and needs explicit approval.
4. **Recipient already linking the photo blocks**, even when that recipient's own copy is moving away in the same plan (evaluated on the original basis). An explicit «bare fjern fra kilden» (source-only removal) outcome would be a separate, later decision.
5. **Non-contiguous recipient ordinals block** rather than renumbering unrelated recipient wrappers. Never observed in the corpus.
6. **UTF-8 sources with non-ASCII hyperlink text cannot be transferred** (same as M7). Widening this needs an M1 encoding-policy decision.
7. **FOTO-state boundaries** (`delivery-conflict`, `accepted-position`, `recipient-has-photo-placement`, `photo-source-not-live-bound`) are initial conservative rules, not permanent product policy. A move combined with an existing GML/Ikke decision needs a decision: reset, carry over or refuse.

## 8. Required integration interfaces for Batch 1B.2 (not implemented)

1. **Input adapter (review → planner).** For each resolved `move` decision from `photoLinkReviewDecisions`:
   - `decisionKey` = `decision.key`, `sourceObjectKey` = `decision.row.objectKey`, `assetId` = `decision.group.assetId`, `referenceIds` = `decision.referenceIds`;
   - `recipient` = `{ objectKey, geometryScope, sourceIndex, parserId, guid }` of `decision.target`;
   - `sourceFingerprint`/`sourceId` from the live FOTO source.

   A test demonstrates the mapping. `photoState` must come from the single existing owners: delivery planning (`model.delivery.byPhotoId` statuses for every occurrence of the asset), accepted spatial state and FOTO occurrences. No second delivery owner may be created.
2. **One transaction.** In a single wizard-contract commit: plan → proposal (with the current M2 session) → validation → apply. Apply means:
   - a hyperlink ChangeSet kind registered in the existing Rettinger history;
   - the FOTO occurrence ownership move (source → recipient object key) with placement at the recipient position and provenance «intentional transfer»;
   - delivery left at «Beholdes i GMI».

   All parts get one coupled undo/redo entry, roll back on failure and publish once. The M2 guard must stay closed for ordinary edits; the transfer owns the hyperlink cells, as M7 does at delivery.
3. **Stale gates.** Re-plan at save with `expectedBasis` (document fingerprint, FOTO source fingerprint, session `effectiveKey`), and refuse any difference.
4. **FOTO re-derivation.** After save, re-derive the FOTO evidence/ledger from the proposed source (`createGmiPhotoSource` + `reviewGmiPhotoSource`). `transfers[].outputReferenceIds` predicts the moved ids for consistency checks. Retained ids in renumbered source cells change, as with M7.
5. **Validator.** «Kontroller i Validator» revalidates the Foreslått dataset. S_HYPERLINK findings are recomputed, never marked resolved by the save.
6. **Exports.** Compose transfers, field edits and M7 delivery removals once against the original (the existing `field-edit-overlaps-hyperlink` / one-edit-per-cell rules mean M7 delivery removal must take the post-transfer state as its basis through a single combined planner, not a second patch). Invalidate stale exports. Cover revision reimport and recipient gate A5.

## 9. Remaining work outside this batch

- Export composition with M7 delivery removals and attachments; revision reimport; recipient (Gemini) acceptance of added wrappers.
- FOTO ownership/position/provenance changes, coupled undo/redo, discard and rollback.
- Validator recomputation on the proposed dataset and the UI save step (`PHOTO_LINK_REVIEW_WRITABLE`).
- Real-data trial of the composed output on an authorized file; synthetic tests do not close it.

## 10. File inventory

- New: `src/lib/gmi-edit/hyperlinkTransfer.mjs` (planner, cell layout, proposal builder).
- New: `src/lib/gmi-edit/hyperlinkTransferVerify.mjs` (independent verifier).
- Modified: `src/lib/gmi-edit/index.mjs` (barrel exports only).
- New: `tests/gmiEditHyperlinkTransfer.test.mjs` (21 synthetic tests).
- Modified: `tests/gmiEditProduction.test.mjs`. The import-inventory contract registers the two modules with exactly M7's two allowed external imports, so the contract is as strict as before.
- Reports: this report; working record `20261121-hyperlink-transfer-batch1b1-progress.md`.

## Git and process state

- Branch `feature/photo-workspace`, HEAD `7ee184d` unchanged; the staged diff is empty. Nothing was staged, committed, pushed, deployed, reset, restored, stashed or cleaned.
- Task changes: 3 new untracked source/test files; 2 modified files (`index.mjs` +13, `gmiEditProduction.test.mjs` +6/−1); 2 reports.
- The five pre-existing status-only paths (`tests/gmiBatchInspectorUi`, `gmiCheckboxSoftFocusUi`, `gmiFieldValueInputUi`, `gmiFieldValueSearchUi`, `gmiTableReviewUi`) were not touched and still have no content diff.
- The task-owned server on port 3180 was started and stopped; the port has no listener. No other process was touched. The isolated build copy `%TEMP%/gmi-1b1-build` remains as a local aid.
