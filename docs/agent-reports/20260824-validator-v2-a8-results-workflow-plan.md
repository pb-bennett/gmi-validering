# Validator 2.0 A8.1 compact results workflow and field-inspection plan

Date: 2026-08-24  
Branch reviewed: `feature/validator-v2-a8-results-workflow`  
Scope: planning only; no application implementation, commit, push, merge, deployment, production change, new rule, or A9 behavior.

## 1. Recommendation

Implement this milestone as three reviewable slices, in this order:

1. **A8.1A — compact results workflow and Testmodus relocation**: short canonical labels, the three derived aggregate statuses, attention sorting, search/status filtering, one-open accordion, concise expanded counts, removal of the failed-object list, and the compact Testmodus pill in the shared top toolbar.
2. **A8.1B — field reference and lazy Fildata inspection**: source-backed canonical field-information metadata, accessible two-tab modal, and cached/lazy value distributions that preserve delivered lexical evidence.
3. **A8.1C — existing-table handoff**: an ephemeral, fail-only ObjectRef subset passed into the existing `LayerDataTable`, with strict layer/revision/geometry ownership checks.

This is one product milestone with three integration slices, not three independent feature branches. A establishes the presentation vocabulary used by B and C. B is local to Validator 2.0. C is last because it is the only slice that changes the shared store/table path and therefore has the broadest regression surface.

The central architectural decision is to keep `ValidationRunV2` and every rule result immutable and unchanged. Aggregate status, ordering, filtering, accordion state, field documentation, field distributions, and table navigation are presentation concerns derived from the current selected-layer result and dataset.

## 2. Baseline audited

### 2.1 Validator 2.0 host and component flow

The current flow is:

```text
src/app/page.js
  -> FieldValidationSidebar (one-third application sidebar)
       -> local mode selector; Validator 1.0 remains the default
       -> ValidationV2ErrorBoundary
            -> ValidationV2Workspace
                 -> selected GMI layer
                 -> createValidationV2ViewController(runGmiValidationV2)
                 -> one explicit run / one immutable result
                 -> Punkter or Ledninger derived geometry view
                 -> RuleResultList
                      -> FindingGroups and individual source indexes
```

Relevant facts:

- `FieldValidationSidebar.js` hosts both modes. Its local initial mode is `legacy`; the V2 workspace is isolated under `ValidationV2ErrorBoundary`.
- `ValidationV2Workspace.js` owns selected-layer request state, run lifecycle, current-result checks, geometry selection, and the currently expanded rule ID.
- `validationViewController.js` owns only `{ geometryTab, result }`. `selectGeometry` derives another view from the same result and cannot call the runner.
- `uiIntegration.js` filters `result.ruleResults` by rule geometry, derives the geometry summary, and currently supplies the old `Må rettes` / `Må vurderes` / neutral / `Bestått` presentation status.
- The workspace already enforces one expanded rule ID at a time. The work is to make that behavior explicit and robust across geometry/search/filter/sort changes, not to introduce multiple independent disclosure states.
- `FindingGroups` is the current per-object presentation. It groups findings by reason/value and then prints source indexes. This entire visual object list should leave V2 in A8.1A.
- The header, layer selector, explicit `Kjør` action, GMI-only gate, current-layer freshness check, and geometry tabs/counts are good and remain.
- There are 23 active rules in registry order: 12 common, 5 point, and 6 line. The active point list therefore contains 17 rules and the active line list 18; `23 regler` remains a run/header fact rather than the count shown by each geometry filter.

### 2.2 Engine and result semantics relevant to presentation

`validationRunner.js` creates one result for exactly one `layerId` and one opaque `datasetRevision`. Each rule result has:

- `evaluatedObjectCount`;
- `passCount`;
- `failCount`;
- `notEvaluatedCount`;
- `indeterminateCount`;
- point/line `geometryBreakdown` with the same counters;
- sparse findings only for `FAIL` and `INDETERMINATE`;
- `affectedObjectRefs`, currently containing both failure and indeterminate refs.

The runner increments `evaluatedCount` for every ObjectRef offered to a rule, including an evaluation that returns `NOT_EVALUATED`. Therefore:

```text
evaluatedCount = passCount + failCount + indeterminateCount + notEvaluatedCount
applicableCount = passCount + failCount + indeterminateCount
```

`NOT_EVALUATED` currently means that an allowed-value-only evaluator intentionally did not judge a missing/absent value; uncertainty in schema or binding is `INDETERMINATE`, not `NOT_EVALUATED`. The active A8 rules are required or required-plus-allowed-value rules, so `NOT_EVALUATED` is normally zero today, but the presentation selector must preserve its existing future-facing meaning.

No presentation helper may mutate these counts, rewrite a finding state, add findings for pass/not-evaluated objects, or change the engine's count equations.

### 2.3 Identity and lexical evidence

`ObjectRef` is an immutable identity containing `key`, `layerId`, `datasetRevision`, `geometryScope`, and a geometry-local `sourceIndex`. `assertObjectRefOwnership` verifies all identity dimensions and the internally derived key. A bare source/array index is not an adequate handoff contract.

A8 also stores original GMI field lexemes in a frozen, non-enumerable Symbol-keyed map on each `attributes` object. Ordinary normalized attributes remain unchanged. `objectFieldValue.js` accesses this evidence only by the exported private symbol and an already-bound literal source key, returning both `sourceValue` and `sourceLexeme`. The private map is absent from `Object.keys`, JSON, schema binding, unknown-field diagnostics, and telemetry.

Fildata must preserve that boundary. It must never enumerate symbols, turn the private map into a column, or copy it into UI/store/telemetry state.

## 3. Current table architecture and integration surface

### 3.1 Components, placement, and opening

The existing table is `src/components/LayerDataTable.js`. It is mounted by `src/app/page.js` in the lower 45% of the map/3D area when `state.ui.layerDataTable.isOpen` is true. Opening it reduces the primary map/3D view to 55% and closes Profile Analysis. This layout continues to work while the V2 sidebar is open.

The existing user entry point is the table icon in `LayerPanel.js`, which calls `openLayerDataTable(layerId)`. The store writes the exact table `layerId`; the table then reads `layers[layerId]`. There is no all-layer fallback.

### 3.2 Existing table state/store API

The Zustand state under `ui.layerDataTable` currently contains:

```text
isOpen
layerId
activeTabByLayer[layerId]
sortingByLayer[layerId][punkter|ledninger]
columnOrderByLayer[layerId][punkter|ledninger]
```

Actions are:

- `openLayerDataTable(layerId)`;
- `closeLayerDataTable()`;
- `setLayerDataTableTab(layerId, tab)`;
- `setLayerDataTableSorting(layerId, tab, sorting)`;
- `setLayerDataTableColumnOrder(layerId, tab, order)`.

Only `settings` is partialized into local persistence, so a new table handoff subset should stay ephemeral. It must still be initialized/reset/migrated consistently in all duplicated store initial-state/reset sections.

### 3.3 Geometry, filtering, identity, and map hooks

- Table geometry uses Norwegian tab keys `punkter` and `ledninger`, mapped to `layer.data.points` and `layer.data.lines`.
- Existing filtering is layer filter state: `hiddenCodes`, `hiddenTypes`, and `feltHiddenValues`. The table has no ObjectRef/selection subset API.
- `ui.filteredFeatureIds` is a legacy map visibility path used by Validator 1.0 and `MissingFieldsReport`; it contains generated feature-ID strings, not V2 ObjectRefs, and is not an acceptable V2 table handoff.
- Rows are copied with `__index`, filtered, sorted by TanStack Table, and virtualized by TanStack Virtual. `__index` is then used for map feature IDs, zoom, and highlight.
- Row click/hover uses `setHighlightedFeature` / `setHighlightedFeatureIds`; zoom uses `viewObjectInMap` with layer ID and geometry-local index.
- There is no existing object-row selection API and no row-level search filter.

The smallest clean integration is therefore a narrow ObjectRef subset mode inside the existing table. It must not create a second table and must not route through legacy `filteredFeatureIds`.

## 4. Current Testmodus implementation

`TestModeControl.js` is mounted at the root of `page.js`. After store hydration it:

1. recognizes only the exact single query parameter `testmodus=1`;
2. enables the existing persisted `settings.testMode` flag;
3. removes the activation parameter from the URL;
4. renders a fixed bottom-left amber banner while active;
5. disables the same flag through `updateSettings({ testMode: false })`.

`TabSwitcher.js` is the fixed top-center control containing `Kartoversikt | 3D-visning`. It currently returns nothing unless the 3D viewer is open and data is loaded.

Relocation must preserve the activation effect even before parsed data exists. The recommended change is to make `TabSwitcher` the shared top toolbar, mount it unconditionally as it is today, remove its early return, and render:

```text
[Kartoversikt] [3D-visning] [amber Testmodus pill + compact disable button]
```

The view buttons remain conditional; `TestModeControl` remains mounted inside the toolbar so its hydration/query activation effect always runs. An `empty:hidden` toolbar wrapper avoids an empty visible shell when neither view controls nor Testmodus are visible. The compact pill retains full accessible status text and an `aria-label="Slå av testmodus"`. This is application-toolbar work and has no dependency on Validator 2.0.

## 5. Proposed state and derivation model

Keep the existing view controller as the owner of the run result and active geometry. Add a local presentation reducer/state in the V2 workspace:

```text
searchQuery: string
statusFilter: ALL | ATTENTION | NOT_MET | PARTIALLY_MET | MET
sortMode: ATTENTION | NAME_ASC | NAME_DESC | REGISTRY
expandedRuleKey: `${geometryScope}:${ruleId}` | null
fieldDialog: { ruleId, canonicalFieldId, geometryScope, opener } | null
fieldDialogTab: INSTRUCTION | FILE_DATA
```

Derived selectors receive only the active geometry rule results and this presentation state. They produce view models containing rule identity, registry index, short field name, geometry counts, aggregate status, visibility, and sort rank. They never call `runGmiValidationV2`.

State transitions are explicit:

| Event | Search/filter/sort | Expanded row | Dialog/result |
|---|---|---|---|
| Open/collapse a row | retain | set that one key or `null` | unchanged |
| Open another row | retain | replace prior key | unchanged |
| Sort change | update sort | retain if visible; row may move | unchanged |
| Search/status change | update filter | retain if still visible; otherwise collapse immediately | unchanged |
| Geometry tab change | retain | collapse | same immutable result; derive other view |
| Selected layer change | clear search/status, retain preferred sort | collapse | close dialog; clear stale result as today |
| New explicit run/result | clear search/status, retain preferred sort | collapse | close dialog; use new immutable result |
| Result becomes stale | irrelevant | collapse | close dialog; no old data/table handoff |

If a filter/search hides the expanded row, the reducer collapses it in the same state transition; no hidden panel remains mounted. Focus naturally remains on the search/filter control that caused the change. Sorting alone does not collapse a still-visible row.

The default sort is `ATTENTION`. Presentation preferences remain component-local for this milestone; there is no need to persist search text, accordion state, modal state, or uploaded-data-derived information.

## 6. Exact aggregate status mapping

Introduce a pure presentation helper, for example `getValidationV2AggregateStatus(counts)`. It returns a stable enum, Norwegian label, attention rank, visual token, and a reason code for expanded explanation. It does not replace `EvaluationState` and must not be named or described as file approval.

Definitions:

```text
applicableCount = passCount + failCount + indeterminateCount
```

Precedence and mapping:

| Condition | Aggregate enum | User label | Dot | Reason |
|---|---|---|---|---|
| `fail > 0 && pass === 0` | `NOT_MET` | Ikke oppfylt | red | At least one concrete failure and no applicable evaluation passed. This remains red when indeterminate evaluations also exist. |
| otherwise `fail > 0 || indeterminate > 0` | `PARTIALLY_MET` | Delvis oppfylt | amber | Some applicable evaluations passed and some failed, or at least one evaluation is indeterminate. |
| otherwise `pass > 0` | `MET` | Oppfylt | green | Every applicable evaluation passed; `NOT_EVALUATED` objects are outside the applicable set. |
| otherwise (`applicableCount === 0`) | `PARTIALLY_MET` | Delvis oppfylt | amber | There is no conclusive applicable evaluation; do not claim success or failure. |

Truth table for required edge cases:

| Pass | Fail | Indeterminate | Not evaluated / evaluated | Result |
|---:|---:|---:|---:|---|
| `>0` | 0 | 0 | any valid count | Oppfylt |
| 0 | `>0` | 0 | any | Ikke oppfylt |
| `>0` | `>0` | any | any | Delvis oppfylt |
| `>0` | 0 | `>0` | any | Delvis oppfylt |
| 0 | 0 | `>0` | any | Delvis oppfylt |
| 0 | `>0` | `>0` | any | Ikke oppfylt |
| 0 | 0 | 0 | `notEvaluated > 0` | Delvis oppfylt |
| 0 | 0 | 0 | zero evaluated objects | Delvis oppfylt |

Rationale for the two potentially surprising cases:

- `fail + indeterminate` with zero pass is red because the approved definition of `Ikke oppfylt` is “applicable evaluations exist, none pass, one or more fail.” The expanded counts still expose the indeterminate objects; red does not assert that every object conclusively failed.
- Zero applicable/all-`NOT_EVALUATED` is amber because green would claim unsupported success and red would treat absence of a failure decision as failure. The expanded reason says `Ingen relevante evalueringer` or `Ikke kontrollert`, preserving engine semantics.

Rules outside the active geometry are not list entries at all; the opposite-geometry zero breakdown is never presented as a status. An active geometry with zero objects may still show its applicable rule entries as amber, accompanied by the existing geometry count and an explicit `Ingen objekter å kontrollere` message.

The colored dot is `aria-hidden`; adjacent visible status text is always present. Text and accessible labels must say that the state applies to “denne kontrollen for valgt geometri,” never that the delivery/file is approved or rejected.

## 7. Compact list, labels, sort, filter, and accordion

### 7.1 Short display-name strategy

Do not strip Norwegian suffixes from rule titles at render time. That is fragile and would turn executable rule wording into UI parsing policy.

Use one canonical field-information/presentation registry keyed by `canonicalFieldId`. Its short display name is shared by geometries and rules. Rule definitions retain their complete executable `title` and `description`; the compact list uses canonical `displayName`.

The 20 active canonical labels in this milestone should be:

```text
Høydereferanse
Anleggsår
Datafangstdato
Innmålt av
Saksnummer
Nøyaktighet XY
Nøyaktighet høyde Z
Maksavvik horisontalt
Maksavvik vertikalt
Stedfestingsforhold
Stedfestingsårsak
Synbarhet
Tema
Innvendig/utvendig
Tykkelse
NOBB/VAVVS-nummer
NOBB/VAVVS-nummer ramme
Dimensjon
Nett-type
Rørform
```

This deliberately separates human display names from literal GMI source keys such as `Innmålt_av`, `MaksAvvikHorisontalt`, and `Nett_type`. The modal shows the literal bound source column separately.

Missing display metadata is a development error for an active rule and should be caught by registry tests. A safe production fallback may use the canonical registry's existing `displayLabel`, then the unchanged rule title, but tests should make that path unreachable for the 23 active rules.

### 7.2 Collapsed row and expanded summary

A collapsed row contains only:

- the short display name;
- round status dot;
- visible aggregate status label;
- disclosure chevron.

It contains no per-object counts and no `er gyldig` / `er oppgitt` suffix.

Expanded content contains a compact summary, not object IDs:

- `Objekter i grunnlaget`: geometry `evaluatedCount`;
- `Bestått`: `passCount`;
- `Må rettes`: `failCount`;
- `Må vurderes`: `indeterminateCount`;
- `Ikke kontrollert`: `notEvaluatedCount` (show when non-zero, or always in a consistent compact grid).

Using `Objekter i grunnlaget` avoids falsely saying that `NOT_EVALUATED` objects were checked. Optionally show `Kontrollert` as the separate sum `pass + fail + indeterminate`. Do not repeat layer, geometry, document title, rule description, or allowed-value prose here; those belong in the header or field modal.

Expanded icon actions are:

- `Feltinformasjon` (info icon) in B;
- `Vis avvik i tabell` when the active-geometry `FAIL` count is non-zero, in C.

Do not use `affectedObjectRefs` for the first table action because it mixes failures and indeterminate findings. Select `ruleResult.findings` by both active geometry and `state === FAIL`.

The first implementation should expose FAIL only. The handoff contract may accept a finding-state label so an `INDETERMINATE` action can be added later without redesign, but a second button is not required in A8.1C.

### 7.3 Sorting

Sort modes:

1. `Status – krever oppmerksomhet` (default): `NOT_MET`, `PARTIALLY_MET`, `MET`;
2. `Navn A–Å`;
3. `Navn Å–A`;
4. `Instruksrekkefølge` (the original `result.ruleResults`/registry index).

Attention sorting uses registry index as its stable secondary key. Name sorting uses a single `Intl.Collator('nb-NO', { sensitivity: 'base', numeric: true })`, then registry index as a deterministic tie-breaker. Sorting never writes to the registry/result and never calls validation.

### 7.4 Search and status filtering

Search is case-insensitive Norwegian substring matching over the visible short name only. It does not search long instruction prose, source field aliases, raw uploaded values, or hidden engine metadata.

Use one filter enum:

- `ALL`;
- `ATTENTION` = red or amber;
- exact `NOT_MET`;
- exact `PARTIALLY_MET`;
- exact `MET`.

Counts are derived for the active geometry after search and before the selected status filter. Thus `Alle 17` / `Alle 18` is expected by geometry, while `23 regler` stays in the V2 header.

Recommended narrow-sidebar layout:

```text
[ Søk i kontroller........................ ]
[ Alle 18 ] [ Krever oppmerksomhet 6 ] [ Status ▾ ]
[ Sorter: Status – krever oppmerksomhet ▾ ]
```

At wider sidebar widths the status and sort controls may share a row; at narrow widths they wrap to a two-column grid. Exact statuses live in the compact status menu rather than five always-visible pills. All controls have text labels/accessible names and 44px-equivalent hit targets where space allows.

### 7.5 Accordion behavior

The rule heading is an actual button with `aria-expanded`, `aria-controls`, stable IDs, and Enter/Space toggle behavior. Expanded content is a labelled region. All headings stay in tab order; optional ArrowUp/ArrowDown/Home/End handlers move focus between visible rule-heading buttons without making those keys the only navigation method.

Action buttons are siblings inside expanded content, never nested inside the disclosure button. Visible focus rings are mandatory.

## 8. Field-information metadata model

### 8.1 Hybrid responsibility split

Use a hybrid model:

1. **Canonical field-information registry** keyed once by `canonicalFieldId` owns human `displayName`, source-backed explanatory text, units, documented format/range, qualifications, source-document references, and code meanings. It supports geometry-specific overlays only where the source pages/meaning differ (not duplicate whole entries).
2. **Executable rule definitions** remain authoritative for whether the current rule is required, its active geometry scopes, current allowed tokens, comparison policy, and rule-level source reference.
3. **Canonical field adapter registry** (`registry/fields.js`) remains authoritative for canonical identity and GMI binding names/aliases. Do not turn documentation into alias policy.
4. **Modal selector** composes these three sources. Instruction metadata never drives validation.

This prevents duplicated descriptions for `tema`, `insideOutside`, and `nobbVavvsNumber`, which are used by point and line rules. It also prevents a source-document qualification from silently becoming an A9 condition.

Recommended data shape:

```text
fieldInformation[canonicalFieldId] = {
  displayName,
  description: string | null,
  appliesTo: derived/validated point|line|both,
  units: string | null,
  documentedFormat: string | null,
  range: string | null,
  qualifications: [{ text, validationStatus }],
  valueInfo: { [exactToken]: { label, description|null, sources[] } },
  sources: [{ documentId, title, version, pages, auditSourceRuleIds[] }],
  byGeometry: { point?, line? },
  documentationStatus: COMPLETE | PARTIAL | MISSING
}
```

`required` and `allowedValues` are intentionally absent from this static shape; the modal derives them from the selected active rule. Tests ensure every documented code key is exact and that displayed active tokens come from the rule, not the documentation registry.

Long prose belongs in a data/registry module, not JSX. A small registry loader validates unique canonical IDs, valid source references, exact value keys, and geometry overlays.

### 8.2 Source material already available

The audited repository sources are:

- the two bundled Innmålingsinstruks PDFs;
- `docs/validation-v2/innmalingsinstruks-rule-source-map.json` (83 documentation-only source records; explicitly not a runtime module);
- `docs/agent-reports/20260820-innmalingsinstruks-rule-source-mapping.md`;
- the approved A8 plan/implementation reports;
- active rule definitions and canonical binding registry;
- legacy `src/data/fields.json`, but only as candidate text/value labels where the audit explicitly established an exact source match.

Do not import the documentation-only source map at runtime and do not make Validator 2.0 depend on Validator 1.0's `src/data/fields.json`. Populate a reviewed runtime V2 subset with traceable `auditSourceRuleIds` and page references.

### 8.3 What A8.1B can populate now

For all 20 active canonical fields, A8.1B can populate from already-audited material:

- short human display name;
- canonical ID and literal direct GMI source property (composed from the canonical registry);
- point/line/both applicability;
- current requiredness from the rule evaluator;
- current allowed tokens from the active rule;
- Appendix A document/page reference;
- audited concise description/notes and source confidence;
- documented format/unit where audited, while clearly saying it is informational and not necessarily checked by the current rule.

Specific audited format/unit information available now includes `YYYY`, displayed `DD.MM.YYYY`, integer centimetres for accuracy/deviation, integer millimetres for point wall thickness and line dimension, integer NOBB identifiers with “usually seven digits” explicitly not treated as a strict rule, and text/name fields for case number/surveyor.

The seven unique active code-list fields have audited exact token sets: Høydereferanse, Stedfestingsforhold, Stedfestingsårsak, Synbarhet, Innvendig/utvendig, Nett-type, and Rørform. Their token labels/meanings may be transcribed from the cited Appendix tables. Existing legacy labels/descriptions may accelerate this only after token-by-token verification against those pages; blank/source-absent meanings stay null rather than being invented.

Tema is a required-field rule only in A8. Its disputed/partial code lists must not appear as “allowed by this rule.” The modal can document that Tema is required and cite separate point/line pages, while marking allowed-value documentation as pending domain/source decisions.

### 8.4 Explicitly pending metadata

Represent missing text as `Ikke dokumentert i kontrollert kildemateriale` and retain the source reference/status. Never synthesize a description from a code name.

Pending beyond this milestone's safe population includes:

- unresolved Tema list closure/free-text policy and corrected point/line code inventories;
- date calendar-validity and leading-zero policy;
- accuracy/range exception policy and area-dependent LAGS interpretation;
- whether “usually seven digits” should ever become a rule (currently no);
- disputed conditional/applicability logic and every A9 rule;
- code meanings not actually present in or verified against the cited source table;
- the Appendix A internal version conflict (cover 3.1 versus revision/footer 3.0);
- any prose requiring a new source audit, external standard, or domain-owner approval.

The UI distinguishes `Dokumentert format` from `Kontrolleres av denne regelen`; this prevents helpful field-reference content from implying engine behavior that does not exist.

## 9. Accessible field modal

The info action opens a modal dedicated to the selected canonical field and active geometry/rule context.

Dialog behavior:

- `role="dialog"`, `aria-modal="true"`, and a heading referenced by `aria-labelledby`;
- focus moves into the dialog on open, is trapped while open, Escape closes, and focus returns to the exact info button that opened it;
- background interaction is suppressed while open;
- close button has a visible focus state and accessible name;
- dialog content fits narrow viewports and owns its vertical scroll.

Tabs:

- `Instruks` and `Fildata` are buttons with `role="tab"` inside `role="tablist"`;
- `aria-selected`, `aria-controls`, matching `tabpanel`, and roving focus;
- Left/Right (and Home/End) change tab focus/selection;
- only the active panel is exposed.

`Instruks` shows display name, canonical/source field, current rule scope/requiredness, audited description, active allowed values plus documented meanings, unit/format/range/qualifications, and source/page. Missing sections use the explicit fallback and are omitted from visual clutter when no value exists.

Opening `Instruks` performs no dataset scan. `Fildata` scanning starts only the first time that tab is selected for the current key.

## 10. Fildata aggregation strategy

### 10.1 Inputs and ownership

The aggregation helper accepts:

```text
selected layer object and dataset
current immutable ValidationRunV2
active geometryScope
selected rule/canonicalFieldId
```

It first verifies `isCurrentValidationV2Result(result, layerId, getDatasetRevision(dataset))`. It reuses `result.schemaBinding`; it must not rerun schema binding or validation. It enumerates only the selected geometry's ObjectRefs and resolves the canonical field through the existing A3/A4 functions (`resolveGmiTemaIdentity` for Tema, `extractGmiObjectFieldValue` otherwise).

This gives geometry-specific accepted binding, multiple-source/conflict state, normalized source value, and source lexeme without changing or bloating the immutable validation result.

### 10.2 Summary counts

Return:

- binding state;
- bound source column: one preferred key, a list when multiple accepted keys exist, or explicit absent/ambiguous/unresolved text;
- object count for the active geometry;
- number with a resolved/present value;
- number missing;
- number unresolved/ambiguous (shown only when non-zero);
- exact unique display-bucket count;
- frequency rows and omitted-row count.

`withValue + missing + unresolved = objectCount` must hold. Field-absent objects count as missing for a required field; schema/binding ambiguity counts as unresolved, not missing. Tema conflicts are unresolved/needs-assessment buckets.

Percentages use all active-geometry objects as the denominator so missing/unresolved buckets and present values reconcile to 100% apart from display rounding.

### 10.3 Delivered versus interpreted values

Recommend displaying **both**, with delivered evidence primary:

```text
Levert verdi | Tolket verdi | Antall | Andel | Regelverdi
```

- When `sourceLexeme` is available, frequency grouping includes the exact lexeme. Thus `1`, `01`, `1.0`, and whitespace-padded ` 1` never collapse merely because the parser interpreted them all similarly.
- `Tolket verdi` is shown when it differs from the delivered representation or its type is useful; otherwise it may display a quiet dash to keep the table compact.
- With no lexical evidence, use a type-tagged stable key for the unmodified `sourceValue`. String `"1"`, number `1`, boolean `true`, `-0`, and other primitives cannot collide.
- Never trim, case-fold, stringify-coerce for equality, or apply `parseFloat` in the aggregation key.

Missing representations stay distinct internally and in the table:

- empty delivered lexeme / empty string: `⟨tom⟩`;
- `null`: `⟨null⟩` when no delivered lexeme explains it;
- `undefined`/property not present: `⟨ikke levert⟩`;
- binding/schema uncertainty: `⟨kan ikke fastslås⟩`;
- multi-source conflict: `⟨motstridende kilder⟩`.

All missing variants contribute to the summary's `missing` count but do not need to be falsely merged into one frequency identity. React text rendering supplies escaping; raw HTML is never used.

For rules with an active allowed-value set, `Regelverdi` is derived by calling the same exported rule evaluator with the same `valueComparison` policy and evidence, producing `Godkjent`, `Ikke godkjent`, or `Må vurderes`. Do not implement a second `includes()` policy: that would misclassify A8 lexical evidence, especially Synbarhet. For required-only rules, omit this column.

### 10.4 High cardinality and lazy work

Compute only after Fildata is selected. One scan is `O(objectCount)` and one type-safe frequency Map is `O(uniqueValues)`. Sort frequency rows by count descending, then a deterministic type/lexeme key.

Keep the exact unique count, but expose at most the first 500 deterministic rows in this milestone, in a bounded scroll area, with `Viser 500 av N unike verdier`. This caps rendered output while retaining accurate aggregate counts. Virtualization may replace the 500-row cap later if real datasets require every rare value, but it is not necessary to redesign the table stack here.

Use a module-local cache:

```text
WeakMap<datasetObject, LRU Map<
  layerId | datasetRevision | geometryScope | canonicalFieldId |
  ruleId | bindingSignature,
  frozen FieldDataSummary
>>
```

Limit each dataset's LRU to a small number such as eight distributions. Dataset replacement/removal permits WeakMap garbage collection; revision/binding changes form a new key. Cache values and modal state are memory-only, never sent to Zustand persistence, localStorage, telemetry, logs, or a backend.

Show a loading state while computing. Benchmark the synchronous scan; only introduce chunking/worker work if representative multi-thousand-object scans exceed the agreed interaction budget (for example 50–100 ms). Do not add worker complexity pre-emptively.

## 11. Table integration contract

### 11.1 Validator-side selection

For `Vis avvik i tabell`, derive:

```text
failObjectRefs = ruleResult.findings
  where finding.geometryScope === activeGeometry
  and finding.state === FAIL
  map finding.objectRef
```

Never pass `affectedObjectRefs` unfiltered and never pass indexes or generated map IDs.

Proposed handoff:

```text
openLayerDataTableForObjectRefs({
  layerId,
  datasetRevision,
  geometryScope: 'point' | 'line',
  objectRefs: ObjectRef[],
  source: 'validator-v2',
  ruleId,
  label: 'Avvik: Høydereferanse',
  findingState: 'FAIL'
})
```

The action sets table layer, maps geometry to `punkter`/`ledninger`, opens the existing lower pane, closes Profile Analysis as today, and stores an ephemeral `objectRefSubset` on `ui.layerDataTable`.

### 11.2 Ownership validation and row filtering

Both handoff creation and table consumption fail closed unless:

- current layer exists and matches `layerId`;
- `getDatasetRevision(layer.data)` exactly matches `datasetRevision`;
- every ref passes `assertObjectRefOwnership` for the same layer/revision/geometry;
- every ref's `sourceIndex` is within the selected geometry collection;
- ref keys are unique.

Only after those checks may the existing table dereference each authoritative ObjectRef's `sourceIndex` to the current geometry array. That is use of ObjectRef's local identity, not an array-index fallback. No lookup may search another layer/geometry when a ref is missing or stale.

If ownership is stale, show a fail-closed inline table message such as `Avviksutvalget tilhører en annen versjon av laget. Åpne det på nytt fra Validator.` Do not silently show all rows.

While an ObjectRef subset is active:

- table data is exactly that subset in the selected geometry;
- ordinary layer visibility filters are not mutated and should not hide handed-off failures; the subset is evaluated from the raw geometry collection;
- existing table sort and column order still apply;
- a visible chip states the subset label/count and provides `Fjern utvalg`;
- the opposite geometry tab is disabled until the subset is cleared, preventing a geometry-scoped subset from appearing to cross tabs;
- normal table open, clear-subset, close, layer removal, and reset clear the ephemeral subset;
- map row hover/click/zoom continues through the existing table hooks after ownership validation.

This is a small extension of the good table module, not a table redesign. Column tuning, broader search, selection UX, exports, and table accessibility overhaul remain for the planned table milestone.

## 12. Accessibility plan

Required implementation checks:

- every disclosure, icon action, filter, sort, modal close, tab, and Testmodus disable control is a real `<button>`/form control;
- row disclosure has `aria-expanded`, `aria-controls`, stable IDs, Enter/Space behavior, and visible focus;
- only one disclosure panel exists as expanded at a time;
- status dot never carries the only meaning; the text `Oppfylt`, `Delvis oppfylt`, or `Ikke oppfylt` is visible and announced;
- status labels describe the rule/selected geometry, not file approval;
- search has a persistent visible or programmatic label and a clear action;
- status/sort menus report current selection;
- no nested interactive elements inside the rule-heading button;
- dialog opens with managed focus, traps focus, closes on Escape, restores opener focus, and blocks background interaction;
- tabs use tablist/tab/tabpanel semantics and keyboard navigation;
- frequency table has real column headings, a caption/accessible name, and a bounded labelled scroll region;
- code validity does not rely on green/red alone; text labels remain;
- compact amber Testmodus retains screen-reader status text and an accessible disable action.

Manual keyboard and screen-reader smoke testing is required because the repository currently has no DOM interaction test harness.

## 13. Performance and privacy

- 23 rule view models are cheap and should be memoized by active `ruleResults`, geometry, search, status filter, and sort mode.
- Aggregate status is a constant-time count selector; it does not inspect findings or objects.
- Registry order is captured once from result array position; sorting copies presentation arrays only.
- Search/status/sort/accordion/geometry events cannot call the runner. Preserve the current controller test that counts runner invocations.
- Instruction metadata lookup is constant-time by canonical field ID.
- Fildata is lazy, one geometry/field at a time, exact, memory-only, and weak/LRU cached.
- Frequency output is capped/bounded and stable; no thousands of DOM nodes.
- Table already virtualizes rows and continues to do so for ObjectRef subsets.
- No uploaded values, distributions, source lexemes, ObjectRefs, dialog state, or table subset are persisted or included in telemetry.
- Do not log raw values or private metadata on aggregation errors.

## 14. Implementation slices and order

### A8.1A — compact results workflow + Testmodus relocation

Deliver:

- pure aggregate selector and truth-table tests;
- canonical short names for all 20 active fields;
- compact status-only collapsed rows;
- concise expanded counts and no `FindingGroups`/per-object list;
- one-open reducer behavior across filter/sort/geometry/result changes;
- attention/name/registry sorting;
- search, attention shortcut, exact status filter;
- info/table action placeholders only if needed for layout, not active features;
- Testmodus compact top-toolbar pill with unchanged setting behavior.

Review gate: prove presentation actions do not rerun validation and A0–A8 outcomes/counts are byte-for-byte/structurally unchanged apart from intended V2 presentation helpers.

### A8.1B — field metadata + Instruks/Fildata modal

Deliver:

- reviewed canonical field-information registry and validation;
- accessible dialog/tabs/focus behavior;
- populated safe A8 field documentation and explicit missing fallback;
- geometry-specific binding summary;
- lazy exact-lexeme/type-safe value frequencies;
- current-rule acceptance indicator for code-list rules;
- bounded output and weak/LRU cache.

Review gate: compare representative uploaded lexical variants to A8 engine outcomes and prove no private symbol appears in ordinary fields, persistence, or telemetry.

### A8.1C — `Vis avvik i tabell`

Deliver:

- fail-only, active-geometry ObjectRef derivation;
- strict handoff validator;
- ephemeral table subset store state/action;
- existing table subset mode, label/count/clear behavior;
- stale/cross-layer fail-closed UI;
- regression tests for normal table opening/filter/sort/virtualization behavior.

Review gate: two-layer and two-geometry fixtures prove no cross-layer/geometry/revision leakage and no bare-index handoff.

## 15. Exact expected files

The following is the expected implementation footprint. A later implementation should explain any deviation before expanding scope.

### A8.1A

| File | Change |
|---|---|
| `src/components/validation-v2/ValidationV2Workspace.js` | Replace verbose list/object groups with compact derived list, controls, reducer wiring, and summary actions. Preserve run/layer/geometry architecture. |
| `src/components/validation-v2/ValidationV2RuleList.js` | New focused accordion/list component with accessible headings and compact expanded summary. |
| `src/lib/validation-v2/resultPresentation.js` | New pure aggregate status, filter, stable sort, and presentation-state helpers. |
| `src/data/validation-v2/field-information.json` | New source-backed data shape, initially containing all active short display names, source IDs/pages, and explicit partial/missing documentation markers; enriched in B. |
| `src/lib/validation-v2/registry/fieldInformation.js` | New validated canonical lookup over the field-information data; expanded in B without changing consumers. |
| `src/lib/validation-v2/index.js` | Export public pure helpers only if tests/UI use the package facade. |
| `src/components/TestModeControl.js` | Replace floating banner markup with compact in-flow toolbar pill; preserve activation/disable logic. |
| `src/components/TabSwitcher.js` | Become the always-mounted shared top toolbar and place Testmodus immediately after view buttons. |
| `src/app/page.js` | Remove the standalone floating `TestModeControl` mount; retain `TabSwitcher` mount. |
| `tests/validationV2GmiA81ResultsWorkflow.test.mjs` | New selector, ordering, filter, reducer, source/ARIA contract, and no-rerun tests. |
| `tests/testMode.test.mjs` | Preserve activation/default/persistence behavior. |
| `tests/statsUiContract.test.mjs` | Update placement/compact accessible Testmodus UI contract without changing telemetry semantics. |

`uiIntegration.js` may delegate its old status functions to the new selector or retain compatibility wrappers, but should not continue as a second source of status truth. Existing A6/A7 status assertions must be updated only for the approved presentation vocabulary.

### A8.1B

| File | Change |
|---|---|
| `src/data/validation-v2/field-information.json` | Enrich the A data with reviewed descriptions, units/formats/qualifications, exact code meanings where available, and source traceability; no executable validation policy. |
| `src/lib/validation-v2/registry/fieldInformation.js` | Validate/index data, compose geometry overlays, expose explicit missing fallback. |
| `src/lib/validation-v2/fieldData.js` | New lazy aggregation, type/lexeme bucket encoding, rule-evaluator acceptance, bounded rows, and WeakMap/LRU cache. |
| `src/components/validation-v2/ValidationV2FieldInfoModal.js` | New accessible dialog with Instruks/Fildata tabs and loading/empty/error states. |
| `src/components/validation-v2/ValidationV2Workspace.js` | Own modal state and provide current layer/result context. |
| `src/components/validation-v2/ValidationV2RuleList.js` | Wire the info button and opener focus reference. |
| `src/lib/validation-v2/index.js` | Export only the supported field-info/aggregation facade if useful. |
| `tests/validationV2GmiA81FieldInfo.test.mjs` | New registry, metadata fallback, aggregation, lexical evidence, binding, cache-key, and high-cardinality tests. |

Do not edit `src/data/fields.json`, the parser, the A8 rule registry, or the validation runner for this slice.

### A8.1C

| File | Change |
|---|---|
| `src/lib/validation-v2/tableHandoff.js` | New fail-only ObjectRef selection and ownership-checked handoff builder. |
| `src/components/validation-v2/ValidationV2RuleList.js` | Wire `Vis avvik i tabell` for non-zero active-geometry FAIL findings. |
| `src/components/validation-v2/ValidationV2Workspace.js` | Provide current result/layer/revision and invoke the store handoff. |
| `src/lib/store.js` | Add ephemeral `objectRefSubset` and open/clear actions in every initial/reset/migration location; keep normal open API unchanged. |
| `src/components/LayerDataTable.js` | Consume validated subset, force geometry, bypass ordinary hidden filters for exact subset, show label/count/clear/stale states, retain existing table implementation. |
| `tests/validationV2GmiA81TableHandoff.test.mjs` | New layer/revision/geometry/ObjectRef/fail-only contract tests plus source contract for table reuse. |

No separate table component, map identity mapper, parser modification, or Validator 1.0 file is expected.

## 16. Testing matrix

### 16.1 Aggregate selector

| Case | Expected |
|---|---|
| all pass | Oppfylt / green |
| all fail | Ikke oppfylt / red |
| mixed pass/fail | Delvis oppfylt / amber |
| pass + indeterminate | Delvis oppfylt / amber |
| all indeterminate | Delvis oppfylt / amber |
| fail + indeterminate, zero pass | Ikke oppfylt / red; both counts preserved |
| pass + NOT_EVALUATED only | Oppfylt; not-evaluated count remains visible |
| all NOT_EVALUATED | Delvis oppfylt / amber, no-applicable reason |
| zero evaluated/empty geometry | Delvis oppfylt / amber, no-object reason |
| count reconciliation | helper never changes count equations/result objects |

### 16.2 Compact list and presentation state

- Every active rule resolves one of the 20 exact short labels; no visible `er gyldig` / `er oppgitt` suffix.
- Collapsed rows contain no `bestått`, `må rettes`, `må vurderes`, or `ikke kontrollert` counts.
- Default attention sort is red, amber, green; ties retain registry order.
- Norwegian A–Å and Å–A sorting are deterministic; registry sort exactly restores source order.
- Search checks only visible name and is case-insensitive.
- Exact status filters and attention filter return correct counts for point (17) and line (18) universes.
- Opening B after A leaves exactly B open; toggling B closes it.
- Sort retains visible expansion; search/status hiding the row collapses it.
- Geometry change collapses; search/filter/sort remain; layer/new-result change clears stale presentation state.
- Search/filter/sort/accordion/modal opening each leave runner call count unchanged.
- Header, selected layer, GMI gate, explicit run, and geometry counts remain.

### 16.3 Accessibility interaction

- Buttons/IDs/`aria-expanded`/`aria-controls`/region labelling are present and unique.
- Enter/Space and optional arrow/home/end accordion navigation work.
- Visible focus survives reordering and returns from dialog.
- Dialog traps focus, closes on Escape, restores opener, and blocks background.
- Tabs expose correct roles/selection/panels and keyboard behavior.
- Dot is hidden from accessibility tree while visible text status is announced.
- Testmodus compact disable control is keyboard accessible and retains explanatory accessible text.

Current Node tests can cover pure reducers/selectors and source contracts. Implementation QA must add browser keyboard checks; if committed DOM interaction automation is required, choose a test harness explicitly rather than silently adding a broad dependency in this milestone.

### 16.4 Instruks metadata

- All 20 active fields and 23 rules resolve display/source/page metadata.
- Shared canonical fields do not duplicate base descriptions.
- Point/line overlays choose correct Tema/NOBB pages.
- Requiredness/allowed tokens come from the active rule, never static docs.
- Missing description/code meaning renders the approved fallback, not invented text.
- Document version conflict and informational-vs-validated format label remain visible where applicable.
- Registry rejects unknown fields, duplicate IDs, bad geometry overlays, bad source IDs, and code descriptions not keyed by exact token.

### 16.5 Fildata

- Correct geometry-specific preferred/multiple/absent/unresolved binding is shown.
- Object/with-value/missing/unresolved counts reconcile.
- Exact unique count and frequency counts/percentages reconcile.
- Null, undefined, empty string, booleans, numbers, strings, `-0`, and conflicts have collision-free keys and deliberate labels.
- `1`, `01`, `1.0`, ` 1`, and `1 ` remain distinct delivered values even where normalized values collide.
- Synbarhet accepted/invalid labels exactly match current A8 evaluator behavior.
- Other exact enums retain exact whitespace/case behavior.
- Required-only fields omit code acceptance.
- Field-absent and schema/binding uncertainty are not conflated.
- High-cardinality fixture reports exact unique count, returns at most 500 rows, stable order, and omitted count.
- Reopening the same key hits cache; different layer/revision/geometry/field/binding misses cache.
- No scan occurs before Fildata first opens.
- No symbol/private metadata appears in enumerated fields, JSON, telemetry, or UI field names.
- Running Fildata cannot change subsequent validation outcomes or frozen result identity.

### 16.6 Table handoff

- Same selected layer and active geometry open in the existing lower-pane table.
- ObjectRefs equal exactly the active rule's FAIL findings; indeterminate refs are excluded.
- Duplicate refs are rejected/deduplicated deterministically before store write as specified.
- Wrong layer, revision, geometry, malformed key, or out-of-range ref fails closed.
- Two-layer fixtures prove no cross-layer leakage or fallback.
- Point and line source index zero remain distinct through ObjectRef geometry.
- No API accepts a bare array of indexes or generated map feature IDs.
- Active subset bypasses ordinary hidden layer filters without mutating them.
- Opposite table geometry is unavailable until subset is cleared.
- Clear, close, normal open, reset, layer removal, and stale revision remove the subset.
- Existing sorting, column order, row virtualization, map highlight, and zoom continue.

### 16.7 Testmodus and regression

- Exact `testmodus=1` activation, URL cleanup, hydration fail-closed behavior, persistence, and disable action remain.
- No bottom-left Testmodus floater remains; pill follows `Kartoversikt | 3D-visning` when those buttons are present.
- A0–A8 test suites remain green after intentional presentation assertion updates.
- Validator 1.0 remains default and behavior/source files are unchanged.
- Parser tests, map/Profile Analysis, normal table behavior, stats/telemetry payloads, build, and representative multi-thousand-object performance run remain green.

## 17. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Three statuses have no neutral fourth state | Empty/all-not-evaluated could be mistaken for partial compliance | Map conservatively to amber with explicit reason; keep counts/`Ikke kontrollert`; never say file approval. |
| Red with fail+indeterminate/no pass is misunderstood | Users may assume every object failed | Expanded summary retains both failure and needs-assessment counts; text says status is aggregate for the control. |
| Short labels drift from canonical identity | Search/docs/table could refer to different concepts | One canonical info registry keyed by `canonicalFieldId`; no title-string parsing. |
| Documentation becomes executable policy | Informational format/condition could imply A9 validation | Compose requiredness/allowed tokens from rule; label documented vs checked; metadata never feeds runner. |
| Legacy prose/code descriptions contain errors | UI could publish unaudited claims | Use exact-match audit only; verify meanings against cited PDF; explicit PARTIAL/MISSING fallback. |
| Appendix internal version conflict | Source citation may overstate certainty | Store/show version note; do not resolve silently. |
| Fildata collapses lexical variants | UI could contradict A8 exact outcomes | Delivered lexeme is primary/group key; use same evaluator; exhaustive lexical tests. |
| Private lexical Symbol leaks as a field | Privacy/architecture regression | Access exact exported symbol only inside extractor; never enumerate symbols; serialization/telemetry tests. |
| High-cardinality cache grows across fields | Browser memory growth | Lazy scan, per-dataset LRU limit, WeakMap lifetime, 500-row output cap. |
| Store/table subset persists or goes stale | Wrong rows/layer could be shown | Store state is ephemeral; exact revision checks on open and render; fail closed; clear on all lifecycle events. |
| Existing table filter hides requested failures | Handoff appears incomplete | ObjectRef subset derives from raw collection and temporarily supersedes ordinary hidden filters without mutating them. |
| Source index becomes an informal identity | Cross-layer/index bugs return | Pass full ObjectRefs; validate all owner dimensions/key before dereference; no bare-index API. |
| Testmodus relocation prevents URL activation before data | Test uploads could be tracked | Always mount TestModeControl inside toolbar even when view buttons are hidden; preserve hydration tests. |
| React UI interaction coverage is source-only | Focus/keyboard regressions can escape unit tests | Pure reducer tests plus explicit browser keyboard/screen-reader QA; decide separately on DOM harness. |

## 18. Explicit non-goals

- No new validation rule, evaluator outcome, reason code, severity, allowed-value policy, conditional applicability, format/range enforcement, A9 logic, or whole-file approval decision.
- No mutation or expansion of immutable `ValidationRunV2` for Fildata distributions.
- No parser change and no change to A8 lexical evidence representation.
- No schema-binding, alias, ObjectRef identity, dataset revision, runner, or one-layer input change.
- No validation rerun on geometry, accordion, search, filter, sort, modal, Fildata, or table action.
- No individual failed-object list inside Validator 2.0.
- No second object table, map-only feature-ID handoff, bare-index handoff, cross-layer fallback, or table redesign/tuning milestone.
- No changes to Validator 1.0 logic/config/data/UI behavior; `src/data/fields.json` remains untouched.
- No redesign of the V2 header, layer selector, Punkter/Ledninger tabs/counts, map, 3D view, Profile Analysis, general sidebar, application chrome, or telemetry.
- No persistence/upload of field values, source lexemes, frequencies, ObjectRefs, search state, or modal state.
- No production change, deployment, commit, push, or merge in this planning task.

## 19. Acceptance criteria

A8.1 is acceptable when all of the following are true:

1. V2 still validates exactly one selected GMI layer per explicit run and returns the same immutable 23-rule A8 result/counts/findings.
2. Point and line tabs remain views of that one result and never rerun validation.
3. Every visible rule has one short canonical name and exactly one of Oppfylt/Delvis oppfylt/Ikke oppfylt, following the truth table above.
4. Collapsed rows show no count sentence or verbose title suffix; the list is substantially denser.
5. Default/status/name/registry sorting and search/status/attention filters are stable, deterministic, and presentation-only.
6. Exactly one rule is open; geometry change collapses; filter hiding a row collapses; sort preserves a visible open row.
7. Expanded content has concise reconciled counts and icon actions, with no individual object list.
8. Status is visible in text and color, uses accessible accordion semantics, and never claims authoritative file approval/rejection.
9. Field modal has accessible dialog/tabs/focus behavior and source-backed Instruks metadata with explicit missing/pending representation.
10. Fildata is lazy, geometry/binding-correct, exact-lexeme/type-safe, bounded, cached only in memory, and cannot change validation behavior.
11. `Vis avvik i tabell` opens the existing table for exactly the active geometry's FAIL ObjectRefs in the same layer/revision, with no bare-index or cross-layer fallback.
12. Normal table behavior remains intact outside the ephemeral subset mode.
13. Testmodus is a compact amber pill immediately right of the map/3D controls, and exact activation/disable/telemetry behavior is unchanged.
14. Validator 1.0, parser behavior, map/Profile Analysis, table baseline, telemetry, A0–A8 tests, build, and representative performance checks pass.
15. No implementation crosses the explicit non-goals or expected file boundaries without a reviewed reason.
