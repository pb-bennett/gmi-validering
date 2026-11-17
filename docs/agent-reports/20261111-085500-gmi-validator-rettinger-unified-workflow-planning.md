# Validator → Rettinger: unified selection, batch safety, value lists and UX refinements — planning

Date: 2026-11-11, Europe/Oslo. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`.

Type: **architecture investigation and implementation planning only.** No application code, test or style was changed. Nothing was committed or pushed. The only file added is this report.

## 0. Verified starting state

| Check | Result |
| --- | --- |
| Branch | `feature/photo-workspace` |
| HEAD | `13a44a2` «refactor(rettinger): simplify sidebar navigation» — equals the confirmed deployed commit |
| Remote | `git fetch origin` done; local and `origin/feature/photo-workspace` are identical (0 ahead, 0 behind) |
| Working tree | Clean before and after (apart from this report) |
| Line endings | `core.autocrlf=true`: index LF, working tree **CRLF**. This matters for one test (§10) |

Evidence used: the four requested reports, a full read of the source files cited below, and one run of the relevant Node gate (§10). No production build or browser suite was run in this pass.

---

## 1. Executive summary

1. **Keep one selection model.** The existing `gmiEditSelection` slot, `reduceGmiEditSelection` reducer, `scope:sourceIndex` keys and the `{layerId, sessionId, fingerprint}` binding are sufficient for the Validator as well. The only structural addition is a **host** (who is displaying the selection): `rettinger` or one Validator field inspection.
2. **The Validator's contextual Data Table gets the same checkbox column and selection bar**, with one primary action: «Åpne i Rettinger (N)». The handoff reuses the R5 identity verification, generalised to both geometries and without any field or eligibility.
3. **Selecting is not permission to edit.** The handoff carries objects only. One object opens the individual editor; several open the batch inspector with **no field and no value chosen**. Field permission stays where it is today: `gmiEditFieldPolicy` per cell, and M2 eligibility for SDR/Trykklasse/Ringstivhet.
4. **The R5 shrink-only lock should be retired** once the new handoff is accepted. It protected a machine-computed target list with a fixed field. A selection the user ticked is theirs; it keeps an informational provenance label instead.
5. **Batch safety needs three additions in the inspector**: a profile of the selected objects with one-click narrowing, an explicit confirmation when the selection is mixed or the preview introduces new FEIL, and no default field. A fourth addition, a step-through mode («Rett én og én»), gives multi-object selections a safe path when one value does not fit all, and is the only useful path for point selections today.
6. **Allowed values already exist as data** in `VALIDATION_RULES[].allowedValues`, with meanings in the authoritative value tables. A small pure module can expose them to Rettinger with no new code lists. Recommended («gir Pass») values are *not* data — they are inline in `fieldPolicy.js` and depend on Tema — so Rettinger must take verdicts from the Validator's evaluation, never from its own list check.
7. **The thirteen UX findings split into ten small slices**; most are independent and can start immediately.

A finding that shapes the plan: **the batch inspector is line-only and limited to three fields** (`gmiSelectionTargets`, `src/lib/gmiBatchInspectorView.mjs:10`; `GMI_BATCH_FIELDS`, `src/lib/gmiEditBatchView.mjs:6`). A generic «select in Validator → batch edit» for, say, five points missing `InnvendigUtvendig` would open an inspector that can do nothing. §4.5 and decision D3 cover this.

---

## 2. Current architecture (code is authoritative)

### 2.1 Validator inspection

| Step | Code |
| --- | --- |
| Rule card: «Vis» opens the docked field inspector; «Lag retting…» is shown when `canCorrect` | `ValidationV2RuleList.js:99–110` |
| Field inspector, Resultat tab: each diagnostic has «Vis N objekter» | `ValidationV2FieldDetailContent.js:279–307` |
| That button builds a **contextual** inspection request: `scope` = every object the field's rules evaluated, `focus` = the diagnostic's exact ObjectRefs, plus FAIL/CHECK/PASS per object | `validation-v2/tableInspection.js:19–57`, called from `ValidationV2Workspace.js:270–295` |
| The store validates ownership (layer, dataset revision, geometry, index range) and freezes the inspection | `store.js:1653–1687`, `objectTableInspection.js:73–120` |
| Foreslått: the request carries `editBasis {layerId, session, datasetRevision}`; rows resolve against the verified proposed dataset of exactly that session | `ValidationV2Workspace.js:287`, `gmiValidatorEditing.mjs:115–123` |
| The table renders inspection rows, pins geometry and bypasses Tema/Felt filters; search still applies. It offers «Utvalg N / Alle N» | `LayerDataTable.js:224`, `:247–256`, `:284–288`, `:851–860`; `layerTableRows.mjs:31–51` |
| Validation re-runs whenever layer, dataset revision or reference date changes, so Validator results are never stale against the dataset shown | `ValidationV2Workspace.js:332–337` |

Inspection mode has **no selection**: `selectionEnabled = !isExactInspection && gmiEditWorkspaceLayerId === layerId && binding` (`LayerDataTable.js:291`).

### 2.2 Selection (R3) and its lifecycle

- **State:** `gmiEditSelection = { binding, scope, keys, anchor, showOnly, origin }` (`store.js:227`).
- **Reducer:** `reduceGmiEditSelection` (`gmiEditSelection.mjs:25–54`): toggle, range, add, remove, clear, show-only, make-ordinary. One geometry per selection. A Validator-origin selection is shrink-only (`:28–34`, `:52`).
- **Write path:** `changeGmiEditSelection` requires the live binding to match and **the Rettinger workspace to be open on that layer** (`store.js:233–240`).
- **Reconcile:** on every store change, `reconcileGmiEditSelection` drops the selection unless the workspace layer matches, the layer exists, and the session binding is unchanged (`gmiEditSelection.mjs:15–22`, `gmiEditSessions.mjs:73–81`).
- **Cleanup:** `GmiEditWorkspace` clears it on unmount (`GmiEditWorkspace.js:75–78`).
- **Display:** «Bare valgte» shows the whole selection regardless of filters, search and view, but only outside inspections (`layerTableRows.mjs:47–49`).
- **Map:** a persistent halo through `gmiSelectedFeatureIds(selection, workspaceLayerId)` (`MapInner.js:1589–1593`).

Selection therefore exists only inside Rettinger today.

### 2.3 Row focus versus checkbox

- **Row click / Enter:** `handleRowClick` sets `ui.highlightedFeatureId` and emits a one-shot `gmiEditObjectRequest` (`LayerDataTable.js:530–538`). The workspace turns it into `select()`, which passes the draft guard (`GmiEditWorkspace.js:131–145`, `:166–173`). In batch mode `select()` shows the object read-only inside the batch inspector and never prompts (`:132–136`).
- **Checkbox / Space:** `toggleSelectionRow` only (`:679–683`); the click does not reach the row (`SelectionCheckbox`, `:72–80`).
- **Existing inconsistency:** the table sets the highlight *before* the guard decides. If the user cancels the discard dialog, the row and map highlight the new object while the inspector still shows the old one.

### 2.4 R5 handoff («Lag retting…»)

1. `startCorrection` opens the session and calls `prepareValidatorCorrection`: exact missing findings → M2 eligibility → eligible, originally empty targets (`ValidationV2Workspace.js:350–365`, `gmiValidatorEditing.mjs:69–86`).
2. `openGmiEditWorkspace(layerId, correction)` validates through `validatorCorrectionSelection` — live handle, same session object, same document, fingerprint, intact source bytes, and for each target the same object id and GUID in the document and the imported layer (`gmiValidatorEditing.mjs:91–111`). It validates **twice**: before the draft guard and again when the guard continues (`store.js:261–285`).
3. One atomic store update sets the workspace, the selection (with `origin.kind: 'validator'`) and the table view (forced to Original).
4. The workspace opens the batch inspector with the recommended field, **locked** while the origin is active (`GmiEditWorkspace.js:109–115`, `GmiBatchInspector.js:170`).

Supported rules are three (`CORRECTABLE_RULES`, `gmiValidatorEditing.mjs:5–9`). Lines only.

Validator and Rettinger are mutually exclusive in the left panel (`page.js:911–912`), and `openGmiValidator` sets `gmiEditWorkspace: null` (`store.js:246–251`). The Rettinger workspace is therefore never mounted while the Validator is open, so a Validator → Rettinger handoff never meets an unsubmitted Rettinger draft.

### 2.5 Editing and review

- **Individual:** `GmiObjectEditor` — plain `<input type="text">` per editable cell (`:206–209`), `planGmiObjectForm` for lexeme safety (`gmiEditView.mjs:258–279`), live per-object diagnostics with drafts (`useGmiObjectValidation`, `gmiEditValidation.mjs:54–77`), review, then `gmiEditSessions.stage`.
- **Batch:** `GmiBatchInspector` — field (default `'sdr'`, `:40`), free-text value, mode → `prepareGmiBatchReview` with the selection as explicit targets → per-object outcome in the table → `buildGmiBatchSelection` → risk dialog only for manual override, populated overwrite or conflict replacement (`:135`).
- **Views:** Original / Foreslått / Kun endrede per layer in `gmiEditTableView`; offered whenever a session is `editable` or `read-only`, regardless of whether any correction exists (`LayerDataTable.js:275`).
- **Full validation:** `GmiFullValidation` compares Original and Foreslått on demand and links each finding to the Validator with dataset and rule focus (`GmiFullValidation.js:23–26`, `:56–63`).

### 2.6 Allowed-value metadata

| Source | Content | Status |
| --- | --- | --- |
| `validation-v2/registry/rules.js:13–199` and each rule's `allowedValues` | The strict code lists the Validator enforces, per rule and geometry | **Authoritative for validation** |
| `data/validation-v2/authoritative-value-tables.js`, `getAuthoritativeValueTable(fieldId, scope)` | Code + meaning transcribed from Vedlegg A v3.2 | Presentation only (file header says so) |
| `fieldInformation.js:452–496` `buildAllowedValuePresentation` | Joins the two and reports `validatorCodesMatch` | Reusable as is |
| `fieldPolicy.js` | Which allowed values give Pass and which give Sjekk — **inline constants and Tema-dependent logic** (`:125–127`, `:161–196`) | Not data; must not be copied |
| `data/validation-v2/field-information.json` | `documentedFormat` (Kode 19, Heltall 12, Desimaltall 2, Tekst 5, YYYY, DD.MM.YYYY), `units`, `range` | Hints only |

Fields with a complete strict enumeration: Høydereferanse, Målemetode, MålemetodeHøyde, Vertikalnivå, Stedfestingsforhold, Stedfestingsårsak, Tema (point and line lists), Type, Kumform, Byggemetode, Kjegle, InnvendigUtvendig, Eier, Adkomst, Material, Nett_type, Rørform, SDR, Ringstivhet, Trykklasse.

Two properties verified from the lists: every enumerated value is upper-case-invariant, and SDR is compared numerically by its policy (`11`, `11.0` and `11,0` are all valid; `fieldPolicy.js:229–231`), so a plain «is the text in the list» check would be wrong for SDR.

---

## 3. Recommended architecture

### 3.1 Ownership

| Concern | Owner | Change |
| --- | --- | --- |
| Source bytes, ChangeSets, undo/redo, export, proposed dataset, eligibility | M1/M2/M3 (`gmi-edit/*`, `gmiEditSessions`) | **None** |
| Validator rules, applicability, severity | `validation-v2/*` | **None** |
| Selection membership | `gmiEditSelection` + `reduceGmiEditSelection` | Add `host`; generalise the write/reconcile conditions |
| Which surface shows the selection | `host`: `{kind:'rettinger'}` or `{kind:'inspection', key}` | New, small |
| Focused object (inspector) | `selected` in `GmiEditWorkspace` | Add an initial focus from the handoff; add «soft» focus requests |
| Row/map highlight of the focused object | Today the table; **recommended: the workspace**, after the guard accepts | Small fix |
| Batch draft, preview, risk approval | `GmiBatchInspector` local state | Add profile, gates, no default field |
| Value options per field | New pure module over rules + value tables | New |
| Verdict on a typed value | The Validator, through `gmiEditObjectDiagnostics` / the batch preview | Unchanged |

### 3.2 One selection, two hosts

**Shape:** `{ binding, scope, keys, anchor, showOnly, origin, host }`.

- `host: { kind: 'rettinger' }` — today's behaviour, valid while `gmiEditWorkspace.layerId === binding.layerId`.
- `host: { kind: 'inspection', key }` — valid while `objectTableInspection?.selectionContext?.key === key`.

**Where the inspection key comes from.** `buildValidatorFieldInspectionRequest` adds an optional block to the request, and `createContextualObjectInspection` freezes it onto the inspection:

```js
selection: { key: `${layerId}|${geometryScope}|${canonicalFieldId}`,   // one field inspection
             canonicalFieldId, ruleIds, fieldLabel, datasetKind }       // provenance, display only
```

The table stays independent of the Validator (the stated intent of `objectTableInspection.js:68–72`): it only learns that *this inspection permits selection under this key*.

**Lifetime of a Validator selection (recommended, decision D1):** it belongs to one field inspection on one layer and geometry.

- It **survives** switching between that field's diagnostics («Vis 5 objekter» for FEIL, then «Vis 12 objekter» for SJEKK), «Utvalg / Alle», sorting and search. Each of those opens an inspection with the same key, and the store replaces the inspection atomically.
- It is **dropped** — it holds no data, so no prompt — when another field's objects are opened, the geometry or layer changes, the dataset is switched (`changeDataset` already closes the table, `:341–345`), the table or Validator is closed, or the session is replaced or invalidated.

Reason: every selected object is then inside the inspection's `scope`, so «Alle» can always show the complete selection. A selection spanning several fields would contain members no open inspection can display, because «Bare valgte» does not exist in inspection mode and contextual rows need a per-object result. Objects from several findings can still be combined in Rettinger after the handoff.

**Changes, all small and pure:**
- `reduceGmiEditSelection(selection, action, { binding, counts, host })`: `current` requires the same binding **and** the same host key.
- `reconcileGmiEditSelection(selection, { workspaceLayerId, inspection, layers, statuses })`.
- `changeGmiEditSelection`: accept when the workspace is on the layer *or* the open inspection has a `selectionContext` on the layer.
- `LayerDataTable`: `selectionEnabled` gains the inspection case; `scope` comes from `inspection.geometryScope`; no «Bare valgte», no «Rediger valgte».
- `MapInner.js:1591`: pass the selection's own layer id when the host is an inspection, so the existing halo also shows what is ticked in the Validator.

### 3.3 Session identity in the Validator

The binding needs an **editable** session (`gmiSelectionBinding`, `gmiEditSelection.mjs:3–6`). `ValidationV2Workspace` already reads the layer's descriptor (`useGmiEditLayer`, `:102`) but never opens the session except in `startCorrection`.

Recommended (decision D8): when a selectable inspection is opened and the descriptor is `unloaded`, call `gmiEditSessions.open(layerId)` in the background. Checkboxes appear when the published status is `editable`. For `read-only`, `unavailable`, `unsupported` or `error` there are no checkboxes and the bar explains why («Filen kan bare vises og ikke rettes.»). This is the document-level form of «selection is not editing permission».

Side effect to plan for: once a session is open, the ordinary Data Table shows Original/Foreslått/Kun endrede (`LayerDataTable.js:275`). That is finding UX-01, so slice **U4 should land before H2**.

### 3.4 The handoff

`openGmiEditWorkspace(layerId, handoff)` keeps its two-phase validate → guard → re-validate → atomic commit shape (`store.js:261–285`). The payload changes:

```js
{ kind: 'validator-selection', scope, keys,            // exactly the ticked objects
  binding, sessionId,                                   // the selection's own binding
  focus: keys.length === 1 ? { scope, sourceIndex } : null,
  provenance: { canonicalFieldId, ruleIds, fieldLabel, datasetKind } }
```

Validation is a generalised `validatorCorrectionSelection`, e.g. `validatorSelectionHandoff(handoff, view, layer)` in `gmiValidatorEditing.mjs`:

| R5 check | New handoff |
| --- | --- |
| Live handle, same session object, same document, fingerprint, `gmiSourceIntact` | **Kept unchanged** |
| Each target: valid index, object exists in document and layer, id and GUID equal | **Kept**, for `point` as well as `line` |
| Non-empty, no duplicates, one geometry | **Kept** |
| `CORRECTABLE_RULES[ruleId] === canonicalFieldId` | **Dropped** — no field is transferred |
| Targets come from M2 eligibility | **Dropped** — the user chose them; eligibility still runs later in the batch preview for the three hydraulic fields |

The commit sets, in one update: the workspace with `handoff: { id, mode: 'object' | 'batch', focus, provenance }`; the selection with `host: {kind:'rettinger'}`, `showOnly: keys.length > 1` and `origin: { kind: 'validator-selection', ...provenance, count }`; and the table view matching the dataset the user was looking at (Original or Foreslått), marked as an automatic choice (§5, UX-06).

Nothing is staged, calculated or pre-filled.

### 3.5 Origin restrictions: reuse, adapt, retire

| R5 element | Recommendation |
| --- | --- |
| Identity verification and the atomic, twice-validated commit | **Reuse** (generalised, §3.4) |
| `origin` on the selection | **Adapt**: `kind: 'validator-selection'` is informational. The bar shows «Valgt i Validator · Stedfestingsårsak · 12 objekter». |
| Shrink-only lock, `make-ordinary`, «Gjør om til vanlig utvalg», «Fra Validator … bare fjerning tillatt» | **Retire** with «Lag retting…» (slice H5). The lock guaranteed that a computed target list for a fixed field was not widened unnoticed. A hand-ticked selection has no such invariant (decision D2). |
| Locked field / `initialField` in the batch inspector | **Retire**. No field is chosen for the user. |
| `prepareValidatorCorrection`, `CORRECTABLE_RULES`, `isCorrectableMissingFinding` | **Retire** in H5. Nothing else uses them. |
| `compareGmiValidationRuns`, `buildGmiValidationComparison`, `validatorInspectionLayer` | **Keep** |

«Lag retting…» stays in parallel until the new handoff is manually accepted (decision D10).

### 3.6 Checkbox also focuses (UX-03)

Ticking a box should show that object without disturbing anything else. The safe rule:

- **Trigger:** a single *check* (mouse or Space). Not uncheck, not «Velg alle», not a range (a range focuses the clicked row only if the action checked it).
- **Mechanism:** the table sends the same one-shot request with `soft: true`. The workspace handles it without the guard:

| Inspector state | Soft focus does |
| --- | --- |
| Batch inspector open | Shows the object read-only inside the batch inspector (existing `setBatchInspected` path, never prompts) |
| Object editor, no unsubmitted values | Focuses the object |
| Object editor **with** unsubmitted values | **Nothing.** The box is ticked; the draft and focus stay. The bar shows a short hint: «Valgt. Objektet åpnes ikke fordi skjemaet har verdier som ikke er lagt til.» |
| ChangeSet details open | Replaces them with the object, as a row click does |

- **No dialog is ever raised by a checkbox** (decision D5). The earlier rule «checkbox clicks never prompt the draft guard» is preserved.
- **Highlight ownership:** in Rettinger the table stops setting `highlightedFeatureId` itself; the workspace sets it when a focus change is actually accepted. This also fixes the inconsistency in §2.3.

### 3.7 Shared value domains

A new pure module, e.g. `src/lib/validation-v2/fieldValueDomain.js`:

```js
getGmiFieldValueDomain({ canonicalFieldId, geometryScope }) →
  { kind: 'enumeration' | 'integer' | 'decimal' | 'year' | 'date' | 'text',
    options: [{ value, label, longLabel }],   // rule.allowedValues, labelled from the value table
    upperCase: boolean,                        // derived: every option equals its upper-case form and is not purely numeric
    ruleId, unit, format }
```

- Options come from the active rule for that field and geometry in `VALIDATION_RULES`. Labels come from `getAuthoritativeValueTable`. **No list is written anywhere else.**
- `upperCase` is computed from the options, not declared per field.
- Non-enumerated fields get `kind`, `unit` and `format` from `field-information.json` for input hints only.

A second helper maps a document's **source columns** to domains through the schema binding, as `diagnosticsFor` already does for findings (`gmiEditValidation.mjs:40–42`), cached per document. Tema and S_FCODE both resolve to the Tema list for their geometry.

**Rules for the control (`GmiFieldValueInput`, used by both editors):**

1. **Options are offers; verdicts come from the Validator.** The control never declares a value invalid itself. FEIL and SJEKK continue to come from `gmiEditObjectDiagnostics` (individual) and the batch preview (batch). This keeps strict lists and recommendations apart: a valid-but-unusual value shows as SJEKK from the real rule, with its real Tema context.
2. **Short lists (≤ 12 options)** render as a native `<select>` with «Annen verdi…» switching to text. **Long lists** (Tema, Type, Material, Målemetode) render as one accessible searchable combobox. Both show code and meaning.
3. **A current value outside the list is always shown as it is**, as its own entry («`id` – ikke i kodelisten»). The draft changes only when the user changes it. Original lexemes are never rewritten, trimmed or re-cased silently.
4. **Upper-casing (UX-04)** is applied to the *draft value* on input for `upperCase` domains: typing `id` stores `ID`. Because every allowed value of such a field is upper-case and comparison is exact, this can never turn a valid entry into an invalid one. The existing lexeme check still applies afterwards.
5. **Numeric and text fields** keep a text input, with `inputMode`, unit and format as hints.

**Before staging:**
- *Individual:* if the review would introduce a new FEIL on an edited field, the review step requires a tick: «Legg til selv om Validator gir ny FEIL». Not blocked (decision D4).
- *Batch:* a preview with new FEIL goes through the risk dialog (§4.4, decision D11).

---

## 4. Interaction design

### 4.1 In the Validator

1. Rule → «Vis» → Resultat → «Vis N objekter». The table opens as today.
2. With an editable session, a checkbox column and header checkbox appear. Space and Shift work as in Rettinger.
3. From the first tick, a selection bar shows:
   «**N valgt** · M vises» · [Velg alle K synlige] · [Fjern utvalg] · **[Åpne i Rettinger (N)]**
4. The inspection's own columns (Tema, the field, Stedfestingsårsak, Merknad) can be sorted, so like objects can be ticked together before the handoff.
5. «Lag retting…» remains on the rule card until H5.

### 4.2 One object

Rettinger opens with that object in the individual editor, the table on its geometry in the ordinary filtered view, the box ticked, the row scrolled into view and marked, the map highlight on it. No field is changed and no review is opened.

If the row is hidden by a Tema/Felt filter, the table says so and offers «Nullstill filtre»; it never changes filters by itself (§5, UX-09).

### 4.3 Several objects

Rettinger opens with exactly those objects selected, «Bare valgte» on, and the batch inspector at step «Oppsett» with **Felt: «Velg felt…»**, an empty value and no preview. The bar shows the provenance label.

### 4.4 Batch inspector safeguards

**a. Selection profile** (new, before and after choosing a field). A pure summary over the *proposed* values of the selected objects — the same basis eligibility uses:

> Utvalget: 18 ledninger
> Material: PE100 (12) · PVC (4) · SJK (2)
> Dimensjon: 5 ulike verdier ▸
> Tema: VL (14) · SP (4)
> Stedfestingsårsak: NYTT (10) · UENDR (8)

Each value has «Behold bare disse (12)». It **removes** the others from the selection — a shrink, which is always safe and keeps an existing preview valid (`gmiBatchScopeState` only invalidates on widening, `gmiBatchInspectorView.mjs:28`).

Columns: the context facts the governing rule itself reports (`evidence.diagnosticFacts.context`, already used by `describeGmiBatchApplicability`) plus a short fixed list of physical descriptors resolved through the schema binding: Tema, Material, Dimensjon, Stedfestingsårsak.

**b. Current-finding split** (after preview, from data the preview already holds in `row.currentFindings`):

> Nå: 10 FEIL · 6 SJEKK · 2 uten funn på SDR

with «Behold bare FEIL (10)». This is how existing infrastructure is handled without new rule logic: where the Validator says a missing value is only SJEKK (not NYTT), the user sees it and can leave those objects alone. The text states that a missing value on existing infrastructure does not have to be corrected.

**c. Confirmation gates.** Staging goes through the existing compact risk dialog (`GmiConfirmDialog`, `GmiBatchInspector.js:243–260`) in two further cases, with the same exact-approval token (`:131`):
- the selection is **mixed** on any profile column — the dialog lists the mix: «Samme verdi legges på 12 PE100, 4 PVC og 2 SJK»;
- the preview introduces **new FEIL**.

**d. No default field.** `initialField = 'sdr'` becomes an empty choice. Choosing a field alone is not a draft.

**e. Specific action label:** «Legg til: SDR → 11 på 12 ledninger».

**Unchanged:** preview is mandatory; eligibility decides for the three fields; manual inclusion stays behind «Tillat manuelt utvalg…»; overwrite and replacement keep their confirmations; widening, staging, undo and source change invalidate the preview.

**Never added:** a suggested value, a computed SDR, a «fix all» action.

### 4.5 When one value does not fit: «Rett én og én»

A step-through over the selection in the individual editor:

> ‹ Forrige · **Objekt 3 av 7 i utvalget** · Neste ›

Each step goes through the existing `select()` and its draft guard. It is offered:
- in the batch inspector, always, as the alternative to a batch;
- as the **only** action when the selection cannot be batch-edited — points, or a field outside the three (decision D3).

No new engine path is involved; every correction is an ordinary single-object ChangeSet.

### 4.6 Where each safeguard lives

| Selection workflow (table and bar) | Batch inspector |
| --- | --- |
| Source-identity keys; one geometry | Explicit field choice |
| Counted «Velg alle N synlige»; no implicit «all findings» | Value options and lexeme safety |
| Hidden members always counted | Applicability and eligibility (M2) |
| Sorting by context columns before ticking | Selection profile and narrowing |
| Provenance label | Mixed-selection and new-FEIL confirmation |
| Selection never implies a field | Mandatory preview; stale invalidation; risk approval |

### 4.7 Existing corrections, drafts, mixed geometry

| Case | Behaviour |
| --- | --- |
| Selected object already has staged corrections | Transferred as any other. The editor shows Foreslått; a batch preview reports the conflict and requires the existing «Erstatt tidligere rettinger» choice. |
| Unsubmitted Rettinger draft at handoff | Cannot occur from the Validator (§2.4). The guard path in `openGmiEditWorkspace` is kept for other callers. |
| Leaving Rettinger for the Validator with a draft | Existing guard («Forkaste endringer i skjemaet?»). |
| Mixed geometry | Impossible in one selection (reducer); a Validator inspection is one geometry. In Rettinger the existing «Erstatt utvalget…» dialog remains. |
| Source replaced or session invalidated between ticking and «Åpne i Rettinger» | The selection is already gone (reconcile). If it happens inside the click, the handoff fails closed with `VALIDATOR_CORRECTION_STALE` and the user stays in the Validator. |
| Selection made on Foreslått | Same source indices. Rettinger opens on Foreslått. |

### 4.8 The loop back to the Validator

Validator → select → Rettinger → edit → Foreslått → Validator already works piecewise. Three small additions close it:

1. **Return target.** The workspace keeps the handoff's provenance. The bar's provenance label becomes a link «Tilbake til Validator · \<felt\>». It uses the existing `openGmiValidator(layerId, dataset, ruleId, geometryScope)` with **Foreslått when corrections exist**, otherwise Original.
2. **After staging**, the staged-details panel offers «Kontroller i Validator (Foreslått)» for the same rule.
3. **«Åpne Validator»** in `GmiFullValidation` defaults to Foreslått when corrections exist and the user has not chosen a dataset for the layer.

| Concern | How it is covered |
| --- | --- |
| Staging | Published status changes → proposed revision changes → the Validator re-runs on Foreslått automatically (`:332–337`). |
| Undo / redo | Same mechanism. Selection keys are unaffected. Batch previews are invalidated by session identity. |
| Stale comparison in Rettinger | `isCurrentGmiComparison` already marks it; no automatic full re-run is added. |
| Stale Validator selection | Bound to session and inspection; dropped on dataset switch. |
| Original retained | Untouched: the Validator's Original always reads `layer.data`; export still goes through M1 verification. |

---

## 5. UX findings

| # | Finding | Cause in code | Recommendation | Priority | Slice | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| UX-01 | View controls shown before corrections exist | `gmiEditModesAvailable` depends only on session state (`LayerDataTable.js:275`) | Ordinary app: hide until `changeSetCount > 0`. Rettinger: show, with Foreslått/Kun endrede disabled and a tooltip. With no corrections the *effective* view is Original; the stored choice is not rewritten, so redo returns to it. (D6) | High — becomes more visible once the Validator opens sessions | U4 | — |
| UX-02 | Tema/Felt expansion resets between hosts | Local state: `LayerPanel.js:462`, `GmiLayerFilters.js:12`, `LayerFilterSections.js:357` and `:550` | A non-persisted store map per layer: open section, open Felt value groups per geometry. Both hosts read and write it; cleared with the layer. Not under `ui` (persisted, and layer ids are random per import). | Medium | U6 | — |
| UX-03 | Checkbox should focus | §2.3 | §3.6 | Medium | T3 | — |
| UX-04 | `id` → `ID` | Plain text input | §3.7 rule 4 | High | D2 | D1 |
| UX-05 | Code lists | No domain metadata reaches Rettinger | §3.7 | High | D1, D2, D3 | — |
| UX-06 | Foreslått after staging | Nothing switches the view; `GmiObjectEditor` is mounted without `onStaged` (`GmiEditWorkspace.js:327–329`) | After a successful stage, switch Original → Foreslått **unless the user chose Original themselves**. `setGmiEditTableView(layerId, view, { by: 'user' \| 'auto' })`; toolbar buttons pass `user`; code passes `auto`. Only the view changes — no tab, scroll or focus. | High | T2 | U4 |
| UX-07 | FEIL and SJEKK icons alike | `FindingIcon` uses `WarningCircleIcon` for both (`GmiObjectEditor.js:15–21`); elsewhere octagon vs triangle | One shared severity icon: FEIL `XCircleIcon`, SJEKK `WarningIcon`, OK `CheckCircleIcon`, Phosphor Regular, coloured by the existing `data-validation-tone` tokens (`globals.css:8–33`). Use it in the object editor, batch inspector, risk dialog and table review. Tooltips unchanged. Update the legend line (`GmiObjectEditor.js:243–246`). | High, small | U2 | — |
| UX-08 | Legend open in Validator/Rettinger | `legendCollapsed` is reducer state that already collapses on profile analysis (`mapPanePresentation.mjs:37–40`) | Add a `workspace-entered` action dispatched when Validator or Rettinger becomes active: remember the current value, collapse; restore it on leaving. Manual toggling inside the workspace still works. | Low, small | U3 | — |
| UX-09 | «Vis i Foreslått» does not scroll | `showProposed` only sets table, geometry and view (`GmiEditWorkspace.js:217–222`) | A one-shot **row reveal** request handled by the table (below). | High | T1 | — |
| UX-10 | Redo hard to find | Footer icon only; «N angret retting kan gjøres om» is plain text (`GmiChangeList.js:26`, `:87`) | The «Angret: …» notice gets a «Gjør om» button while that entry is next on the redo stack; the Endringer text becomes a button «Gjør om: \<label\>». | Medium, small | U5 | — |
| UX-11 | Selection handoff | §2.4 | §3–§4 | Highest | H1–H5 | U4, T1 |
| UX-12 | Header controls small | Datasett `<select>` and date input lack the padding and text classes the Lag select has (`ValidationV2Workspace.js:404–422`) | Same field classes and height as «Lag»; a two-column label/control grid. Existing tokens only. | Medium, small | U1 | — |
| UX-13 | «Dato» | Same line | «Kontrolldato», tooltip: «Datoen kontrollen regnes mot, for eksempel alder på datafangst og fremtidige datoer. Ikke filens opprettelses- eller innmålingsdato.» Same wording in `GmiFullValidation.js:45`. | Medium, small | U1 | — |

**Row reveal (T1).** A store one-shot `{ layerId, scope, sourceIndex, fields?, at }` consumed by `LayerDataTable`. A pure helper classifies the target against the row sets the table already derives:

| Where the object is | Action |
| --- | --- |
| In the sorted rows | `rowVirtualizer.scrollToIndex(index, {align:'center'})`, move the keyboard cursor, flash the row. Works under any sort because the index is taken from the sorted model. |
| Excluded by «Bare valgte» | Switch to «Filtrert visning» (a display preference, not membership), then reveal. |
| Excluded by table search | Clear the search, then reveal. |
| Excluded by Tema/Felt filters | **Do not change filters.** Show «\<Objekt\> er skjult av Tema/Felt-filtre» with «Nullstill filtre». (D7) |

For a multi-object ChangeSet, reveal the first of its objects *in the current sort order*. The changed field is already brought forward by the column focus (`GmiChangeSetDetail.js:27–30`); if the user has switched that off, scroll horizontally to the column. The inspector's focused object is not changed.

---

## 6. Safety analysis

| Risk | Analysis and mitigation |
| --- | --- |
| **Wrong object transferred** | Keys are parser source indices, identical in Original and Foreslått (M1 forbids structural edits). The handoff re-checks id and GUID per object against the immutable document *and* the imported layer, twice. |
| **Stale selection** | Bound to session id and fingerprint; reconcile drops it on any source/session change, layer removal or reset. A Validator selection is additionally bound to its inspection key. Never persisted. |
| **Selection read as permission** | The handoff carries no field. Cell editability is still `gmiEditFieldPolicy` + M1; the three hydraulic fields still go only through `evaluateGmiBatchEligibility`. `createGmiBatchCorrection({targets})` without eligibility is still never called from the UI (keep the existing contract test). |
| **Selection widened unnoticed** | With the lock retired, the count is always shown, «Velg alle» is explicit and counted, and widening invalidates any preview (existing). |
| **One value on unlike objects** | Profile, narrowing, mixed-selection confirmation, current-finding split, «Rett én og én» (§4.4–4.5). |
| **Invalid values** | Options from authoritative lists; verdicts from the real rules; confirmation on new FEIL. The control cannot contradict the Validator because it does not judge. |
| **Silent rewriting** | Upper-casing touches only what the user types. Out-of-list originals are displayed as they are. |
| **Source bytes** | No slice touches M1, M2, M3, export or `layer.data`. S_HYPERLINK remains refused at build, stage and compile. |
| **Accidental staging** | Nothing stages without review (individual) or preview (batch). No default field. Handoff, checkbox focus, reveal and view switching never stage. |
| **Draft loss** | Checkbox focus never prompts and never discards. All other focus changes keep the single guard. |
| **Hidden selected objects** | Validator: impossible outside the inspection scope (D1). Rettinger: existing hidden count and «Bare valgte». |
| **Session opened by the Validator** | Opening reads and verifies the retained file; it stages nothing and sets no unsaved flag. UX-01 gating prevents new controls appearing in the ordinary table. |
| **Dev-only double effect** | The unmount cleanup that clears the selection (`GmiEditWorkspace.js:75–78`) would also run on a development Strict Mode remount. Not verified in this pass; check one handoff under `next dev` in H3. |

---

## 7. Code-reuse strategy

| Need | Reuse |
| --- | --- |
| Selection membership, range, counts | `reduceGmiEditSelection`, `gmiSelectionCounts`, `gmiSelectionKey` (`gmiEditSelection.mjs`) |
| Checkbox column, header checkbox, keyboard, bar | Existing code in `LayerDataTable.js:72–80`, `:669–683`, `:716–751`, `:947–975` — widen the enabling condition, do not copy |
| Inspection scope and identity | `createContextualObjectInspection`, `resolveExactObjectInspectionRows`, `validatorInspectionLayer` |
| Handoff verification | `validatorCorrectionSelection` generalised; `VALIDATOR_CORRECTION_STALE` |
| Guarded atomic commit | `openGmiEditWorkspace` (`store.js:261–285`) |
| Opening Rettinger on an object | `gmiEditObjectRequest` → `select()`; `syncObjectTable` |
| Batch preview, eligibility, staging, risk | `prepareGmiBatchReview`, `planGmiInspectorBatch`, `buildGmiBatchSelection`, `gmiBatchReviewRows`, `GmiConfirmDialog` — unchanged |
| Rule context for the profile | `evidence.diagnosticFacts.context` as read by `describeGmiBatchApplicability` (`gmiEditBatchView.mjs:10–28`) |
| Current findings per object | `row.currentFindings` from `prepareGmiBatchReview`; `gmiEditObjectDiagnostics` |
| Code lists and meanings | `VALIDATION_RULES[].allowedValues`, `getAuthoritativeValueTable`, `buildAllowedValuePresentation` |
| Column → canonical field | Schema binding as in `gmiEditValidation.mjs:40–42`; `bindGmiLayerSchema` |
| Lexeme safety | `validateGmiFieldLexeme`, `planGmiObjectForm` |
| Proposed view | `gmiProposedViewForStatus` |
| Return to Validator | `openGmiValidator` with focus (`store.js:246–251`, `ValidationV2Workspace.js:367–379`) |
| Legend state | `reduceMapPanePresentation` |
| Browser test navigation | `tests/helpers/gmiTableNavigation.mjs`, `chromeHarness.mjs` |

---

## 8. File-level impact

**New**

| File | Purpose | Slice |
| --- | --- | --- |
| `src/lib/validation-v2/fieldValueDomain.js` | Domain per canonical field and geometry | D1 |
| `src/lib/gmiEditFieldDomains.mjs` | Source column → domain for one document | D1 |
| `src/components/gmi-edit/GmiFieldValueInput.js` | Select / combobox / text control | D2 |
| `src/lib/gmiSelectionProfile.mjs` | Value distribution of a selection | B1 |
| `src/lib/layerTableReveal.mjs` | Classify a reveal target against derived rows | T1 |
| `src/components/SeverityIcon.js` | One FEIL/SJEKK/OK icon | U2 |
| Tests alongside each | | |

**Modified**

| File | Change | Slice |
| --- | --- | --- |
| `src/lib/gmiEditSelection.mjs` | `host`; reconcile and reducer context | H1 |
| `src/lib/store.js` | Selection write condition; handoff payload; reveal request; view intent; disclosure map; soft object request | H1, H3, T1, T2, U6, T3 |
| `src/lib/gmiEditSessions.mjs` | Pass the inspection to reconcile | H1 |
| `src/lib/gmiValidatorEditing.mjs` | `validatorSelectionHandoff`; later remove R5 helpers | H3, H5 |
| `src/lib/objectTableInspection.js`, `validation-v2/tableInspection.js` | Optional `selection` context | H2 |
| `src/components/LayerDataTable.js` | Selection in inspections; «Åpne i Rettinger»; reveal; view gating; soft focus; highlight ownership; severity icon | H2, H3, T1, U4, T3, U2 |
| `src/components/validation-v2/ValidationV2Workspace.js` | Open session; pass selection context; header controls; later remove `startCorrection` | H2, U1, H5 |
| `src/components/validation-v2/ValidationV2RuleList.js` | Later remove «Lag retting…» | H5 |
| `src/components/gmi-edit/GmiEditWorkspace.js` | Handoff entry (object / batch); soft focus; `onStaged`; redo notice; return link; queue navigation | H3, T3, T2, U5, H4, B3 |
| `src/components/gmi-edit/GmiBatchInspector.js` | No default field; value control; profile; gates; «Rett én og én»; icons | D3, B1, B2, B3, U2 |
| `src/components/gmi-edit/GmiObjectEditor.js` | Value control; new-FEIL confirmation; icons; queue header | D2, U2, B3 |
| `src/components/gmi-edit/GmiChangeSetDetail.js`, `GmiChangeList.js`, `GmiFullValidation.js` | Reveal; redo button; Kontrolldato; Validator links | T1, U5, U1, H4 |
| `src/components/gmi-edit/GmiLayerFilters.js`, `LayerFilterSections.js`, `LayerPanel.js` | Shared disclosure state | U6 |
| `src/components/MapInner.js` | Selection halo for an inspection host | H2 |
| `src/lib/workspace/mapPanePresentation.mjs`, `MapPanePresentationProvider.js`, `src/app/page.js` | Legend on workspace entry | U3 |
| `src/lib/gmiEditView.mjs` | View labels/disabled state helper | U4 |
| `src/components/gmi-edit/gmiEdit.css` | Bar, profile, queue, combobox styles | several |

**Removed (H5 only, after acceptance):** `prepareValidatorCorrection`, `validatorCorrectionSelection`, `CORRECTABLE_RULES`, `isCorrectableMissingFinding`; the reducer's restricted branch and `make-ordinary`; the «Fra Validator» bar text and conversion button; `correction` / `initialField` wiring; `startCorrection`, `correctable`, `canCorrect`, `onCorrect`.

**Not touched in any slice:** `src/lib/gmi-edit/*`, `validation-v2/fieldPolicy.js`, `registry/rules.js`, `validationRunner.js`, parsers, FOTO, export, `GmiBatchDialog.js` (R7 remains a separate decision), map-click selection (R8).

---

## 9. Implementation slices

Each slice is one commit-sized change with its own acceptance. Complexity: S ≈ under half a day, M ≈ a day, L ≈ up to two days for the intended implementer.

Every slice must also pass the standing gate in §10 and leave input file bytes unchanged in browser tests.

### Group U — independent refinements

**U1 · Validator header and Kontrolldato (UX-12, UX-13)** — S. No dependency.
- *Accept:* Datasett and date controls have the same height, padding and text size as «Lag»; labels aligned; label reads «Kontrolldato» with the tooltip; accessible names match the visible labels; `GmiFullValidation` uses the same word.
- *Tests:* update selectors in `tests/gmiValidatorEditingUi.test.mjs` («Datasett i Validator»); one source-contract assertion for the tooltip. Browser: no horizontal overflow of the Validator sidebar at 1280×720.
- *Manual:* change Kontrolldato; results re-run.

**U2 · Severity icons (UX-07)** — S. No dependency.
- *Accept:* FEIL = X in circle, SJEKK = triangle, OK/løst = check, in the object editor, batch inspector, risk dialog and table review; colours from `data-validation-tone`; tooltips unchanged; legend text updated.
- *Tests:* Node contract: each consumer imports the shared icon and no longer uses `WarningCircleIcon`/`WarningOctagonIcon` for severity. Existing `data-severity`/`data-transition` attributes stay, so `gmiEditValidationUi` keeps passing.
- *Manual:* an object with one FEIL and one SJEKK field is distinguishable without colour.

**U3 · Legend collapsed in Validator/Rettinger (UX-08)** — S. No dependency.
- *Accept:* entering either workspace collapses the legend; it can be expanded there; leaving restores the state it had before entry; profile-analysis and compact-width behaviour unchanged.
- *Tests:* Node reducer cases in `tests/mapPaneToolbar.test.mjs` (enter, toggle inside, leave, nested entry).
- *Manual:* expanded in the ordinary map → Rettinger (collapsed) → back (expanded).

**U4 · View controls only when meaningful (UX-01)** — S. No dependency. **Before H2.**
- *Accept:* ordinary table shows no Original/Foreslått/Kun endrede for a layer with zero corrections; in Rettinger the two proposed modes are disabled with a tooltip until a correction exists; undo to zero shows Original without rewriting the stored choice; redo returns to it.
- *Tests:* Node helper for available/disabled/effective view; browser additions in `gmiRettingerSidebarUi`.
- *Manual:* enter and leave Rettinger without editing → ordinary table has no mode buttons.

**U5 · Contextual redo (UX-10)** — S. No dependency.
- *Accept:* after undo (footer or ChangeSet details) the notice has «Gjør om»; the Endringer tab's redo text is a button; both disappear when the redo stack changes; footer icon unchanged.
- *Tests:* browser steps in `gmiRettingerSidebarUi` (undo → Gjør om → same ChangeSet id back).

**U6 · Filter disclosure state (UX-02)** — S–M. No dependency.
- *Accept:* the open section (Tema/Felt) and open Felt value groups per geometry are the same in the ordinary sidebar and Rettinger's Filter tab, and survive switching Filter ↔ Endringer; nothing is persisted across reloads; cleared when the layer is removed; filter values and behaviour unchanged.
- *Tests:* Node store lifecycle; additions to `gmiLayerFilters.test.mjs` and `gmiLayerFiltersUi`; `statusBrowsing.test.mjs` unchanged.

### Group T — table mechanics

**T1 · Row reveal and «Vis i Foreslått» (UX-09)** — M. No dependency. **Before H3.**
- *Accept:* per the table in §5; works after sorting by any column; the row is rendered (virtualised list) and marked; filters are never changed automatically; the focused inspector object is unchanged.
- *Tests:* Node for `layerTableReveal.mjs` (visible, selected-only, search, filter, absent); browser: stage a correction on a late row, sort descending, add a search that excludes it, press «Vis i Foreslått» → row in viewport.
- *Manual:* same with a Tema filter hiding the object → message and «Nullstill filtre».

**T2 · Foreslått after staging (UX-06)** — S. After U4.
- *Accept:* first and later stages switch Original → Foreslått when the view was not chosen by the user; a user click on Original is respected until they choose otherwise; applies to single and batch staging; geometry, scroll, selection and focus unchanged.
- *Tests:* Node for the intent rule; browser in `gmiRettingerSidebarUi` and `gmiBatchInspectorUi`.

**T3 · Checkbox focuses (UX-03)** — M. No dependency.
- *Accept:* per the table in §3.6; no dialog from any checkbox; unticking, «Velg alle» and header checkbox do not move focus; cancelling a guard after a row click leaves the previous row and map highlight in place.
- *Tests:* browser additions to `gmiEditSelectionUi` and `gmiEditDraftGuardUi` (tick with a dirty form → draft intact, box ticked, no dialog); keyboard Space in `layerDataTableKeyboardUi`.

### Group D — value domains

**D1 · Domain modules** — M. No UI. No dependency.
- *Accept:* every field in §2.6 returns its options in rule order with meanings; point and line Tema and InnvendigUtvendig differ correctly; `upperCase` true for all current enumerations except purely numeric lists; non-enumerated fields return kind, unit and format; S_FCODE resolves to Tema.
- *Tests:* Node: options equal `rule.allowedValues` for every rule that has them (so a list can never diverge); no array literal of codes exists in the new modules (source contract).

**D2 · Value control in the object editor (UX-04, UX-05)** — M. After D1.
- *Accept:* `InnvendigUtvendig` offers ID and OD; long lists are searchable by code and meaning; typing `id` yields the draft `ID`; an out-of-list original is displayed unchanged and produces no edit by itself; «Bruk original» and «Angre skrivingen» work; new FEIL on an edited field requires the confirmation tick in the review; keyboard-only operation; staged bytes equal the chosen code exactly.
- *Tests:* browser in `gmiEditWorkspaceUi` / `gmiEditValidationUi`: choose ID on a point, stage, export, compare bytes; lower-case typing; out-of-list original. Node: `planGmiObjectForm` unchanged.
- *Manual:* the Punkt 16 case — empty → ID, Validator FEIL 5 → 4.

**D3 · Batch inspector: no default field, same control** — S–M. After D2.
- *Accept:* field starts at «Velg felt…»; preview disabled without a field; value uses the shared control with the field's options; `11` and `11.0` both preview without a list complaint; choosing a field alone does not trigger the draft guard.
- *Tests:* update `gmiBatchInspectorUi` and `gmiBatchInspector.test.mjs` for the explicit field step.

### Group H — handoff

**H1 · Selection host (pure)** — M. No UI. No dependency.
- *Accept:* existing Rettinger behaviour identical; a selection with an inspection host is accepted only while that inspection is open; changing inspection key, closing the table, source or session change drop it; actions under a different host start a fresh selection.
- *Tests:* extend `gmiEditSelection.test.mjs` and `gmiEditWorkspace.test.mjs` (all existing cases must pass unmodified).

**H2 · Checkboxes in the Validator's table** — L. After H1 and U4.
- *Accept:* checkboxes and bar per §4.1 for an editable session; none for read-only or unavailable, with an explanation; selection survives FEIL ↔ SJEKK diagnostics of the same field, «Utvalg/Alle», sort and search; dropped on another field, geometry, layer, dataset switch or close; map halo shows the ticked objects; ordinary (non-Validator) inspections unchanged; «Vis» remains inspection-only until a box is ticked.
- *Tests:* Node for the inspection `selection` context and ownership checks (`objectTableInspection.test.mjs`); new browser suite `gmiValidatorSelectionUi` at 1366×768 and 1280×720.
- *Manual:* Original and Foreslått datasets; a layer never opened in Rettinger.

**H3 · «Åpne i Rettinger (N)»** — L. After H2 and T1.
- *Accept:* exactly the ticked source objects arrive (assert indices); one object → individual editor, row revealed, nothing changed; several → batch inspector, no field, no value, no preview, no ChangeSet; provenance label shown; selection is ordinary (can grow); a handoff from Foreslått opens on Foreslått; replaced source or session → refused with the stale message, user stays in the Validator; «Lag retting…» still works.
- *Tests:* Node: `validatorSelectionHandoff` refusal matrix (layer, session, fingerprint, mutated bytes, id/GUID mismatch, duplicate, empty, out-of-range, point and line); store atomicity. Browser: extend the new suite; input bytes unchanged.
- *Manual:* the real delivery — one point missing InnvendigUtvendig; twelve lines missing SDR. One pass under `next dev` (§6, last row).

**H4 · Loop back to the Validator** — S–M. After H3.
- *Accept:* per §4.8; every route passes the existing draft guard; dataset defaults to Foreslått only when corrections exist.
- *Tests:* browser: handoff → stage → «Kontroller i Validator (Foreslått)» → the same rule is focused and its count has changed.

**H5 · Retire «Lag retting…» and the origin lock** — M. After **manual acceptance** of H3 and B2.
- *Accept:* no «Lag retting…»; no shrink-only state; removed exports have no importers; all selection behaviour otherwise identical.
- *Tests:* remove or rewrite the R5 cases in `gmiValidatorEditing.test.mjs`, `gmiEditSelection.test.mjs`, `gmiEditWorkspace.test.mjs`, `gmiValidatorEditingUi.test.mjs`, `validationV2RuleCountsBrowser.test.mjs`; keep every identity refusal case under the new helper.

### Group B — batch safety

**B1 · Selection profile and narrowing** — M. No dependency (best after D3).
- *Accept:* profile lists distinct values and counts on the proposed dataset for Tema, Material, Dimensjon, Stedfestingsårsak and the rule's own context; «Behold bare disse» only removes; an existing preview stays valid after narrowing; counts update on undo/redo.
- *Tests:* Node for `gmiSelectionProfile.mjs` (missing values, proposed vs original, large selection performance); browser in `gmiBatchInspectorUi`.

**B2 · Confirmation gates and current-finding split** — M. After B1.
- *Accept:* a mixed selection or a preview with new FEIL cannot be staged without the risk dialog; the dialog names the mix and the findings; approval is void if selection or setup changes (existing token); a uniform selection with no new FEIL stages directly as today; manual override and overwrite confirmations unchanged; split shows FEIL/SJEKK/none with narrowing.
- *Tests:* Node on the gate predicate; browser: uniform → direct; mixed Material → dialog; change selection while the dialog is open → approval refused.
- *Manual:* the SDR case from the brief — pipes with different Material and Dimensjon; some not NYTT.

**B3 · «Rett én og én»** — M. After H3 (independent technically).
- *Accept:* Forrige/Neste walks the selection in source order through the guard; position shown; available from the batch inspector; the only action for point selections and non-batch fields, with a plain explanation; selection unchanged by stepping.
- *Tests:* browser: five points from the Validator → step, edit two, guard on a dirty step.

### Suggested order

1. U1, U2, U3, U5 (any order, parallel) · U4
2. T1 → T2 · D1 → D2 → D3
3. H1 → H2 → H3 → H4
4. B1 → B2 · B3 · T3 · U6
5. Manual acceptance on the real delivery → H5

The handoff (step 3) is the main goal; steps 1–2 are ordered first only because U4 and T1 are prerequisites and the rest are cheap and independent.

---

## 10. Regression strategy

### Standing gate for every slice

```powershell
# Node (relevant set)
node --test tests/gmiRettingerSidebar.test.mjs tests/gmiLayerFilters.test.mjs tests/statusBrowsing.test.mjs tests/layerTableRows.test.mjs tests/tableSearch.test.mjs tests/objectTableInspection.test.mjs tests/gmiEdit*.test.mjs tests/gmiBatchInspector.test.mjs tests/gmiR4UxPolish.test.mjs tests/gmiValidatorEditing.test.mjs tests/validationV2Workspace*.test.mjs

# Production browser, serial (next start -p 3123, PHOTO_UI_URL=http://localhost:3123)
node --test --test-concurrency=1 tests/gmiEditWorkspaceUi.test.mjs tests/gmiEditDraftGuardUi.test.mjs tests/gmiEditValidationUi.test.mjs tests/gmiValidatorEditingUi.test.mjs tests/gmiLayerFiltersUi.test.mjs tests/gmiEditSelectionUi.test.mjs tests/gmiBatchInspectorUi.test.mjs tests/gmiR4UxPolishUi.test.mjs tests/gmiEditBatchUi.test.mjs tests/layerDataTableGeometryUi.test.mjs tests/layerDataTableKeyboardUi.test.mjs tests/gmiRettingerSidebarUi.test.mjs
```

Plus targeted ESLint, `npm run build`, `git diff --check`. Slices touching Validator presentation (U1, H2, H5) add `validationV2RuleCounts*`, `validationV2RulePresentation`, `validationV2GmiA81*`. H5 and any slice touching `store.js` broadly should run the full serial suite.

### Baseline measured in this pass (Node gate, HEAD `13a44a2`, this machine)

**215 tests: 202 pass, 4 fail, 9 skipped.**

| Failing test | Status |
| --- | --- |
| `validationV2WorkspaceInspector`: sidebar width; workspace-shell placement; map/3D resize composition | The three **documented baseline** source-contract failures (R5, R6A, R6B reports). Checked: the map/3D one also fails on LF-normalised text, so it is a real outdated contract. |
| `gmiRettingerSidebar`: «R6B has only Filter/Endringer…» | **Environment artefact, not a regression.** The assertion `/showObjectNumber\s*\n.*\n.*gmiObjectMatchesQuery/` (`tests/gmiRettingerSidebar.test.mjs:24`) cannot match CRLF text. This checkout has `core.autocrlf=true` (index LF, working tree CRLF). Verified: the same regex matches the same file once normalised to LF. R6B reported 203 pass. |

Recommendation: make that one assertion end-of-line agnostic (`\r?\n`) in the first slice that touches the file, or run gates on an LF checkout. Until then, expect **4** Node failures on this machine and **3** elsewhere.

Not re-run in this pass, quoted from the R6B and R5 reports: browser gate 81/81 plus R6B's 6/6; full serial suite 2,025 tests with 7 known failures (`appInfoUiContract` 1, `statsUiContract` 2, `terrainPhotoGml` 1 optional corpus, `validationV2WorkspaceInspector` 3).

### Tests that will need deliberate updates

| Change | Tests |
| --- | --- |
| Header labels (U1) | `gmiValidatorEditingUi` |
| No default batch field (D3) | `gmiBatchInspector.test.mjs`, `gmiBatchInspectorUi`, `gmiValidatorEditingUi` |
| Foreslått after staging (T2) | Any browser test asserting Original directly after a stage — check `gmiEditWorkspaceUi`, `gmiRettingerSidebarUi`, `gmiR4UxPolishUi` |
| Removal of R5 (H5) | `gmiValidatorEditing.test.mjs`, `gmiEditSelection.test.mjs` (`make-ordinary`), `gmiEditWorkspace.test.mjs`, `gmiValidatorEditingUi`, `validationV2RuleCountsBrowser` («Lag retting») |

No safety assertion may be deleted; identity and refusal cases move to the new helper.

### New coverage (summary)

1. Selection host lifecycle (H1).
2. Handoff refusal matrix for both geometries (H3).
3. Exact-index transfer, no field, no preview, no ChangeSet (H3, browser).
4. Domain lists equal the rule lists (D1).
5. Bytes of a chosen code in the exported file (D2).
6. Gate predicate and approval invalidation (B2).
7. Reveal classification under sort, search, selected-only and filters (T1).
8. No dialog from checkboxes with a dirty draft (T3).
9. Layout at 1280×720 and 1366×768 for the Validator selection bar and the batch profile.

### Manual acceptance on the real delivery (after H3 and B2)

1. Validator, Original: open a point rule with FEIL → «Vis» → «Vis N objekter». Tick one → «Åpne i Rettinger (1)». The object is in the editor, nothing changed.
2. Choose `ID` from the list, review, add. Table switches to Foreslått. «Kontroller i Validator (Foreslått)»: FEIL count reduced by one.
3. Back in the Validator, a line rule (SDR): tick several pipes with *different* Material → «Åpne i Rettinger (N)». Batch inspector has no field or value. Read the profile; narrow to one Material; choose SDR and a value; preview; add.
4. Repeat without narrowing: the mixed-selection confirmation appears and names the mix.
5. Tick five points → Rettinger offers «Rett én og én» only.
6. Tick a box in Rettinger while a form has unsubmitted values: no dialog, values intact.
7. «Vis i Foreslått» on a correction for an object far down a sorted table.
8. Undo, then «Gjør om» from the notice.
9. Export the revised GMI; compare with the original outside the corrected cells.
10. Replace the source file while a Validator selection exists: the selection is gone and nothing can be transferred.
11. Repeat 1–4 at 1280×720, one pass keyboard-only.

---

## 11. Open decisions

Only choices the code does not settle. Each has a default the slices above assume.

| # | Decision | Recommended default | Alternative |
| --- | --- | --- | --- |
| D1 | Lifetime of a Validator selection | One field inspection (layer + geometry + field); survives FEIL/SJEKK diagnostics of that field | Persist across fields — needs a «Bare valgte» mode for inspections and creates members no open table can show |
| D2 | Transferred selection in Rettinger | Ordinary, can grow; provenance label only | Keep the R5 shrink-only lock |
| D3 | Several points, or a field outside SDR/Trykklasse/Ringstivhet | «Rett én og én» now | A generic batch for fully enumerated fields through M2's explicit-targets path, with the §4.4 gates. This is the old Q3 and should be decided separately after B2 is accepted; it is the change that most increases the risk described in the brief. |
| D4 | Value outside the code list, individual editor | Allowed after an explicit tick when the Validator reports new FEIL | Block |
| D5 | Checkbox on another object while the form has unsubmitted values | Tick only; no focus change; short hint | Raise the discard dialog |
| D6 | UX-01 presentation | Hidden in the ordinary app; disabled with tooltip in Rettinger | Hidden everywhere |
| D7 | «Vis i Foreslått» when Tema/Felt filters hide the object | Message with «Nullstill filtre» | Show the object temporarily despite filters |
| D8 | When the Validator opens the editing session | When objects are first shown in the table | Only on the first tick, or only at handoff (checkboxes would then appear late or need a second identity model) |
| D10 | Removing «Lag retting…» | Keep in parallel; remove in H5 after manual acceptance | Remove together with H3 |
| D11 | Batch preview with new FEIL | Risk dialog | Block staging |

Wording to confirm: «Åpne i Rettinger (N)», «Rett én og én», «Kontrolldato», «Valgt i Validator».

---

## 12. Constraints honoured by this plan

No change to Validator rule logic or FEIL/SJEKK/OK semantics; no automatic correction or computed value; no weakening of identity checks (the handoff keeps every R5 check and extends them to points); no change to imported bytes, the ChangeSet engine, Original/Foreslått validation, FOTO or export; the legacy batch modal (R7) and map-click selection (R8) are left as separate decisions; the combined ZIP work is not started.

## Appendix: commands run

- `git status -sb`, `git log`, `git fetch origin`, `git merge-base --is-ancestor 13a44a2 HEAD` — read-only.
- The Node gate in §10, once; log kept in the session scratchpad, outside the repository.
- A one-line Node check of the CRLF hypothesis against `src/components/LayerDataTable.js`.
- No build, no browser suite, no repository file modified other than this report.
