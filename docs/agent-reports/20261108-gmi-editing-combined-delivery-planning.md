# GMI editing and coordinated delivery — architecture and implementation planning

Date: 2026-11-08. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, HEAD `3759dd5`.
Pass type: investigation and planning only. No production code, tests, fixtures or other docs were changed; no commit or push. Throwaway survey/prototype scripts ran from the session scratchpad against read-only copies of local files and printed aggregate counts only.

Evidence labels used throughout:

- **[C] Confirmed**: read in the repository code, or measured on local real files in this pass.
- **[R] Recommendation**: architectural proposal from this pass.
- **[U] Unverified assumption**: plausible, but not demonstrated here. Each one maps to a test or a Gemini VA gate in §9.

---

## 1. Executive summary and recommended architecture

**Source-preserving GMI editing is feasible and should be the only export mechanism.** A throwaway prototype indexed exact byte spans for every `_FIELDVALUES` lexeme in **186 unique parseable GMI files** (175 real deliveries plus the 13 committed fixtures, less 2 deliberate parser-error fixtures). It reconciled them against the production `GMIParser` lexemes. Results [C]:

| Check | Result |
|---|---|
| Decoded text length equals byte length (1 char ↔ 1 byte) | 188/188 |
| Every parser lexeme equals its independently indexed byte span | 186/186 files, 29,186 objects, 0 mismatches |
| No-op patch (each lexeme replaced by its own bytes) is byte-identical | 186/186 |
| Fill one empty `SDR` with `11.0`; reparse | 99/99 applicable files: exactly one object changed, all other objects deep-equal, prefix and suffix bytes identical |
| Remove the first `h:N(...)` wrapper from each hyperlink value; re-extract | 2,029/2,029 values: every other link preserved, grammar still valid |

The code also shows that **parse-and-reserialize is unsafe** [C]. The parser coerces `11.0` to `11` and `010` to `10`, trims lexemes, and drops `[T_]`, `[Y_]`, `[N_]`, `[C_]`, `[O_COORDOBS]` and `[O_BIM_ATTRIBUTES_SCHEMA]` sections. It ignores `_rot`, `_label` and `/XYH` geometry, and keeps only the last `_FIELDNAMES` for each geometry. The upload path can also inject an assumed `COSYS_EPSG` into the header. A reserializer would ship all of these losses.

**Recommended architecture [R]**, as four layers with one-way dependencies:

```
                ┌─────────────────────────────────────────────────────────┐
 shared core    │ gmi-source  : immutable GmiSourceDocument (bytes, fingerprint,
 (pure, no UI)  │               encoding class, span index reconciled w/ GMIParser)
                │ gmi-patch   : patch ops → new bytes + post-condition verifier
                └─────────────────────────────────────────────────────────┘
                        ▲                          ▲
 field editing  ┌───────┴──────────┐     ┌─────────┴─────────────┐  photo delivery
 (owns all      │ gmi-edit         │     │ FOTO delivery intent  │  (owns S_HYPERLINK
  columns but   │ ChangeSets,      │     │ per occurrence, in    │   removals only)
  S_HYPERLINK)  │ working state,   │     │ photoSession          │
                │ revalidation     │     └─────────┬─────────────┘
                └───────┬──────────┘               │
                        ▼                          ▼
                ┌─────────────────────────────────────────────────────────┐
 delivery       │ delivery-package : one immutable DeliverySnapshot →
                │   plan (GMI bytes + GML + attachment list) → ZIP / .gmi
                └─────────────────────────────────────────────────────────┘
```

Key decisions:

1. **One canonical GMI state per survey layer.** It holds the immutable original bytes and one ordered list of field ChangeSets. FOTO never writes into it. Hyperlink removals are **derived at package time** from FOTO's explicit per-occurrence delivery intent, and exist only in a package that also contains the corresponding GML features. This structurally prevents removing a link without its GML photo, and it means a field-only export can never remove a link.
2. **Column ownership prevents cross-module conflicts.** Field editing may change any column except `S_HYPERLINK`. Photo delivery may only remove whole `h:N(...)` wrappers from `S_HYPERLINK`. The composer rejects any patch set where both target the same cell.
3. **The proposed state is produced by re-parsing patched bytes.** The proposed copy is `GMIParser(decode(applyPatches(originalBytes)))`. It is revalidated with the unchanged `runGmiValidationV2`, so what is validated is byte-for-byte what is exported. `layer.data` remains the contractor's original delivery.
4. **Patch guarantees are enforced, not assumed.** Every plan reparses its output and verifies that only the intended cells differ. If it cannot prove this, it fails closed.
5. **A new dedicated "Rettinger" workspace handles editing.** It is a sibling of the Validator and FOTO workspaces and reuses the Data Table bottom dock and the exact-object-set selection model. Validator findings may offer a prefilled batch correction, but only for allow-listed rules, and the user always chooses the value.
6. **One combined delivery planner** builds a single frozen snapshot covering GMI field changes, FOTO export data and delivery intent. It produces `<basename>.gmi`, `<basename>.gml` and a shared `Attachments/` folder. Retained GMI reference names are fixed and reserved, and GML-only assets are named around them. Standalone FOTO export is untouched.

---

## 2. Repository findings

### 2.1 GMI import, decoding and source retention [C]

| Location | Finding | Consequence for editing |
|---|---|---|
| `src/components/FileUpload.js:99-161,303` | GMI is read as `ArrayBuffer`, decoded once with `decodeGmiBytes`, parsed with `new GMIParser(text)`. `createGmiPhotoSource(parser)` runs only when the parser reports no errors. | The original `File` is available at upload time. |
| `src/components/FileUpload.js:183-203` | A missing or invalid CRS triggers `window.confirm`, then `COSYS_EPSG`/`COSYS` are **written into `parsedData.header`**. | `layer.data.header` is not the delivered header. Never serialize from it. |
| `src/components/FileUpload.js:220-221` → `src/lib/store.js:1959-2044` (`addLayer`) | `sourceInput: { file, evidence }` goes to `loadedGmiSources.register(layerId, data, file, evidence)`. | **The original `File` is retained outside Zustand**, keyed by layer and bound to the exact `layer.data` object. This is the natural place to source original bytes. |
| `src/lib/photos/loadedGmiSource.mjs:8-46` | `register` / `begin(ticket)` / `read(ticket)` / `isLive`. Liveness means the same layer and the same `data` object. `reconcile()` drops dead inputs. | Reusable liveness pattern for edit sessions. A byte-reading method needs to be added. |
| `src/lib/store.js:3044-3062` (`partialize`) | Only `settings`, `ui`, `lastActive` persist. Layers and data are **never persisted**. | Edits are in-memory today. Reload loses everything (§5.9). |
| `src/lib/parsing/gmiDecoding.js` | `new TextDecoder('iso-8859-1')`. Under the WHATWG Encoding standard this label **is windows-1252**. Each byte maps to exactly one UTF-16 unit. | Char offsets equal byte offsets (verified 188/188). Re-encoding with a Latin-1 encoder would corrupt bytes `0x80-0x9F`. |
| `src/lib/photos/gmiPhotoSource.mjs:12-21` | `gmiSourceFingerprint` = SHA-256 of the exact bytes (exact-bytes fallback without WebCrypto). `MAX_PHOTO_GMI_BYTES` = 10 MiB. | Shared document identity between field editing and FOTO. |

### 2.2 `GMIParser` behaviour relevant to preservation [C]

`src/lib/parsing/gmiParser.js`:

- `lines = content.split(/\r?\n/)` (line 20). EOLs are discarded, and a bare CR is not a line break.
- The header loop requires `lines[0] === '[GMIFILE_ASCII]'` exactly (286). Keys are split on the first space and EPSG values are coerced to numbers (313-321).
- Only `[L_]`, `[P_]`, `[+L_]`, `[+P_]` are interpreted. `[L_]`/`[P_]` overwrite `lineFieldNames`/`pointFieldNames`, so repeated sections are last-wins (328-365). Every other section is skipped.
- In an object, only lines starting `_EXTENT`, `_FIELDVALUES`, `GUID` and exactly `/XYZ` are read. A second `_FIELDVALUES` line would silently overwrite the first.
- `_parseFieldValues` (123-174) splits on `;` with **no quoting or escaping**. It trims, maps empty to `null`, and coerces `^-?\d+$` to int, `^-?\d+\.\d+$` to float, and `true`/`false` to boolean. Raw untrimmed lexemes go into a non-enumerable `GMI_SOURCE_LEXEMES` symbol (`gmiLexicalEvidence.js`). More values than names produces a warning.
- `_getRawFieldValues` (181-188) removes exactly one space or tab after `_FIELDVALUES` and keeps everything else. The span index must use the same rule (it does in the prototype).
- Object identity is parser order per geometry (`points[i]`, `linesParsed[i]`). `:L n` numbers and `GUID` are attributes, not keys.

### 2.3 Real-file structure (local corpus survey) [C]

Sources surveyed: `C:\GitHub\gmi-validering\REF_FILES` (182 `.gmi`; `GMI/` 113 unique, plus `LONG_PIPE_GMI`, `OUTLIER_POINT_GMI`, `BROKEN_GMI` = 1 file, which is a byte duplicate of a Downloads file), `C:\Users\…\Downloads` (60 unique) and `C:\temp\gmi-photo-test` (Ekenesstokken). **244 files, 175 byte-unique.** Largest file 1.7 MB. Only counts were printed; no private values were copied into this report.

| Property | Finding |
|---|---|
| BOM | 0 files |
| Line endings | **175/175 CRLF**, all with final CRLF. No LF-only, CR-only or mixed. (Committed fixtures are LF; see §9.) |
| Encoding | 160 contain non-ASCII bytes. 159 are not valid UTF-8 (single-byte Latin-1/1252). **1 is valid UTF-8 without BOM** (a Gemini-named "Kummer" export). 3 contain `0x80-0x9F` bytes (`0x86`, `0x98`), i.e. Windows-1252-only characters. |
| `_INDEX` header | **Always `_INDEX` + 20 × `!`** (175/175). No numeric index or byte offset was observed. Section `_EXTENT` lines carry `!` padding of 24-52 chars. |
| Section sequences | 16 distinct. Most common: `[GMIFILE_ASCII] [L_] [P_] [+L_] [+P_] [END]` (99), `[P_] [+P_]` (39), `[L_] [+L_]` (18). Also present: `[Y_]`, `[T_]`, `[N_]`, `[C_]`, `[O_COORDOBS]`, `[O_BIM_ATTRIBUTES_SCHEMA]`. **No repeated section.** |
| `_FIELDNAMES` | 324/324 end with `;`, producing a trailing empty name. No duplicate names. |
| `_FIELDVALUES` | 29,284 lines. **All end with `;`**, none with `; `. 0 L/P objects with ≠1 `_FIELDVALUES`. Value count equals name count in real L/P data; 4 mismatches occur only in deliberate fixtures. |
| Quoting | No quote escaping. 3 `Merknad` values contain an odd number of `"` (e.g. inch marks), so a quote-aware splitter would be **wrong**. |
| GUIDs | 130 files all-GUID, 45 files **no GUID at all** (8,292 objects without GUID). 0 duplicate GUIDs or object numbers within a file. |
| Columns | 113/135 line sections have `SDR`. 110 line and 102 point sections have `S_HYPERLINK`. **`S_HYPERLINK` is never the last column.** |
| Unparsed object content | `:T` text objects with `_label`/`_rot`, `:Y`, `:N`, `/XY`, `/XYH`, `_ASPOLY`, `_OFFSET_NE`, `/POINTS2`, `/TRIANGLES2`. All must survive untouched. |

### 2.4 Hyperlink syntax as delivered [C]

Extractor: `src/lib/hyperlinkFilenames.mjs:26` (`extractHyperlinkOccurrences`). The grammar is a whole-value validated sequence of `h:<n>( key:"value" … )` wrappers with optional `,`/`;`/whitespace separators. Only `link` members are references; `sign` and other keys are metadata. Output carries `wrapperOrdinal`, `memberOrdinal`, `wrapperStart/End` and `rawStart/End` (UTF-16 offsets within the lexeme, which equal byte offsets here).

Corpus (2,035 non-empty hyperlink values):

| Shape | Count |
|---|---|
| Wrappers per value 1 / 2 / 3 / 4 / 5 / 6 | 1,880 / 115 / 19 / 5 / 5 / 5 |
| Bare (unwrapped) single path | 6 values (16 in all files incl. fixtures) |
| Wrapper separator | always a single space |
| Trailing space after last wrapper | 2,029 yes / 6 no |
| Wrapper ordinals | **always contiguous `1..n`** |
| Wrappers with >1 `link` member | 0 |
| Member keys | `link` 2,248, `sign` 725 |
| Target extension | `.jpg/.jpeg` 2,221, **`.pdf` 21, `.sos` 4**, no filename 2 |
| Directory prefix | `Attachments\` 2,132; bare filename 63; deeper relative paths 53 |
| Same file twice in one value | 0 |
| URL / drive / UNC / forward slash | 0 |

So **non-photo links (PDF, SOSI) really do share `S_HYPERLINK` with photos.** A semicolon-separated wrapper cannot survive `_FIELDVALUES` splitting, so the extractor's `;` separator is theoretical for GMI.

### 2.5 FOTO association model [C]

- `createGmiPhotoSource` (`gmiPhotoSource.mjs:37`) gives each object an `objectKey`: `guid:<lowercase>` if unique, else `<scope>:<sourceIndex>`. Each reference has id `${objectKey}:S_HYPERLINK:${sourceIndex}:${wrapperOrdinal}:${memberOrdinal}`, the raw member/wrapper text and `targetValid` (image target via `classifyPhotoFile`).
- `reviewGmiPhotoSource` (`:129`) resolves references to photo assets: `confident` / `ambiguous` / `unmatched` / `invalid`. Only confident ones form ledger edges `[sourceId, objectKey, photoId]` with `referenceIds[]`.
- `photoSession.planGmiAssociations` (`photoSession.mjs:378`) creates **one occurrence per (GMI source fingerprint, objectKey, assetId)**. `occurrence.key = JSON.stringify([fingerprint, objectKey, assetId])`, and the occurrence carries `referenceIds`. One photo linked from two objects gives two occurrences of one asset.
- Photo GMI sources are either `loadedBinding` (from a survey layer: `{ layerId, datasetRevision, inputId, filename }`, `live` flag) or imported directly into FOTO from a `File`. **Direct FOTO GMI sources keep no bytes** (`makeSource` parses and discards the file).
- Moving or rotating a photo goes through `applyPhotoEdits` (`photoSession.mjs:690`), which touches only `spatial.current` and `direction.current`. No GMI or reference state is involved.

### 2.6 Photo export pipeline [C]

| Step | Location | Notes |
|---|---|---|
| Snapshot | `photoExportPlan.mjs:11` `capturePhotoExportSnapshot` | Frozen assets and occurrences plus an `isLive()` identity check. Pattern to reuse. |
| Plan | `:48` `buildPhotoExportPlan` | Exports **all placed occurrences** of the layer (no per-photo selection). Names are fixed once per plan. Gemini profile: UUIDv4, EPSG:5972, `Attachments\` backslash in XML. Each asset's file is hashed. |
| Names | `attachmentNames.mjs:32` `planAttachmentNames` | Attachment filenames are sanitized (`<>:"/\|?*%#`, controls, reserved device names, ≤180 bytes). Case-fold collisions get a `--<hash>` suffix. Path is `Attachments/<name>`. |
| Package names | `photoExportNaming.mjs:33` | `YYYYMMDD-HHmmss[-label]` in Europe/Oslo time; ZIP and GML share the basename. |
| ZIP | `photoExportPackage.mjs:6` | `fflate` `ZipPassThrough`, fixed DOS mtime, GML first, then attachments. Each file is rehashed against the plan checksum. `assertExportablePlan` runs before and after each step. |
| UI | `components/photos/PhotoExportWizard.js` | Two-step wizard. The plan lives only in the dialog; a stale plan blocks download. |
| Gemini evidence | `photoExportRules.mjs` `PHOTO_EXPORT_IMPORT_EVIDENCE`; reports `20261102-0928…`, `20261102-1036…` | The Gemini profile was imported into Gemini VA/GeoFoto with a sibling `Attachments` folder in the user's FME setup. |

### 2.7 Validator, Data Table and shell [C]

- **Shell** (`src/app/page.js:864-893`): the left `sidebar` slot shows one of `PhotoWorkspaceCollection` (FOTO, when `workspaceLayer`), `FieldValidationSidebar` (Validator, `ui.fieldValidationOpen`) or `Sidebar`. `bottomDock` is `LayerDataTable`. The map is the shared primary pane.
- **Validator 2.0**: `runGmiValidationV2({ layerId, dataset, datasetRevision, sourceFormat })` (`validationRunner.js:507`) is pure. `createValidationV2Input` (`uiIntegration.js:13`) builds the input from a layer. Results are keyed by `datasetRevision` (`datasetRevision.js:17`, a WeakMap on the dataset object). `ObjectValueState` already distinguishes `VALUE_PRESENT` / `VALUE_MISSING` / `FIELD_ABSENT`, and the schema binding maps canonical fields to source columns (`gmiLayerSchemaBinding.js`). SDR/ring stiffness/pressure class applicability is computed in `getDiagnosticApplicability` (`validationRunner.js:304`): SDR is applicable when hydraulic class is PRESSURE and the material is in the SDR family. Allowed values are canonical lexemes (`SDR_VALUES` = `'11.0'` etc., `rules.js:82`).
- **Selection**: `createObjectRef` (`objectRef.js:106`) = `{layerId, datasetRevision, geometryScope, sourceIndex, key}`. `openObjectTable` (`store.js:1568`) with `exact-object-set`/`contextual-object-set` scopes (`objectTableInspection.js`) is already used by `ValidationV2Workspace` to show a finding's objects in the Data Table. It fails closed on a stale revision.
- **Data Table** (`LayerDataTable.js`) is read-only, virtualized, has column ordering and search, and highlights the contextual field column.

### 2.8 Reusable staging and transaction patterns [C]

| Pattern | Where | Reuse |
|---|---|---|
| Ticket + baseline + all-or-nothing apply with conflict ids | `photoSession.beginPhotoEdits` / `applyPhotoEdits` | ChangeSet apply and conflict detection. |
| Frozen snapshot + `isLive()` + issued-plan WeakSet + checksum before write | `photoExportPlan.mjs`, `photoExportPackage.mjs` | Delivery snapshot and plan. |
| Liveness by object identity and input id | `loadedGmiSource.mjs` | Edit-session binding to a survey layer. |
| Fail-closed exact scopes | `objectTableInspection.js` | Batch selections from Validator findings. |
| Opt-in private corpus via env var, counts-only output | `tests/gmiPhotoCorpus.test.mjs` (`GMI_PHOTO_CORPUS`), `photoCorpusFixtures.mjs` | GMI edit corpus suite. |

**New infrastructure is needed for:** byte-span indexing, a patch engine, an encoding policy, a ChangeSet model, a proposed-dataset cache, a corrections UI, per-occurrence delivery intent, hyperlink wrapper removal, a combined attachment planner and a combined package.

---

## 3. Delivery modes and interaction matrix

| | A. Field corrections | B. Photos only | C. Split photo delivery | D. Field + split |
|---|---|---|---|---|
| Inputs | Survey GMI layer | FOTO layer | Survey GMI layer + FOTO layer bound to it (`loadedBinding` live, same fingerprint) | Same as C |
| Field ChangeSets applied | Yes | — | **No** (must be empty, or the user explicitly excludes them) | Yes |
| `S_HYPERLINK` removals | **Never** | — | Derived from occurrences marked *transfer* | Same as C |
| GML | — | All placed occurrences (unchanged behaviour) | Only occurrences explicitly marked *transfer* or *include* | Same as C |
| Output | `.gmi` (default) or optional ZIP with retained attachments | Existing ZIP (`.gml` + `Attachments/`) | ZIP: `.gmi` + `.gml` + one `Attachments/` | ZIP: `.gmi` + `.gml` + one `Attachments/` |
| FOTO session required | No | Yes | Yes | Yes |
| Original GMI modified | Never (copy) | Never | Never (copy) | Never (copy) |
| Entry point [R] | Rettinger workspace → *Last ned revidert GMI* | FOTO → *Eksporter bilder* (existing wizard) | Delivery hub (§8.6) | Delivery hub |

Interaction rules [R]:

1. **One snapshot.** In C and D, GMI, GML and attachments come from one `DeliverySnapshot`. Any change to the field ChangeSet list, FOTO occurrences, positions, directions, metadata or delivery intent makes the plan stale.
2. **A ↔ D consistency.** Mode A and mode D read the same ChangeSet list, so the field changes in D's GMI are identical to A's GMI. D's GMI equals A's GMI with hyperlink removals applied, which is a testable invariant (§9).
3. **C with pending field edits.** C is D with field changes excluded. The hub shows "N feltrettinger finnes — ta med / utelat" explicitly instead of silently leaving them out.
4. **B is unaffected by intent.** Standalone FOTO export ignores delivery intent and keeps its compatibility behaviour. FOTO shows a note when intent exists (§11 Q4).
5. **Moving is not classifying.** No position, direction or metadata operation reads or writes delivery intent.

---

## 4. Source-preservation feasibility and risks

### 4.1 Mechanism [R]

1. **`GmiSourceDocument`** (immutable): `{ bytes: Uint8Array, fingerprint, filename, encodingClass, text, parser, index }`. `text = decodeGmiBytes(bytes)` with `text.length === bytes.length` asserted.
2. **Span index**: one pass over `text` that records line records `{start, end, eolEnd}` (CRLF or LF), section ranges, and per object (mirroring parser order): object header line, `_FIELDVALUES` line, value region start (after the single separator), and field spans `[start, end)` split on `;`. Spans for `_FIELDNAMES` lines are kept per section.
3. **Reconciliation gate**: for every parsed object and field, `text.slice(span)` must equal `attributes[GMI_SOURCE_LEXEMES][name]`. Object counts must match per geometry. The document is editable only if reconciliation passes; otherwise it is read-only with a reason.
4. **Patch engine**: `applyGmiPatches(document, patches) → Uint8Array`. Patches are `{ start, end, bytes, expect }` byte ranges. `expect` is the original bytes in the range, re-checked. Patches are sorted, overlaps are rejected, and output is built by concatenating original subarrays and new bytes. Unchanged regions are therefore copied, never re-encoded.
5. **Post-condition verifier**: decode and reparse the output. Assert the same object counts, GUIDs, ids, `extent`, coordinates and header. Every `(scope, index, field)` lexeme must equal the original, except cells in the intended patch set, which must equal their new lexemes. For a column add, assert the same plus exactly one new name and a value for every object. For hyperlink removals, the remaining references must be the original multiset minus the removed reference ids (via `createGmiPhotoSource`). Any deviation blocks export.

### 4.2 Guarantees we can offer

| ID | Guarantee | Status |
|---|---|---|
| P1 | A no-change export is the original `Uint8Array`, byte-identical (no decode or encode at all). | [C] feasible; prototype 186/186 |
| P2 | For a changed export, every byte outside patched spans is identical and in the same order. EOL bytes, BOM (none observed), header, `_INDEX`/`_EXTENT` padding, geometry, GUIDs, comments, unsupported sections and unknown lines are copied verbatim. | [C] by construction; prototype verified |
| P3 | A value patch changes only the bytes between two `;` of one `_FIELDVALUES` line (or between the value-region start and the first `;`). | [C] |
| P4 | A column add changes only end-of-line insertions: one on `_FIELDNAMES`, one on each `_FIELDVALUES` line of that geometry section. | [R] feasible because 100% of real lines end with `;`; Gemini acceptance is [U] |
| P5 | A hyperlink removal changes only bytes inside one `S_HYPERLINK` lexeme. Removed wrappers lose their following separator. Optional renumbering changes only ordinal digits. | [C] grammar, [U] Gemini |
| P6 | The output reparses with the production parser to exactly the intended attribute differences. | [R] enforced gate |
| P7 | Inserted bytes are ASCII or Latin-1, encoded explicitly per the file's encoding class (§4.4). | [R] |

**What we cannot honestly promise:** that Gemini VA accepts every patched file. That is a compatibility gate (§9.3), not a structural property.

### 4.3 Reject instead of risk (fail-closed list) [R]

| Situation | Behaviour |
|---|---|
| Reconciliation fails, parser warnings in object structure, `text.length ≠ bytes.length` | Document read-only. Field-only and combined GMI export unavailable. FOTO-only export unaffected. |
| Repeated `[L_]`/`[P_]`/`[+L_]`/`[+P_]` sections, CR-only or mixed EOLs, a BOM other than UTF-8 | Read-only, with an explicit reason (none observed; defensive). |
| Target object has ≠1 `_FIELDVALUES` line or more values than names | That object is not editable. |
| New lexeme contains `;`, CR, LF, NUL or other C0 controls, or unrepresentable characters | Reject the value. |
| `expect` bytes differ at apply time | Reject the whole plan (stale). |
| Edit to `S_HYPERLINK` from field editing | Not offered (column ownership). |
| Hyperlink wrapper with >1 `link` member where only some are being removed | Reject; removal is whole-wrapper only. |
| Invalid hyperlink grammar in the target value | No removal possible; the link stays and the user is told. |
| Column add where any object in the section is irregular, or the column already exists (case-insensitive) | Reject. |
| Column add of a name not in the canonical registry | Not offered. |
| Non-ASCII value into a UTF-8-likely file | Reject (§4.4). |

### 4.4 Encoding policy [R]

Classify at load: `ascii` (no byte ≥0x80), `single-byte` (non-ASCII, invalid UTF-8; 159/175 real files), `utf8-likely` (valid UTF-8 with multibyte sequences, no BOM; 1/175), `utf8-bom` (0 observed).

- **ASCII** values: always allowed.
- **Non-ASCII** values: allowed for `ascii` and `single-byte` files if every char is in U+00A0–U+00FF (æøåÆØÅ and so on). Encode to one byte each. Reject U+0080–U+009F and characters that exist only in Windows-1252 (€, †, ˜…) unless a later decision says otherwise.
- **UTF-8-likely**: ASCII-only edits. (The current app already shows this file's Norwegian text as mojibake; this is a pre-existing limitation [C].)
- Field values remain lexemes. The editor writes the canonical lexeme from the registry (`SDR_VALUES` `'11.0'`), **never** a formatted number.

### 4.5 Main corruption and compatibility risks

| Risk | Mitigation |
|---|---|
| Span index drifts from parser semantics (trim, separator, section rules) | Reconciliation gate on every document; corpus suite; parser untouched. |
| Re-encoding unchanged text (Windows-1252 bytes 0x86/0x98 observed) | Byte splicing only; P1/P2 tests on those 3 files. |
| Value contains `;` | Reject; no escaping exists in the format [C]. |
| Lexical form changes (`11` vs `11.0`, padding) | Canonical lexemes from the registry; preview shows original vs new lexeme including whitespace. |
| Column add misaligns values | Precondition: uniform trailing `;` per section, exact span count per object; post-condition reparse. |
| Gemini rejects added columns, renumbered or gapped `h:` ordinals, or Latin-1 text | Gemini gates G1–G6 before the feature leaves "experimental". |
| Stale state between preview and download | Snapshot `isLive()` and `expect` bytes; rehash the source file before packaging. |
| Two survey layers of the same file with diverging edits | Edit session per layer; warn on importing a file whose fingerprint matches a layer with pending changes; package binds to one layer. |
| `_INDEX` placeholder might be filled by some writer | No numeric `_INDEX` observed [C]. If one is ever seen (`/^_INDEX \d/`), make the document read-only until understood. |

---

## 5. Shared edit-state design

### 5.1 Identity and targeting [R]

- **Document**: `{ layerId, inputId, fingerprint }`. `inputId` comes from `loadedGmiSources` and ties the session to the exact registered `File`.
- **Object**: `(geometryScope, sourceIndex)` in parser order of the immutable source. This is stable because the source never changes. GUID, `:L n` and identifiers are shown and checked, but are not keys (45 real files have no GUIDs).
- **Cell**: `(geometryScope, sourceIndex, columnName)`, with `columnName` the exact delivered source column. The canonical field (`sdr`) is resolved through the existing schema binding at operation build time and stored for display.
- **Validator bridge**: because `layer.data` stays original, `datasetRevision` stays constant, so `ObjectRef`s from findings map directly to `(scope, sourceIndex)`.

### 5.2 ChangeSet model [R]

```js
ChangeSet = Object.freeze({
  id, createdAt, origin: 'object-editor' | 'batch' | 'validator:<ruleId>',
  label,                              // "Fyll SDR 11.0 på 14 trykkrør"
  kind: 'set' | 'fill-missing' | 'clear' | 'add-column',
  column, canonicalFieldId,           // 'SDR', 'sdr'
  lexeme,                             // canonical new lexeme ('' for clear)
  selection: { description, objectKeys: [...] },   // always resolved to explicit cells at creation
  cells: [{ scope, index, column, original, previous, next }],  // original = delivered lexeme
  skipped: [{ scope, index, reason }],             // not eligible / already populated / conflict-skipped
  conflictPolicy: 'skip-changed' | 'replace-changed',
})
```

- `fill-missing` targets only cells whose delivered lexeme `trim() === ''` (parser-equivalent missing) **and** that no earlier ChangeSet has changed. It never overwrites.
- `set` may overwrite existing values. The preview lists each overwritten value and needs confirmation when any populated cell is affected.
- `add-column` is a structural ChangeSet. It can carry initial values for some objects (others empty), and is shown separately with a strong warning.
- Selections from filters (Tema, Material, applicability) are **resolved to explicit cells when the set is created**. Later edits never silently widen an earlier batch.

### 5.3 Working state and conflict rule [R]

`EditSession = { document, changeSets: ChangeSet[] (ordered), redo: [] }`. The effective lexeme of a cell is the `next` of the **last** ChangeSet containing that cell, else `original`.

- **Conflicts between operations**: when building a ChangeSet, cells already changed by an earlier set are reported in preview as "allerede endret". The default is `skip-changed`; the user can choose `replace-changed`. No silent last-write-wins.
- **Conflicts between modules**: impossible by column ownership. The delivery composer still asserts disjoint cells.
- **Undo / redo / discard**: undo pops the last ChangeSet; *Forkast* removes any ChangeSet (effective values recomputed); *Forkast alle* clears the session. Each ChangeSet is atomic.
- **Original vs proposed**: every cell view shows `original` (contractor), effective `proposed`, and the ChangeSet(s) that touched it.

### 5.4 Applicability, types and domains [R]

- Eligible columns: canonical registry fields whose source column is bound for the geometry (`gmiLayerSchemaBinding`). Unknown or unsupported columns are read-only in v1.
- Value input: code lists come from `getAuthoritativeValueTable` / rule `allowedValues` (`SDR_VALUES`, `PRESSURE_CLASS_VALUES`, `MATERIAL_VALUES`…). Free-text fields go through `evaluateTextMaxLength`, and dates and years through the existing format evaluators. Invalid input is blocked before a ChangeSet exists.
- Batch eligibility reuses Validator policy: SDR eligible = `getDiagnosticApplicability(...) === 'APPLICABLE'` on the **proposed** dataset (so a material corrected first can make an object eligible). `UNRESOLVED` objects are excluded and listed.

### 5.5 Proposed dataset and revalidation [R]

`proposedDataset = memo(document, changeSets) → GMIParser(decode(applyGmiPatches(...)))` keeps the same object model as `layer.data`, with its own `datasetRevision`. Revalidation: `runGmiValidationV2({ layerId, dataset: proposedDataset, datasetRevision: getDatasetRevision(proposedDataset), sourceFormat: 'gmi' })`. The UI shows per-rule deltas (original → proposed) and flags **newly introduced FAIL/CHECK**. Parsing a 1.7 MB file is fast enough on demand; debounce, or recompute only on ChangeSet changes (they are discrete).

### 5.6 Preview before apply [R]

A ChangeSet preview lists eligible cells (original → new), skipped objects by reason (not applicable / already populated / changed earlier / not editable) and overwrite counts. It highlights scope on the map via the existing highlight mechanism and offers *Vis i tabell*, which opens an `exact-object-set` in the Data Table. Apply = append the frozen ChangeSet.

### 5.7 Lifecycle [R]

| Event | Behaviour |
|---|---|
| Remove survey layer / reset | Confirm if the session has ChangeSets, then discard. Bound FOTO GMI sources go non-live (existing `reconcileLoadedGmiBindings`), so combined export becomes unavailable. |
| Import another file | Independent layer and session. If the fingerprint equals a layer with pending edits, show a non-blocking warning. |
| Clear FOTO / remove GMI source / remove photos | Delivery intent of the removed occurrences vanishes; combined plan goes stale. |
| Page reload | Everything is lost today. Add a `beforeunload` guard while ChangeSets exist (§11 Q9). |

### 5.8 Where state lives [R]

A plain JS module `gmiEditSessions` (like `loadedGmiSources`), holding the bytes and ChangeSets outside Zustand and outside persistence. Zustand holds only a small, serializable view-state tick (`{ layerId, version, count }`) for re-rendering. The original bytes must never enter Zustand or `localStorage`.

### 5.9 Persistence [R]

v1 is in-memory only. Later (optional milestone): export and import an **endringsfil** (JSON) `{ sourceFingerprint, filename, changeSets[] }`. On import, verify the fingerprint and every cell's `original` lexeme, then restore all or nothing. This avoids storing customer GMIs in the browser.

---

## 6. Field-editing UI proposal [R]

### 6.1 Placement

Add a third left-panel workspace, **"Rettinger"**, next to Validator (`FieldValidationSidebar`) and FOTO (`PhotoWorkspaceCollection`) in the `WorkspaceShell` `sidebar` switch (`page.js:869-891`). It is entered from the layer card or Sidebar (*Rett feltverdier…*) and from Validator findings. FOTO is not touched.

```
┌ Rettinger · <fil.gmi> ───────────────┐┌──────────── map (changed objects highlighted) ───────────┐
│ ⓘ Foreslått kopi. Originalleveransen ││                                                           │
│   er uendret.                         ││                                                           │
│ [Endringer (3)] [Ny retting]          ││                                                           │
│ ─ Fyll SDR 11.0 · 14 objekter   ↶ ✕  ││                                                           │
│ ─ Material PE100 · Linje 12     ↶ ✕  ││                                                           │
│ ─ Trykklasse PN10 · 6 objekter  ↶ ✕  │├───────────────────────────────────────────────────────────┤
│ Validering: 12 Feil → 3 Feil (+0 nye) ││ Data Table · [Original | Foreslått | Kun endrede]         │
│ [Revalider] [Last ned revidert GMI…]  ││ cells: original struck / proposed bold, row "Rediger"     │
└───────────────────────────────────────┘└───────────────────────────────────────────────────────────┘
```

### 6.2 Components

1. **Object editor** (docked inspector, like the Validator inspector): every column of one object, showing delivered lexeme, proposed lexeme, field info (`composeFieldInformation`) and applicability. Inputs are per type (code list picker, number, date, text). *Lagre* creates one `set` ChangeSet with all modified cells. GUID, geometry and `S_HYPERLINK` are read-only (hyperlinks are shown with a note that photo delivery is decided in FOTO).
2. **Batch builder** ("Ny retting"): field → scope (all / Tema / Material / applicability / current table selection / Validator finding) → mode (*Fyll bare tomme* default, *Overskriv*) → value → **preview** → apply.
3. **Change list** ("Endringer"): ChangeSets in order with counts, origin, undo/discard, and *Vis i tabell / kart*.
4. **Data Table modes**: *Original* (today), *Foreslått* (proposed dataset rows), *Kun endrede*. Modified cells are marked, and tooltips show original → proposed. Editing stays in the inspector, not inline, to keep the virtualized table read-only and simple.
5. **Revalidation summary**: per-rule counts original → proposed, new problems first, with links into the Validator.
6. **Field-only download**: *Last ned revidert GMI* opens a confirmation summary (ChangeSets, cells, objects, any structural column additions, filename) and saves a `.gmi`.

### 6.3 Validator integration

- A rule-level action **"Lag retting…"** only for rules on an allow-list `CORRECTABLE_RULES` (start with `innmaling.line.sdr.valid`, `innmaling.line.pressure-class.valid`, plus simple required code-list fields). It opens the batch builder with the field, mode *Fyll bare tomme* and the scope = finding objects with `APPLICABLE` + `VALUE_MISSING`. **The user picks the value.** Nothing is auto-fixed. Relationship, plausibility, geometry and Tema-conflict findings stay non-fixable.
- The Validator keeps showing the **original delivery** by default. Once a session exists it shows a toggle *Original / Foreslått kopi* plus a banner, so the contractor's result is never hidden.

---

## 7. FOTO classification and hyperlink removal

### 7.1 Classification level [R]

The **unit is the FOTO occurrence**: one asset as linked from one GMI object. It already carries `sourceFingerprint`, `objectKey` and `referenceIds` (§2.5). Both levels are needed:

- **Occurrence level (decision):** `deliveryIntent ∈ { 'keep-link' (default), 'transfer' }` for GMI-linked occurrences. *Transfer* means include the occurrence in the combined GML and remove its `referenceIds` from the revised GMI. Unlinked (EXIF/GML/manual) occurrences have `include ∈ { false (default), true }` for the combined GML.
- **Asset level (view and bulk action):** the photo card shows "Kum A: beholdes i GMI · Kum B: overføres til GML". Bulk actions: *Overfør valgte*, *Behold lenker*. An asset with any kept link stays physically in `Attachments` once.

Stored in `photoSession` as an occurrence field with a dedicated action `setDeliveryIntent(layerId, occurrenceIds, intent)`. It is changed **only** by that explicit action. `applyPhotoEdits`, positioning and metadata never touch it (test-enforced).

### 7.2 Removal rules [R]

1. Only references with a `confident` ledger edge that belong to a *transfer* occurrence are candidates. Ambiguous, unmatched, invalid, non-image (`.pdf`, `.sos`) and directory-only links are never removed.
2. Removal is whole-wrapper. Before patching, recompute `extractHyperlinkOccurrences` on the document's current lexeme. The wrapper text must equal the recorded `rawWrapper`, contain exactly one `link`, and that link's `referenceRaw` must match. Otherwise block.
3. The rewrite removes the wrapper plus its following whitespace separator. If no wrappers remain, the lexeme becomes `''`. Other wrappers, including `sign` metadata, stay byte-identical except optional ordinal renumbering (§11 Q3).
4. A bare (unwrapped) single-path value whose path is transferred becomes `''`.
5. One photo linked from several objects is removed only where its occurrence is *transfer*. Other links remain, and the file stays in `Attachments`.
6. Duplicate deliveries (the same file twice in one value; 0 observed) are all removed for that occurrence, since the ledger groups them.

### 7.3 Absent or failing GML photo [R]

A *transfer* occurrence whose GML feature cannot be produced (unplaced, projection failure, missing required direction, unreadable file, stale) is a **blocking error** in the combined plan. Resolution options per row: *fix in FOTO*, or *behold lenke i GMI*, which resets intent to `keep-link`. The plan never silently keeps the link while the user believes it moved, and never removes it without the GML feature. Warnings (not blocks) cover retained links to files missing from the package and transfers of photos also linked elsewhere.

---

## 8. ZIP, Attachments and export architecture

### 8.1 Package layout [R]

```
<basename>.zip
├── <basename>.gmi        revised copy (patched bytes)
├── <basename>.gml        selected georeferenced photos (omitted if none)
└── Attachments/
    ├── <retained GMI file names, exactly as referenced>
    └── <GML-only file names, planned around the reserved names>
```

`<basename>` reuses `photoExportNames` (`YYYYMMDD-HHmmss[-label]`, Europe/Oslo). Entry order: `.gmi`, `.gml`, attachments sorted by path. Fixed DOS time; pass-through (no compression of images). The GMI is written as raw bytes, never via `strToU8`.

### 8.2 Attachment planning (one shared folder) [R]

1. **Reserved names.** For every *retained* GMI reference (all original links minus removed ones) that resolves confidently to a loaded asset, the packaged path is the reference's relative path with `\`→`/`. These names are **never renamed**, because renaming would require editing kept links.
2. **Shared assets.** An asset referenced by a retained link and by a GML feature uses the reserved name in the GML too (one physical copy). If that name fails the GML safety check (`planAttachmentNames` rules), block with an explanation (§11 Q6).
3. **GML-only assets** are named with the existing `planAttachmentNames` algorithm, extended with a `reserved` set (case-fold, NFC). Collisions with reserved names get the existing `--<hash>` suffix.
4. **Deduplication is by `assetId` only.** Same content under different names stays as two files (the corpus audit recommends against hash or filename merging) [C].
5. **Same name, different content** within the reserved set is impossible for one GMI namespace. Between a reserved name and a GML-only asset it is resolved by step 3.
6. **Unreferenced delivered files** (loaded in FOTO but neither retained nor in the GML) are excluded by default and listed in the summary (§11 Q7).
7. **Retained links whose file is not loaded** produce a warning ("N lenker i GMI peker på filer som ikke er med i pakken") that needs explicit confirmation.
8. **Retained links outside `Attachments\`** (63 bare and 53 deeper paths in the corpus [C]) are packaged at their own relative path, which breaks the single-folder property. Readiness shows this; see §11 Q5.
9. **Path safety.** Reject `..`, absolute, drive, UNC and URL targets for packaging (keep the link, do not package it, warn). ZIP entry names are UTF-8. Verify that `fflate` sets the EFS flag for Norwegian names [U, test].

### 8.3 Snapshot and plan [R]

`captureDeliverySnapshot({ surveyLayerId, photoLayerId, includeFieldChanges })` freezes:

- the GMI document reference, fingerprint and ChangeSet list identity
- `capturePhotoExportSnapshot(photoSession, photoLayerId)` (reused unchanged)
- delivery intents and the bound GMI source ledger
- `isLive()` as the conjunction of the photo snapshot `isLive`, the same ChangeSet list identity and the same document input

`buildDeliveryPlan(snapshot, config)` produces:

- `gmiBytes` (frozen) and its verification report
- GML via the existing serializer, fed a filtered occurrence list and the shared attachment names
- `attachments[]`, `counts`, `errors`, `warnings` and `changeSummary`

The plan is registered in a WeakSet like `issuedPlans`. `buildDeliveryPackage(plan)` re-hashes the source GMI file and each asset, asserts the plan is live before and after each member, and writes the ZIP.

**Refactor note:** the existing `buildPhotoExportPlan` needs two small seams, an occurrence filter and an injected reserved-names / pre-planned-attachments map, so the combined plan reuses the serializer and rules **without changing the standalone output**. That is guarded by the existing golden/parity tests (`photoExportBaseline`, `photoExportParity`, `photoExportSerializers`).

### 8.4 Field-only export (mode A) [R]

Default: a standalone `<basename>.gmi` (or §11 Q8: original stem plus suffix), because the original attachments are already beside the user's original GMI and mode A must not require FOTO. Optional *Pakke med vedlegg* (ZIP with `.gmi` + retained attachments) is offered only when a FOTO layer has the referenced files loaded.

### 8.5 Readiness and summary [R]

The readiness levels mirror the photo export (blocking / recommendation / note):

- **GMI**: editable document; verification passed; ChangeSet counts by kind; structural changes; removed links per object; encoding notes.
- **GML**: the existing readiness, restricted to selected occurrences.
- **Attachments**: reserved, shared, GML-only, renamed, missing, outside-Attachments and unreferenced counts.

The summary is shown before download and offered as a separate *Last ned endringsrapport* (CSV/TXT) **outside** the ZIP. Current packages deliberately contain no manifest [C], and extra files may confuse import chains (§11 Q10).

### 8.6 Delivery hub UI [R]

Add an *Eksporter leveranse* entry in Rettinger and in FOTO, opening a wizard with steps *Innhold* (choose: revidert GMI, georefererte bilder, both; shows A/C/D implicitly), *Kontroll* (readiness) and *Pakke* (preview and download). It reuses `PhotoWizardSteps` and the reducer pattern of `photoExportWizard.mjs`. The existing FOTO *Eksporter bilder* wizard stays as mode B.

---

## 9. Tests and compatibility gates

### 9.1 Fixtures [R]

- New committed synthetic fixtures (`tests/fixtures/gmi-edit/`, fabricated, with a manifest and SHA-256 like `gmi-v32`). They must cover:
  - **CRLF** and LF
  - Latin-1 Norwegian letters and Windows-1252 `0x86`/`0x98`
  - a UTF-8-without-BOM file
  - trailing `;` names and values
  - `_INDEX`/`_EXTENT` `!` padding
  - `[T_]` with `_label`/`_rot`, `[Y_]`, `[O_COORDOBS]`, `/XYH`
  - objects without GUID
  - an `S_HYPERLINK` mid-row, 1–6 wrappers, `sign`, bare path, `.pdf`/`.sos` links, directory-only link
  - the same photo from two objects, a Merknad with an odd `"`, an empty SDR column vs an absent SDR column
- Reuse `tests/helpers/gmiPhotoFixtures.mjs` `realGrammarFamilies` (12 real shapes).
- An opt-in private corpus suite `GMI_EDIT_CORPUS=<dir>` that prints counts only and asserts every file is unchanged before and after (pattern of `gmiPhotoCorpus.test.mjs`). Point it at `REF_FILES` and Downloads locally; never commit those files.

### 9.2 Automated acceptance criteria

| ID | Criterion |
|---|---|
| T1 | **No-change export** equals the original bytes (SHA-256), for every fixture and corpus file. |
| T2 | **Reconciliation**: every parser lexeme equals its span; object counts equal; non-reconcilable inputs are read-only. |
| T3 | **Targeted change**: output differs from input only inside the patched spans (byte diff ranges ⊆ patch ranges). Reparse differs only in the intended cells. Header, GUIDs, ids, `extent` and coordinates are deep-equal. |
| T4 | **Insertion into an empty value** (first, middle and last column, trailing-empty column) and **clear** behave as T3. |
| T5 | **Column add**: exactly one new name, one new value per object in that section, no other diffs; other sections untouched; rejected on irregular sections. |
| T6 | **Batch eligibility**: SDR fill touches only APPLICABLE + missing cells on the proposed dataset; populated, UNRESOLVED and non-pressure objects are listed as skipped; overwrite needs explicit mode. |
| T7 | **Conflicts**: overlapping ChangeSets default to skip, replace when chosen; undo/redo/discard recompute effective values; module-cell overlap is rejected. |
| T8 | **Encoding**: Latin-1 letters encode to one byte in single-byte files; `;`, CR, LF and controls are rejected; non-ASCII is rejected in UTF-8-likely files; Windows-1252 bytes elsewhere are preserved. |
| T9 | **Hyperlink removal** (all real families × every wrapper position): remaining links and `sign` metadata are byte-identical (modulo the chosen renumbering policy); non-photo links never removed; a multi-link wrapper partial removal is rejected; a bare value is cleared. |
| T10 | **Shared photographs**: an asset linked from two objects, one transferred, keeps one link and is in GML. `Attachments` contains it once. |
| T11 | **No silent loss**: a *transfer* occurrence that is unplaced, unprojectable or missing direction blocks the plan; no link is removed in any produced bytes. |
| T12 | **Single shared folder**: every GMI-retained and GML link resolves to exactly one ZIP entry; no dangling, duplicate or orphan entries; reserved names are never renamed; case-fold and NFC/NFD collisions are handled. |
| T13 | **Snapshot integrity**: an edit, intent change, photo move or ChangeSet change after plan creation makes the plan stale and download refuses. A source file changed on disk (hash mismatch) refuses. |
| T14 | **Reimport**: revised GMI → `GMIParser` (no errors or warnings beyond the original's) → `createGmiPhotoSource` (references = original − removed) → `runGmiValidationV2` (results consistent with the proposed dataset). |
| T15 | **Mode invariants**: GMI(A) == GMI(D with no transfers); GMI(C) == original + removals only; standalone FOTO ZIP unchanged (existing golden/parity suites green). |
| T16 | **Intent isolation**: `applyPhotoEdits`, positioning and metadata actions never change `deliveryIntent`. |
| T17 | **Diff report**: `diffGmiDatasets(original, revised)` lists exactly the intended cell changes (used by UI and tests). |

UI and browser tests follow the existing `chromeHarness` pattern: the workspace opens and exits, the banner is visible, the preview shows skipped and overwritten counts, the Data Table modes work, the hub step flow works, and stale states display correctly.

### 9.3 Gemini VA compatibility gates (manual, recorded like `PHOTO_EXPORT_IMPORT_EVIDENCE`)

Our parser accepting a file proves nothing about Gemini. Each gate records the Gemini/FME version, file hashes, counts and observed result.

| Gate | Package | Pass condition |
|---|---|---|
| G0 | The **original** GMI imported as a baseline | Reference behaviour recorded |
| G1 | Value-only edits (SDR fill, material replace), ASCII | Imports; edited values visible; other attributes and geometry unchanged |
| G2 | Value with Norwegian letters into a Latin-1 file | Characters displayed correctly |
| G3 | Column add (e.g. `SDR` where absent) | Imports; column mapped; values visible |
| G4 | Hyperlink wrapper removal, with and without renumbering | Imports; remaining photos open; removed ones absent |
| G5 | Combined ZIP: `.gmi` + `.gml` + shared `Attachments` | Both import (record the order used); kept and GML photos open; no duplicates in GeoFoto |
| G6 | GML referencing a reserved GMI name (shared asset) | GeoFoto registers it; GMI link still opens |

Until G1/G4/G5 pass, label the GMI export **eksperimentell** in the UI, as for the photo profiles.

---

## 10. Recommended implementation milestones

All milestones keep the original GMI untouched and are reviewable independently. *Effort* means the suggested Opus effort.

| # | Milestone | Scope | Prerequisites | Main code areas | Expected behaviour | Tests / acceptance | Risks | Indep.? | Effort |
|---|---|---|---|---|---|---|---|---|---|
| **M0** | Edit fixtures and corpus harness | Synthetic fixtures (§9.1), manifest and hashes, opt-in `GMI_EDIT_CORPUS` runner (port of this pass's prototype: reconcile, no-op, single-cell edit, wrapper removal) | — | `tests/fixtures/gmi-edit/`, `tests/helpers/`, `tests/gmiEditCorpus.test.mjs` | Tests only | Fixture integrity; corpus suite skipped without env | Fixture realism; LF/CRLF via git autocrlf (use `.gitattributes -text` for fixtures) | Yes | Medium |
| **M1** | Source document, span index, patch engine | `GmiSourceDocument`, encoding class, `indexGmiSource`, reconciliation, `applyGmiPatches`, post-condition verifier, value-lexeme validation | M0 | new `src/lib/gmi-edit/{sourceDocument,sourceIndex,patch,verify,encoding}.mjs` | Pure library; no UI | T1–T4, T8 | Parser-semantics drift; must not change `GMIParser` | Yes | **High** |
| **M2** | ChangeSets and working state | ChangeSet model, conflict policy, undo/redo/discard, proposed-dataset memo, revalidation adapter, `diffGmiDatasets`, batch eligibility helpers (SDR/pressure class via existing applicability) | M1 | `src/lib/gmi-edit/{changeSet,session,proposed,eligibility,diff}.mjs` | Pure library | T6, T7, T14 (field part), T17 | Applicability reuse needs a small exported helper from `validationRunner.js` | Yes | Medium |
| **M3** | Session lifecycle and field-only export service | `gmiEditSessions` registry; bytes from `loadedGmiSources` (add `readBytes(ticket)`); layer remove/reset/duplicate-fingerprint handling; `beforeunload` guard; `.gmi` download service and naming | M2 | `loadedGmiSource.mjs`, `store.js` (minimal tick + remove/reset hooks), new `gmi-edit/exportGmi.mjs` | A `.gmi` can be produced programmatically | T1, T3, T15 (A part); lifecycle tests like `photoLoadedGmiStore.test.mjs` | Store coupling; keep bytes out of Zustand | Mostly | Medium |
| **M4** | Rettinger workspace: object editor and change list | Workspace shell slot, banner, object inspector, change list, undo/discard, field-only download dialog, Data Table *Original/Foreslått/Kun endrede* | M3 | `page.js`, new `components/gmi-edit/*`, `LayerDataTable.js` (mode), `Sidebar.js` entry | **Scenario A usable for single-object edits** | Browser UI tests; download equals library output | Data Table complexity; keep inline editing out | Yes (after M3) | Medium |
| **M5** | Batch builder and Validator integration | Batch builder with preview, `CORRECTABLE_RULES`, *Lag retting…* from findings, revalidation summary, Validator *Original/Foreslått* toggle | M4 | `components/gmi-edit/*`, `ValidationV2Workspace.js` | **Scenario A complete** (SDR fill etc.) | T6, T7 in UI; findings scope correctness | Scope creep into auto-fix; keep allow-list small | Yes | Medium |
| **M6** | Structural column add (experimental) | `add-column` ChangeSet, preconditions, UI with strong warning | M5 | `gmi-edit/patch.mjs`, UI | Missing columns can be added | T5; Gemini G3 before enabling by default | Gemini acceptance unknown | Yes | Medium |
| **M7** | Hyperlink removal composer | Pure function from (document, ledger, reference ids) to `S_HYPERLINK` patches; whole-wrapper rules; renumber policy flag; bare values | M1 | new `gmi-edit/hyperlinkRemoval.mjs` (uses `extractHyperlinkOccurrences`) | Library only | T9, T10 (GMI part) | Grammar edge cases; renumbering decision (Q3) | Yes | Medium |
| **M8** | FOTO delivery intent | `deliveryIntent`/`include` on occurrences, `setDeliveryIntent`, reconcile on removal, FOTO UI (per-occurrence and asset view, bulk actions, filter "Overføres til GML") | — (parallel to M1–M7) | `photoSession.mjs`, `photoWorkspaceView.mjs`, FOTO inspector/collection components | Intent visible and editable in FOTO; no export yet | T16; UI tests; standalone export unchanged | Must not disturb edit/positioning flows | Yes | Medium |
| **M9** | Combined delivery planner and package | `captureDeliverySnapshot`, reserved-name attachment planner, seams in `buildPhotoExportPlan` (occurrence filter, pre-planned names), blocking rules for absent GML photos, ZIP builder | M3, M7, M8 | new `src/lib/delivery/*`, `photoExportPlan.mjs` (seams), `attachmentNames.mjs` (reserved set) | Scenarios C and D produced programmatically | T10–T15; existing photo golden/parity suites unchanged | Naming/layout correctness; snapshot liveness across two modules | Yes (lib) | **High** |
| **M10** | Delivery hub UI | Wizard *Innhold/Kontroll/Pakke*, readiness and summary, change report download | M9, M5 | new `components/delivery/*`, entries in Rettinger and FOTO | **Scenarios C and D usable** | Browser flow tests; stale/blocked states | UX density | Yes | Medium |
| **M11** | Gemini acceptance and hardening | Run G0–G6; record evidence table; adjust renumbering/naming per results; remove or keep "eksperimentell" | M6, M10 | evidence constants, docs | Documented compatibility | Manual gates | External dependency | — | Medium |
| **M12** (optional) | Change file persistence | Export/import endringsfil with fingerprint and lexeme verification | M3 | `gmi-edit/changeFile.mjs`, UI | Resume work after reload | Round-trip, stale-source rejection | Privacy (no customer bytes stored) | Yes | Medium |

Suggested order: M0 → M1 → M2 → M3 → M4 → M5 (scenario A ships). M7 and M8 can run in parallel from M1. Then M9 → M10 (C/D ship), M6 and M11 alongside, M12 last.

---

## 11. Open product decisions (each with a recommended answer)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Name and placement of the field-editing section? | A separate **"Rettinger"** workspace next to Validator and FOTO (§6.1), entered from the layer card and from correctable Validator findings. |
| Q2 | Should Validator findings auto-apply fixes? | **No.** Allow-listed rules may *prefill* a batch; the user always picks the value and confirms the preview. |
| Q3 | After removing `h:N` wrappers, renumber the remaining ones? | **Renumber to contiguous `1..n`** (the only shape seen in 2,035 real values), changing only the digits. Confirm via Gemini G4; keep a flag to disable it. |
| Q4 | Should standalone FOTO export (mode B) respect delivery intent? | **No by default** (keeps established behaviour). Show a note when intents exist. Optional later filter "bare valgte". |
| Q5 | Retained links outside `Attachments\` (bare or deeper paths)? | **Keep the links unchanged and package files at their referenced paths**, with a readiness warning. Offer an explicit, separately listed "normaliser til Attachments\" ChangeSet only if users ask for it. |
| Q6 | Shared asset whose GMI name is unsafe for GML? | **Block with explanation** in v1. Do not create a second copy silently. |
| Q7 | Include delivered photos that neither output references? | **Exclude by default**, list them in the summary; possible later opt-in "ta med ureferte vedlegg". |
| Q8 | Revised GMI filename? | `<YYYYMMDD-HHmmss>[-label].gmi`, matching the existing ZIP/GML basename. The summary records the original filename and SHA-256. Alternative if users prefer traceability: `<original-stem>-revidert-<timestamp>.gmi`. |
| Q9 | Persist edits across reload? | **v1 in-memory plus an unsaved-changes guard**; later the endringsfil (M12). Never store the original GMI in the browser. |
| Q10 | Change summary inside the ZIP? | **No.** Separate download, because current packages intentionally contain only importable content. |
| Q11 | Field-only output format? | **Standalone `.gmi` by default**; ZIP with attachments only when the files are loaded. |
| Q12 | Disposition "both" (keep the GMI link and also export to GML)? | **Not in v1**: only *keep-link* or *transfer*. Revisit after G5/G6 shows how GeoFoto handles duplicates. |
| Q13 | Non-ASCII values in UTF-8-likely GMIs? | **Block** (ASCII only) until decoding of such files is addressed app-wide. |
| Q14 | Allow adding columns (structural change)? | **Yes, as an explicit experimental operation** (M6), disabled by default until G3 passes. |
| Q15 | Combined package with photos from several GMI sources? | **One GMI per package in v1**; block if transfer intents reference another source fingerprint. |
| Q16 | GMI sources imported directly into FOTO (not as a survey layer)? | Combined delivery **requires the GMI loaded as a survey layer** (only that path keeps bytes and edit state). Offer "Last inn som kartlag" in the hub. |

---

## Appendix A. Verification performed in this pass

- Repository read: parser, decoding, upload, store layer lifecycle and persistence, loaded-GMI retention, hyperlink extractor, GMI photo source and ledger, photo session association and edit transaction, export plan/XML/package/naming/rules/wizard, Validator v2 runner/binding/contracts/objectRef/uiIntegration, object-table inspection, shell layout, fixture manifest and prior corpus/compatibility reports.
- Local survey (read-only, counts only): 244 GMI files from `REF_FILES`, Downloads and `C:\temp\gmi-photo-test`, deduplicated to 175 by SHA-256, plus 13 committed fixtures in the prototype run.
- Prototype (scratchpad, not committed): span index, reconciliation, no-op patch, SDR value patch with reparse diff, hyperlink wrapper removal. Results in §1.
- Not done: no Gemini VA import, no tests or build run (no code changed), no ZIP generated.

`git status` before and after: clean, apart from this report.
