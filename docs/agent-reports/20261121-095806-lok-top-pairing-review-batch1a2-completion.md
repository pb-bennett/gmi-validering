# Batch 1A.2 completion — all-point candidates and pairing review (read-only)

2026-11-21, Europe/Oslo. Continues the accepted [Batch 1A implementation](20261120-164243-lok-top-kum-batch1a-completion.md) and its [verification](20261120-190000-lok-top-kum-batch1a-verification.md), under Batch 1A of the [roadmap](20261120-154700-final-functional-reconciliation-release-planning.md). Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `52880b2` (unchanged). No subagents, private-corpus inspection, staging, commits, pushes, deployments, branch or dependency changes.

## Outcome and boundary

The existing review was refined in place, not rebuilt:

- Candidate recipients are now **every point object in the same GMI source except the source object itself**. Candidates are sorted by ascending XY distance, there is no Tema whitelist or radius, and nothing is selected automatically.
- Choices are now **exact decisions per (source object, reference group)**. Each decision has its own outcome, its own recipient, and its own blocking issues and warnings.
- A read-only **«Kontroll»** step lists one row per decision, with counts and «Endre» to return to that pairing.
- **No hyperlink mutation exists.** There is no save, execute or transfer control and no success receipt. `PHOTO_LINK_REVIEW_WRITABLE` is `false`, so `saveReady` is always `false`. Decisions live only in the dialog's component state and are discarded on close, on a source/revision/photo-layer/delivery/position change, and on workspace transitions. This uses the Batch 1A remount key unchanged.

## Implementation summary

### Model (`src/lib/photos/photoHyperlinkReview.mjs`)

**Candidates**
- `detectPhotoLinkReview` now adds every point object to `targets`, with `targetsByKey` for lookup. Each object carries `pointName` («Punkt N»), `identifierText` (raw identifier lexemes), `anleggsId` (raw) and `photoReferenceCount`.
- Tema still comes only from the V2 `resolveGmiTemaIdentity`. Line objects never become recipients.
- `photoLinkReviewCandidates(model, row)` excludes the source and sorts by XY distance. Ties keep source order. Objects without a safe distance (invalid geometry, missing or unsupported CRS) follow in source order.
- `photoLinkReviewCandidate(model, row, target)` evaluates one recipient.
- The CRS, Z, raw-identifier and duplicate-GUID rules from Batch 1A are unchanged.

**Issues** are now structured as `{ code, text, blocking }`:
- **Source issues:**
  - Blocking: `tema-unresolved`, `identity`, `link-columns`, `link-shape` (any cell other than whole `h:` wrappers or empty), `no-references`.
  - Warning only: `placement`. The source position is distance evidence, not the destination.
- **Recipient issues:**
  - Blocking: `target-placement`, `target-identity`, `target-link-column`, `target-link-shape`, `target-reuse` (the same photograph is already on the recipient) and `target-placement-same-photo`.
  - Warnings: `target-tema` (unresolved recipient Tema) and `target-existing-links` (with a count).

**Decisions**
- `photoLinkDecisionKey(objectKey, groupKey)` identifies one decision. A group is a confident asset on one object (every reference ID retained, matching the M7 ledger grouping), or a single unresolved reference.
- `reducePhotoLinkReviewChoices` handles these actions:
  - `select`: creates an unresolved move without a recipient. Deselecting removes the decision, so its references stay unchanged.
  - `outcome`: sets one of `keep`, `move`, `gml` or `exclude`. Changing the outcome clears the recipient, so no hidden recipient remains.
  - `target`: accepted only for a selected move, and only for a recipient in the same source other than the source itself.
  - `clear`: removes every decision.

  Each action applies only to the one decision it names.
- `photoLinkReviewDecisions(model, choices)` evaluates every decision, depending on its outcome:
  - **Move** is blocked by: a FOTO-only source (`foto-only`); missing, ambiguous, invalid or unsafe assets; a GMI delivery decision other than «Beholdes i GMI» (`delivery-conflict`); an accepted alternative position (`accepted-position`); any blocking recipient issue; and the same photograph proposed for the same recipient twice (`duplicate-recipient-photo`).
  - **Move** gets warnings when the recipient's own links are also changing (`recipient-also-changes`) and when another occurrence of a shared photo has a different decision (`shared-photo-differs`).
  - **GML and Ikke** use the existing occurrence delivery entry and `photoDeliveryOptions` reasons. They need a FOTO occurrence of exactly that object and asset (`occurrencePhoto`) with `linked && canTransfer`.
  - **Keep** is always resolved.
- `photoLinkReviewProgress` returns `selected`, `resolved`, `unresolved`, `unchangedReferences`, `allResolved` and `saveReady`. A review with nothing selected is never «resolved».
- The old `photoLinkReviewProposal` and the shape `{ targets, groups }` (one recipient per source object) were removed. Nothing outside the dialog consumed them.

### Dialog (`PhotoHyperlinkReviewDialog.js`)

- **Title:** «FOTO · Gjennomgå bildelenker». The boundary text now refers to moving to a point object, distinct from GMI → GML delivery.
- **Source section:** shows Tema, «Punkt N» and identifiers, then the issues (Må avklares / Merknad). Object facts and the raw link field are in expandable sections.
- **«Bilder» section,** one card per reference group:
  - a selection checkbox and the resolution status;
  - preview buttons with the current delivery status;
  - the four outcome radios when selected, and the recipient line with «Velg/Endre mottaker» (`aria-pressed`);
  - the decision issues, and the raw expressions and reference IDs in «Rå lenkeuttrykk».
  - The active card has a teal edge.
- **«Punktobjekter i samme kilde (n)»:**
  - an explanatory line, then «Søk punktobjekt» as a stacked label/field with a 4px gap;
  - 20-row pages with «Forrige»/«Neste» (named «… side med punktobjekter»);
  - each row shows Tema · Punkt N · identifiers, XY distance, the photo-reference count, equal-identifier evidence and recipient issues;
  - the radios are disabled until a move is active, with one line explaining why.
- **«Foreslått mottaker»:** shows the recipient, its XY distance and the group. Recipient facts, the raw link field and «Posisjoner og Z-evidens» (original/current/proposed positions, raw ΔZ) are expandable. The evidence map is kept; it draws the current candidate page plus the selected recipient.
- **«Kontroll»:**
  - a table with one row per decision: photograph and references (expandable), source, action (plus the current delivery status for GML/Ikke), recipient, XY distance, and Avklart/Uavklart with issues;
  - «Endre» returns to that exact decision and focuses it; the Kontroll heading receives focus on entry.
- **Footer:** «Valgt · Avklart · Uavklart» counts, «Avslutt gjennomgang» and the primary «Kontroll» (disabled with nothing selected), or «Tilbake til paring» in the Kontroll step.
- `liveSource` is passed only for a live loaded-GMI binding.
- **Styling:**
  - `photoTheme.css`: `.photo-link-review` is added to FOTO's existing scoped selector lists, so the review uses FOTO's established teal primary, secondary hover and focus treatment. No new colour or variant.
  - `photoHyperlinkReview.css`: new scoped layout rules. Blocking issues use the validation error text token; warnings keep the approved compact-warning token.
- **Map (`PhotoHyperlinkReviewMap.js`):** «punktobjekt»/«mottaker» terminology and Tema · Punkt tooltips.

### Decisions made within the task

- The FOTO menu entry stays «Gjennomgå bildelenker på LOK/TOP…». It is still accurate, because the sources are still LOK/TOP, and the exact menu-inventory tests remain valid. Only the dialog title changed.
- The decision granularity is the ledger reference group, not an individual repeated reference. M7 removal accepts only a complete confident edge (`referenceIds` equal to the edge). Splitting repeated references inside one object/asset group is listed below as a Batch 1B decision.
- No convenience action applies one recipient to several groups. Every recipient is set per decision.

## Exact file inventory

Application (5):
- `src/lib/photos/photoHyperlinkReview.mjs`: candidate population, structured issues, decision reducer/evaluation/progress.
- `src/components/photos/PhotoHyperlinkReviewDialog.js`: pairing and Kontroll steps, terminology, `liveSource`.
- `src/components/photos/PhotoHyperlinkReviewMap.js`: terminology and tooltips.
- `src/components/photos/photoHyperlinkReview.css`: scoped layout for the new parts.
- `src/components/photos/photoTheme.css`: `.photo-link-review` added to the nine existing FOTO scope lists.

Tests (2):
- `tests/photoHyperlinkReview.test.mjs`: the 25 Batch 1A cases are updated to the new API (KUM-only counts replaced by all-point populations; issue objects), and 7 cases are added. 32 in total.
- `tests/photoHyperlinkReviewUi.test.mjs`: the production workflow covers all-point ordering, disabled recipients before selection, explicit group selection and recipient choice, distant search, paging, outcome inventory, a second independent decision, Kontroll rows/counts/focus/«Endre», FOTO teal primary, label/field spacing, no save controls, discard on close/reopen/workspace transition, and laptop captures including Kontroll.

Documentation: this report, its 10 PNGs in [`20261121-095806-lok-top-pairing-review-batch1a2/`](20261121-095806-lok-top-pairing-review-batch1a2/), and the working progress record `20261121-pairing-review-batch1a2-progress.md`.

Pre-existing status-only paths (`tests/gmiBatchInspectorUi.test.mjs`, `tests/gmiCheckboxSoftFocusUi.test.mjs`, `tests/gmiFieldValueInputUi.test.mjs`, `tests/gmiFieldValueSearchUi.test.mjs`, `tests/gmiTableReviewUi.test.mjs`) were left untouched. As the earlier reports record, they have no content diff.

## Synthetic coverage added (unit)

| Requirement | Test |
|---|---|
| LOK at Punkt 293, SLU 0,18 m away first, KUM at 14 m, GUT, an arbitrary Tema `XYZ`, a 1 km KUM, line objects excluded, no automatic selection | «a LOK at Punkt 293 offers the SLU…» |
| Exact ascending order, ties in source order, unsafe distances last in source order with a blocking recipient issue | «ascending XY order is exact…» |
| Several source objects with independent pairings, no spreading, changing an earlier pairing, unselected references unchanged, counts | «independent pairings…» |
| Repeated references (two IDs in one decision), shared photo as separate decisions, duplicate recipient blocks, differing shared decisions warn, keep resolved | «repeated references and shared photographs…» |
| Recipient with other links (warning with count), same photo (blocks), malformed cell (blocks) | «recipients that already contain hyperlinks…» |
| Missing asset, multi-member grammar, conflicting GML decision, FOTO-only source, GML reusing the existing entry, unavailable Ikke reason | «missing assets, unsupported grammar…» |
| Recipient that is itself a changing source, progression never save-ready, frozen decisions, empty review not resolved | «a recipient that is itself a changing source…» |
| Restricted Validator entry keeps the full recipient population | Updated 65-finding handoff test |
| Stale or tampered handoff, revision and source guards | Batch 1A tests retained |
| No mutation of the live session, source bytes, history, delivery or export snapshot through select/target/outcome/clear in three rounds | Updated live-session test (zero publications, identical snapshots) |

## Verification

| Check | Result |
|---|---|
| Focused unit `node --test tests/photoHyperlinkReview.test.mjs` | 32 passed, 0 failed, 0 skipped |
| Fresh isolated production build (`%TEMP%/gmi-1a2-build`, `npm run build -- --webpack`); `src/` byte-identical to repository (`diff -rq`) | Passed |
| Focused production browser `tests/photoHyperlinkReviewUi.test.mjs` (port 3170) | 3 passed, 0 failed, 0 skipped (after one helper fix, below) |
| Full serial Node `node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"` | **2,328 passed, 0 failed, 156 skipped** (2,484; 128.7 s) |
| Complete serial production browser (same build, port 3170) | **489 passed, 0 failed, 11 skipped** (500; 624.6 s) |
| ESLint, the 5 affected JS/MJS files | Exit 0, no diagnostics |
| `git diff --check` | Exit 0 (LF/CRLF notices only) |

The first focused browser run failed at the new Kontroll layout check. The test helper required the pairing pane (`.photo-link-detail`), which is not rendered in Kontroll. The helper now checks the visible scroll pane (`.photo-link-detail, .photo-link-control-body`); the bounded-layout assertions are unchanged. One earlier build was stopped before completion because a map fix was made after the copy. I confirmed no orphaned build process remained, resynced the copy and built again. Turbopack's junction restriction (see the Batch 1A report) still applies, so the webpack builder was used. Pre-existing servers on ports 3110–3113 were not touched.

Commands (Bash; private/dev opt-ins unset):

```sh
node --test tests/photoHyperlinkReview.test.mjs
cd "$TEMP/gmi-1a2-build" && npm run build -- --webpack
node node_modules/next/dist/bin/next start -p 3170   # in the isolated copy; task-owned
PHOTO_UI_URL=http://localhost:3170 PHOTO_LINK_SCREENSHOT_DIR="$TEMP/gmi-1a2-shots" node --test tests/photoHyperlinkReviewUi.test.mjs
node --test --test-concurrency=1 --test-reporter=tap "tests/*.test.mjs"
PHOTO_UI_URL=http://localhost:3170 node --test --test-concurrency=1 --test-reporter=tap "tests/*Ui.test.mjs" tests/photoDialogLayout.test.mjs "tests/*Browser.test.mjs"
npx --no-install eslint src/lib/photos/photoHyperlinkReview.mjs src/components/photos/PhotoHyperlinkReviewDialog.js src/components/photos/PhotoHyperlinkReviewMap.js tests/photoHyperlinkReview.test.mjs tests/photoHyperlinkReviewUi.test.mjs
git diff --check
```

Scratch logs (local, synthetic only): `%TEMP%/gmi-1a2-unit.log`, `%TEMP%/gmi-1a2-ui.log`, `%TEMP%/gmi-1a2-node-full.log`, `%TEMP%/gmi-1a2-browser-full.log`, `%TEMP%/gmi-1a2-build/build.log`.

## Screenshot evidence

Synthetic production captures. The supplied EXIF image is 1×1, so these prove file and preview binding, not real-photograph acceptance. The fixture's FOTO-attached source is not live-bound, so these captures also show the `foto-only` blocking explanation.

| View | 1280×720 | 1366×768 |
|---|---|---|
| Reference group with four outcomes, recipient line and issues | [Capture](20261121-095806-lok-top-pairing-review-batch1a2/foto-pairing-1280x720.png) | [Capture](20261121-095806-lok-top-pairing-review-batch1a2/foto-pairing-1366x768.png) |
| All-point candidates with selected recipient and recipient issues | [Capture](20261121-095806-lok-top-pairing-review-batch1a2/foto-selected-1280x720.png) | [Capture](20261121-095806-lok-top-pairing-review-batch1a2/foto-selected-1366x768.png) |
| Foreslått mottaker, expandable evidence and map | [Capture](20261121-095806-lok-top-pairing-review-batch1a2/foto-map-evidence-1280x720.png) | [Capture](20261121-095806-lok-top-pairing-review-batch1a2/foto-map-evidence-1366x768.png) |
| Kontroll (two decisions, one unresolved) | [Capture](20261121-095806-lok-top-pairing-review-batch1a2/foto-kontroll-1280x720.png) | [Capture](20261121-095806-lok-top-pairing-review-batch1a2/foto-kontroll-1366x768.png) |

Validator entry: [initial restricted review, 1366×768](20261121-095806-lok-top-pairing-review-batch1a2/validator-initial-1366x768.png) and [move blocked by a missing file, 1280×720](20261121-095806-lok-top-pairing-review-batch1a2/validator-missing-assets-1280x720.png). Automated layout checks at both sizes confirm a bounded dialog, no horizontal overflow, reachable footer actions, teal native controls and the teal FOTO primary.

## Concise real-data acceptance workflow

1. Load the authorized GMI as a map layer and the photographs into a FOTO layer, using the existing workflows. Before opening the review, record photo counts, accepted positions, GMI/GML/Ikke choices, correction history, Validator state and export readiness.
2. Open FOTO **Verktøy → Gjennomgå bildelenker på LOK/TOP…** and choose the live GMI layer (not «FOTO-kilde»). Open the LOK at Punkt 293.
   - Under «Punktobjekter i samme kilde», the SLU about 0,18 m away should appear among the first candidates, ahead of the KUM objects starting around 14 m.
   - Check that distant objects can be found with «Søk punktobjekt».
3. Select one photograph, keep «Flytt til punktobjekt», click «Velg mottaker» and choose the SLU. Confirm the recipient line, the distance and any «Må avklares» items.
4. On a second LOK/TOP, choose a different recipient. On a third, try «Behold uendret», «Lever som GML» and «Ikke med i leveransen», including a photo with an existing GML/Ikke choice and a shared or repeated photo.
5. Open «Kontroll». Check one row per decision, the counts, and the unresolved explanations. Use «Endre» to change an earlier recipient, then return to Kontroll.
6. Close by the footer, X and Escape, and leave and return to FOTO. Confirm everything recorded in step 1 is unchanged and the decisions are gone.
7. From point S_HYPERLINK findings, use «Gjennomgå i FOTO». The restricted source list should be complete, and the recipient population should still cover the full source.
8. Report which proposed recipients were correct, whether any blocking rule is too strict or too lax, and the answers to the Batch 1B decisions below.

## Pairing and progression contract for Batch 1B (not implemented)

The intended writable workflow is one transaction, following the AGENTS.md wizard contract.

1. **Select photograph hyperlinks.** A decision is the exact (source object, reference group) key. Unselected references are not part of the change set.
2. **Pair each selection.** Every selected decision has exactly one explicit outcome:
   - «Behold uendret»: no change; always resolved.
   - «Flytt til punktobjekt»: a **new** paired operation. It removes the group's exact references from the source S_HYPERLINK cell (the M7 removal planner, unchanged eligibility) and adds equivalent references to the explicitly chosen point object's S_HYPERLINK cell (a new addition planner with an independent verifier). It also moves the FOTO occurrence's ownership and placement to the recipient's position, with provenance «intentional transfer». It must not set a GML delivery intent and must not invoke the automatic position → GML default (`photoPositionDeliveryEffect`).
   - «Lever som GML»: the existing delivery intent `transfer` on that object's FOTO occurrence via `setDeliveryIntent`. M7 removes the GMI link at delivery; nothing is added to another object.
   - «Ikke med i leveransen»: the existing delivery intent `exclude`. This uses the photo-exclusion semantics and M7 removal at delivery.
3. **Kontroll.** Every proposed pair is reviewed together, one row per decision. «Lagre endringer» is enabled only when `selected > 0`, every decision is resolved (no blocking issue, every move has an eligible explicit recipient), and the source, revision and delivery basis is still current. Any blocking conflict keeps the transaction out of the save-ready state.
4. **Save atomically with undo/redo.** All accepted decisions are validated and applied as one change:
   - one plan against the original document;
   - one patch, with removals and additions composed once alongside existing field edits;
   - independent verification against the original bytes;
   - one coupled history entry covering hyperlink cells, FOTO ownership/position/provenance and delivery intents;
   - rollback on any failure, published once.

   Afterwards the review shows what was saved. Undo and redo restore all parts together.
5. **«Kontroller i Validator»** opens the actual Foreslått dataset. Validator recomputes S_HYPERLINK findings from that dataset; a save never marks a finding as resolved by itself.

The original source bytes and the GMI file are never modified. Exports are composed from the original plus verified patches. Stale exports are invalidated after a save.

### Boundaries identified rather than guessed

- **Move combined with existing GML/Ikke decisions.** Move is currently blocked when any occurrence of the photo has a non-GMI delivery decision. Decide whether the transfer should reset, carry over or refuse that intent.
- **GML/Ikke inside the transaction.** These are currently separate immediate session writes (delivery planning). Including them in the same atomic save and undo entry as transfers requires deciding whether delivery intents join the Rettinger/transfer history or stay with FOTO delivery state. Do not create a second delivery state owner.
- **Recipient cell composition.** The ordinal/renumber policy for added wrappers, `sign:` metadata preservation, the target path form (`Attachments\…`) and the encoding policy are undecided. M7 renumbering covers removal only.
- **Chains.** When a recipient is itself a source whose links change, the same cell would receive a removal and an addition. This is currently a warning; the planner must compose both against the original bytes exactly once.

## Remaining unresolved decisions

| Area | Current read-only behaviour | Decision still required |
|---|---|---|
| Hyperlink grammar | Only whole `h:` wrappers (or an empty recipient cell) are non-blocking. Bare, malformed, multi-member, separator and non-string cells block on both source and recipient. | The supported addition grammar and metadata/ordinal rules; whether empty-recipient cells need a column-presence guarantee (no column is created). |
| Grouping | One decision per confident object/asset group (all reference IDs); unresolved references are individual. | Whether repeated references within one group may be split; whether ambiguous copies can ever be resolved inside the review. |
| Target reuse | The same photo already on the recipient blocks (`target-reuse`, `target-placement-same-photo`); the same photo moved twice to one recipient blocks. | Explicit «only remove from source» semantics, path/metadata equivalence, uncertain collisions. |
| Provenance | Accepted alternative positions block a move; current and proposed positions are shown. | Which provenance the recipient placement receives, and how an accepted manual position is reconciled. |
| Z | Raw Z and ΔZ are shown in expandable evidence; no transformation. | Recipient interpretation and comparability, established during the recipient trial. |
| Export | Not touched. | Combined/split/standalone GMI composition with transfers plus M7, attachment packaging, revision reimport and recipient gate A5. |
| FOTO-only sources | A move is blocked without a live loaded-GMI binding. | Confirm that this restriction stays for Batch 1B. |

## Git and process state

- Branch `feature/photo-workspace`, HEAD `52880b2` unchanged; staged diff empty. Nothing was staged, committed, pushed, deployed, reset, restored, stashed or cleaned.
- Task changes: the 7 modified files above (`git diff --numstat`: dialog +195/−93, model +166/−52, map +4/−4, review CSS +27, FOTO theme 9/9, unit test +219/−37, browser test +72/−22), plus the untracked report, its PNG folder and the progress record.
- The five pre-existing status-only test paths still have zero content diff (`git diff --numstat` is empty for them).
- The task-owned production server on port 3170 was started and stopped by this task; it has no listener. The build-only process from the stopped first build left no orphan (process scan). Pre-existing servers on 3110–3113 were not touched. The isolated build copy `%TEMP%/gmi-1a2-build` remains as a local aid (synthetic data only).

## Remaining acceptance work

- Real-data pairing acceptance (workflow above), including the Punkt 293 SLU case on the actual file, is manual and not closed by synthetic tests.
- The complete browser gate was green on one complete run; that is not evidence of long-run stability. The intermittent `photoGmlCaptureApprovalUi` failure recorded in the Batch 1A verification did not recur in this run.
- Batch 1B (paired planner and verifier, coupled history, Validator recomputation, exports, recipient gate A5) needs separate authorization and the decisions above.
