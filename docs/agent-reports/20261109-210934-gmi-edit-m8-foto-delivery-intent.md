# GMI editing M8: FOTO delivery intent

Date: 2026-11-09. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, starting commit `1037634` (clean).

Scope: **Milestone M8 only**. Sources are the planning report (`20261108-gmi-editing-combined-delivery-planning.md`: §7, Q4, Q12, Q15, Q16) and the M7 report (`20261109-200825-gmi-edit-m7-hyperlink-removal.md`).

Not changed by M8:
- no combined delivery planning or ZIP (M9), wizard (M10) or column insertion (M6);
- no hyperlink removal, and no call to M7 from the UI;
- no change to standalone FOTO export, positioning, the Gemini GML profiles, the Rettinger editor or the Validator;
- M7 itself.

No commit, no push.

---

## 1. Files changed

| File | Status | Purpose |
|---|---|---|
| `src/lib/photos/photoDeliveryIntent.mjs` | new | Pure model: intents, statuses, labels and reason texts; association check; per-occurrence entry; summary; the M9 snapshot |
| `src/lib/photos/photoSession.mjs` | changed | Decision map, cleanup in `release`, two explicit actions, three read-only selectors |
| `src/lib/photos/photoWorkspaceState.mjs` | changed | Mode `delivery` with its own `deliveryIds` selection (same convention as Remove mode); filter key `delivery` |
| `src/lib/photos/photoWorkspaceView.mjs` | changed | Delivery filter, filter summary and per-status counts (optional `delivery` input; without it the behaviour is unchanged) |
| `src/components/photos/PhotoDeliveryControls.js` | new | Inspector section «Samlet levering» |
| `src/components/photos/PhotoWorkspaceInspector.js` | changed | Embeds that section after «Opptak» |
| `src/components/photos/PhotoWorkspaceCollection.js` | changed | Row indicator, summary line, filter group, delivery-mode bar, checkboxes and bulk actions |
| `src/components/photos/PhotoWorkspaceToolsMenu.js` | changed | Tool «Velg samlet levering» (group *Eksport*; changes mode only) |
| `src/components/photos/photoWorkspace.css` | changed | Delivery styles: accent `#007595` / `--gmi-interactive`, warning tokens for review |
| `src/app/page.js` | changed | Reads `getLayerDelivery` on each publish; passes it to the view, list and inspector; tool and Escape handling for the new mode |
| `tests/photoDeliveryIntent.test.mjs` | new | 11 session, model, M7, export-parity and Rettinger-parity tests |
| `tests/photoDeliveryIntentUi.test.mjs` | new | Production-browser test (opt-in `PHOTO_UI_URL`, screenshots with `PHOTO_SCREENSHOT_DIR`) |
| `tests/photoWorkspace.test.mjs` | changed | Pinned filter literal gains `delivery: 'all'` |
| `tests/photoInspectorPresentation.test.mjs` | changed | Tools list gains the new tool; the read-only contract is narrowed (§6.4) |
| `tests/photoWorkspaceEditUi.test.mjs` | changed | Browser contract: same tools list; inspector inputs allowed only inside «Samlet levering», and only radio/checkbox; section list includes it |
| `tests/helpers/photoSourceWorkflow.mjs` | changed | Registers the new tool label for the shared click helper |

## 2. State model and actions

**Stored state.** Only explicit decisions are stored, one per occurrence (photo-session record id), in a private `deliveryDecisions` map **outside the records**:

```js
{ kind: 'gmi', occurrenceKey, intent: 'transfer' }   // GMI-linked occurrence
{ kind: 'unlinked', include: true }                   // occurrence without a GMI link
```

**Defaults.** No entry means the default:
- **`keep-link`** for a GMI-linked occurrence;
- **not included** for an unlinked one.

Choosing a default value again deletes the entry. The two kinds are separate types and are never converted into each other.

**Why a separate map?**
- Positions, directions and metadata are written through `updateRecord`, `updateAsset`, `applyPhotoEdits`, `acceptCandidates`, `setCaptureMetadata` and so on. None of these can reach the map. Only the two delivery actions write to it.
- Records, `publicPhoto` and the export snapshot are unchanged.
- Decisions are released together with their records (`release()`), so the following clear them: removing an occurrence, deleting the layer, `clear()`.

**Actions**

| Action | Contract |
|---|---|
| `setDeliveryIntent(layerId, photoIds, 'keep-link' \| 'transfer')` | Validates **every** id before any write. `transfer` requires a confident association (§3). Returns `{ok, changedIds, unchangedIds}`. Repeating the current value is a silent no-op (no publish). |
| `setCombinedDeliveryInclusion(layerId, photoIds, boolean)` | Same validation and no-op behaviour. Refuses GMI-linked occurrences, and refuses `true` for photos linked from a GMI object without an occurrence (§4). |

**Rejection codes.** Atomic: nothing changes and nothing is published.
- `invalid-intent`, `invalid-inclusion`, `layer-not-found`;
- `invalid-selection` (empty list or duplicate ids), `stale-occurrence`;
- `not-gmi-linked`, `gmi-linked-occurrence`, `association-unavailable`, `linked-without-occurrence`.

The result carries `invalidIds`.

**Selectors** (read-only)
- `getLayerDelivery(layerId)` → `{ byPhotoId: {photoId: entry}, summary }`;
- `getPhotoDeliverySnapshot(layerId)` → the M9 snapshot (§7);
- `isPhotoDeliverySnapshotCurrent(snapshot)` → recomputes and compares `stateKey`.

**Derived entry** per occurrence: `{photoId, assetId, linked, status, reason, intent, include, explicit, canTransfer, canInclude, linkedWithoutOccurrence, ambiguousGmiReference, association: {state, sourceId, sourceFingerprint, objectKey, occurrenceKey, objectLabel, geometryScope}}`.

**Status** (used by the filter and indicators): `keep-link` | `transfer` | `include` | `not-selected` | `review`.

## 3. Occurrence identity and reconciliation

The identity is the existing FOTO occurrence key, `JSON.stringify([sourceFingerprint, objectKey, assetId])`. It is the same as M7's `gmiHyperlinkSelectionKey`, and a test asserts that. A transfer decision stores this key.

**Confident association.** `photoOccurrenceAssociation(layer, record)` requires all of the following. It uses ids, fingerprints and ledger edges only, never filenames.
- The occurrence's `sourceId` is still a GMI source of the layer.
- The source fingerprint equals the occurrence fingerprint, and the key re-derives from fingerprint, objectKey and assetId.
- The source is live (`loadedBinding.live !== false`).
- The ledger edge `[source.id, objectKey, assetId]` exists, its `referenceIds` equal the occurrence's, and every one of those references is `confident` for that asset.

**When it fails**

| Situation | Result |
|---|---|
| Position or direction changed, metadata adopted or filled, source re-checked with the same ledger | Decision unchanged (tested) |
| Occurrence removed | Decision deleted with the record. The GMI link appears in the snapshot as `linksWithoutOccurrence` with reason `placement-removed`. |
| GMI source removed from the layer | Transfer → `review` / `source-missing`. The occurrence evidence (object, GUID, source filename) is kept for the explanation. |
| Loaded survey layer gone (`reconcileLoadedGmiBindings`) | Transfer → `review` / `source-not-live` |
| Ledger edge lost, or its references changed | Transfer → `review` / `association-lost` / `association-changed` |
| Unlinked inclusion on an occurrence that has since become GMI-linked (FOTO reuses the unlinked record) | `review` / `decision-type-changed` |
| A default `keep-link` whose association becomes unavailable | Stays `keep-link`. Nothing is ever removed for it, and `association.state` explains. |

**Review is never resolved silently.** A transfer is never reinterpreted as an unlinked inclusion, and the reverse never happens either. Choosing «Behold lenke i GMI» (or un-ticking an inclusion) clears a review. `transfer` cannot be re-chosen while the association is unavailable.

## 4. Shared assets, line links and ambiguous references

- **Shared photo.** One photo referenced by Kum 1 and Kum 2 has two occurrences, each with its own decision. Kum 1 → transfer and Kum 2 → keep is tested at session level and in the browser.
  - Bulk actions take explicit occurrence ids only. Selecting one occurrence never changes its siblings.
  - The snapshot lists the asset under `assets.transferredAndRetained`, so M9 keeps it in `Attachments`.
  - Counts are given per occurrence *and* per distinct asset.
- **Line-linked photos (known limitation, documented, not hidden).** `planGmiAssociations` creates occurrences only for point objects with a position, so a photo linked from a line has a confident edge but no occurrence. Its record looks unlinked. M8 does **not** manufacture an occurrence. Instead:
  - such a record has status `keep-link` with reason `linked-without-occurrence`;
  - it cannot be transferred, and cannot be "included without a GMI link" (that would be the "both" state that Q12 excludes from v1);
  - an inclusion made before the link appeared becomes `review`.

  The snapshot lists every such edge in `linksWithoutOccurrence` (reasons `line-object` / `placement-removed` / `no-occurrence`). For M9, these links always stay in the GMI.
- **Ambiguous references** (two imported files with the same name) never create an occurrence. The photo stays unlinked and may be included. The entry is flagged `ambiguousGmiReference`, the inspector warns, and the snapshot raises the readiness issue `included-photo-ambiguously-referenced` for M9 to decide.

## 5. Readiness, intent and export are kept apart

- **Intent stays visible regardless of readiness.** The decision is shown as made. A transfer or inclusion that lacks an accepted placement, a direction (for placed photos) or a capture time shows «Mangler foreløpig …. Dette kontrolleres når samlet levering lages; valget ditt beholdes.» The choice is never switched back.
- **Wording never claims a transfer has happened.** Texts say «tenkt levert», «fjernes først når en samlet leveranse lages senere», «GMI-filen er ikke endret» and «Ingen filer er endret». No text says a photo has been transferred.
- **Standalone export is untouched.** It ignores the new state (Q4). An open export snapshot stays live after delivery changes, and the GML it serializes is byte-identical before and after decisions (test).

## 6. UI

### 6.1 Inspector, section «Samlet levering» («gjelder denne plasseringen»)

Placed after «Opptak» and before «Koblinger».
- **GMI-linked:** radio choice **Behold lenke i GMI** / **Overfør til GML**, plus a one-line explanation of the current choice that names the GMI object.
  - «Overfør til GML» is disabled, with a reason, when the association is not confident.
  - In `review`, a warning shows the reason and how to resolve it.
- **Unlinked:** checkbox **Ta med i samlet levering**, with an explanation. An ambiguous reference adds a warning.
- **Line-linked without an occurrence:** an explanatory note only, with no control.
- **Shared photo:** «Andre plasseringer av samme bilde» lists every other occurrence with its object and its own status. Each object name is a link to that occurrence. This complements the existing occurrence switcher at the top and does not replace it.

### 6.2 List (Bildemodul)

- **Row indicator.** Rows show a pill only for explicit or attention states: «Til GML», «Tas med», «Gjennomgå» (warning colours). The defaults stay quiet. The row's accessible name includes the status.
- **Summary line** under the counts, shown only when there is something to say. Example: «Samlet levering: 2 overføres til GML (1 bilde) · 1 tas med uten GMI-lenke · 1 krever gjennomgang». The asset count is added only when it differs from the occurrence count.
- **Filter group «Samlet levering»** in the existing filter panel: Alle, Beholdes i GMI, Overføres til GML, Tas med uten GMI-lenke, Ikke valgt, Krever gjennomgang, each with a count. Options with a count of 0 are disabled, as in the placement group. The active filter appears in the filter summary chip, and «Nullstill» resets it.

### 6.3 Bulk actions

**Entry and exit.** The Verktøy tool «Velg samlet levering» opens a selection mode that mirrors Remove mode: checkboxes, «Velg alle viste», «Ferdig», Escape. Leaving the mode or running another tool clears its selection. The bar says: «Valgene brukes når en samlet leveranse lages senere. GMI-filen og bildene endres ikke nå.»

**The action area** shows «Valgt: N plasseringer · X med GMI-lenke, Y uten» and offers **only actions that would change something**:
- Overfør N til GML;
- Behold lenker for N;
- Ta med N uten GMI-lenke;
- Ikke ta med N.

**Counts are exact.** Each N is the exact number of occurrences that will change: of the right kind, eligible, and not already in that state.

**Mixed selections** show: «Hver handling gjelder bare plasseringer av riktig type. De andre i utvalget endres ikke.» Occurrences without a confident link, and line-linked occurrences, are counted and explained, never changed.

**After an action**, the existing toast reports «N plasseringer merket «Overføres til GML». Ingen filer er endret.» and clears the selection. If the action is rejected (a stale selection), an error toast appears and nothing changes.

### 6.4 Design decision: an input in the inspector

The existing contract test says the inspector is read-only and that metadata writes happen only in a dialog. The M8 brief explicitly asks for the choices to be in the inspector, so the contract is now narrower but still enforced:
- `PhotoWorkspaceInspector.js` itself still has no input elements;
- the embedded `PhotoDeliveryControls.js` may call **only** `setDeliveryIntent` and `setCombinedDeliveryInclusion` (asserted). It has no metadata, position, edit or removal writes.

Final contract verification: `photoInspectorPresentation.test.mjs` checks the exact set of `photoSession` calls in the delivery component against those two actions, and rejects metadata/edit/removal writers. `photoWorkspaceEditUi.test.mjs` checks that every inspector input is inside «Samlet levering» and is a radio or checkbox; all other inspector sections have zero inputs/selects/textareas, retain their section order and expose only the existing contextual metadata-dialog action (apart from navigation/locate controls). Delivery choices remain embedded in the inspector. The delivery session tests independently verify that decisions do not alter original GMI bytes, metadata/position state, standalone export or Rettinger state.

### 6.5 Screenshots

Five curated PNGs from the original browser-test scratch directory are now preserved under `assets/20261109-gmi-edit-m8/`. The producer is `tests/photoDeliveryIntentUi.test.mjs`: all photographs and GMI objects are synthetic (`gpsPng()`, `gmiFile()`, Kum 1–3 and Ledning); no private contractor data is included.

- [Inspector, 1366×768](assets/20261109-gmi-edit-m8/m8-inspector-1366x768.png): «Samlet levering» radio controls; Kum 1 transfers while the shared photograph's Kum 2 occurrence retains its GMI link.
- [Inspector, 1280×720](assets/20261109-gmi-edit-m8/m8-inspector-1280x720.png): the same independent decisions and readiness explanation at the smaller laptop size.
- [Mixed bulk selection](assets/20261109-gmi-edit-m8/m8-bulk-selection.png): 3 selected occurrences, 2 linked and 1 unlinked; exact actions «Overfør 2 plasseringer til GML» and «Ikke ta med 1 plassering».
- [Delivery filter](assets/20261109-gmi-edit-m8/m8-filter-transfer.png): «Overføres til GML (2)» selected and two matching rows.
- [Inspector, 1024×640](assets/20261109-gmi-edit-m8/m8-inspector-1024x640.png): useful responsive evidence of wrapped filter options and summary text, with separate scroll areas and visible delivery choices and sibling state.

Final visual inspection covered every saved PNG. No horizontal overflow or clipped delivery controls/action counts were observed. Long panes scroll vertically; in the filter image the lower inspector text continues below the viewport, while the complete delivery section is shown in the inspector images. The toast and map legend do not obscure delivery controls. One redundant transfer screenshot was omitted. The action panel stays compact because only applicable actions are offered. The first version showed disabled «0 plasseringer» buttons that squeezed the list at 768 px; those were removed during implementation.

## 7. M9 snapshot contract

`photoSession.getPhotoDeliverySnapshot(layerId)` returns a deep-frozen object. Its lists are sorted by `assetId`, then `occurrenceKey`, then `photoId`, so it does not depend on UI order.

```js
{
  kind: 'photo-delivery-snapshot', generation, layerId, stateKey,
  sources: [{ sourceId, fingerprint, filename, live, loadedBinding, confidentAssociationCount, transferCount, retainedCount }],
  transfers: [{ photoId, assetId, occurrenceKey, sourceId, sourceFingerprint, objectKey, objectLabel, geometryScope,
                referenceIds, associationState: 'confident' }],
  retained:  [ /* same shape: GMI-linked occurrences that keep their link (default or explicit) */ ],
  included:  [{ photoId, assetId, ambiguousGmiReference }],
  unresolved:[{ photoId, assetId, linked, reason, decision: 'transfer'|'include', occurrenceKey, sourceId, sourceFingerprint, objectKey }],
  linksWithoutOccurrence: [{ sourceId, sourceFingerprint, objectKey, assetId, occurrenceKey, referenceIds, geometryScope, objectLabel,
                             reason: 'line-object'|'placement-removed'|'no-occurrence' }],
  removalSelections: [{ key, sourceId, sourceFingerprint, objectKey, assetId, referenceIds }],   // M7 `selections`, unchanged
  assets: { transferred, included, retainedLinked, transferredAndRetained, all },               // distinct asset ids
  counts: { transferOccurrences, retainedOccurrences, includedOccurrences, unresolvedOccurrences,
            linksWithoutOccurrence, transferredAssets, includedAssets },
  readiness: { decisionsResolved, sourceFingerprints, issues: ['unresolved-decisions'|'multiple-gmi-sources'|
               'gmi-source-not-live'|'included-photo-ambiguously-referenced'] },
}
```

How M9 should use the snapshot:
- **Valid selections only.** Only `confident` transfers enter `removalSelections`. Unresolved decisions are listed separately, so M9 can block on them.
- **Pass to M7 unchanged.** M9 hands `removalSelections` and the layer's GMI source (`layer.spatialSources`, with its `associationLedger`) to `planGmiHyperlinkRemoval`. M7 keeps the authoritative removal eligibility; M8 does not repeat it. A test runs this end to end on synthetic bytes: Kum 1 loses only `a.jpg`, Kum 2 keeps it, and the PDF stays.
- **Q15 (one GMI per package).** `readiness.sourceFingerprints` and the `multiple-gmi-sources` issue give M9 what it needs to enforce this.
- **Staleness.** `stateKey` covers the generation and every value above. Call `isPhotoDeliverySnapshotCurrent(snapshot)` before writing anything. Any decision or association change makes it false (tested). Photo positions are **not** part of `stateKey`; M9 must combine this check with the existing export snapshot's `isLive()`.

## 8. Tests and results

`tests/photoDeliveryIntent.test.mjs` (11 tests, all pass) covers:
- defaults, including line-only links;
- shared photo with independent choices, and exact bulk scope;
- invalid and stale identities, atomic rejection, no publish on rejection or no-op;
- invariance under source-workflow positioning, `applyPhotoEdits` (position + direction), `acceptCandidates`, `setCaptureMetadata`, `fillMissingPhotoValues`, `adoptSourceEvidence`, source re-check and visibility. The test also asserts that the edits took effect;
- source not live, source removed, and resolving with keep-link;
- occurrence removal (`placement-removed`), stale id;
- inclusion turned review by a later GMI link; ambiguous references;
- M9 snapshot: determinism, freezing, counts, staleness, M7 key parity, end-to-end M7 removal;
- workspace filter and counts (occurrences vs assets);
- standalone export: GML byte-identical before and after decisions, and the open export snapshot stays live. Original GMI bytes and the M2 proposal are unchanged, and no hyperlink is changed;
- layer delete and clear.

`tests/photoDeliveryIntentUi.test.mjs` runs against a production build. It covers:
- defaults, and a single transfer of a shared photo with the sibling unchanged;
- the explanation and readiness texts;
- retention across sibling and other-photo navigation;
- inclusion, and the line-linked note;
- the bulk mixed selection with exact buttons, the toast and «Behold lenker for 1»;
- the summary line, Escape, filter counts and filtering;
- no horizontal overflow at 1366×768, 1280×720 and 1024×640.

### 8.1 Earlier implementation runs (historical)

These results were recorded during implementation. The final verification below supersedes the incomplete browser-gate conclusion; the full non-browser baseline was not rerun during the final evidence pass.

| Run | Result |
|---|---|
| `node --test tests/photoDeliveryIntent.test.mjs` | **11 pass, 0 fail** |
| `PHOTO_UI_URL=… node --test tests/photoDeliveryIntentUi.test.mjs` (production build on port 3117) | **1 pass** |
| GMI/FOTO/M7 subset (`gmi*`, `photo*`, `hyperlink*`, `validationV2Gmi*`, `validationV2SyntheticGmiFixtures*`) | 1221 tests: **1118 pass, 0 fail**, 103 skipped (opt-in), after the two intended test updates |
| Full suite `node --test tests/*.test.mjs` | 1971 tests: **1860 pass, 7 fail**, 104 skipped. The 7 are exactly the known baseline: `appInfoUiContract` (1), `statsUiContract` (2), `terrainPhotoGml` optional real corpus (1), `validationV2WorkspaceInspector` (3). **No new regression.** |
| Browser gate: all 31 suites that read `PHOTO_UI_URL`, serial, against the M8 production build | First run: 190 tests, **177 pass, 3 fail**, 10 skipped (private-corpus suites without their env). The 3 failures are one parent test and its two subtests in `photoWorkspaceEditUi`. They pinned the old tools list and «no inputs anywhere in the inspector», which M8 changes on purpose. After the contract update below, `photoWorkspaceEditUi` reran on its own: **21/21 pass**. The other 30 suites: **0 failures**. |
| `npx eslint --max-warnings 0` on every changed source and test file | Clean |
| `npm run build` | Success |

**Intended test updates** (all caused by new features; no guard is weakened beyond §6.4):
- `photoWorkspace.test.mjs`: the pinned filter now has `delivery: 'all'`.
- `photoInspectorPresentation.test.mjs`: the tools list includes «Velg samlet levering», and the read-only contract is narrowed as described in §6.4.
- `photoWorkspaceEditUi.test.mjs` (browser): the same tools list. Inspector inputs are allowed only inside «Samlet levering», and only as radio or checkbox. Every other section is still checked for zero inputs and for the single «Rediger opptaksdata…» action.

**Earlier port note.** Port 3110 was already in use by a process I did not start, so the implementation run used 3117 and stopped only that run's own server.

### 8.2 Final verification and evidence pass — 2026-11-09

**M8 is ready for a local commit under the automated acceptance criteria. No commit or push was performed.** All 31 production-browser files were rerun together, serially, against a fresh production build of the current working tree on `http://127.0.0.1:3127` (build ID `--M-el4_z_j2zGaAiCTWm`). Final result: **190 tests: 180 passed, 0 failed, 10 skipped, 0 cancelled** (385.924 seconds). There are **no new browser failures**. Skips are the existing opt-in private/real-corpus scenarios whose fixture environment variables were not enabled; they are not counted as passes.

The earlier three failure entries are all resolved in this complete run:

| Previously failing test in `photoWorkspaceEditUi.test.mjs` | Cause and final result |
|---|---|
| `Verktøy menu: grouping, icons, Fullfør opplysninger… opens its tool, keyboard and no photo-specific items` | Old expected tool list omitted «Velg samlet levering». Updated list passes. |
| `inspector is read-only with one contextual action; occurrence switcher selects siblings` | Old blanket ban on inspector inputs conflicted with the deliberate delivery-only controls. Scoped radio/checkbox exception and read-only checks for every other section pass. |
| Parent `FOTO workspace: tools, tooltips, filters, inspector, metadata dialog, transactional Edit mode and map display` | Previously failed because of those two child assertions. All 21 parent/child test entries now pass in the full gate. |

No contracts or implementation were changed during this final pass. SHA-256 comparisons of all ten changed/new M8 source files against their contents at the start of verification confirmed they are unchanged. Only this report and the five curated screenshot assets were added/updated by the evidence pass. The implementation decisions and M9 snapshot contract above are retained.

| Final check | Result |
|---|---|
| Complete 31-file production-browser gate | **190 total, 180 pass, 0 fail, 10 skip** |
| `node --test tests/photoDeliveryIntent.test.mjs tests/photoInspectorPresentation.test.mjs tests/photoWorkspace.test.mjs` | **32 pass, 0 fail, 0 skip** |
| Targeted ESLint on all changed/new JS and MJS source/test files, `--max-warnings 0` | Clean |
| `git diff --check` | Clean |
| Fresh `npm run build` | Success; initial sandbox attempt could not fetch Google Fonts Roboto, then the network-enabled retry succeeded without code changes |
| Five saved screenshots (§6.5) | Visually inspected; synthetic data only |

Reproduction in PowerShell, using an available port and the existing Chrome harness:

```powershell
npm run build
# In a separate terminal; stop only this server after the tests:
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 -p 3127

$env:PHOTO_UI_URL = 'http://127.0.0.1:3127'
$browserFiles = @(rg -l 'PHOTO_UI_URL' tests -g '*.test.mjs' | Sort-Object)
if ($browserFiles.Count -ne 31) { throw 'Browser suite inventory changed' }
node --test --test-concurrency=1 $browserFiles

# Optional regeneration: the M8 test uses only synthetic fixtures.
$env:PHOTO_SCREENSHOT_DIR = Join-Path $env:TEMP 'gmi-m8-screenshots'
node --test tests/photoDeliveryIntentUi.test.mjs
```

Port 3127 was available and the verification server was started specifically for this pass. No pre-existing server was stopped or reused. The seven **known baseline full-suite failures** listed in §8.1 remain historical baseline findings, outside this clean browser gate; no fresh full non-browser run is claimed here. **Outstanding manual acceptance** remains listed in §10, including human interaction and optional private-corpus coverage. There are no remaining blockers to the requested automated M8 commit-readiness criteria.

## 9. Remaining limitations

1. **Decisions are in memory**, like the rest of the FOTO session (Q9). They are lost on reload, and nothing is persisted.
2. **Line-linked photos cannot be transferred** (§4). Supporting this needs a deliberate decision about line occurrences or GML for lines. That is not an M8 positioning change.
3. **GMI sources imported directly into FOTO** (not as a survey layer) can carry transfer decisions. M9 must still apply Q16, because only survey-layer GMIs keep their bytes. The snapshot exposes `loadedBinding` so M9 can tell the two apart.
4. **Multiple GMI sources in one layer** are allowed in M8 and reported (`multiple-gmi-sources`). Blocking them is M9's decision (Q15).
5. **No reversible bulk undo**, beyond re-applying the opposite action. Choices are cheap and every change is reported in a toast.
6. **Photo readiness is advisory in M8.** M9 performs the authoritative, atomic GML readiness check.

## 10. Suggested manual browser acceptance

**Outstanding manual acceptance:** the human walkthrough below has not been completed by this verification pass. Automated production-browser tests and screenshot inspection provide the results in §8, but do not mark these manual steps as signed off. Private-corpus browser scenarios remain opt-in and were not enabled for the final synthetic-data gate.

1. Load a survey GMI where one photo is referenced from two kummer. Import the photos, connect the GMI in «Koble og posisjoner bilder…» and open the workspace.
2. Select the first occurrence. «Samlet levering» shows «Behold lenke i GMI», and the other occurrence is listed below. Choose «Overfør til GML». Check that the row shows «Til GML», the other occurrence does not, and the header summary appears. Read the explanation: nothing has been removed yet.
3. Move that photo in «Juster plassering og retning», save, and change its capture data. The choice is unchanged.
4. Verktøy → «Velg samlet levering». Tick a mix of linked and unlinked photos and check that each button's count matches. Run «Ta med … uten GMI-lenke». Leave with Escape.
5. Open the filter and try each «Samlet levering» option.
6. Remove the GMI survey layer from the map, or remove the GMI source in FOTO. The transfer shows «Krever gjennomgang» with the reason. «Behold lenke i GMI» resolves it.
7. Run an ordinary «Eksporter…». The package contains every placed photo exactly as before.
8. Open Rettinger and the Validator for the same GMI. Nothing has changed there.
