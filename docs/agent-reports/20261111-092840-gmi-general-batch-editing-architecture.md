# General-purpose batch editing for all GMI fields — architecture and implementation plan

Date: 2026-11-11, Europe/Oslo. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`.

Type: **architecture investigation and implementation planning only.** No application code, test or style was changed. Nothing was committed or pushed. The only file added is this report.

## 0. Verified starting state

| Check | Result |
| --- | --- |
| Branch | `feature/photo-workspace` |
| HEAD | `13a44a2` «refactor(rettinger): simplify sidebar navigation», the confirmed HEAD; equal to `origin/feature/photo-workspace` |
| Working tree | Clean, apart from the untracked Fable planning report `20261111-085500-…-unified-workflow-planning.md` (left untouched) and this report |
| Tests | **None run in this pass.** The baseline quoted in §10 is the one the Fable report measured on this machine at the same HEAD. |

Evidence: the Fable report (read in full and reused), the R4/R5/R6 reports for context, and a full read of the M1/M2 engine (`changeSet.mjs`, `patch.mjs`, `targets.mjs`, `sourceDocument.mjs`, `sourceIndex.mjs`, `encoding.mjs`, `session.mjs`, `proposed.mjs`, `eligibility.mjs`, `editSessions.mjs`), the view libraries (`gmiEditView.mjs`, `gmiEditBatchView.mjs`, `gmiBatchInspectorView.mjs`, `gmiEditValidation.mjs`, `gmiEditSelection.mjs`), both editors, the canonical field registry, the schema binding, the rule registry (dumped with Node), `fieldPolicy.js`, the applicability derivation in `validationRunner.js`, and `field-information.json`. Two small Node one-liners listed the rule and field metadata; they changed nothing.

---

## 1. Executive recommendation

1. **The generic engine mostly exists already. The missing parts are above it.** M2 already has a generic, source-safe «one column, one lexeme, many explicit objects» builder: `createGmiBatchCorrection(session, { field, lexeme, targets, mode, conflictPolicy })` (`session.mjs:137–185`). It goes through the same `buildGmiChangeSet` as the individual editor's `createGmiObjectCorrection`. That covers stale state, identity guards, column presence, lexeme encoding, reserved columns, fill/overwrite and conflict policy, and it is tested (`gmiEditChangeSets.test.mjs:158–342`). The most general primitive, `createGmiFieldChangeSet(session, { requests })`, also exists: any cells, on any objects, in one ChangeSet. **M1 and M2 need no safety change.** What is missing is (a) one shared description of which columns can be edited and with which values, (b) a per-object preview planner for any field, (c) a field-agnostic batch UI for points and lines.

2. **Build three new pure layers and reuse the rest:**
   - **Field capability** (`gmiEditFields.mjs`): one function decides, for each physical column of a document and geometry, whether it can be edited, which canonical field it binds to, which value domain applies, and which operation kind must be used (generic, hydraulic eligibility, linked Tema/S_FCODE, or refused). The object editor and the batch inspector both read it. The existing `gmiEditFieldPolicy` becomes a thin wrapper, so there is still one implementation.
   - **Value domain** (`validation-v2/fieldValueDomain.js`, the Fable D1 module): options from `VALIDATION_RULES[].allowedValues`, labels from the authoritative value tables, format hints from `field-information.json`. No code list is written twice.
   - **Batch planner** (`gmiFieldBatchPlan.mjs`): turns *selection + column + operation + value* into one classified row per object, using M1 cell resolution, M2 effective cells, the existing per-object Validator overlay (`gmiEditObjectDiagnostics`) before and after the change, and the governing rule's own applicability. It then builds exactly one ChangeSet through the existing M2 builder. **For SDR, Trykklasse and Ringstivhet it hands over to the unchanged M2 eligibility path** (`prepareGmiBatchReview` / `buildGmiBatchSelection`).

3. **Add a dataset-level dry run to every preview.** Sessions are immutable values, so `stageGmiChangeSet(session, changeSet)` returns a hypothetical session without touching the registry. From that hypothetical session, `getGmiProposedState` gives the M1-verified proposed dataset and `validateGmiDataset` gives the full Validator run. Diffing that run against the current Foreslått run gives the exact new and resolved FEIL/SJEKK, **including cross-object rules** (NYTT-year), which the per-object overlay cannot judge (`deferred`). It also proves before approval that the export will verify. Cost: one M1 verification (about 1.3 s on the largest real file, `proposed.mjs:13`) plus one Validator run per preview, not per object.

4. **Validator decisions are evidence, not new rules.** Every rule already reports a per-object `coverageApplicability` (`ALL`, `APPLICABLE`, `EXPECTED`, `NOT_APPLICABLE`, `UNRESOLVED`; `validationRunner.js:322–346`) and its own context fields (`explanationContextFieldIds`, `:368–386`). The planner uses them as follows:
   - `NOT_APPLICABLE` and `UNRESOLVED` objects are **unticked by default** and can be included one by one, with confirmation;
   - the selection profile shows exactly the context fields the governing rule names (for example `sdr` → Tema, Material; `installationYear` → Stedfestingsårsak);
   - no applicability logic is written in the editor.

5. **Enumerated fields are restricted to the authoritative list** (confirmed product decision; this replaces the Fable report's decision D4). An out-of-list delivered value is shown as it is and kept unless the user picks a listed value. There is no «type any code» fallback. An exception mechanism is listed as a separate open decision (A2).

6. **Missing physical columns stay a hard limit.** The verifier explicitly fails `field-names-changed`, `field-count-changed`, `attribute-keys-changed` and `structure-changed` (`verify.mjs:205`, `:227`, `:237`, `:262`). Adding a column is a different kind of edit (a structural rewrite of `_FIELDNAMES` and every `_FIELDVALUES` line of one geometry). It is planned as a separate track, X1–X3, with its own verifier contract, and it is **not** a dependency of the general batch editor. Absent fields are listed in the field picker as «Finnes ikke i filen» with that reason; they are not hidden.

7. **Order: generic batch before the Validator handoff.** The handoff (H1–H3) is only useful when the inspector it opens can edit what was selected. Recommended order: G1 → G2 → G3 → G4 (**minimum useful milestone**, deployable and testable on a real file) → G5/G7 → H1–H4 → G6/G8/B3 → H5. The U and T slices stay as planned and can run in parallel.

**Minimum useful milestone (MUM = G1–G4):** points and lines; every bound field whose column exists and is editable, except Tema/S_FCODE when both columns are present (G8); enumerated values chosen from the list; numeric, date, year and text values typed and judged by the Validator; *Fyll manglende verdier* and *Sett verdi*; per-object preview with before/after FEIL/SJEKK; dataset dry run; confirmation for new FEIL, overwrite, conflict replacement, manual inclusion and mixed selections; SDR/Trykklasse/Ringstivhet unchanged through M2 eligibility. Example that must work: four LOK points missing `InnvendigUtvendig` → choose `OD` → four previewed changes → approve → one ChangeSet, undoable, exportable.

---

## 2. Current architecture and limitations

### 2.1 What is already general

| Layer | Code | Generic? |
| --- | --- | --- |
| Cell identity | `resolveGmiCell(document, {scope, sourceIndex, field, objectId?, guid?})` (`targets.mjs:28–64`) | Yes. Any delivered column, both geometries, identity guards, per-cell refusal codes (`field-absent`, `duplicate-field-name`, `object-not-editable`, `unnamed-field`, `no-value-separator`, `cell-not-indexed`) |
| Lexeme safety | `validateGmiFieldLexeme` (`encoding.mjs:104–125`) | Yes. `;`, line breaks, controls, C1, unrepresentable characters are refused for any field. `''` is a valid lexeme (empties a value). |
| ChangeSet build | `buildGmiChangeSet` (`changeSet.mjs:134–249`), reached from `createGmiObjectCorrection`, `createGmiBatchCorrection({targets})`, `createGmiFieldChangeSet({requests})` | Yes. One builder for every entry point. Fill-missing vs overwrite, skip vs replace, reserved-column refusal, duplicate-target refusal, frozen and registered |
| Staging, undo/redo, discard | `stageGmiChangeSet`, `undoGmiEdit`, `redoGmiEdit`, `discardGmiChangeSet` (`session.mjs:201–258`) | Yes. Pure transitions on immutable sessions; stale/foreign sets refused |
| Proposed copy and export | `compileGmiEffectiveEdits` → `editGmiFields` → `verifyGmiEdit` (`proposed.mjs:88–136`, `patch.mjs:125–134`) | Yes. Byte splice of exact value spans plus an independent reparse proof |
| Per-object Validator overlay | `gmiEditObjectDiagnostics({view, scope, sourceIndex, rows, drafts})` (`gmiEditValidation.mjs:54–77`) | Yes. Any field, both geometries, all rules for that geometry; cross-object outcomes reported as `deferred`, never as resolved |
| Full validation of Foreslått | `revalidateGmiEditSession`, `validateGmiDataset` (`proposed.mjs:156–190`) | Yes |
| Registry and identity | `createGmiEditSessions` handle checks, fingerprint, intact bytes (`editSessions.mjs:272–284`) | Yes |
| Selection | `reduceGmiEditSelection` (`gmiEditSelection.mjs:25–54`) | Yes. Both geometries, one geometry per selection |

### 2.2 What is field- or geometry-specific today

| Limitation | Code | Consequence |
| --- | --- | --- |
| Batch field list is three hard-coded entries | `GMI_BATCH_FIELDS` (`gmiEditBatchView.mjs:6–8`); shared with the legacy `GmiBatchDialog.js:7`, `:117` | No other field can be batch-edited |
| Batch preview requires M2 eligibility | `prepareGmiBatchReview` calls `evaluateGmiBatchEligibility`, which accepts only `sdr`, `pressureClass`, `ringStiffness` and only `line` (`eligibility.mjs:36–42`, `:68–69`, `:42` `RULE_SCOPE = 'line'`) | `unsupported-field` for everything else |
| Batch preview reads `proposed.dataset.lines` | `gmiEditBatchView.mjs:45` | Points impossible |
| Selection targets refuse points | `gmiSelectionTargets` returns `line-only` (`gmiBatchInspectorView.mjs:10`, regex `^line:` at `:14`) | Points impossible |
| Labels and counts say «ledninger» | `gmiEditBatchView.mjs:89`, `GmiBatchInspector.js:211`, `:246` | Cosmetic, but wrong for points |
| Field and value controls | Free-text value; field select with default `'sdr'` (`GmiBatchInspector.js:40`, `:170–171`) | No code lists; a field is chosen before the user chooses one |
| Column editability rule lives in the object editor only | `gmiEditFieldPolicy` (`gmiEditView.mjs:219–225`), only caller `GmiObjectEditor.js:42` | A batch path would have to re-implement it |
| Individual editor value control | Plain `<input type="text">` (`GmiObjectEditor.js:206`) | Any code can be typed; no lists |
| Risk dialog triggers | Only manual override, populated overwrite, conflict replacement (`GmiBatchInspector.js:135`) | New FEIL alone does not trigger confirmation |

### 2.3 What is deliberately not editable (and must stay so)

- **Structure:** object number (`:P n`/`:L n`), `GUID` line, `_EXTENT`, `/XYZ` coordinate lines, `_FIELDNAMES`, header. These are not `_FIELDVALUES` spans, so `applyGmiPatches` refuses them (`range-not-a-field-value`, `patch.mjs:92`), and the verifier fails any change (`object-identity-changed`, `geometry-changed`, `header-changed`, `field-names-changed`; `verify.mjs:226–236`).
- **S_HYPERLINK and aliases:** refused at build, stage and compile (`changeSet.mjs:152`, `session.mjs:209`, `:272`). Removal is a separate M7 capability (`hyperlinkRemoval.mjs`).
- **Identifier-named columns:** `GUID`, `UUID`, `OBJID`, `Objekt_ID`, `LokalId`, `ID` (optionally `S_` prefixed) are refused by the UI policy (`gmiEditView.mjs:212`, `:223`). M1 could patch them; the UI deliberately does not.
- **Irregular objects and cells:** objects with zero, several, too many or too few `_FIELDVALUES` entries; unnamed columns (a trailing `;` in `_FIELDNAMES` is common in real files: `S_FCODE;Type;…;Kumform;`); duplicate column names; documents that are read-only for any file-level reason.

---

## 3. Field-category capability matrix

### 3.1 By category

| # | Category | Individual editor today | Source-safe engine | Needed for batch | Generic op enough? | Safeguards | Identity/structure risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Enumerated, strict list** (20 fields, §3.2) | Free text | Yes, value span only | Domain options; restricted control; per-object Validator verdict | Yes, except Tema/S_FCODE (row 8) and the three hydraulic fields (M2 eligibility) | Restricted list; Validator before/after; dataset dry run | None |
| 2 | **Numeric** (integer and decimal) | Free text | Yes | Text control with `inputMode`, unit and format hint; **no reformatting** (`11,0` stays `11,0`) | Yes | Validator verdict (integer/decimal/range rules are already in `fieldPolicy.js`) | None |
| 3 | **Date / year** (Datafangstdato `DD.MM.YYYY`, Anleggsår `YYYY`) | Free text | Yes | Date and year controls that emit the exact lexeme; text fallback | Yes | Validator verdict; **dataset dry run required** (NYTT-year is cross-object) | None |
| 4 | **Free text** (Merknad, Innmålt_av, Saksnummer) | Free text | Yes | Text control; encoding feedback; length hint | Yes | Lexeme check; Validator (255-char limit; placeholder SJEKK) | None |
| 5 | **Optional, missing** | Editable if the column exists | `fill-missing` mode | «Fyll manglende verdier» | Yes | Applicability from the Validator; current-finding split; no assumption that missing must be filled | None |
| 6 | **Already populated** | Overwrite tick | `overwrite` mode | «Sett verdi», «Erstatt verdi» | Yes | Overwrite count and confirmation; per-object old → new | None |
| 7 | **Conditional applicability** (Kumform, Byggemetode, Kjegle, Bredde, Tykkelse, Avst_…, Adkomst, Type, VertikalDimensjon, SDR/Ringstivhet/Trykklasse) | Editable | Yes | `NOT_APPLICABLE` / `UNRESOLVED` unticked by default, includable with confirmation | Yes (hydraulic: M2 eligibility) | Rule's own `coverageApplicability` | None |
| 8 | **Cross-field dependencies** (Tema ↔ S_FCODE; Type ↔ Tema; InnvendigUtvendig (point) ↔ Bredde; SDR ⊕ Ringstivhet; Rørform → VertikalDimensjon; Anleggsår ↔ Stedfestingsårsak ↔ Datafangstdato; Material/Tema → hydraulic fields) | Editable; overlay shows all-rule effects for one object | Yes | Preview runs all rules for the object, not only the edited one; profile shows the rule's context fields | Yes, **except Tema when both `Tema` and `S_FCODE` exist**: writing one creates `TEMA_CONFLICT`. Needs a linked operation that writes both cells in one ChangeSet (`createGmiFieldChangeSet`) | Dataset dry run; downstream findings listed | None in bytes; large downstream semantic effect for Tema and Material |
| 9 | **Absent physical column** | Not shown (no cell) | Refused: `field-absent` (`targets.mjs:43`); verifier forbids field-set changes | Listed in the picker as unavailable with the reason | No. Needs column insertion (X track) | — | Structural; separate capability |
| 10 | **Identifiers, coordinates, geometry** | Identifier-named columns refused; structure not reachable | Structure not reachable at all | Not offered | No | — | Would break identity; future specialist operations only (out of scope) |
| 10a | **AnleggsID** (`facilityId`) | **Editable** (regex does not match it) | Yes | Not as a shared batch value | No: one value on many objects makes an identifier non-unique | Recommend individual only (A6) | Semantic identity |
| 11 | **S_HYPERLINK** and aliases | Refused | Refused ×3 | Shown disabled: «styres av bildeleveransen» | No; M7 removal exists, M8 FOTO owns delivery intent | Unchanged | Photo delivery intent |
| 12 | **Unknown, disabled-alias and recognized-unresolved columns** (for example `DIM`, `HREF`, `Dato`, `MATERIALE`, custom columns) | Editable as text | Yes | Text control; the inspector says the Validator does not check this column | Yes, with explicit confirmation (A5) | Lexeme check only; no domain | None in bytes; no semantic check |
| 13 | **Retired/informational** (Synbarhet; AnleggsID informational rule) | Editable | Yes | Text/code control | Yes (Synbarhet) | Validator always PASS for Synbarhet | None |

### 3.2 Field by field (canonical registry, `registry/fields.js`, rules from `registry/rules.js`)

Kind: E = strict enumeration (option count), I = integer, D = decimal, Y = year, Dt = date, T = text. Path: G = generic planner, H = M2 hydraulic eligibility, L = linked Tema/S_FCODE (G8), — = not batch.

| Field (source key) | Geom. | Kind | Value comparison | Cross-field / applicability evidence | Path | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Høydereferanse | P+L | E 7 | exact | `UKJENT` → SJEKK | G | |
| Målemetode | P+L | E 69 | integer-code string | `96` preferred | G | numeric codes: no upper-casing; searchable |
| MålemetodeHøyde | P+L | E 35 | integer-code string | `97` SJEKK | G | searchable |
| Vertikalnivå | P+L | E 7 | exact | Tema (LOK/GUT) changes recommendation | G | |
| Stedfestingsforhold | P+L | E 10 | exact | | G | |
| Stedfestingsårsak | P+L | E 6 | exact | Anleggsår; **cross-object NYTT-year** | G + dry run | |
| Tema (or S_FCODE) | P 81 / L 108 | E | exact | Drives most applicability, hydraulic class, Type compatibility | G if one column; **L if both** | Large downstream effect; FOTO reads `S_FCODE` from the source (`gmiPhotoSource.mjs:56`), see G8 |
| Type | P | E 72 | exact | Type–Tema compatibility rule | G | searchable |
| Kumform | P | E 7 | exact | Tema applicability | G | |
| Byggemetode | P | E 15 | exact | Tema applicability; `UK` SJEKK | G | |
| Kjegle | P | E 5 | exact | Tema applicability | G | |
| InnvendigUtvendig | P / L | E 2 | exact | Point: depends on Bredde; KUM+OD / LOK+ID SJEKK | G | the brief's main example |
| Eier | P+L | E 13 | exact | `AN` SJEKK | G | |
| Adkomst | P | E 5 | exact | EXPECTED on KUM | G | |
| Material | L | E 45 | exact | Changes SDR/Ringstivhet applicability | G | searchable; dry run shows downstream |
| Nett_type | L | E 8 | exact | | G | |
| Rørform | L | E 7 | exact | Drives VertikalDimensjon | G | |
| SDR | L | E 13 | **numeric** | Tema + Material; exclusive with Ringstivhet | **H** | unchanged |
| Ringstivhet | L | E 7 | exact | Tema + Material | **H** | unchanged |
| Trykklasse | L | E 15 | exact | Tema | **H** | unchanged |
| Bredde | P | I mm | | Tema applicability | G | |
| Lengde | P | I mm | | | G | |
| Utvendig_høyde | P | I mm | | | G | |
| Tykkelse | P / L | I (P) / D (L) | | Tema (P) | G | field-information says «Heltall»; the point policy accepts decimals. The control does not judge |
| Avst_BunnInnvUnderUtv | P | D m | | Tema | G | |
| Dimensjon | L | I mm | | `< 32` SJEKK | G | |
| VertikalDimensjon | L | I mm | | Rørform | G | |
| Nøyaktighet, NøyaktighetHøyde, MaksAvvikHorisontalt, MaksAvvikVertikalt | P+L | I cm | | ranges in policy | G | |
| NOBB-VAVVS-nr, NOBB-VAVVS-nr-ramme | P(+L) / P | I | | | G | product numbers: a shared value is plausible |
| Anleggsår | P+L | Y | | Stedfestingsårsak; **cross-object NYTT-year** | G + dry run | |
| Datafangstdato | P+L | Dt `DD.MM.YYYY` | | Before Anleggsår → FEIL; future → FEIL; older than 5 years → SJEKK | G | reference date = the Kontrolldato |
| Merknad | P+L | T ≤ 255 | | | G | |
| Innmålt_av, Saksnummer | P+L | T | | Placeholder → SJEKK | G | |
| Synbarhet | P+L | code 0–3 (retired rule) | | | G | |
| AnleggsID | P | T | | Informational | — (individual only, A6) | |
| S_HYPERLINK | P+L | T | | | — | M7/M8 |

Non-canonical columns (category 12) and structural items (category 10) are as in §3.1.

---

## 4. Proposed general-purpose batch architecture

### 4.1 Layers

```
 GmiObjectEditor                    GmiBatchInspector (points + lines)
   │                                    │
   │  GmiFieldValueInput (shared control: select / combobox / date / year / text)
   │                                    │
   ├──────────── gmiEditFields.mjs ─────┤   NEW  column capability + draft check (one implementation)
   │               │                    │
   │      validation-v2/fieldValueDomain.js   NEW  options/labels/format from rules + value tables
   │                                    │
   │                         gmiFieldBatchPlan.mjs   NEW  per-object plan, ChangeSet build, dry run
   │                                    │        └─ hydraulic fields → gmiEditBatchView.mjs (unchanged)
   │                                    │
 createGmiObjectCorrection     createGmiBatchCorrection({targets}) / createGmiFieldChangeSet({requests})
   └──────────────────── buildGmiChangeSet (M2, unchanged) ──────────────────┘
                     stage / undo / redo / proposed / verify / export (M1–M3, unchanged)
                     gmiEditObjectDiagnostics (small additive extension) · validateGmiDataset
```

### 4.2 Column capability (`src/lib/gmiEditFields.mjs`, new)

```js
describeGmiEditColumns(view, scope) → {
  columns: [{
    sourceKey, position,                 // exact delivered column name and position
    canonicalFieldId, bindingState,      // from the schema binding of the document dataset
    mappingKind,                         // DIRECT | CASE_NORMALIZED | ACCEPTED_FALLBACK | null
    validatorKind,                       // 'bound' | 'unknown' | 'disabled-alias' | 'recognized-unresolved'
    editable, reason,                    // column-level refusal: reserved, identifier, unnamed, duplicate, document read-only
    operationKind,                       // 'generic' | 'hydraulic' | 'linked-tema' | 'refused'
    domain,                              // from fieldValueDomain (null for non-canonical columns)
    governingRuleId,                     // the field rule for this geometry, if any
    linkedSourceKeys,                    // ['Tema','S_FCODE'] when both are accepted candidates
  }],
  absent: [{ canonicalFieldId, label, reason: 'field-absent' }],   // canonical fields for this geometry with FIELD_ABSENT
}
```

- **Column list** comes from the parser's `pointFieldNames` / `lineFieldNames` of the document. The binding comes from `bindGmiLayerSchema` on the document dataset, cached per document, as `gmiEditValidation.mjs:40–42` already does.
- **Column-level refusal** is the existing `gmiEditFieldPolicy` logic: reserved prefix, identifier regex, document state. `gmiEditFieldPolicy(cell)` keeps its signature and calls the shared predicate, so the object editor's behaviour is unchanged.
- **Per-object editability** is still decided by M1 (`resolveGmiCell`) in the planner, because it can differ between objects (irregular objects).
- `operationKind = 'hydraulic'` exactly for the keys of `GMI_BATCH_ELIGIBILITY_RULES`. `linked-tema` when the Tema binding has both `Tema` and `S_FCODE` as accepted candidates (`MULTIPLE_ACCEPTED`). `refused` for S_HYPERLINK, identifiers and `facilityId` (A6).
- **Draft check, the single implementation of value validity:**

```js
checkGmiFieldDraft(column, input, encodingClass) →
  { lexeme, normalized: boolean, ok, problem, outOfDomain }
```

  It upper-cases input for `domain.upperCase`, runs `validateGmiFieldLexeme`, and for enumerations requires `lexeme` to be one of `domain.options[].value`, with an exception for keeping the current value (no edit). `planGmiObjectForm` and the batch setup both call it. Nothing else validates values.

### 4.3 Value domain (`src/lib/validation-v2/fieldValueDomain.js`, new; Fable D1 unchanged)

As specified in the Fable report §3.7: `getGmiFieldValueDomain({canonicalFieldId, geometryScope})` → `{kind, options, upperCase, ruleId, unit, format, comparison}`. Two additions:

- `comparison` is copied from the rule's `valueComparison` (`EXACT`, `INTEGER_CODE_STRING`), plus `numeric` for SDR (policy at `fieldPolicy.js:229–231`). It is used only to show an out-of-list delivered value as «tilsvarer 11» rather than «ikke i kodelisten». **The offered value is always the listed lexeme.**
- `kind` for non-enumerated fields is derived from `documentedFormat` (`Heltall` → integer, `Desimaltall` → decimal, `YYYY` → year, `DD.MM.YYYY` → date, `Tekst…` → text, `Kode 0–3` → text). It is a hint for the control only.

### 4.4 Batch planner (`src/lib/gmiFieldBatchPlan.mjs`, new)

```js
// Setup → per-object rows. Async, chunked, cancellable (same pattern as prepareGmiBatchReview).
prepareGmiFieldBatch(view, {
  scope, sourceKey,                          // the physical column
  operation,                                 // 'fill-missing' | 'set' | 'replace' | 'clear'
  value, match?,                             // match = old value for 'replace'
  targets,                                   // explicit {scope, sourceIndex, objectId, guid} from the selection
}, { yieldWork, isLive }) → { ok, preview } | { ok:false, code }

// Decisions → one ChangeSet, rebuilt against the live session (never cached across states).
buildGmiFieldBatch(session, preview, { included: Set<objectKey>, replace, approvals }) → { ok, changeSet, rows, counts }

// Dataset-level consequences of exactly that ChangeSet.
dryRunGmiFieldBatch(session, changeSet, { referenceDate }) → { ok, verification, introduced, resolved, byObject }
```

**Routing:** if `column.operationKind === 'hydraulic'`, `prepareGmiFieldBatch` calls the existing `prepareGmiBatchReview` and `buildGmiBatchSelection` and adapts their rows to the common row shape. The generic path is never used for those three fields (contract test, §10).

**Per object, in source order:**

1. `resolveGmiCell(document, {scope, sourceIndex, field: sourceKey, objectId, guid})` → structural status or refusal code.
2. Current value: the effective cell (`gmiSessionEffectiveCells` through `getGmiEditCell`), giving `original`, `current` and `changedBy`.
3. **Operation match:**

   | Operation | Requests the object when | M2 mode |
   | --- | --- | --- |
   | Fyll manglende | `current` is missing (parser-equivalent) **and** the original is missing | `fill-missing` |
   | Sett verdi | always | `overwrite` |
   | Erstatt verdi | `current === match` (exact lexeme) | `overwrite` |
   | Tøm verdi | `current` is not missing | `overwrite`, lexeme `''` |

4. **Validator evidence:** `gmiEditObjectDiagnostics` before (current values) and after (with the draft), exactly as `prepareGmiBatchReview` does today (`gmiEditBatchView.mjs:46–58`). Additive extension: also return the governing rule's outcome (`state`, `reasonCode`, `diagnosticFacts.coverageApplicability`, `context`, `explanationContextFieldIds`) for the edited field. The data is already in `result.outcomes`; it is only not returned.
5. **Classification** (§6.1) and the default inclusion decision.

**ChangeSet:** `createGmiBatchCorrection(session, { field: sourceKey, lexeme, targets: includedTargets, mode, conflictPolicy, label, createdAt, intent })`, built **twice** as today (once to count, once with the real label; `gmiEditBatchView.mjs:83–89`). Linked Tema/S_FCODE (G8) uses `createGmiFieldChangeSet(session, { requests })` with two requests per object.

**ChangeSet intent (small additive M2 change):** `buildGmiChangeSet` copies an optional frozen `intent: { operation, sourceKey, value, match, scope, excluded: {notApplicable, user, mismatch} }` into the ChangeSet. `null` for all existing paths. This gives the change list an accurate title («Erstatt Material PE → PE100 · 12 ledninger») without parsing labels. It needs no migration: sessions and ChangeSets are never persisted (`editSessions.mjs:10–13`).

### 4.5 Dataset dry run (`src/lib/gmi-edit/dryRun.mjs`, new, pure)

```js
dryRunGmiChangeSet(session, changeSet, { cache, layerId, referenceDate }) {
  const staged = stageGmiChangeSet(session, changeSet);        // pure; registry untouched
  if (!staged.ok || !staged.staged) return …;
  const proposed = getGmiProposedState(staged.session, { cache }); // M1 plan → splice → verify
  if (!proposed.ok) return { ok: false, stage: proposed.stage };   // the export would fail: block staging
  const before = validateGmiDataset(getGmiProposedState(session, { cache }).dataset, { layerId, referenceDate });
  const after  = validateGmiDataset(proposed.dataset, { layerId, referenceDate });
  return { ok: true, verification: proposed.verification, diff: diffFindings(before, after) };
}
```

- It lives in `gmi-edit/` because it composes M2 primitives. It never calls the registry, so it cannot stage anything.
- **Cache (A4):** using the default proposed cache means the real stage afterwards is a cache hit (same `effectiveKey`), so staging is instant. The LRU holds 4 entries per document (`proposed.mjs:51`), enough for the current state and one hypothetical. Recommended.
- The finding diff is keyed by `ruleId|objectRef|state|reasonCode`, so the preview can say per object «ny FEIL: Stedfestingsårsak deler NYTT-år…» even where the local overlay said `deferred`.

### 4.6 One operation for both editors?

**Yes at the engine level, no at the request-shape level, and that is right.**

- Both editors already end in `buildGmiChangeSet`. «Apply field X = value Y to these explicitly selected source objects» is exactly `createGmiBatchCorrection({field, lexeme, targets})`, and the individual editor is «several fields on one object» (`createGmiObjectCorrection`). Forcing the object form through a batch shape would lose its multi-field ChangeSet (one undo step per form review), which users rely on.
- **What must be shared, and will be:** column capability, value domain, the draft check (normalisation, lexeme, enumeration restriction), per-object Validator overlay, overwrite/conflict semantics (both already derive from M2 cell state) and the value control. After G1 and G5 there is no second implementation of field validity, value normalisation or column editability.
- **What stays separate:** form state and review (one object, many fields) versus preview state (many objects, one field); M2 eligibility for the hydraulic fields; the dataset dry run (batch only at first; the object editor can adopt it later for Anleggsår/Stedfestingsårsak).

---

## 5. Reuse versus required changes

| Component | Change | Notes |
| --- | --- | --- |
| `gmi-edit/targets.mjs`, `patch.mjs`, `verify.mjs`, `encoding.mjs`, `sourceDocument.mjs`, `sourceIndex.mjs`, `proposed.mjs`, `eligibility.mjs`, `editSessions.mjs`, `exportGmi.mjs`, `hyperlinkRemoval.mjs` | **None** | |
| `gmi-edit/changeSet.mjs` | Additive: optional frozen `intent` | Existing sets get `intent: null` |
| `gmi-edit/session.mjs` | Pass `intent` through `createGmiBatchCorrection` / `createGmiFieldChangeSet` | No safety change |
| `gmi-edit/dryRun.mjs` | **New** | Pure composition |
| `gmi-edit/index.mjs` | Export `dryRunGmiChangeSet` | |
| `validation-v2/*` (rules, policy, runner, binding) | **None** | |
| `validation-v2/fieldValueDomain.js` | **New** | Fable D1 |
| `gmiEditValidation.mjs` | Additive: return the governing rule outcome next to `findings` | Existing callers unaffected |
| `gmiEditView.mjs` | `gmiEditFieldPolicy` delegates to the shared predicate; `summarizeGmiChangeSet` reads `intent` when present; new messages | Behaviour unchanged for existing sets |
| `gmiEditFields.mjs` | **New** | Capability + draft check |
| `gmiFieldBatchPlan.mjs` | **New** | Planner |
| `gmiEditBatchView.mjs` | **None**; called by the planner for hydraulic fields | Legacy dialog keeps working |
| `gmiBatchInspectorView.mjs` | `gmiSelectionTargets` for both geometries (validate against `dataset.points` / `dataset.lines`); scope-state and table-review helpers take the common row shape | |
| `GmiBatchInspector.js` | Field picker from capabilities; no default field; shared control; operations; generic preview; extended gates; points | Largest UI change |
| `GmiObjectEditor.js` | Shared control and draft check (G5) | |
| `GmiFieldValueInput.js` | **New** | G4 basic, G5 complete |
| `LayerDataTable.js` | Review columns already keyed by `scope:index` (`:621–626`); verify for points; no logic change expected | |
| `GmiBatchDialog.js` (legacy) | **None** (R7 decides) | Shares `GMI_BATCH_FIELDS`, which stays |

---

## 6. Safety and validation semantics

### 6.1 Per-object preview states

Each selected object gets exactly one primary state and any number of flags. Default inclusion is shown as the checkbox state in the review column.

| Primary state | Condition | Default | Can include? |
| --- | --- | --- | --- |
| **Endres – fyller tom verdi** | operation matches, current missing | ✔ | — |
| **Endres – overskriver** | operation matches, current populated (Sett/Erstatt/Tøm) | ✔ | — (gate: overwrite approval) |
| **Uendret – har allerede verdien** | `current === lexeme` | — | no (nothing to do) |
| **Passer ikke operasjonen** | Fyll: populated; Erstatt: `current ≠ match`; Tøm: already empty | ✘ | no (change the operation instead) |
| **Gjelder ikke ifølge Validator** | governing rule `coverageApplicability = NOT_APPLICABLE` | ✘ | yes, per object, gated |
| **Uavklart anvendelighet** | `UNRESOLVED` (for example invalid Tema) | ✘ | yes, per object, gated |
| **Tidligere rettet** | `changedBy` non-empty and value differs | ✘ | yes with «Erstatt tidligere rettinger» (existing M2 `replace`) |
| **Kan ikke rettes i kilden** | M1 refusal: `object-not-editable`, `duplicate-field-name`, `no-value-separator`, `cell-not-indexed`, identity mismatch | ✘ | no |

Flags on included objects (from the overlay, and after the dry run from the dataset diff):

- **Ny FEIL** / **Ny SJEKK** — `transition === 'introduced'` on any rule, not only the edited field's rule. Cross-field consequences are therefore visible (for example InnvendigUtvendig `OD` on a KUM → SJEKK; Tema change → Kumform FEIL).
- **Løser FEIL/SJEKK** — `transition === 'resolved'`.
- **Krever full kontroll** — the overlay returned `deferred` for this object; the dry run settles it.

Setup-level refusals (no per-object preview at all): column absent, refused or ambiguous; value not in the domain for enumerations; lexeme invalid for the file encoding; no objects selected; selection of another session.

### 6.2 Approval gates

Staging is always an explicit button press after a valid preview. It goes through the existing compact risk dialog (`GmiConfirmDialog`) with the existing exact-approval token (`GmiBatchInspector.js:131`: selection object, review, decisions) when any of these holds:

1. any included object gets **new FEIL** (local or dry run);
2. any **populated value is overwritten** or a **previous correction is replaced** (existing);
3. any object is **manually included** against the Validator's applicability;
4. the selection is **mixed** on a profile column (§7.3);
5. the column is **not checked by the Validator** (category 12);
6. the dry run reports **cross-object** findings the local preview did not show.

The dialog lists the objects per reason and the exact operation: «Sett InnvendigUtvendig → OD på 4 punkter».

### 6.3 Staleness and invalidation

| Event | Effect (existing mechanism unless marked new) |
| --- | --- |
| Stage, undo, redo, discard | `preview.session !== view.session` → preview invalid (`gmiEditBatchView.mjs:75`) |
| Selection widened | `expanded` → invalid; narrowing keeps the preview (`gmiBatchInspectorView.mjs:28`) |
| Field, operation, value or match changed | `invalidate()` (existing pattern) |
| Source replaced, session invalidated | Selection reconciled away; handle refused |
| Dry-run result | **New:** bound to the ChangeSet object; any rebuild (narrowing, inclusion toggle, replace toggle) re-runs it, debounced; stage refused until the dry run for that exact ChangeSet is `ok` |
| Kontrolldato changed | **New:** dry run re-runs (reference date is part of `validateGmiDataset`'s key) |

### 6.4 Invariants kept

- No value is suggested, computed or pre-filled. No field is chosen by default.
- Original stays the delivered bytes; Foreslått is always compiled from the immutable original plus the ChangeSet history.
- S_HYPERLINK is refused at three layers; nothing in this plan adds a fourth path to it.
- The three hydraulic fields keep M2 eligibility, including manual override semantics.
- Partial failure: a ChangeSet is all-or-nothing at build time (any rejection rejects the set). Objects that cannot be changed are excluded in the preview, never half-applied.
- Undo/redo: one batch = one ChangeSet = one undo step.

---

## 7. User interface and workflow

### 7.1 Batch inspector flow (points and lines)

1. **Utvalg** — «12 punkter valgt» with a short profile (G4: Tema and the edited field's current values; G7: full profile).
2. **Felt** — a searchable list grouped:
   - *Felt Validator kjenner* — bound canonical fields with a column, with the label from `field-information.json` and the source key («InnvendigUtvendig»);
   - *Andre kolonner i filen* — unknown and alias columns, marked «Kontrolleres ikke av Validator»;
   - *Kan ikke rettes* — S_HYPERLINK, identifiers, AnleggsID, unnamed or duplicate columns, Tema/S_FCODE until G8, each with its reason;
   - *Finnes ikke i filen* — canonical fields for this geometry with no column: «Kolonnen finnes ikke i filen. Nye kolonner kan ikke legges til ennå.»

   Each entry shows a small count from the selection: «tom i 9 av 12».
3. **Operasjon** — *Fyll manglende verdier* (default once a field is chosen) · *Sett verdi* · later *Erstatt verdi* (with a «fra» value picked from the selection's distinct current values) · *Tøm verdi*.
4. **Verdi** — `GmiFieldValueInput` for the domain.
5. **Forhåndsvis** — per-object rows in the Data Table (existing review columns: Status, Endring, Funn), summary counts, then the dry-run line «Full kontroll av forslaget: 0 nye FEIL · 1 ny SJEKK · 9 løst».
6. **Legg til** — label «Legg til: InnvendigUtvendig → OD på 4 punkter»; risk dialog when §6.2 applies.
7. **Lagt til** — existing staged view; «Ny masseendring for utvalget»; T2 switches the table to Foreslått.

### 7.2 Input controls

| Domain | Control | Rules |
| --- | --- | --- |
| Enumeration ≤ 12 options | Native `<select>` with «code – meaning» | Only listed values; current out-of-list value shown as a disabled first entry «`id` (i filen, ikke i kodelisten)» and kept unless changed |
| Enumeration > 12 (Tema, Type, Material, Målemetode, MålemetodeHøyde, Byggemetode, Trykklasse, SDR) | Accessible combobox, search by code and meaning | Same; typing filters, never commits free text |
| Integer / decimal | Text, `inputMode="numeric"`/`"decimal"`, unit suffix | Exact lexeme; no reformatting; Validator judges |
| Year | Text, 4 digits, `inputMode="numeric"` | Exact lexeme |
| Date | Date picker emitting `DD.MM.YYYY`, plus text entry | Picker output is exactly `DD.MM.YYYY`; typed text is kept as typed and judged by the Validator |
| Text | Text | Encoding feedback; length counter for Merknad |

Upper-casing applies only to typed input in `upperCase` enumeration domains (all current non-numeric lists). For a restricted list it only matters while searching.

### 7.3 Mixed selections (G7, generalising Fable B1/B2)

The profile columns are chosen without new domain rules:

- the edited field's current values (always);
- the governing rule's `explanationContextFieldIds` (for example `sdr` → Tema, Material; `insideOutside` → Tema; `installationYear` → Stedfestingsårsak; `captureDate` → Anleggsår);
- Tema, and for lines Material and Dimensjon (the Fable B1 fixed list);
- the current-finding split for the governing rule: «Nå: 3 FEIL · 1 SJEKK · 8 uten funn».

Each value has «Behold bare disse (n)», which only shrinks the selection and keeps a valid preview valid.

**Mixed** = more than one distinct non-empty value in any context column of the governing rule. It triggers gate 4. It is information plus one confirmation, never a block. Objects on existing infrastructure where the Validator gives only SJEKK for a missing value are visible in the split; the text says a missing value there does not have to be filled.

### 7.4 Individual editing

- G5 replaces the object editor's text inputs with `GmiFieldValueInput` and `checkGmiFieldDraft`. Enumerations are restricted there too.
- «Rett én og én» (Fable B3) remains an optional path from the batch inspector. It is no longer the only path for points.

---

## 8. Implementation slices

Complexity: S ≈ under half a day, M ≈ a day, L ≈ up to two days. Every slice passes the standing gate in §10, leaves input file bytes unchanged in browser tests, and needs **no data migration** (sessions, ChangeSets and selections are in-memory only).

### G1 · Shared field capability and value domains — M–L

- **Goal:** one pure description of editable columns and value domains for both editors. No UI change.
- **Scope:** `validation-v2/fieldValueDomain.js` (Fable D1 + `comparison`, `kind` derivation); `gmiEditFields.mjs` (`describeGmiEditColumns`, `checkGmiFieldDraft`, shared column predicate); `gmiEditFieldPolicy` delegates to the predicate; `planGmiObjectForm` uses `checkGmiFieldDraft` **with the enumeration restriction switched off** (behaviour unchanged until G5).
- **Approach:** bind the document dataset once per document (WeakMap), as `gmiEditValidation.mjs` does. The domain reads `getValidationRules()` and `getAuthoritativeValueTable`.
- **Dependencies:** none.
- **Non-goals:** controls, batch, any change to rules.
- **Tests (Node):** domain options equal `rule.allowedValues` for every rule that has them (cannot diverge); no code-array literals in the new modules (source contract); capability on fixtures: `S_FCODE;Tema;…` → linked Tema; trailing `;` → unnamed refused; `S_HYPERLINK`, `GUID`, `AnleggsID` refused with reasons; `SDR` → hydraulic; `DIM` → recognized-unresolved; absent canonical fields listed per geometry; point and line differ (`InnvendigUtvendig`, Tema lists); `gmiEditFieldPolicy` results identical to today for every cell of the gmi-edit corpus.
- **Manual:** none.
- **Risks:** schema binding cost on large files (once per document; measure).

### G2 · General batch planning engine — L

- **Goal:** `prepareGmiFieldBatch` and `buildGmiFieldBatch` for any column and both geometries, with hydraulic routing.
- **Scope:** `gmiFieldBatchPlan.mjs`; additive governing-rule outcome in `gmiEditObjectDiagnostics`; `intent` pass-through in `changeSet.mjs` / `session.mjs`; `gmiSelectionTargets` for points.
- **Approach:** §4.4. Operations `fill-missing` and `set` only. Default inclusion per §6.1. Chunked every 20 objects with `isLive`, as today.
- **Dependencies:** G1.
- **Non-goals:** UI, dry run, Erstatt/Tøm, linked Tema.
- **Tests (Node):** multiple points same field (InnvendigUtvendig); multiple lines same field (Material, Merknad); different original values (empty/populated/out-of-list); Validator `NOT_APPLICABLE` default-excluded (Kumform on a non-KUM Tema); `UNRESOLVED` excluded; conflict detection and replace; M1 refusals per object (irregular-objects fixture); hydraulic field returns the M2 eligibility rows unchanged (compare with `prepareGmiBatchReview` output); **contract: the generic path never calls `createGmiBatchCorrection` with `targets` for `SDR`/`Trykklasse`/`Ringstivhet`**; stale session/selection refused; ChangeSet cells exactly equal the included objects; `intent` frozen and null on existing paths; staged result → proposed bytes differ only in those spans.
- **Manual:** none.
- **Risks:** per-object overlay cost (2 evaluations × N objects × all rules); measure with the largest corpus file at 100, 1,000 and all objects.

### G3 · Dataset dry run and preview validation — M

- **Goal:** exact dataset-level consequences and export verification before approval.
- **Scope:** `gmi-edit/dryRun.mjs`, export; finding diff helper; planner integration (`dryRun` on the built ChangeSet).
- **Dependencies:** G2.
- **Non-goals:** UI beyond what G4 shows; object-editor adoption.
- **Tests (Node):** registry untouched (session value and status revision identical after a dry run); NYTT-year cross-object case (Anleggsår on one NYTT object creates a SJEKK on another object) appears only in the dry run; verification failure blocks (simulate with a mutated-bytes document); cache hit on subsequent real stage; Kontrolldato changes the result; perf budget recorded for the largest file.
- **Risks:** about 1.3 s plus a validation run on large files. Show progress and keep it cancellable.

### G4 · Batch inspector for points and lines — **minimum useful milestone** — L

- **Goal:** usable generic batch editing in Rettinger from a Data Table selection.
- **Scope:** `GmiBatchInspector.js` (field picker from capabilities; no default field (Fable D3); operations Fyll/Sett; `GmiFieldValueInput` basic: `<select>` for all enumerations, text otherwise; generic preview; dry-run line; gates 1–6 with a basic mixed check on Tema and the edited field); `gmiBatchInspectorView.mjs` (common row shape, point labels); `GmiFieldValueInput.js` (basic); messages. Hydraulic fields behave exactly as today.
- **Dependencies:** G1–G3.
- **Non-goals:** combobox search, date picker, Erstatt/Tøm, full profile, Validator handoff, linked Tema.
- **Tests:** update `gmiBatchInspector.test.mjs` (no default field, field list from capabilities). Browser `gmiBatchInspectorUi` additions: four points → InnvendigUtvendig → OD → preview counts → stage → one ChangeSet → undo/redo → export bytes differ only in four spans; lines → Material fill; Merknad set with overwrite gate; NOT_APPLICABLE point included manually → gate; new-FEIL gate; mixed gate; absent field listed and disabled; SDR flow unchanged (existing tests pass unmodified apart from the field step). Layout at 1280×720 and 1366×768.
- **Manual (real file):** §10.5 steps 1–9.
- **Risks:** inspector complexity. Keep the planner pure and the component thin.

**Deploy and accept the MUM on a real delivery before G5–G8.**

### G5 · Field-type controls in both editors — M

- **Goal:** complete controls; enumeration restriction in the object editor.
- **Scope:** combobox for long lists (code + meaning search; keyboard; screen-reader names); date and year controls; numeric hints; `GmiObjectEditor` adopts `GmiFieldValueInput` and the restricted `checkGmiFieldDraft` (replaces Fable D2/D4); upper-casing (UX-04).
- **Dependencies:** G4 (control exists), G1.
- **Tests:** browser in `gmiEditWorkspaceUi`/`gmiEditValidationUi`: choose `ID` on a point, stage, export, exact bytes; typing `id` finds `ID`; out-of-list original shown and unchanged without edit; «Bruk original» still restores it; keyboard-only; date picker emits `DD.MM.YYYY`. Node: `planGmiObjectForm` refuses an out-of-list enumeration draft.
- **Risks:** a user who needs to keep an unusual delivered code can (no edit); one who needs to *enter* one cannot (A2).

### G6 · «Erstatt verdi» and «Tøm verdi» — M

- **Goal:** the remaining operations.
- **Scope:** planner operations `replace` (match on exact current lexeme; «fra» picker from distinct current values in the selection, with counts) and `clear`; UI; labels via `intent`.
- **Dependencies:** G4.
- **Tests:** replace only hits objects with the match value; whitespace variants are not matched (exact) and are listed; clear on a required field produces new FEIL → gate; clear on an empty value → «Passer ikke operasjonen»; undo restores.
- **Risks:** exact matching may surprise (`PE ` vs `PE`); show the lexeme with visible whitespace (existing `Lexeme`).

### G7 · Mixed-selection profile and narrowing — M (generalises Fable B1 + B2)

- **Goal:** §7.3.
- **Scope:** `gmiSelectionProfile.mjs` (pure; proposed values; rule-derived columns); inspector panel; «Behold bare disse»; current-finding split; mixed gate uses the full profile.
- **Dependencies:** G4.
- **Tests:** Node profile (missing values; proposed vs original; 10,000-object performance); browser narrowing keeps a valid preview; mixed Material on SDR → dialog names the mix; uniform → no mixed gate.
- **Manual:** the SDR incident: pipes with different Material and Dimensjon, some not NYTT.

### G8 · Special fields — M

- **Goal:** the remaining source-safe special cases.
- **Scope:**
  - **Linked Tema/S_FCODE:** when both columns exist, one operation writes the same code to both cells per object (`createGmiFieldChangeSet`, two requests per object, one ChangeSet). Objects where only one cell is editable are refused. Disagreeing current values are shown. The preview lists downstream changes (applicability of Kumform, Type compatibility, hydraulic class).
  - **FOTO check:** confirm whether FOTO delivery (M8) reads `S_FCODE`/`TEMA` from the original (`gmiPhotoSource.mjs:56–58`) or from Foreslått. If from the original, the inspector warns that photo grouping follows the delivered Tema.
  - **AnleggsID and identifier-like columns:** keep individual-only with a clear reason.
  - **Unknown columns:** confirm A5 behaviour (gate 5).
- **Tests:** linked edit changes exactly two spans per object and resolves `TEMA_CONFLICT`; single-column Tema file uses the generic path; FOTO behaviour pinned by a test either way.
- **Risks:** Tema is the most consequential field. Keep it last among the G slices and accept it separately.

### X1–X3 · Column insertion (separate track, not scheduled)

A substantial new M1 capability, listed so it is not forgotten. It is not a dependency of anything above.

- **X1 · Structural plan (pure):** add one named column at the end of `_FIELDNAMES` for one geometry and append `;` (empty) or `;value` to every `_FIELDVALUES` line of that geometry. Preconditions: document editable; no irregular objects in that geometry; name not present (case-insensitive) and not reserved; trailing-`;` convention detected and handled (an existing unnamed trailing column must not be reused silently).
- **X2 · Verifier contract:** a new verification mode proving that only the `_FIELDNAMES` line and the targeted `_FIELDVALUES` lines changed, each only by the appended suffix; reparse equal except the new key; FOTO fingerprint semantics documented (output differs from the delivered file by design).
- **X3 · Integration:** a column insertion is its own ChangeSet kind (structural), undoable, first in the compile order; field edits on the new column depend on it; export and diff updated.
- **Acceptance tests:** byte-diff confined to the suffixes; reparse; every existing guard fixture refuses; undo restores byte identity; export of insert + fill.

### Retained from the Fable plan

**B3 · «Rett én og én»** — unchanged scope; optional path; after H3. **U1–U6, T1–T3, H1–H5** — see §9.

---

## 9. Revised integrated roadmap

### 9.1 Effect on the Fable slices

| Fable slice | Status | Change |
| --- | --- | --- |
| U1, U2, U3, U5, U6 | **Unchanged** | Independent; run in parallel at any time |
| U4 (view controls) | **Unchanged** | Still before H2 |
| T1 (row reveal) | **Unchanged** | Before H3 |
| T2 (Foreslått after staging) | **Unchanged** | Best after G4, so batch staging also switches |
| T3 (checkbox focuses) | **Unchanged** | |
| D1 (domain modules) | **Absorbed into G1** | Plus `comparison` and `kind` derivation |
| D2 (object-editor control) | **Absorbed into G5, changed** | Enumerations restricted (replaces Fable D4 «allowed after tick») |
| D3 (no default field, shared control) | **Absorbed into G4** | |
| H1–H4 | **Mechanics unchanged; moved after G4** | H3's batch landing opens the generic inspector with no field and no value. Selected points become useful |
| H5 (retire «Lag retting…») | **Unchanged** | After manual acceptance of H3 and G7 |
| B1, B2 (profile, gates) | **Absorbed into G4 (basic gates) and G7 (full)** | Profile columns now rule-derived for any field |
| B3 («Rett én og én») | **Unchanged scope, lower priority** | No longer the only path for points or non-hydraulic fields |
| Fable decision D3 | **Superseded** | Generic batch is now core |
| Fable decision D4 | **Superseded** by A2 | Restricted lists |
| Fable decision D11 | **Kept** | New FEIL → risk dialog |
| R7 (legacy modal) | **Separate, later** | `GMI_BATCH_FIELDS` and `prepareGmiBatchReview` stay for it |

### 9.2 Recommended execution order

1. **G1 → G2 → G3 → G4** · in parallel: U1, U2, U3, U5, U4.
2. **Deploy MUM; real-file acceptance (§10.5).**
3. **G5** and **G7** (parallel) · T1 → T2.
4. **H1 → H2 → H3 → H4** (the Validator handoff now lands in a capable inspector).
5. **G6**, **G8**, B3, T3, U6.
6. Manual acceptance of the full loop → **H5**.
7. R7 as its own decision. X1–X3 only when column insertion is requested.

Why G before H: H3 delivers selected objects. Before G4 there is nothing to do with several points. G1–G4 need no Validator selection: a Data Table selection in Rettinger is a complete test bed. H1–H2 can be developed in parallel by a second implementer, but H3 should merge after G4.

---

## 10. Testing and acceptance plan

### 10.1 Baseline (not re-run in this pass)

From the Fable report, same HEAD, this machine: Node gate **215 tests: 202 pass, 4 fail, 9 skipped**. The failures are the three documented `validationV2WorkspaceInspector` source-contract failures plus one CRLF artefact in `gmiRettingerSidebar.test.mjs:24` (`core.autocrlf=true`; see memory note). Full serial suite (R6B report): 2,025 tests, 7 known failures. **Any other failure in a G slice is a regression.** Recommendation: make the CRLF assertion `\r?\n` in G1 (it is a test-only fix) and report the documented failures separately in every slice report.

### 10.2 Existing coverage of the shared engine

| Area | Tests | Extension needed |
| --- | --- | --- |
| M1 targets, patch, verify, encoding | `gmiEditCorpus`, `gmiEditProduction` | None (no M1 change) |
| M2 builder, explicit targets, conflicts, reserved columns | `gmiEditChangeSets` (`:158–384`) | `intent` field; `createGmiFieldChangeSet` two-cells-per-object (G8) |
| Eligibility (hydraulic) | `gmiEditChangeSets` (`:429–661`), `gmiEditBatch`, `gmiValidatorEditing` | Must pass **unmodified** |
| Sessions, undo/redo | `gmiEditSessions`, `gmiEditChangeSets` | Dry run leaves registry untouched (G3) |
| Per-object overlay | `gmiEditValidation`, `gmiEditValidationPolish` | Governing outcome returned (G2) |
| Batch view / inspector | `gmiBatchInspector`, `gmiR4UxPolish`; browser `gmiBatchInspectorUi`, `gmiEditBatchUi`, `gmiR4UxPolishUi` | Points, generic fields, no default field |
| Object editor | `gmiEditWorkspace`; browser `gmiEditWorkspaceUi`, `gmiEditValidationUi`, `gmiEditDraftGuardUi` | Shared control (G5) |
| Selection | `gmiEditSelection`, browser `gmiEditSelectionUi` | Point targets (G2) |

### 10.3 New tests required (by brief item)

| Brief item | Where |
| --- | --- |
| Multiple points, same field | G2 Node; G4 browser |
| Multiple lines, same field | G2 Node; G4 browser |
| Different original values | G2 Node (empty / populated / out-of-list / whitespace) |
| Different Tema and materials | G2 (applicability), G7 (profile, mixed gate) |
| Restricted code lists | G1 (domain = rule list), G4/G5 (control offers only listed values; object editor refuses out-of-list draft) |
| Numeric, year, date, free text | G2 Node per kind; G5 browser controls |
| Missing physical columns | G1 (listed as absent), G4 (disabled in picker), M2 `field-absent` still refused |
| Invalid input and new errors | G1 (draft check), G4 (new-FEIL gate) |
| Cross-field consequences | G2 (InnvendigUtvendig ↔ Bredde; Rørform → VertikalDimensjon), G3 (NYTT-year), G8 (Tema) |
| Overwrite and conflict approval | G2 Node, G4 browser (existing token semantics) |
| Partial inapplicability | G2 (default exclusion), G4 (manual inclusion gate) |
| Stale preview | G2 (session/selection), G3 (dry run bound to ChangeSet), G4 browser (stage elsewhere while previewing) |
| Undo/redo | G4 browser (one step; redo returns same ChangeSet id) |
| Unchanged bytes outside corrections | G2 Node byte-diff; G4 browser export compare |
| Export | G4 browser; G8 linked edit |
| Hydraulic path unchanged | G2 contract test + existing suites unmodified |
| Performance | G2/G3 measurements recorded in the slice report (largest corpus file; 100 / 1,000 / all objects) |

### 10.4 Standing gate per slice

The Fable §10 gate (Node set + serial production browser set + ESLint on touched files + `npm run build` + `git diff --check`), plus `tests/gmiEditChangeSets.test.mjs tests/gmiEditBatch.test.mjs tests/gmiEditValidation.test.mjs` in every G slice. G2 and G8 (M2 additive change) run the full serial suite.

### 10.5 Manual acceptance of the MUM (real delivery)

1. Rettinger, Punkter: select four LOK points with empty `InnvendigUtvendig` → batch inspector → field *InnvendigUtvendig* (shows «tom i 4 av 4») → *Fyll manglende verdier* → value list shows exactly ID and OD → `OD` → preview: 4 «Endres – fyller tom verdi», FEIL resolved per object, dry run OK → «Legg til: InnvendigUtvendig → OD på 4 punkter» → one ChangeSet.
2. Undo, redo; the Endringer list shows one entry each time.
3. Same with a selection mixing LOK and KUM: KUM + OD shows «Ny SJEKK»; the mixed-Tema gate appears.
4. Ledninger: twelve lines, field *Merknad*, *Sett verdi* «Kontrollert»: populated ones need overwrite approval.
5. Points with Kumform on non-KUM Tema: those objects are unticked «Gjelder ikke ifølge Validator»; including one raises the gate.
6. Anleggsår on a NYTT object: the dry run reports the cross-object consequence (if any) before approval.
7. A field absent from the file appears under «Finnes ikke i filen» and cannot be chosen.
8. SDR on lines behaves exactly as before (eligibility, manual override).
9. Export the revised GMI; compare with the original: only the approved spans differ.
10. Repeat 1 at 1280×720, once keyboard-only.

---

## 11. Architectural decisions requiring review

| # | Decision | Recommended default | Alternative |
| --- | --- | --- | --- |
| A1 | Generic path and Validator applicability | `NOT_APPLICABLE` / `UNRESOLVED` unticked by default; includable per object with confirmation | Include all, flag only; or exclude without override |
| A2 | Enumerated values | Restricted to the authoritative list in both editors; existing out-of-list values kept unless changed; **no exception mechanism now** | A documented exception («Annen kode med begrunnelse», logged in `intent`) as a later, separate slice |
| A3 | Dataset dry run | Automatic once per preview; staging blocked until it is OK | On demand only («Kjør full kontroll») |
| A4 | Dry-run cache | Default proposed cache (real stage becomes a cache hit) | Separate cache (no eviction risk, slower stage) |
| A5 | Unknown, alias and unresolved columns in batch | Allowed, all operations, with the «not checked by Validator» gate | Individual editing only |
| A6 | AnleggsID and identifier-like fields | Individual only; never a shared batch value | Allow «Tøm» in batch |
| A7 | Tema when `Tema` and `S_FCODE` both exist | Linked operation writes both (G8); single-column edit not offered | Allow single-column edit with the conflict shown as new SJEKK |
| A8 | Mixed-selection criterion | Distinct non-empty values in the governing rule's context fields, plus Tema (and Material, Dimensjon for lines) | Fixed list only; or every column |
| A9 | Operations in the MUM | Fyll manglende + Sett verdi; Erstatt + Tøm in G6 | All four in G4 |
| A10 | Multi-field batch (several fields in one ChangeSet) | Not planned; one field per batch | Later slice using `createGmiFieldChangeSet` |
| A11 | ChangeSet `intent` metadata | Additive, frozen, optional | Encode in label only |
| A12 | Column insertion | Separate X track; schedule only on request | Bring forward before H |
| A13 | Order | G1–G4 before H3 | H first, «Rett én og én» meanwhile |
| A14 | Hydraulic fields | Keep M2 eligibility path inside the new UI | Move to the generic path (not recommended: drops tested applicability gating) |
| A15 | Selection size | No cap; progress and cancel; performance measured in G2/G3 | Cap (for example 2,000 objects) |
| A16 | «Tøm» on required fields | Allowed behind the new-FEIL gate | Refused for fields whose rule is «required» |
| A17 | Provenance from a Validator handoff | Shown as a hint («Valgt fra Validator · InnvendigUtvendig»), never preselects the field (Fable principle) | Preselect the field, still no value |

Wording to confirm: «Fyll manglende verdier», «Sett verdi», «Erstatt verdi», «Tøm verdi», «Gjelder ikke ifølge Validator», «Passer ikke operasjonen», «Finnes ikke i filen», «Kontrolleres ikke av Validator», «Full kontroll av forslaget».

---

## Appendix: what was run

- `git rev-parse`, `git status`, `git log` — read-only.
- Two Node one-liners printing `VALIDATION_RULES` metadata and `field-information.json` formats (no writes).
- A `grep` over GMI fixtures for `_FIELDNAMES` patterns.
- No test, build or browser run. No repository file modified other than this report.
