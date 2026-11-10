# Rettinger: integrated workspace, UX and architecture planning

Date: 2026-11-10, Europe/Oslo. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, HEAD **`6bcb572`**.

Type: **planning only**. No application code, tests or styling were changed. Nothing was committed or pushed.

**Starting state.** The local checkout started at `4707f22`, 34 commits behind `origin/feature/photo-workspace`. The working tree was clean, so it was fast-forwarded (`git merge --ff-only`) to the expected `6bcb572` before any investigation. The M0–M8 work exists only in those commits. No local changes were involved.

Evidence gathered:
- code reading of the files cited below;
- the existing GMI-edit node suites;
- the five Rettinger production-browser suites;
- a scratch reproduction and a layout probe, both driven through the real UI of a production build (`next start`). The scripts live outside the repository, in the session scratchpad.

---

## 1. Executive recommendation

1. **Replace the Masseendringer modal with selection in the Data Table and batch editing in the right-hand inspector.** Keep only the existing *compact* confirmation dialogs (risk approval and draft discard). This is option **C, weighted heavily toward B**. The modal's selection, exclusion and inspection tables duplicate what the table, map and inspector already do, and they stop the user from using either while open. The engine behind the modal (`gmiEditBatchView.mjs` → M2 eligibility and `createGmiBatchCorrection`) is reusable unchanged.
2. **Do not reuse `LayerPanel` wholesale in Rettinger.** Extract its `LayerTemaSection` and `LayerFeltSection` (already self-contained functions, `src/components/LayerPanel.js:420`, `:940`) and mount them in a Rettinger **Filter** tab. The layer card around them carries remove-layer, analysis, topplok, FOTO and Rettinger-entry actions, which are irrelevant or unsafe inside an editing workspace.
3. **Validator findings should create explicit *selections*, not live filters.** A finding-based filter computed on a Validator run goes stale as soon as a ChangeSet is staged. A one-shot «Velg N objekter med funnet» is exact, auditable and cannot drift. M5C already works this way (exact targets).
4. **Use a deliberate «Rediger valgte (N)» action, not an automatic switch to batch mode.** An automatic switch would fight the existing draft guard (each checkbox click could raise «Forkaste endringer i skjemaet?»). It would also blur the line between *selecting* and *editing*.
5. **One new piece of state only: a key-based selection.** Store it per layer as `scope:sourceIndex` keys, the identity already shared by the table (`__index`), map feature ids, M2 cells and Validator ObjectRefs. Compute *visible* rows with the same pure function the table uses, so «select all visible» cannot drift from what is displayed.
6. **Fix table geometry stability first.** The reported Punkter/Ledninger switch is **still reproducible** (§3). In an integrated workflow it would swap the table's geometry under an active selection or batch preview. It is a small, independent prerequisite.
7. **Sequence.** Finish the M5B/M5C manual acceptance before touching the batch path. Meanwhile, the table-stability fix and the pure refactors (R1–R2) can proceed safely (§9).

Rejected alternative: inline spreadsheet editing in the Data Table (option D, considered and rejected in §5). The table renders *parsed* values (`11.0` shows as `11`, M4 limitation 4) and has no lexeme semantics. It would bypass the review → ChangeSet discipline.

---

## 2. Findings: the current implementation (code is authoritative)

### 2.1 Layout (`src/app/page.js`, `src/components/WorkspaceShell.js`)

The shell has three regions:
- **Left:** a fixed-width column. It holds the Rettinger workspace (330 px) or the ordinary `Sidebar`/`FieldValidationSidebar` (`page.js:903–931`). In Rettinger, the whole `Sidebar` (and therefore every `LayerPanel`) is **unmounted**.
- **Main:** split **62 % / 38 %** when the bottom dock is open (`WorkspaceShell.js:24,30`). The split is fixed: there is no splitter and no maximise control.
- **Right inspector:** `<aside class="gmi-edit-inspector">` sits *inside the top 62 % section*, beside the map (`page.js:1065`). It is `clamp(380px, 32vw, 600px)` wide (`gmiEdit.css:86`). The Data Table spans beneath map and inspector together.

Measured in the production build (Rettinger open, Ledning 1 selected, table open):

| Viewport | Map (w×h) | Inspector (w×h, content height) | Data Table (w×h) | Visible table rows |
|---|---|---|---|---|
| 1920×1080 | 990×670 | 600×670 (fits) | 1590×410 | 11 |
| 1366×768 | 599×476 | 437×476 (605 → scrolls) | 1036×292 | 7 |
| 1280×720 | 540×446 | 410×446 (635 → scrolls) | 950×274 | 6 |

No horizontal page overflow at any size. At laptop sizes the table shows **6–7 rows**. Any design that moves per-object batch review into the table needs a way to give the table more height (§8).

### 2.2 Base LayerPanel filtering (`src/components/LayerPanel.js`, `src/lib/store.js`)

- **State lives on the layer object**, not in UI state:
  - `layers[id].hiddenCodes` (Tema/S_FCODE);
  - `hiddenTypes` (`{type, code}`);
  - `feltHiddenValues` (`{fieldName, value, objectType}`).

  Actions: `toggleLayerHiddenCode` / `toggleLayerHiddenType` / `toggleLayerFeltHiddenValue` / `resetLayerFilters` (`store.js:2424–2573`).
- **Filtering is hide-based and toggle-only.** To show only one value, the user must *Skjul alle* and then re-enable that value. The intermediate state hides *every* object of that geometry (§3).
- **`hiddenCodes` is not geometry-specific.** The Tema section lists point and line codes separately, but hiding a code hides it in both geometries.
- **Felt counts** are computed from `layer.data` (the original), per geometry (`LayerPanel.js:956–1037`).
- **The Felt section has its own local `tab` state** (`useState('punkter')`, `LayerPanel.js:947`). It is unrelated to the Data Table's geometry tab: opening Felt always shows *Punkter (n)* first, even when the table shows Ledninger.
- **Rettinger does not mount LayerPanel**, so filters cannot be changed inside Rettinger. Filters set *before* entering Rettinger still apply to the table, which can only clear them (*Nullstill*).

### 2.3 Data Table (`src/components/LayerDataTable.js`)

- **Geometry tab:** `ui.layerDataTable.activeTabByLayer[layerId]`. The default is **`'punkter'`** when absent (`:234–238`). Layer ids are random per import (`store.js:2013`), so every newly loaded layer starts on Punkter, even though `ui` is persisted.
- **Row identity:** `__index` = parser source index (`:355–366`); `getRowId = layerId:tab:__index` (`:659`). M3 verifies `layer.data` ↔ document parity by count, id and GUID, and the proposed dataset keeps the same indices. Identity is therefore stable across Original/Foreslått and across ChangeSets.
- **Filters** apply inside the component (`isItemHidden`, `:251–299`). They read the *rows being displayed*, so in Foreslått mode they filter **proposed** values. The auto-switch counts (`visibleCountByTab`, `:303–329`), however, read **original** `layer.data`.
- **Search:** component-local, applied after filters (`:381–384`).
- **Virtualisation:** TanStack `useVirtualizer`, 28 px rows, overscan 10 (`:665–673`). There is **no pagination**.
- **Selection: none.** A row click sets `ui.highlightedFeatureId` and, in Rettinger, emits a one-shot `gmiEditObjectRequest` (`:577–585`). Hover writes `ui.highlightedFeatureIds` and clears it on leave (`:587–597`).
- **The selected Rettinger object is not marked in the table** (verified in a screenshot: Ledning 1 selected, no row state).
- **Accessibility:** rows are `div`s with `onClick`. There is no `role`, `tabIndex` or `aria-selected`, and column headers are sortable `div`s. **The table cannot be operated from the keyboard.** Today the Rettinger *Objekter* list is the only keyboard path to an object.
- **Rettinger modes:** *Original / Foreslått / Kun endrede* (`:739–756`), memoised per published status (`gmiProposedViewForStatus`). Exact/contextual Validator inspections pin geometry via `inspection.geometryScope` and bypass filters.

### 2.4 Map (`src/components/MapInner.js`)

- Feature ids are `ledninger-<layerId>-<idx>` / `punkter-<layerId>-<idx>`, with `idx` the source index (`:1484`, `:1508`). This matches the table and the Rettinger keys (`gmiObjectKey`).
- A feature click opens the ordinary popup. **Map clicks do not select in Rettinger** (M4 limitation 3, still true).
- Styling reacts to `highlightedFeatureId`, `highlightedFeatureIds` (hover), `filteredFeatureIds`, layer filters and the layer-highlight halo (`:1604–1642`, `:1780–1840`). `highlightedFeatureIds` is **owned by table hover** and is cleared on mouse leave, so it cannot carry a persistent selection.

### 2.5 Rettinger left panel (`src/components/gmi-edit/GmiEditWorkspace.js`)

- **Contents:** header and status; *Kontroller endringer* (M5C); *Objekter* / *Endringer (n)* tabs; footer with *Masseendringer*, undo/redo, *Forkast alle* and *Last ned revidert GMI*.
- **`ObjectList` (`:28–73`)** has its own geometry switch, search and «Bare objekter med rettinger», rendered 200 at a time. It reads `layer.data` directly and **ignores the layer's Tema/Felt filters**. The list and the table can therefore show different object sets.
- **List scope:** defaults to `'line'` when lines exist (`:95`). The table defaults to Punkter (§2.3), so **on entry the two disagree** (verified, §3).
- **Switching the list's geometry does not sync the table.** Only *selecting an object* syncs it (`syncObjectTable`, `:139–146`, M5A).
- **Entry:** opens the Data Table automatically if it is closed (`:113`), without setting a tab.
- **Draft guard:** one `guard()` (`:123–133`) covers object and batch drafts and is registered with the page for reset and FOTO navigation.

### 2.6 Right inspector: object editor (`GmiObjectEditor.js`)

- **Single-object flow:** form → review → stage, with exact lexemes, overwrite/replace checkboxes, M5A live diagnostics and *Vis i kartet*. It is portalled into the inspector `aside`.
- **Remount:** a React `key` of `selectedKey:sessionId:formRevision` resets the local form on object change or confirmed discard.

### 2.7 M5B batch modal (`GmiBatchDialog.js`, `src/lib/gmiEditBatchView.mjs`)

**Container.** A native `<dialog>`, `min(1080px, 100vw-32px) × min(690px, 100dvh-40px)` (`gmiEdit.css:125`).

**Steps.**
1. *Velg verdi*: the field, limited to **SDR / Trykklasse / Ringstivhet** (`GMI_BATCH_FIELDS`), the value and fill/overwrite.
2. *Se gjennom og bekreft*:
   - counts;
   - a 50-row paged eligible table with search, the new-FEIL filter, include checkboxes and select all/none;
   - grouped exclusions, each group with its own search, paging and a nested attribute-inspection table;
   - an advanced manual-override switch.

**Approval.** `buildGmiBatchSelection` (memoised M2 build) runs, followed by one of:
- direct staging;
- for manual override, populated overwrite or replacement, a compact `GmiConfirmDialog` risk confirmation.

**Engine boundary.**
- `prepareGmiBatchReview(view, {canonicalFieldId, mode, lexeme, targets?})` already accepts **explicit targets** (used by M5C).
- `buildGmiBatchSelection(session, preview, selectedKeys, replace, createdAt, allowOverride)` takes a **key set**.

Both are UI-agnostic. **They need no change to be driven from a table selection.**

### 2.8 M2 capabilities relevant to a redesign (`src/lib/gmi-edit/session.mjs`, `eligibility.mjs`)

- `evaluateGmiBatchEligibility(session, {canonicalFieldId, mode, targets})` covers the allow-listed hydraulic fields only and is line-only (`RULE_SCOPE = 'line'`). `targets` restricts the scope exactly and never widens it.
- **`createGmiBatchCorrection(session, {field, lexeme, targets})` without `eligibility`** already builds one ChangeSet for *any* editable column and explicit targets. Mode, conflict policy, `S_HYPERLINK` refusal, identity guards and M1 lexeme checks all apply; applicability is not considered.

  This is the existing primitive for a future generic multi-object edit (product decision Q3). **It must never be used for the three allow-listed fields**, or it would bypass M5B applicability.
- `S_HYPERLINK` and its aliases are refused at build, stage and compile time (`changeSet.mjs` header). No UI change can weaken this.

### 2.9 M5C handoff (`ValidationV2Workspace.js:359–363`, `gmiValidatorEditing.mjs`)

1. **Lag retting…** runs `prepareValidatorCorrection`, which yields exact eligible missing targets.
2. `openGmiEditWorkspace(layerId, { ...correction, sessionId })` follows.
3. `GmiEditWorkspace` opens `GmiBatchDialog` seeded with a fixed field and `targets`.

The dialog re-checks layer, session id and document identity before calculating (`GmiBatchDialog.js:61–62`).

### 2.10 FOTO precedent

FOTO already has explicit multi-selection: removal and delivery `…Ids` in `src/lib/photos/photoWorkspaceState.mjs:22–64`. Its rules:
- *filter and sort never change selection*;
- selection exists only inside an explicit mode;
- selections are pruned to existing ids on reconcile.

This is the convention to mirror for GMI objects.

### 2.11 Baseline test status at `6bcb572`

| Run | Result |
|---|---|
| `node --test tests/gmiEdit*.test.mjs tests/gmiValidatorEditing.test.mjs` | 140 tests: **132 pass, 0 fail, 8 skipped** (browser and opt-in corpus) |
| `PHOTO_UI_URL=… node --test` `gmiEditWorkspaceUi`, `gmiEditBatchUi`, `gmiValidatorEditingUi`, `gmiEditValidationUi`, `gmiEditDraftGuardUi` (production build) | 41 tests: **41 pass** |

---

## 3. Punkter/Ledninger filter-reset investigation

**Verdict: 1 and 3. The issue is still reproducible, and it is conditional on a state transition: the active geometry's visible set becomes empty.** It was not fixed. It is deliberate behaviour from commit `8c4134d` («fix(table): auto-switch tab when filters empty active object type», 2026-02-14), still present in `LayerDataTable.js:331–352`. No test covers it (no test references `visibleCountByTab`/`fallbackTab`).

### Mechanism

```js
// LayerDataTable.js:331
if (isExactInspection || !isOpen || !layerId || !hasActiveFilters) return;
if ((visibleCountByTab[activeTab] || 0) > 0) return;
const fallbackTab = activeTab === 'punkter' ? 'ledninger' : 'punkter';
if (visibleCountByTab[fallbackTab] > 0) setLayerDataTableTab(layerId, fallbackTab);
```

The effect writes the *persistent* per-layer tab, and nothing restores it. When filters are relaxed again, the table stays on the fallback geometry.

### Reproduction (production build, 1366×768, synthetic `core-crlf-latin1.gmi`: 3 lines VL/VL/SP, 3 points)

| Step | Table tab | Count text |
|---|---|---|
| 1. Fresh layer, open table from the layer card | **Punkter** | 3 punkter |
| 2. User selects Ledninger | Ledninger | 3 ledninger |
| 3. Open Felt section | Ledninger | the Felt sidebar sub-tab shows **Punkter (7) [active]** |
| 4. Felt → Ledninger → Material → **Skjul alle** | **Punkter** | «3 av 3 (0 skjult)» |
| 5. Material → **Vis alle** | **Punkter** (not restored) | 3 punkter |
| 6. User reselects Ledninger | Ledninger | 3 ledninger |
| 7. Tema → Ledninger → **Skjul alle** | **Punkter** | |
| 8. Tema → Ledninger → **Vis alle** | **Punkter** (not restored) | |
| 9. Ledninger → close table → reopen | Ledninger (kept) | |
| 10. Enter Rettinger with table closed | Ledninger (stored tab kept) | |
| 11. Rettinger list switched to Punkter | Ledninger (**not synced**) | |
| 12. Select Ledning 2 in Rettinger | Ledninger | |
| 13. Leave Rettinger | Ledninger (kept) | |
| A. *Fresh* layer → Rettinger (list scope Ledninger (3)) | **Punkter** (mismatch) | |

No runtime exceptions.

### Per-question answers

| Question | Answer |
|---|---|
| How is the tab stored? | `ui.layerDataTable.activeTabByLayer[layerId]`. It is persisted in `localStorage`, but layer ids are random per import, so a new layer starts on Punkter. |
| What changes it? | The user's tab buttons; the auto-switch effect; Rettinger object selection (`syncObjectTable`, M5A). Exact Validator inspections *display* their own geometry without writing the stored tab. |
| Tema filter changes? | A switch happens if the active geometry's visible count reaches 0 and the other geometry has objects. `hiddenCodes` is layer-wide, so hiding codes in one geometry can also empty the other. |
| Felt/value filter changes? | Same. *Skjul alle* on any line field always empties Ledninger, because every line has *some* value, including `(Mangler)`. «Show only one value» therefore always passes through the switch. |
| Empty visible set? | It switches to the other geometry if that has objects. If both are empty it stays and shows an empty table. It never returns. |
| Switching GMI layers? | Each layer has its own stored tab. A layer never opened before starts on **Punkter**. |
| Base app ↔ Validator ↔ Rettinger? | The stored tab survives. Validator inspections pin their own geometry while open. Entering Rettinger does not set the tab, so the list and table can disagree (step A). Switching the Rettinger list scope does not sync the table (step 11). |

A related perception issue: the Felt sidebar always opens on *Punkter* (step 3), which can look like «Punkter coming back».

### Not attempted, as instructed

No fix. Desired behaviour for the redesign (R1, §9):
- filtering must never write the geometry tab;
- an empty geometry shows an explicit empty state with a one-click «Vis punkter (n)»;
- entering Rettinger and switching its scope keep the list and table in one geometry.

---

## 4. Data Table selection capabilities

| Question | Finding / recommendation |
|---|---|
| Existing multi-selection? | **None.** Only a single `highlightedFeatureId` (also used by the map popup and analysis) and a transient hover set. |
| How much to add? | Moderate: a checkbox column (Rettinger only), a header «select visible» control, a selection bar, row selected/focused styling, keyboard operation, and a pure selection reducer plus store slice. No TanStack row-selection feature is needed. Selection is keys, not DOM. |
| Virtualisation / pagination | No pagination exists. Virtualisation is irrelevant to key-based selection. Checkbox state is derived from `selection.has(key)` per rendered row. Shift-range uses the current *sorted, filtered, searched* row array (`table.getRowModel().rows`), not DOM order. |
| «Select all filtered» across thousands | Map the row-model array to keys: O(n), well under a millisecond for 10⁴ rows. It must be an **explicit, counted action**: «Velg alle 1 234 synlige ledninger». It adds those keys (union) and never silently tracks later filter changes. |
| Selection when filters change | **Selection is unchanged.** Filters affect visibility only (the FOTO rule). The bar shows «12 valgt · 3 skjult av filter/søk». «Vis bare valgte» turns the table into a review of exactly the selection, bypassing filters and search, like exact inspections. |
| Hidden selections | Always counted in the selection bar and the batch summary. The batch operates on the **selection**, not the visible set; the summary repeats «inkluderer 3 objekter som er skjult av filter». |
| Map highlighting | Needs a **new persistent channel** (e.g. `selectedFeatureIds`) with its own style (teal halo or outline, reusing the layer-highlight halo technique). It cannot be `highlightedFeatureIds`, which hover owns. The style key must include a selection *version*, not just its size. |
| Original/Foreslått switch | Keys are identical in both datasets (same source indices; M1 forbids structural edits). The selection survives unchanged. Visibility may differ, because filters read displayed values, and is reported through the hidden count. |
| Stability through ChangeSets | Keys are `scope:sourceIndex`, bound to the session's **document fingerprint and lineage**. Stage, undo, redo and discard keep them valid. Source replacement or invalidation, layer removal, reset or a read-only document **clears** the selection. Pruning reuses the registry's existing invalidation (status `invalidated`), with no second source manager. |
| Avoiding parallel state | The selection is the only new state. *Visible* rows come from one pure function, extracted from `LayerDataTable` (filter + view + search). Eligibility, manual inclusion and actual changes remain M2 outputs. Nothing caches «visible» or «eligible» copies. |

---

## 5. UX alternatives compared

| | A. Keep and improve the modal | **B/C. Integrated selection + inspector batch (recommended), compact dialogs only for risk** | D. Inline spreadsheet editing |
|---|---|---|---|
| Duplicate object tables | Remains (modal table, exclusion groups, nested inspection) | Removed; the Data Table is the only object table | Removed |
| Map / table while editing | Blocked by the modal | Available; selection is visible on both | Available |
| Screen use at 1280×720 | Modal covers 1080×690 over everything | Inspector 410 px + table (needs a height toggle) | Table only |
| Reuse of engine | Full | Full (`prepareGmiBatchReview`, `buildGmiBatchSelection` unchanged) | Poor: per-cell edits bypass review/ChangeSet batching |
| Exact lexemes | Yes | Yes, in the inspector and preview columns rendered with `Lexeme` | No: the table shows parsed values |
| Risk confirmation | Compact dialog | Same compact dialog (`GmiConfirmDialog`) | Unclear |
| Implementation risk | Low | Medium; staged in small slices with the modal kept as a fallback until parity | High |
| Discoverability | «Masseendringer» button | Checkbox column, selection bar, «Rediger valgte (N)», Validator handoff | High, but error-prone |

**Recommendation: B with the C element.**
- Keep `GmiConfirmDialog` for manual override, populated overwrite and conflict replacement, and for draft discard. These are short, focused decisions where a modal is correct.
- Retire the modal's configure/select/exclusion surface.
- Do **not** spend effort on the modal's checkbox accent, row centring, pagination or terminology polish. The few explanation strings worth keeping (e.g. replacing `pipeShape`/`positioningCause` with Norwegian labels) belong to `describeGmiBatchApplicability` and the diagnostics text, and carry over to the new surface. Fix them there when R4 is built.

---

## 6. Recommended workspace architecture

```
┌──────────── 330 px ─────────────┬──────────────── map ───────────────┬──── inspector clamp(380,32vw,600) ────┐
│ RETTINGER · layer · status      │                                    │ [Objekt]  or  [Masseendring · N]      │
│ Kontroller endringer (M5C)      │   selected objects: teal halo      │                                       │
│ [Filter] [Endringer (n)]        │   focused object: existing         │ Objekt: existing GmiObjectEditor      │
│  Filter tab:                    │   highlight                        │ Masseendring:                         │
│   · Tema (extracted section)    │   click (Rettinger) = focus object │  Felt · Ny verdi · Fyll/Overskriv     │
│   · Felt (extracted section)    │                                    │  [Beregn]                             │
│   · Validator: «Velg N objekter │                                    │  Valgt 40 · Kvalifisert 31 · Manuelt 2│
│     med funnet» (explicit)      │                                    │  Endres 29 · Uendret 2 · Hoppes 9     │
│   basis: Original | Foreslått   │                                    │  Overskriver 0 · Nye FEIL 3           │
│                                 │                                    │  ☐ Avansert (manuelt utvalg)          │
│                                 │                                    │  [Legg til masseendring]              │
├─────────────────────────────────┼────────────────────────────────────┴───────────────────────────────────────┤
│ Masseendringer → removed        │ Datatabell  Punkter|Ledninger  Original|Foreslått|Kun endrede  🔍            │
│ ↶ ↷  Forkast alle               │ ▸ 40 valgt · 3 skjult av filter · [Vis bare valgte] [Fjern utvalg]        │
│ [Last ned revidert GMI]         │   [Rediger valgte (40)]                     [⇕ Større tabell]             │
│                                 │ ☐ | 🔍 | S_FCODE | Tema | … | (batch preview: Status | Nå → Ny | Funn)     │
└─────────────────────────────────┴───────────────────────────────────────────────────────────────────────────┘
```

**Component ownership.**

| Concern | Owner (existing ⇢ proposed) |
|---|---|
| Source bytes, ChangeSets, undo/redo, export | M1/M2/M3 registry (`gmiEditSessions`), **unchanged** |
| Filters | Layer filter state (existing), edited from extracted Tema/Felt sections in Rettinger |
| Visible rows | ⇢ new pure `layerTableRows(...)` extracted from `LayerDataTable`, used by the table, the selection bar and «select visible» |
| Selection | ⇢ new store slice `gmiEditSelection[layerId]` plus a pure reducer module (mirrors `photoWorkspaceState`) |
| Focused object | Existing `selected` in `GmiEditWorkspace` (row click or `gmiEditObjectRequest`) |
| Batch preview | Inspector batch component, local state bound to `session` + selection snapshot (as `GmiBatchDialog` today) |
| Map selection style | ⇢ new `selectedFeatureIds` channel in `MapInner` style |
| Risk confirmation | Existing `GmiConfirmDialog` |

**Distinct sets, each with its own label and count.** These must never be merged:

| Set | Source | Shown as |
|---|---|---|
| Synlige | filters + view + search (pure function) | table count «N av M» |
| Valgt | selection keys | selection bar, inspector |
| Skjult valgt | Valgt − Synlige | «3 skjult av filter» |
| Kvalifisert | M2 `eligibility.eligible` restricted to Valgt | inspector summary |
| Hoppes over (per reason) | M2 `eligibility.skipped` | inspector summary + table status column |
| Manuelt inkludert | `manualKeys` ⊆ skipped and overridable (`canManuallySelectGmiBatchRow`) | separate column, advanced only |
| Endres | `planned.changeSet.cells` (actual M2 result) | «Endres 29» and the history label |
| Uendret (already the new value) | `planned.unchanged` | «Uendret 2» |

---

## 7. Proposed interactions

### 7.1 Single object (behaviour preserved)

- **Focusing an object:** row click, map click (new, Rettinger only) or an Endringer link focuses one object. The inspector shows `GmiObjectEditor` exactly as now, behind the same draft guard. The table and the map mark the focused row and feature.
- **Checkbox clicks never change the focused object** and never prompt the draft guard.

### 7.2 Selecting

- **Row checkbox:** toggles one object. Shift-click selects a range over the current row order. Space toggles the focused row (keyboard).
- **Header checkbox:** «Velg alle synlige (N)» adds the visible keys. With a partial selection it shows the mixed state, and «Fjern utvalg» clears it.
- **One geometry per selection.** Batch fields are line-only today, and mixed batches are meaningless for them. Checking an object of the other geometry asks «Erstatt utvalget med punkter?». It never mixes silently.
- **Filtering, search, Original/Foreslått, sorting and tab switches never change the selection.** Their effect on visibility is reported, not applied.

### 7.3 Batch editing

1. **Enter batch mode.** «Rediger valgte (N)» in the selection bar (and the inspector empty state) switches the inspector to *Masseendring*, after the existing guard if an object draft exists. «Tilbake til objekt» returns. The selection persists.
2. **Configure.** The field is limited to the allow-list (Q3 decides whether to widen it); then the value (M1 lexeme validation inline) and *Fyll manglende / Overskriv*. «Beregn» calls `prepareGmiBatchReview(view, { canonicalFieldId, mode, lexeme, targets: selectionTargets })`: the same chunked, cancellable, session-bound helper.
3. **Review.**
   - The inspector shows the counts from §6 and grouped skip reasons, collapsed with counts only.
   - The table adds pinned preview columns while a preview is live: *Status* (Endres / Uendret / Hoppes over: årsak), *Nå → Ny* as lexemes, and *Nye funn* (severity icons, M5A tooltips).
   - «Vis bare valgte» turns on automatically and can be turned off.
   - Per-object inspection happens by focusing the row: the inspector shows that object read-only inside batch mode, with a «Tilbake til masseendring» link, or a small «Objektdetaljer» disclosure. This replaces the modal's nested attribute table.
4. **Exclusion = unchecking.** This *shrinks* the selection. The preview remains valid because a subset never needs new eligibility. `buildGmiBatchSelection` is rebuilt from the memoised preview, as in M5B.
5. **Widening invalidates.** Adding any object to the selection marks the preview **stale** («Utvalget er utvidet – beregn på nytt»), mirroring the session-staleness rule.
6. **Advanced override.** «Avansert: tillat manuelt utvalg utenfor Validatorens anbefaling» is off by default and selects nothing. It reveals a per-row «Ta med manuelt» control in the Status column, only for rows where `canManuallySelectGmiBatchRow` is true. Manual inclusion is its own set and never reuses the selection checkbox.
7. **Approve.** «Legg til masseendring» (teal, inspector footer) runs one of two paths:
   - direct staging via `gmiEditSessions.stage`;
   - for manual override, populated overwrite or replacement, the existing compact risk `GmiConfirmDialog` first.

   After staging: the notice «Lagt til: …», the Endringer tab highlights the new ChangeSet, the preview clears, and **the selection is kept**, so the user can verify in Foreslått or undo.
8. **Stale protection** is unchanged: any stage, undo, redo, discard or source change produces a new session object, which invalidates the preview (existing `stale` logic).

### 7.4 Validator handoff (M5C) into the redesign

- **Lag retting…** keeps `prepareValidatorCorrection` and the identity checks. Instead of opening the modal, Rettinger:
  1. sets the selection to **exactly** `correction.targets` (line scope), with `origin: { kind: 'validator', ruleId, targets, sessionId, fingerprint }`;
  2. switches the table to Ledninger with «Vis bare valgte» on;
  3. opens the inspector in batch mode with the field fixed and the value **empty**.

  Nothing is calculated until the user types a value and presses *Beregn*.
- **Never widened.** While the origin is `validator`, the selection may shrink but not grow: adding is refused with a message, and the header shows «Fra Validator: 12 eksakte objekter». Leaving this origin requires «Gjør om til vanlig utvalg» (Q8). The existing layer, session and document checks (`GmiBatchDialog.js:61–62`) move into the inspector batch component unchanged.
- **FOTO:** no change. The `S_HYPERLINK` restriction is untouched (engine-enforced, and the field never appears in the batch field list).

### 7.5 Left panel

- **Tabs:** *Filter* | *Endringer (n)*. The *Objekter* list is removed only after the table is keyboard-operable (R2) and selection exists (R3); before that it stays.
- **Filter tab:**
  - the extracted Tema and Felt sections, with the Felt sub-tab following the table geometry;
  - a basis note: «Filtrert på: Original | Foreslått», following the table view, with Felt counts computed on the same basis;
  - a *Validator* group listing rules with object counts from the last cached run. Each entry offers «Velg N objekter» (replace or add). These are explicit selections, recorded as `origin: 'validator-filter'`.
- **Unchanged:** the footer keeps undo/redo, *Forkast alle* and download; *Masseendringer* is replaced by «Rediger valgte (N)» in the selection bar.

---

## 8. State ownership, identity and lifecycle risks

| Risk | Mitigation |
|---|---|
| Selection outlives its source (file replaced) | Bind to `{layerId, sessionId/lineage, document.fingerprint}`. Clear on registry `invalidated`, `removeLayer`, `resetAll`, read-only. Mirror the `gmiEditWorkspace` cleanup in `store.js` and test it alongside the M4 lifecycle tests. |
| «Visible» in the selection bar ≠ table rows | One pure row function used by both. A unit test proves parity across filters, search, view mode and inspections. |
| Hidden selected objects edited unknowingly | A permanent «skjult» count, repeated in the batch summary; «Vis bare valgte» is auto-on in batch preview. |
| A filter or view change during preview alters what the user reviews | The preview binds to *selection keys*, not visibility. Visibility changes only change which preview rows are displayed. |
| Allow-listed field edited via the explicit-targets path | The UI routes the three hydraulic fields only through `evaluateGmiBatchEligibility({targets})`. A source-contract test asserts that the inspector batch never calls `createGmiBatchCorrection` with `targets` for those fields. |
| Validator scope silently widened | Origin lock (subset-only), with tests that select-all, the header checkbox and «Velg N objekter» are refused or convert only explicitly. |
| Auto-switch flips geometry mid-batch | R1 removes filter-driven tab writes before R3. |
| Draft guard noise | Checkbox interaction never calls `guard()`. Only focus changes and the batch/object mode switch do. |
| Map hover/selection conflicts | A separate `selectedFeatureIds` channel; hover keeps `highlightedFeatureIds`. |
| Performance | Selection ops are O(n) on keys. The map style key uses a selection version counter. Preview diagnostics keep the 20-object chunks with yield and cancel. The first eligibility run remains synchronous (M5B limitation). Selection sizes are bounded by the dataset. |
| React Compiler crashes (M4 note 5) | New Rettinger components follow the existing `'use no memo'` + explicit memo pattern. |
| Persistence | Selection is in-memory, like sessions, and excluded from `partialize`. |

**Scope of the editing engine (unchanged by every milestone below):**
- M1 immutable source and byte patches;
- M2 ChangeSet construction and conflict semantics;
- undo/redo/discard;
- M3 session identity and export guards;
- M5A diagnostics;
- M5B eligibility, manual-override token rules and the `canManuallySelectGmiBatchRow` gate;
- M5C exact targets;
- the Original/Foreslått semantics;
- the *Eksperimentell* export.

---

## 9. Incremental milestones

Each slice is independently testable and revertable. The engine is untouched throughout.

| # | Scope | Components / modules | State changes | Reuse | Risks | Tests | Browser acceptance | Depends on | Can start before M5B/M5C acceptance? |
|---|---|---|---|---|---|---|---|---|---|
| **R1** Table geometry stability | Remove filter-driven tab writes; add an explicit empty state with «Vis punkter (n)»; set the table tab on Rettinger entry and on list-scope change; Felt sub-tab follows the table geometry (optional) | `LayerDataTable.js`, `GmiEditWorkspace.js` (`:95`, `:113`, `onScope`), `LayerPanel.js:947` | None new | Existing `setLayerDataTableTab` | Users relying on auto-switch; contextual inspections unaffected | Node: pure decision helper. Browser: §3 steps 4–8, A and 11 now keep the user's geometry | Repeat the §3 script; Ledninger survives Skjul alle/Vis alle; fresh-layer Rettinger list and table agree | — | **Yes**; base-app scoped |
| **R2** Row derivation + accessible rows | Extract filter + view + search into a pure module; rows focusable (`role="row"`/grid or row buttons), `aria-selected` for the focused object, keyboard Enter = focus | `LayerDataTable.js`, new `src/lib/layerTableRows.mjs` | None | `filterTableSearchRows`, `isItemHidden` logic moved, not rewritten | Behavioural drift in the refactor | Node parity tests (filters × view × search × inspection); existing `tableSearch`/`objectTableInspection` suites | Keyboard-only object focus in Rettinger; table counts unchanged | R1 | **Yes** (pure refactor plus a11y) |
| **R3** Selection model | Selection reducer + store slice; checkbox column (Rettinger only, `accent-color: var(--gmi-interactive)`); selection bar (counts, hidden count, Vis bare valgte, Fjern utvalg); map `selectedFeatureIds` style; lifecycle cleanup | new `src/lib/gmiEditSelection.mjs`, `store.js`, `LayerDataTable.js`, `MapInner.js`, `GmiEditWorkspace.js` | `gmiEditSelection[layerId]` | FOTO selection convention; layer-highlight halo technique | Map style performance; draft-guard interplay | Node: reducer (toggle/range/union/shrink/scope swap/prune/invalidate), store cleanup on remove/reset/invalidated; source contract that filters never touch selection. Browser: selection survives filter, search, Original/Foreslått and stage/undo; cleared on source replacement | 1366×768: select 3, filter one away → «1 skjult»; Vis bare valgte; map halo; leave/re-enter behaviour per Q5 | R2 | **Better after** acceptance (touches Rettinger UI), but nothing in editing changes |
| **R4** Inspector batch mode | «Rediger valgte (N)»; configure/compute/summary in the inspector; preview columns in the table; shrink-valid / widen-stale; advanced manual inclusion column; risk dialogs reused; table height toggle (62/38 ↔ 35/65) | new `GmiBatchInspector.js` (logic lifted from `GmiBatchDialog.js`), `LayerDataTable.js` (preview columns), `WorkspaceShell.js` (dock ratio prop), `gmiEdit.css` | Local preview state; dock ratio UI state | `prepareGmiBatchReview`, `buildGmiBatchSelection`, `initialGmiBatchSelection` semantics, `GmiConfirmDialog`, `Warnings`, `Lexeme` | Parity gaps vs M5B; inspector width at 1280 (410 px) | Port all `gmiEditBatch.test.mjs` cases to the new orchestration (same helper); new tests: shrink keeps preview, widen stales, manual set distinct from selection, counts per set. **Keep the modal reachable** for side-by-side parity | The M5B manual checklist (§ «Recommended acceptance» in the M5B refinement report) executed through the new surface at all three sizes | R3; **M5B manual acceptance complete** | **No** |
| **R5** Validator handoff | Lag retting… → exact selection + batch inspector, origin lock (subset-only), empty value | `GmiEditWorkspace.js`, store `openGmiEditWorkspace`, `ValidationV2Workspace.js` (unchanged call) | `origin` on selection | `prepareValidatorCorrection`, existing identity checks | Accidental widening | Port `gmiValidatorEditing*` handoff cases; refusal tests for every widening path | M5C checklist steps 2–3 through the new surface | R4; **M5C manual acceptance complete** | **No** |
| **R6** Left panel restructure | *Filter* tab with extracted Tema/Felt (basis follows table view); Validator «Velg N objekter»; remove `ObjectList` | `LayerPanel.js` (export the sections; data/basis props), `GmiEditWorkspace.js` | None new (layer filters reused) | `LayerTemaSection`, `LayerFeltSection`, cached `validateGmiDataset` runs | Base-app LayerPanel regressions; shared filter state (Q7) | Existing LayerPanel/styling contracts; new: sections render identically in both hosts; Validator selection is exact and dated | Filter then select visible then batch, all inside Rettinger, at 1280×720 | R3 (R4 for the full flow) | Partly (extraction yes; removal of ObjectList after R2+R3) |
| **R7** Retire modal | Delete the configure/select/exclusion modal UI; keep risk and discard dialogs; update tests and docs | `GmiBatchDialog.js` (removed or reduced), tests | — | — | Loss of a fallback | Full gmiEdit/Validator/FOTO production regression | Full Rettinger acceptance | R4, R5 accepted | No |
| **R8** Optional | Map click focus/toggle in Rettinger; dock splitter; generic multi-object edit for non-allow-listed fields via explicit targets (if Q3 = yes) with M5A advisory diagnostics; polish | `MapInner.js`, `WorkspaceShell.js`, inspector batch | — | `createGmiBatchCorrection({targets})` | Q3 safety semantics | Per feature | Per feature | R4 | No |

**Essential:** R1–R5 and R7. **R6** is essential for the «filter → select → edit» workflow, but its Validator group is optional. **Optional / polish:** R8.

**Rollback points:**
- R1 and R2 are standalone.
- R3 adds UI without changing editing.
- R4 runs in parallel with the modal until R7.
- R5 can be reverted to modal seeding by reverting the handoff commit alone.

**Avoid until M5B/M5C manual acceptance is complete:** R4, R5 and R7, which touch the batch and handoff flows under acceptance. Also avoid any change to `gmiEditBatchView.mjs`, M2 or the modal itself; acceptance should test the code that exists.

---

## 10. Test and browser acceptance plan

**Unchanged regression gate.** Every slice must pass:
- `node --test tests/gmiEdit*.test.mjs tests/gmiValidatorEditing.test.mjs` (132 pass, 8 skipped);
- the production-browser set `gmiEditWorkspaceUi`, `gmiEditBatchUi`, `gmiValidatorEditingUi`, `gmiEditValidationUi`, `gmiEditDraftGuardUi` (41 pass);
- the FOTO browser regressions listed in the M5C report;
- the full serial suite, with only the known seven baseline failures.

**New automated coverage:**
1. **Geometry stability (R1):** a browser test encoding §3 steps 1–13 and A, asserting the stored tab changes only on explicit user or selection actions.
2. **Row derivation parity (R2):** node tests comparing the extracted function with the expected row sets for Tema, Type, Felt, search, *Kun endrede*, Foreslått and exact inspection.
3. **Selection reducer (R3):** toggle, shift range, union-visible, shrink, scope replacement prompt, prune on invalidation, never-mutated-by-filter (source contract plus behaviour), survives stage/undo/redo and Original/Foreslått, cleared on remove, reset and source replacement.
4. **Set separation (R4):** a fixture where *visible ≠ selected ≠ eligible ≠ manual ≠ changed*, asserting each count independently and in the history label.
5. **Preview validity (R4):** shrink keeps the preview; widen, stage, undo and source change each make it stale; approval from a stale preview is impossible.
6. **Engine routing (R4):** the hydraulic fields always go through eligibility; `S_HYPERLINK` never appears; manual inclusion requires the advanced flag plus `canManuallySelectGmiBatchRow`.
7. **Validator origin lock (R5):** every widening path is refused; the value starts empty; nothing is staged without review.
8. **Accessibility:** keyboard-only path through focus, select, Rediger valgte, configure, Beregn and Legg til; native checkboxes with accessible names; `aria-live` on counts.
9. **Layout:** at 1920×1080, 1366×768 and 1280×720, with the inspector in both modes and the table in both heights:
   - no page overflow;
   - footer actions visible;
   - at least 10 table rows in batch-review height at 1280×720.

**Manual browser acceptance (after R5):**
1. Load a real GMI and enter Rettinger. The list/table geometry agrees.
2. Filter Felt to one Material using Skjul alle and one value. The table stays on Ledninger.
3. Select all visible, then relax the filter. The selection count is unchanged, and the hidden count is correct.
4. Rediger valgte → SDR 11 → Beregn. Compare *Valgt / Kvalifisert / Hoppes over / Endres* with expectations. Exclude two by unchecking: the counts update without recompute. Add one: the preview is stale.
5. Advanced: manually include an inapplicable pipe. Read the risk dialog and approve. Check Endringer shows *Manuelt overstyrt*.
6. Foreslått: verify the changed cells and that the selection persists. Undo/redo: the preview is cleared and the selection persists.
7. Validator → Lag retting…: an exact scope, an empty value, and select-all cannot widen it.
8. Replace the source file: the selection and preview are cleared with a message.
9. Export and verify bytes as in M4 §12. FOTO workflows are unchanged.
10. Repeat at 1366×768 and 1280×720, keyboard only for one full pass.

---

## 11. Open product decisions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Replace auto-switch with an explicit empty state, or remember and restore the user's tab? | Empty state with «Vis punkter (n)». Filtering never writes the tab. |
| Q2 | Inspector: automatic batch mode on ≥2 selected, or deliberate «Rediger valgte (N)»? | Deliberate. |
| Q3 | Batch editing beyond SDR/Trykklasse/Ringstivhet (e.g. Material, Merknad, Stedfestingsårsak) via M2's explicit-targets path, with advisory M5A diagnostics only? | Defer to R8; keep the allow-list for R4. |
| Q4 | Allow mixed point+line selections? | No: one geometry per selection. |
| Q5 | Keep the selection when leaving and re-entering Rettinger? | Clear on exit (staged ChangeSets persist as today). |
| Q6 | May the Data Table be closed in Rettinger once the Objekter list is gone? | Keep it open in Rettinger; offer «større/mindre tabell» instead of close. |
| Q7 | Should Tema/Felt filters set in Rettinger be shared with the base app (layer state) or Rettinger-local? | Shared, because the same layer means the same filters. Show them clearly on return. |
| Q8 | May a Validator-origin selection be converted into an ordinary, widenable selection? | Yes, only through an explicit «Gjør om til vanlig utvalg». |
| Q9 | Filter basis in Foreslått mode: proposed values (current table behaviour) or always original? | Follow the table view, and label the basis. |
| Q10 | In Rettinger, should a map click focus the object (and Ctrl-click toggle selection) instead of opening the popup? | Focus on click; keep the popup reachable via the inspector's *Vis i kartet*. |
| Q11 | Should the selection be kept after a successful batch stage? | Yes (verify/undo), with «Fjern utvalg» one click away. |

---

## Appendix: commands and artefacts

- Sync: `git fetch origin && git merge --ff-only origin/feature/photo-workspace` → `6bcb572`. Working tree clean before and after.
- Build: `npm run build`, success. Served with `node node_modules/next/dist/bin/next start -p 3123`; stopped afterwards.
- Reproduction and layout scripts: session scratchpad only (`tabRepro.mjs`, `tabRepro2.mjs`, `layout.mjs`), using `tests/helpers/chromeHarness.mjs` and the synthetic fixture `tests/fixtures/gmi-edit/core-crlf-latin1.gmi`. No repository files were added except this report.
