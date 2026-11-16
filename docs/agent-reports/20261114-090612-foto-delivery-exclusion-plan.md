# FOTO delivery exclusion — architecture and implementation plan (PLANNING DRAFT)

**Status: planning draft. Nothing in this report is implemented.** Written 2026-11-14 in `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `a50eb62` (matches the expected deployed HEAD). The working tree at the start held only the unrelated untracked report `docs/agent-reports/20261113-182754-rettinger-roadmap-reconciliation.md`, which was left untouched. No application code, tests, CSS, configuration, fixtures or existing reports were changed. No builds, test suites or browser runs were executed; every conclusion below comes from reading the code and the earlier FOTO reports.

## Summary

- The existing architecture already has almost everything needed. M7 `planGmiHyperlinkRemoval` removes exactly identified, confidently associated photograph references from `S_HYPERLINK` cells, preserves source bytes and verifies the result independently. Today it is only fed **transfers**, and every transfer also creates a GML feature. Excluding a GMI-linked occurrence means **removing the reference without adding a GML feature**: the same M7 selection, minus the M9 GML pairing.
- **Recommended model:** keep **one** canonical store, the M8 `deliveryDecisions` map with one decision per occurrence. Add one GMI intent, `exclude`. The unlinked "Ikke med" already exists as the absence of an inclusion. **Whole-photo exclusion is a bulk command, not stored state:** it writes `exclude` / "not included" to every occurrence of the asset in the layer. The photo-level state (included / excluded / partly excluded) is always *derived*.
- **Reference integrity is already enforced by construction.** `planDeliveryAttachments` attaches the file for every retained, confidently resolved GMI reference and blocks on unresolved ones (`retained-photo-unresolved`). An excluded GMI occurrence therefore *must* drop its reference. Otherwise the file would simply be attached again, or the package would be blocked. A dangling reference (reference kept, file omitted) is never produced. The plan keeps it that way.
- **UI:** the accepted direct-click planning stays unchanged for included occurrences. Exclusion is added as (a) a third option, «Ikke med», in the inspector's per-occurrence radiogroup, (b) "click restores" behaviour on excluded pills and markers, and (c) a separate checkbox-selection mode for bulk exclusion and restoration, modelled on the existing «Fjern bilder fra laget» mode. Batch checkboxes inside the planning bar were deliberately removed earlier ([20261113-140534](20261113-140534-foto-direct-delivery-planning-inspector.md); the contract test is `tests/photoDeliveryPlanning.test.mjs:174-188`), so this plan does not bring them back there.
- The design has four slices. Four decisions need user approval before implementation (§8).

---

## 1. Existing architecture and reusable mechanisms

### 1.1 Identity

| Concept | Owner | Identity |
|---|---|---|
| Physical photograph (asset) | `photoSession` `assets` map | `assetId`. The `File` object holds the original bytes and is never written to. |
| Placement / occurrence | `photoSession` `records` map | record `id` (`photoId`). Many records can share one `assetId` (`repeatGroup`, `photoSession.mjs:179`). |
| GMI occurrence | `record.occurrence` | `occurrence.key = JSON.stringify([sourceFingerprint, objectKey, assetId])`. This is identical to the M7 `gmiHyperlinkSelectionKey` (`photoDeliveryIntent.mjs:57`, `hyperlinkRemoval.mjs:85`). |
| GMI reference | GMI photo source `references[]` + `associationLedger` | `referenceId` = `${sourceId}:${objectKey}:S_HYPERLINK:${sourceIndex}:${wrapperOrdinal}:${memberOrdinal}`. A ledger edge groups every reference from one object to one asset (`edge.referenceIds`). |
| GMI link without a FOTO occurrence | ledger edge with no record | Line objects, or placements removed from the workspace (`dismissedGmiPlacements`). Reported by the snapshot as `linksWithoutOccurrence` (`photoDeliveryIntent.mjs:218-235`). |

### 1.2 Canonical M8 delivery state

- `deliveryDecisions: Map<photoId, decision>` (`photoSession.mjs:84`) is the only store. Records are untouched, and only `setDeliveryIntent` and `setCombinedDeliveryInclusion` write to it (`photoSession.mjs:827-875`). Both are atomic, validate every id first and publish once.
- Decisions: `{kind:'gmi', occurrenceKey, intent:'transfer'}` for linked occurrences and `{kind:'unlinked', include:true}` for unlinked ones. Absence means the default: `keep-link` (linked) or `not-selected` (unlinked).
- `photoDeliveryEntry` (`photoDeliveryIntent.mjs:110-152`) derives the status: `keep-link | transfer | include | not-selected | review`. A decision of the wrong kind, a changed occurrence key or a lost confident association becomes `review`. It is never silently converted.
- `buildPhotoDeliverySnapshot` (`photoDeliveryIntent.mjs:183-306`) returns `transfers`, `retained`, `included`, `unresolved`, `linksWithoutOccurrence` and `removalSelections` (= transfers), plus a `stateKey`. `isPhotoDeliverySnapshotCurrent` rejects stale plans.
- `release(ids)` drops decisions when records are removed (`photoSession.mjs:354`).

### 1.3 Existing «Ikke med»

- `PHOTO_DELIVERY_COLOURS.excluded` = `#64748b`, short «Ikke med», label «Ikke med i GML» (`photoMarkerPresentation.mjs:118`). `photoDeliveryColourState('not-selected') = 'excluded'`.
- It exists **only for unlinked occurrences** (`photoDeliveryOptions`, `photoDeliveryChoice.mjs:20-35`) and is the default there. A GMI-linked occurrence has no way to be left out today: the choice is only GMI (keep link + attach file) or GML (remove link + GML feature + attach file).
- Known gap: a stale transfer on an occurrence that lost its link (`review`/`link-removed`) cannot be cleared to «Ikke med», because `setCombinedDeliveryInclusion(false)` only clears `unlinked` decisions (`photoSession.mjs:866-871`; see [20261113-140534](20261113-140534-foto-direct-delivery-planning-inspector.md) §"Review states"). Slice 1 fixes this.

### 1.4 Export path (M9/M10)

`buildDeliveryPlan` (`src/lib/delivery/deliveryPlan.mjs:47-150`), combined/split modes:

1. `planGmiHyperlinkRemoval(document, { photoSource, selections: intent.removalSelections, session, acceptedAssetIds })` runs against the immutable **original** document.
2. `selected = transfers + included` feeds `planDeliveryAttachments` (`deliveryAttachments.mjs`), which:
   - attaches every **retained** (not removed) image reference at its original relative path, if it resolves confidently to the same asset as before. Otherwise it reports `retained-photo-unresolved` / `unsafe-retained-path` / `reserved-path-collision`;
   - reuses a retained `Attachments/<file>` path for a GML-selected asset when that asset is still linked elsewhere (shared-photo deduplication). Otherwise it plans new GML attachment names.
3. `buildPhotoExportPlan(..., { occurrenceIds: selectedIds })` builds the GML features, which are checked one-to-one against `selected`.
4. Each attachment's bytes are checksummed. The GML is validated (`validateDeliveryGml`).
5. `applyGmiHyperlinkRemoval(removal, { authorization: { selectionKeys } })` runs one M1 `editGmiFields` splice (field edits + hyperlink edits), then the independent `verifyGmiHyperlinkRemoval`.
6. `buildDeliveryPackage` re-verifies sources and checksums and writes GMI + GML + `plan.attachments` to the ZIP. Assets that no retained reference and no GML feature needs are not in the ZIP (`counts.excludedAssets`, shown in `DeliveryWizard.js:215`).

Mode B (`photos-only`) deliberately ignores M8 intent (`deliveryPlan.mjs:63-67`). Mode A (`gmi-only`) exports the GMI with every link retained and no photographs.

### 1.5 M7 hyperlink removal: what it can and cannot do (`src/lib/gmi-edit/hyperlinkRemoval.mjs`)

**Can:**
- remove one or more whole `h:N(...)` wrappers containing exactly one link each, for one or more selections in the same cell;
- renumber the remaining wrappers to 1..n (default `renumber`) or keep their numbers (`preserve`);
- clear a cell to `''` when every wrapper is removed, or when the cell is a bare value that is one unambiguous path;
- keep unrelated entries byte-identical (`selfCheckCellLexeme`, then the independent `verifyGmiHyperlinkRemoval`, which also requires untouched cells to be identical);
- handle point **and** line scope (`SCOPE_ORDER`);
- compose with M2 field edits in one splice, and refuse if field edits touch `S_HYPERLINK`;
- warn `photo-linked-elsewhere` for shared photographs and `gemini-g4-unverified` whenever cells change.

**Refuses (blocks the whole plan):** non-confident or missing associations, a reference set that differs from the edge, evidence mismatch against a fresh parse, `multi-link-wrapper`, `bare-value-not-single-path`, `unsupported-wrapper-separator`, `unsupported-wrapper-ordinal`, `ambiguous-duplicate-reference` (an unselected same-name link not confidently owned by another asset), non-editable cells, an unencodable result, `reference-not-image` / directory-only targets, stale fingerprints and missing authorization.

**Conclusion:** removing a photograph reference for exclusion is *exactly* the transfer removal. The patcher needs no new capability. It needs no deletion beyond what it already proves, and it should not get any. M7 does not care why a reference is removed. Only the M9 pairing with GML, the authorization accounting and the reporting need extending.

### 1.6 What can be reused and what must be extended

| Reused unchanged | Extended |
|---|---|
| M7 planner/applier/verifier; M1 splice; source-byte intactness checks | `PHOTO_DELIVERY_INTENTS` (+`exclude`), `photoDeliveryEntry`, `buildPhotoDeliverySnapshot` (exclusions list, purpose-tagged removal selections, asset-level views) |
| `planDeliveryAttachments` (retained/removed logic already gives correct file inclusion) | `photoDeliveryOptions` / toggle target (third option and restore) |
| `deliveryDecisions` map, `release`, `stateKey` staleness | `setDeliveryIntent` accepts `exclude`; `setCombinedDeliveryInclusion(false)` clears stale `link-removed` decisions |
| ZIP writer, checksum and verification gates | `deliveryPlan` counts/selection split; `deliverySummary` / `deliveryReport` text |
| Removal-mode selection pattern (`removalIds`, «Velg alle viste», whole-photo secondary action) | `photoWorkspaceState` (new mode + selection), filter keys, colour labels |

---

## 2. Recommended exclusion model

### 2.1 Approach A vs B

- **A (whole photo)** matches how users think, but stored as a separate photo-level flag it would be a second source of truth. It would contradict per-occurrence GMI/GML choices: what is "GML" plus "photo excluded"?
- **B (per occurrence)** is precise and fits the existing store, but on its own it is tedious and can leave a photo "half excluded" without the user noticing.

**Recommendation: store B, operate mainly in A.**

1. **Stored:** per-occurrence decisions only, in the existing `deliveryDecisions` map:
   - linked: `{kind:'gmi', occurrenceKey, intent:'exclude'}`, with new status `exclude`;
   - unlinked: the existing absence of an inclusion (`not-selected`), unchanged.
2. **Derived photo-level state** (pure, from all occurrences of the asset in the layer plus `linksWithoutOccurrence` for that asset):
   - `included`: no occurrence excluded;
   - `excluded`: every occurrence excluded / not selected **and** no retained link without an occurrence. The file will not be in the package;
   - `partial`: some excluded, some delivered. The file **is** still in the package and the UI says why.
3. **Whole-photo actions** are commands: «Ta ut hele bildet» writes exclusion to *every* occurrence of the asset through the two M8 actions, atomically. «Ta med igjen» restores every occurrence. Single-occurrence controls (inspector, marker, popup) act only on that occurrence, as they do now.
4. Excluding one occurrence **never** changes a sibling occurrence. The photo becomes `partial`, and the UI shows that the file is still delivered through the other placements.

No additional photo-level stored state is needed. This avoids contradictory states by construction: every combination of per-occurrence decisions has exactly one derived photo-level state.

### 2.2 Status vocabulary

New `PHOTO_DELIVERY_STATUS.EXCLUDE = 'exclude'` (label «Ikke med i leveransen»). The existing unlinked `not-selected` stays as it is, because it is also the unlinked default. Both map to the colour state `excluded` (short «Ikke med»). The colour label changes from «Ikke med i GML» to «Ikke med i leveransen», because a linked exclusion also removes the photo from the GMI. The `#64748b` colour stays. The excluded marker could also get a hollow/dashed style so it does not rely on colour alone (decision D4).

### 2.3 Restoration

- Restoring a linked exclusion: «Ta med igjen» returns to the **safe default `keep-link` (GMI)** by deleting the decision. The previous GMI/GML choice is not remembered, because remembering it would add hidden state. The resulting status is visible immediately and is one click from GML. *Alternative (D2):* store `restoreIntent` inside the exclude decision.
- Restoring an unlinked occurrence: «Ta med igjen» means include in GML (`setCombinedDeliveryInclusion(true)`) when `canInclude`. Missing position, direction or time stays a non-blocking note, which the delivery planner then enforces (`selected-photo-not-exported`).

### 2.4 Stale decisions

`exclude` follows the same rules as `transfer`:
- occurrence key changed → `review` / `occurrence-changed`;
- association not confident (`source-missing`, `fingerprint-mismatch`, `source-not-live`, `association-lost`, `association-changed`) → `review`. The reference cannot be removed safely, and the default (keeping it) would silently deliver the photo against the user's choice;
- link removed (occurrence now unlinked) → `review` / `link-removed`, with «Ikke med» **enabled** as the resolution. The new outcome is equivalent (not delivered), but the user is told the GMI link disappeared.

`review` blocks delivery (`unresolved-decisions`), so a stale exclusion can never turn into an inclusion without the user seeing it.

---

## 3. GMI reference-handling strategy

### 3.1 Rule

> A delivered GMI never references a photograph that is not in the package, and a photograph excluded by the user is never delivered through a reference the user excluded.

Consequences:
- Excluding a GMI-linked occurrence **removes** its references (`edge.referenceIds`, which can be several references in one cell) from that object's `S_HYPERLINK`, using M7 unchanged.
- An option to "keep the reference but omit the file" is **not offered**. The existing `retained-photo-unresolved` / attachment logic would contradict it, and a dangling reference is exactly what the requirement forbids.
- If M7 refuses a removal (§1.5), delivery is **blocked**, with a per-occurrence explanation and two resolutions: «Behold i GMI» (keep link and file) or deliver without this GMI/split. There is never a fallback rewrite.

### 3.2 Snapshot and plan changes

- `buildPhotoDeliverySnapshot` adds `exclusions` (occurrence views, same shape as `transfers`). `removalSelections = transfers ∪ exclusions`, each tagged `purpose: 'transfer' | 'exclude'`. M7 can ignore the extra field; `normalizeSelection` drops it, which needs a test. The tag can also be derived in M9 from the two lists, which avoids touching the M7 input contract at all (recommended).
- `assets` gains `excluded` (assets with ≥1 exclusion), `excludedEntirely` (derived `excluded`) and `excludedButDelivered` (`partial`).
- `stateKey` automatically covers exclusions, because they are part of `body`.
- `deliveryPlan` builds `selected = transfers + included` exactly as today. Exclusions take part only in the M7 removal. Authorization still equals `removal.selections` keys. The removal-count summary splits `removedReferences` into transferred and excluded by `selectionKey`.

### 3.3 Specific cases

| Case | Handling |
|---|---|
| One photo, one reference | Wrapper removed. Cell cleared to `''` if it was the only one (`clearedCells`). |
| Several references to the same photo in one cell | All are in one edge, so all are removed together, or the plan blocks. |
| Several photos in one cell, one excluded | Only that wrapper is removed. The others stay byte-identical except for their ordinal digits under `renumber`. |
| Multi-link wrapper / complex bare value / non-whitespace separators | Blocked (M7 codes). The UI explains and offers «Behold i GMI». |
| Same file referenced by several objects, one excluded | That object's reference is removed. The others stay, and the file is still attached because of them (`photo-linked-elsewhere` warning; photo shown as `partial`). |
| Same file referenced by several objects, all excluded | Every reference is removed. The file is not attached, unless a line link without an occurrence remains (see §6). |
| Ambiguous duplicate name in the cell | Blocked (`ambiguous-duplicate-reference`). |
| Reference to a photo not imported / not confidently resolved | Cannot be excluded: there is no asset or confident edge. Already blocks combined delivery (`retained-photo-unresolved`). Unchanged and out of scope. |
| Emptying a cell | Allowed. The cleared-cell count is shown in Kontroll and in the TXT report. Gemini acceptance of empty `S_HYPERLINK` and renumbering is gate G4, still unverified, and the existing warning stays. |
| Original files | Never written. M7 plans against the original document. Re-exports always start from the original bytes. |
| No exclusions and no transfers | `removal.status = 'empty'`, so the GMI output is byte-identical to the input (existing P1 path). |

---

## 4. Proposed interface and bulk actions

All user-facing text is Norwegian. Accepted interactions are preserved unchanged unless stated.

### 4.1 «Fordel bilder til GMI/GML» (planning mode)

- **Row click** selects and locates, as today.
- **Row destination pill** (`photo-delivery-row-button`):
  - included linked occurrence: toggles GMI↔GML, as today. The click never excludes, which prevents accidental exclusion;
  - excluded linked occurrence: shows «Ikke med» (`#64748b`). A click restores it to GMI. The accessible name reads «… Ikke med i leveransen. Klikk for å ta med (GMI)»;
  - unlinked occurrence: «Ikke med»↔GML, as today.
- **Map marker click:** the same per-occurrence semantics as the pill. Overlapping markers keep their popup with individual controls (`PhotoDeliveryMapPopup`). Popup rows also show «Ikke med» for excluded members, which a click restores.
- **Planning-bar counts** (`photoPlanningCounts`): «Ikke med» is shown whenever its count is non-zero, as today. A second line gives photo-level counts when they differ: «12 bilder ikke med · 3 delvis med».
- **Filter** («Samlet levering»): add «Ikke med i leveransen» (`exclude`), keep «Ikke valgt» (unlinked default), and add a photo-level «Delvis med» filter. `FILTER_DELIVERY` in `photoWorkspaceState.mjs` and `PHOTO_DELIVERY_FILTERS` are extended together.
- **Pill colours** are unchanged: GMI white on `#1e40af`, GML white on `#166534`, GML map markers `#22c55e`.

### 4.2 Inspector («Samlet levering»)

`PhotoDeliveryToggle` for a linked occurrence becomes a three-option radiogroup **GMI · GML · Ikke med**. Arrow keys cycle through the enabled options. This is the explicit single-occurrence exclusion. For a shared photo:
- the occurrence switcher shows each sibling's own state;
- a note under the toggle: «Bildet har 3 plasseringer: 1 ikke med, 2 leveres. Filen blir med i leveransen.» with a link-style button «Ta ut alle plasseringer av bildet» (a whole-photo command, with confirmation when it changes other placements).

Unlinked occurrences keep «Ikke med · GML». Line-only links keep the fixed GMI, with the explanation from §6.

### 4.3 Bulk exclusion: separate selection mode (needs approval, D1)

Add a new Verktøy item, **«Velg bilder som ikke skal med…»**, mode `exclude`, placed next to «Fordel bilder til GMI/GML». It mirrors «Fjern bilder fra laget…»:
- row checkboxes (`excludeIds`, the same reducer pattern as `removalIds`), «Velg alle viste», «Avbryt», Escape to leave;
- the existing filters work, so «vis Ikke med → Velg alle viste → Ta med igjen» is the restoration path;
- action bar:
  - primary: **«Ta ut N bilder av leveransen»**. This is whole-photo: every placement of the selected photos. When the selection expands to placements that are not selected or not shown, the label reads «Ta ut N bilder (M plasseringer, K ikke valgt)» and a confirmation dialog lists the affected objects;
  - secondary, shown only when the selection contains repeated photos: «Bare valgte plasseringer (M)»;
  - **«Ta med igjen»**: enabled when the selection contains excluded occurrences, and restores them per §2.3;
  - blocked items (non-confident association, line link) are counted and explained («2 bilder kan ikke tas ut: …») and never written partially. The command is all-or-nothing, like the existing atomic M8 actions;
- it does not change positioning, metadata, files, hyperlinks or the source GMI. Text: «Bildene beholdes i fotolaget. Valget brukes når leveransen lages.»
- a polite `role="status"` announcement after each action.

This keeps the direct-click planning mode free of checkboxes, honouring the earlier contract (`tests/photoDeliveryPlanning.test.mjs:188`), and reuses an established selection idiom. The alternative (checkboxes in planning mode) would deliberately reverse the decision of [20261113-140534](20261113-140534-foto-direct-delivery-planning-inspector.md).

### 4.4 Preventing accidental exclusion

- No single click on an *included* linked placement ever excludes. Exclusion happens only through the inspector's «Ikke med», the selection mode, or the whole-photo link.
- Whole-photo commands that touch placements not visible or not selected need confirmation.
- Exclusion is always reversible, and the session keeps no other history. Kontroll lists every excluded photo before download.

---

## 5. Export consistency guarantees

### 5.1 Effects

| Item | Effect of exclusion |
|---|---|
| GMI attachments | A file is attached iff a retained confident reference needs it **or** a GML feature uses it. Fully excluded photos are absent. |
| `S_HYPERLINK` | The excluded occurrence's references are removed through M7. Unrelated entries are unchanged (independently verified). |
| GML features | Excluded occurrences produce no feature. `selected` stays `transfers + included`. |
| ZIP tree (`deliveryInventory`) | Excluded photos are not listed. Partly excluded photos are listed with their remaining destination (GMI / GML / GMI + GML). |
| Deduplication | Unchanged. One asset is one file per distinct retained path, plus at most one GML path. |
| Validation | Exclusion adds no new error code for the normal case. M7 refusals surface with a new hint («Bildelenken kan ikke fjernes sikkert. Behold bildet i GMI eller …»). `unresolved-decisions` covers stale exclusions. |
| Mode A (Kun GMI) | Exclusions are not applied. Kontroll shows a note when exclusions exist: «N bilder er merket Ikke med, men Kun GMI beholder alle bildelenker.» (D3: alternatively, apply removals in Mode A too.) |
| Mode B (Kun GML med bilder) | Unchanged in this plan: M8 intent is ignored. A note appears when exclusions exist (D3). |
| Repeat export | Each plan is built from the original bytes and current decisions, and any change makes the earlier plan stale. Restoring an exclusion and exporting again gives the earlier output for the same decisions, deterministically. |

### 5.2 Counts: definitions shown in Kontroll and in the TXT report

| Count | Definition |
|---|---|
| **Bilder i leveransen** | distinct `assetId`s in `plan.attachments` |
| **Filer i ZIP** | `plan.attachments.length` (can exceed the photo count when one asset has several retained paths) |
| **Plasseringer** (GMI / GML) | retained confident GMI edges + GML features |
| **Bildelenker** | kept in GMI · removed, transferred to GML · removed, ikke med |
| **Ikke med** | excluded occurrences / photos fully excluded / photos partly excluded but still delivered |
| **Krever gjennomgang / blokkert** | `unresolved` occurrences; M7 blockers per occurrence |

A photograph referenced by five objects counts as **one** photo, one file (one path), five placements. This replaces `counts.excludedAssets` with explicit `excludedEntirelyAssets`, `notNeededAssets` (never selected or required) and `partialAssets`. The current `DeliveryWizard.js:215` sentence should then distinguish "tatt ut av deg" from "ikke valgt".

### 5.3 TXT report (`deliveryReport`)

Add an «Ikke med i leveransen» section: counts as in §5.2, then one line per excluded photo with filename and, for GMI-linked ones, the object label and «bildelenke fjernet». Partly excluded photos get the line «… fortsatt levert via <objekt>». `deliverySummary` «Bildelenker» becomes «X beholdes i GMI · Y overføres til GML · Z fjernet (ikke med)». The report stays outside the ZIP, and its content is limited to filenames and object labels already shown in the UI.

---

## 6. Edge-case decision matrix

| # | Case | Exclude one occurrence | Whole-photo exclude | Package result | Restore |
|---|---|---|---|---|---|
| 1 | Photo, one GMI reference | `exclude` decision → reference removed | same as one occurrence | No file. Cell trimmed or cleared. | GMI (keep link) |
| 2 | Photo, several GMI objects | Only that object's reference is removed; photo `partial`; `photo-linked-elsewhere` | All occurrences `exclude` | partial: file kept for the other references / whole: no file | per occurrence → GMI |
| 3 | Photo in GMI and GML (one occurrence transfer, one keep) | The excluded occurrence is removed from GMI with no feature | All `exclude`; the transfer is replaced | partial: file kept / whole: no file, no feature | GMI (previous GML not remembered, D2) |
| 4 | Several GML placements (unlinked repeats) | That occurrence → not-selected | All → not-selected | No feature for excluded ones. File only if any remains. | GML (`include`) |
| 5 | Unlinked photo | existing «Ikke med» | same | Not in package | GML |
| 6 | Unresolved placement (no accepted position) | Allowed: exclusion needs no position. Linked: requires a confident association. | same | Excluded: nothing. Included: existing `selected-photo-not-exported` block. | as above |
| 7 | Linked but association not confident | **Refused** («Kan ikke tas ut nå: …»), the same rule as `canTransfer` | **Refused for the whole selection** (atomic), listing the reasons | — | — |
| 8 | GMI link without a FOTO occurrence (line object / removed placement) | No occurrence to exclude | **Refused in slice 2.** Shown «Bildet er også lenket fra en ledning; lenken og filen beholdes.» Option D5: slice 4 adds a keyed decision. | File kept for the line link | — |
| 9 | Duplicate filename / ambiguous reference | Unlinked + ambiguous: «Ikke med» allowed, but combined delivery already blocks on the unresolved reference | same | Blocked until clarified (existing) | — |
| 10 | M7 cannot rewrite the cell (multi-link wrapper, odd separators, complex bare value) | Decision accepted; Kontroll blocks with a per-occurrence explanation | same | Blocked; nothing generated | «Behold i GMI» resolves it |
| 11 | Previously excluded, now restored | Decision deleted (linked) / inclusion set (unlinked) | All occurrences | As before exclusion; deterministic | — |
| 12 | Exclusion goes stale (source reloaded, key changed, link lost) | `review`, which blocks delivery | — | Blocked until resolved | `link-removed`: «Ikke med» enabled |
| 13 | Occurrence removed from the layer | The decision is dropped (`release`). The GMI link then becomes `linksWithoutOccurrence` / placement-removed and is **retained**. | — | File required and kept | — |

Case 13 is a pre-existing trap. «Fjern fra laget» *keeps* the GMI link, so removing a placement does not remove it from the delivery. The exclusion UI should tell the user: «Vil du at bildet ikke skal leveres? Bruk Ikke med i stedet for å fjerne det.» Changing removal semantics is out of scope.

---

## 7. Implementation slices (recommended order)

### Slice 1: occurrence-level exclusion in the M8 model (no UI beyond the inspector)

- **Scope:** add the `exclude` intent and status; derive the photo-level state; handle stale exclusions; let `setCombinedDeliveryInclusion(false)` clear a `link-removed` stale gmi decision.
- **Files:** `src/lib/photos/photoDeliveryIntent.mjs`, `src/lib/photos/photoSession.mjs` (`setDeliveryIntent`, `setCombinedDeliveryInclusion`), `src/lib/photos/photoDeliveryChoice.mjs` (third option; toggle target restores from `exclude`), `src/lib/photos/photoMarkerPresentation.mjs` (status→colour, label), `src/components/photos/PhotoDeliveryToggle.js` / `PhotoDeliveryControls.js` (three options), `photoWorkspaceState.mjs` / `photoWorkspaceView.mjs` (filter key).
- **Data model:** decision `{kind:'gmi', occurrenceKey, intent:'exclude'}`. No new store.
- **Export:** the snapshot gets `exclusions` + `assets.excluded*`. `removalSelections` stays transfers-only in this slice. The planner must **block** combined/split delivery with `exclusions-not-supported-yet` until slice 3, so that an exclusion is never silently delivered.
- **Safety:** exclusion requires a confident association (same gate as transfer). Atomic all-or-nothing writes. The decision is never converted into another kind.
- **Tests (`tests/photoDeliveryIntent.test.mjs`, `tests/photoDeliveryPlanning.test.mjs`):** set/clear exclude; shared photo siblings untouched; each stale reason → review; `link-removed` resolvable to «Ikke med»; toggle from `exclude` restores to GMI; marker/pill click on an included linked occurrence never excludes; derived included/partial/excluded; `stateKey` changes; planner blocks while exclusions exist.
- **Acceptance:** a user can mark and unmark a single placement «Ikke med» in the inspector. Counts and filters update. Export is blocked with a clear message until slice 3.

### Slice 2: whole-photo and bulk commands, plus the selection mode

- **Depends on:** slice 1.
- **Scope:** a pure command helper `planPhotoExclusion(delivery, layer, assetIds | photoIds, { scope: 'photo'|'occurrences', include })` that returns writes, affected placements, blocked items and confirmation needs. It applies through the existing two session actions in one publish. A session wrapper `setPhotoDeliveryExclusion(layerId, photoIds, exclude)` may be needed, because a whole-photo command mixes linked and unlinked occurrences, and two separate calls would publish twice and are not atomic across kinds. That wrapper is still the same map and the same validation, not a parallel system. Add the `exclude` workspace mode, the `excludeIds` reducer state, the Verktøy item, and the action bar with confirmation.
- **Files:** `photoDeliveryChoice.mjs` (command planner), `photoSession.mjs` (atomic wrapper), `photoWorkspaceState.mjs`, `PhotoWorkspaceCollection.js`, `PhotoWorkspaceToolsMenu.js`, a confirmation component (reuse the `RemovePhotosConfirmation` pattern), `photoWorkspace.css` (existing tokens only), and the inspector's whole-photo link.
- **Export:** none beyond slice 1 (still blocked).
- **Safety:** all-or-nothing; line-linked (case 8) and non-confident (case 7) photos are refused with reasons; no other workspace state changes; Escape leaves the mode; the selection is cleared on mode change and reconciled on layer change.
- **Tests:** whole-photo across mixed linked/unlinked/repeat occurrences; atomic refusal; confirmation when hidden placements are affected; «Velg alle viste» under a filter; bulk restore; a source contract that the planning bar still has no checkboxes (the existing assertion is kept); keyboard (checkbox tab order, Escape, announcements); removal mode unaffected.
- **Acceptance:** select 50 photos, exclude them, filter «Ikke med», select all shown, restore. Counts are correct throughout, and nothing else in the workspace has changed.

### Slice 3: delivery planner, Kontroll and report

- **Depends on:** slice 1 (slice 2 is not required).
- **Scope:** feed exclusions into the M7 removal; split counts by purpose; add asset-level counts; new texts in Kontroll and the inventory; report section; Mode A/B notes; remove the slice-1 block.
- **Files:** `src/lib/photos/photoDeliveryIntent.mjs` (`removalSelections` = transfers ∪ exclusions), `src/lib/delivery/deliveryPlan.mjs` (counts, purpose split, per-occurrence blocker mapping), `src/lib/delivery/deliveryWizard.mjs` (messages, `deliverySummary`, `deliveryReport`), `src/components/delivery/DeliveryWizard.js`, `DeliveryInventory.js` / `deliveryInventory.mjs` (no logic change expected; destinations already derive from retained/GML).
- **Safety:** M7 unchanged; authorization keys equal all removal selections; independent verification unchanged; no-op delivery stays byte-identical; a removal refused by M7 blocks the whole plan; the earlier plan goes stale on any decision change.
- **Tests (`tests/deliveryPlan.test.mjs`, `tests/deliveryWizard.test.mjs`, `tests/gmiEditHyperlinkRemoval.test.mjs` for the composed cases, all synthetic fixtures):**
  - exclude the only reference → cell cleared, file absent, GML unchanged;
  - two photos in one cell, one excluded → the other wrapper stays byte-identical (except ordinal), file of the other kept;
  - the same photo twice in one cell → both removed;
  - shared photo, one object excluded → file kept, `photo-linked-elsewhere`, counts 1 photo / 1 file;
  - shared photo, all excluded → file absent;
  - transfer + exclusion of the same asset in different objects → GML feature present, file at GML path, no dangling reference;
  - multi-link wrapper / bad separator → blocked, no bytes;
  - ambiguous duplicate → blocked;
  - restore, then rebuild → output identical to the pre-exclusion plan bytes;
  - no decisions → GMI byte-identical to the original;
  - bytes outside the patched cells unchanged (encoding, line endings, geometry, unknown sections);
  - ZIP entries == `plan.attachments` + GMI + GML; inventory == ZIP; report counts == plan counts;
  - stale plan after a decision change; Mode A/B ignore exclusions with notes.
- **Acceptance:** a combined delivery with exclusions downloads. The GMI has no reference to any omitted photograph, and the counts in Kontroll, inventory, ZIP and TXT agree.

### Slice 4 (optional, needs D5): exclusions for GMI links without a FOTO occurrence

- **Scope:** allow whole-photo exclusion to also remove line-object / removed-placement references. These are keyed by occurrence key (no record id) in the same `deliveryDecisions` map, under a distinct key namespace (`link:<occurrenceKey>`). They are validated against `linksWithoutOccurrence` and go stale by fingerprint. M7 already supports line scope.
- **Files:** `photoDeliveryIntent.mjs`, `photoSession.mjs` (cleanup on source change), the slice-2 command planner, the "Kilder og koblinger" presentation.
- **Tests:** line link removal; staleness on reload; whole-photo exclusion now possible for case 8; dismissed-placement link removable.
- **Acceptance:** a photo linked only from a line, or from both a point and a line, can be fully excluded.

### Verification for every slice (per AGENTS.md)

Focused `node --test` on the files above, `npx --no-install eslint` on changed files, then the FOTO serial selection (`photo*`, `delivery*`, `gmiPhoto*`, `gmiHyperlink*`, the selection used in [20261113-154032](20261113-154032-foto-sidebar-destination-correction.md)). Slices 2–3 also need `npm run build` and browser screenshots at 1280×720 and 1366×768 of planning mode, the selection mode, the inspector and Kontroll. Plus `git diff --check`.

---

## 8. Risks and open decisions

### Decisions requiring user approval

- **D1. Bulk UI location.** Recommended: a separate «Velg bilder som ikke skal med…» checkbox mode, with planning mode left click-only. Alternative: reintroduce checkboxes in planning mode, which reverses the accepted 20261113-140534 contract.
- **D2. Restore target for linked occurrences.** Recommended: the safe default GMI (keep link). Alternative: remember the previous GMI/GML intent inside the exclude decision.
- **D3. Modes A/B.** Recommended: exclusions apply only to Delt/Samlet levering, with an explicit note in Kun GMI / Kun GML. Alternatives: Mode B honours exclusions. That requires explicit unlinked exclusions, `{kind:'unlinked', include:false}`, to distinguish them from the default, and changes the standalone scope contract. Mode A could also remove excluded references, but Kun GMI currently promises «Eksisterende bildelenker beholdes».
- **D4. Primary bulk granularity.** Recommended: whole photo by default, «Bare valgte plasseringer» as secondary, and confirmation when unseen placements are affected. Alternative: mirror the removal mode exactly (selected placements primary).
- **D5. Line-link exclusion (slice 4).** Is it needed for real deliveries, or is the refusal-with-explanation enough?
- Also confirm: the excluded marker style (colour `#64748b` alone, or also hollow/dashed), and the label change «Ikke med i GML» → «Ikke med i leveransen».

### Risks

- **Gemini G4 is still unverified.** Exclusion increases the number of trimmed and cleared `S_HYPERLINK` cells and renumbered wrappers. Real recipient acceptance of empty cells and renumbering has not been established, and the `gemini-g4-unverified` warning stays.
- **M7 refusal rate on real files.** Multi-link wrappers or unusual separators would block exclusions as they already block transfers. This needs to be measured on the real corpus before the UX is finalised. A pre-flight indicator in planning mode would require access to the GMI source document from the workspace and is not proposed yet.
- **Removal vs. exclusion confusion** (case 13). Removing a placement keeps the GMI link and the file.
- **Default "Ikke valgt" for unlinked photos** and an explicit «Ikke med» look the same. The report separates them by origin (explicit for linked, default for unlinked).
- **Atomicity across kinds** (slice 2). Mixed whole-photo commands need the single-publish wrapper. Two separate calls could leave a half-applied state if the second fails validation.

---

## 9. Real-file acceptance checklist

Run on a fresh production build with real contractor files. Read-only originals; nothing copied into the repository.

1. Load a GMI with many photo links and the matching photo folder. Open «Fordel bilder til GMI/GML»: GMI/GML pills and markers look and behave as before.
2. Exclude one single-reference photo in the inspector: the pill and marker show «Ikke med», counts update, and a row click still only selects.
3. Click the excluded marker: it restores to GMI. Overlapping markers: each popup row controls its own occurrence.
4. Shared photo (≥2 objects): exclude one placement. The UI shows «delvis med», and Kontroll shows the file still delivered and the link removed only from that object.
5. Bulk: select ~50 photos in the selection mode and exclude them. The confirmation lists any hidden placements. Filter «Ikke med» → select all → restore → exclude again.
6. A photo in GMI and GML: exclude the whole photo. No GML feature, no file, no reference.
7. A photo linked from a line object: whole-photo exclusion is refused or explained (or, with slice 4, removed).
8. Build Samlet levering. Kontroll counts photos, files, placements, links kept/transferred/removed, excluded, partial and blocked consistently with the inventory tree.
9. Download. In the ZIP, every remaining `S_HYPERLINK` target exists in the ZIP, no excluded photo is present, the GML feature count matches, and the TXT report matches Kontroll.
10. Byte-compare the delivered GMI with the original: only the intended `S_HYPERLINK` cells (and any Rettinger field edits) differ. Encoding, line endings and geometry are unchanged. The original files on disk are unchanged.
11. Restore every exclusion and rebuild with no transfers: the GMI is byte-identical to the original (Kun GMI with no field edits, or combined with no decisions).
12. Reload or replace the GMI source while exclusions exist: the decisions become «Krever gjennomgang» and delivery blocks.
13. A cell M7 cannot rewrite (multi-link wrapper, if one exists in the corpus): delivery is blocked with a per-occurrence explanation, and «Behold i GMI» resolves it.
14. Kun GMI / Kun GML with exclusions present: the D3 note is shown, and output follows the chosen policy.
15. Open the delivered package in Gemini VA (G4): links resolve, and empty and renumbered `S_HYPERLINK` cells are accepted. This is manual recipient acceptance; automation cannot replace it.
16. Keyboard-only pass of the selection mode and inspector radiogroup; layout at 1280×720 and 1366×768.

---

## Commands run

- `git rev-parse --abbrev-ref HEAD` → `feature/photo-workspace`; `git rev-parse --short HEAD` → `a50eb62`; `git status --short` → one unrelated untracked report.
- Read-only inspection (`cat`, `sed`, `grep`, `wc`) of the files cited above.
- No tests, lint, build or browser runs (planning only).

## Git status / publication

This report is the only new file. Nothing was staged, committed, pushed or deployed. The unrelated untracked report `20261113-182754-rettinger-roadmap-reconciliation.md` was left untouched.
