# GMI editing M1: source document, span index, patch engine, encoding policy and verifier

Date: 2026-11-09. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, starting commit `e1e1092`.
Scope: **Milestone M1 only**, from `docs/agent-reports/20261108-gmi-editing-combined-delivery-planning.md` §4, §9.2 and §10, building on M0 (`docs/agent-reports/20261109-110929-gmi-edit-m0-fixtures-corpus-harness.md`).
No UI, ChangeSets, session lifecycle, download, Validator/FOTO integration, column insertion or hyperlink removal was added. `GMIParser`, the M0 harness, the M0 and `gmi-v32` fixtures, their manifests and `.gitattributes` are unchanged. No commit, no push.

---

## 1. Implementation summary and files changed

| File | Status | Purpose |
|---|---|---|
| `src/lib/gmi-edit/sourceDocument.mjs` | new | Immutable `GmiSourceDocument`: private byte copy, fingerprint, encoding characteristics, frozen parser result, reconciliation outcome, editability status and reasons. |
| `src/lib/gmi-edit/sourceIndex.mjs` | new | Control-flow port of `GMIParser._parseInternal`/`_parseCoordinates` that records exact spans. Also reconciles the index with the parser: lexemes, location, identity and warnings. |
| `src/lib/gmi-edit/encoding.mjs` | new | Byte description (BOM, encoding class, C1 bytes, EOL). Replacement-lexeme validation and encoding per encoding class. Decoder self-check. |
| `src/lib/gmi-edit/targets.mjs` | new | Resolves `(scope, sourceIndex, field)` targets to exact editable cells, with optional `objectId`/`guid` identity guards. Also provides per-object cell inspection. |
| `src/lib/gmi-edit/patch.mjs` | new | `planGmiFieldPatches` → `applyGmiPatches` (strict splice) → `editGmiFields` (plan, apply, verify). |
| `src/lib/gmi-edit/verify.mjs` | new | Independent post-edit verifier (§4). |
| `src/lib/gmi-edit/index.mjs` | new | Public entry point. |
| `tests/gmiEditCorpus.test.mjs` | changed | The five M1 `todo` placeholders were replaced by real production tests T1, T2, T3, T4, T8. Added a production private-corpus test. The header comment was updated. All reference tests are unchanged. |
| `tests/gmiEditProduction.test.mjs` | new | 12 negative, policy, immutability, identity and module-boundary tests. |
| `tests/helpers/gmiEditProductionCorpus.mjs` | new | Read-only production corpus scan that compares each file with the M0 reference harness. Reports counts only. |
| `docs/agent-reports/20261109-113731-gmi-edit-m1-source-patch-engine.md` | new | This report. |

**Deviation from the proposed file boundaries.** I added `targets.mjs` (target resolution and cell inspection) and `index.mjs` (public entry point) to the five proposed modules. Putting target resolution in `patch.mjs` would have made the verifier import the patch engine. The verifier resolves cells by itself, so it must not depend on the code it checks. Every other responsibility matches the architecture.

All new modules are pure ES modules and safe to run in the browser. Their only imports are siblings and `src/lib/parsing/*`: no `node:` modules, no photo or UI code. The fingerprint uses WebCrypto. A test enforces these import boundaries. The app does not import the library yet, so `next build` does not bundle it.

## 2. Public production API and example usage

```js
import {
  loadGmiSourceDocument, createGmiSourceDocument, getGmiSourceBytes,
  resolveGmiCell, listGmiObjectCells, validateGmiFieldLexeme,
  planGmiFieldPatches, applyGmiPatches, editGmiFields, verifyGmiEdit,
} from '@/lib/gmi-edit/index.mjs'; // src/lib/gmi-edit/index.mjs

const document = await loadGmiSourceDocument(bytes, { filename: 'leveranse.gmi' });
// document: frozen { kind, filename, size, fingerprint ('sha256:…'), encoding, status,
//                    editable, reasons[], mismatches[], counts, parser (frozen result) }
if (!document.editable) showReadOnly(document.status, document.reasons); // still readable

const cell = resolveGmiCell(document, { scope: 'line', sourceIndex: 1, field: 'SDR', objectId: 2 });
// { ok, cell: { key, scope, sourceIndex, field, position, line, start, end, lexeme, objectId, guid } }

const result = editGmiFields(document, [
  { target: { scope: 'line', sourceIndex: 1, field: 'SDR' }, expected: cell.cell.lexeme, lexeme: '11.0' },
]);
if (result.ok) download(result.bytes);          // verified Uint8Array (a fresh copy)
else report(result.stage, result.rejections);   // 'plan' | 'apply' | 'verify'; no bytes at all
```

| Function | Contract |
|---|---|
| `createGmiSourceDocument(bytes, {filename})` | Synchronous. Copies the input. Never throws for content problems (read-only with reasons instead). `fingerprint` is `null`. |
| `loadGmiSourceDocument(bytes, {filename})` | Async. The same, plus a `sha256:` fingerprint identical to FOTO's `gmiSourceFingerprint` (parity test). |
| `getGmiSourceBytes(doc)` / `getGmiSourceText(doc)` | A fresh copy of the original bytes, or the upload-decoded text. Works on every document, including read-only ones. |
| `resolveGmiCell(doc, target)` / `listGmiObjectCells(doc, scope, i)` | Target resolution, and inspection of every column of an object with its editability and reason. |
| `validateGmiFieldLexeme(lexeme, encodingClass)` | `{ok, bytes}` or `{ok:false, code, index, codePoint, nfcRepresentable}`. |
| `planGmiFieldPatches(doc, edits)` | Frozen patches `{cellKey, target, start, end, expectedLexeme, lexeme, expected: bytes, replacement: bytes}`. |
| `applyGmiPatches(doc, patches)` | Strict byte splice (§4). `[]` returns bytes identical to the source. |
| `editGmiFields(doc, edits)` | Plan → apply → verify. Bytes are returned **only** if verification passes. |
| `verifyGmiEdit(doc, output, changes)` | `{ok, failures[], summary, outputDocument}`. `outputDocument` is the verified output loaded as a new source document. M2 can use it as the proposed dataset. |

Rejections and failures are data (`{code, editIndex|patchIndex, …}`) with no file content. Only programming errors throw: non-byte input, or an object that is not a document.

## 3. Encoding and reconciliation decisions

**Decoding.** Offsets are byte offsets because the upload decoder (`iso-8859-1` = WHATWG windows-1252) maps each byte to exactly one UTF-16 unit. This is verified per document (`text.length === bytes.length`) and once per runtime: all 256 bytes decode to distinct single units, with identity on 0x00–0x7F and 0xA0–0xFF. If either check fails, the document is read-only. Unchanged bytes are never decoded or re-encoded on output.

**Encoding classes and replacement policy** (planning report §4.4):

| Class | Editable | Replacement characters allowed |
|---|---|---|
| `ascii` | yes | U+0020–U+007E, U+00A0–U+00FF, one byte each |
| `single-byte` (Latin-1/1252) | yes | U+0020–U+007E, U+00A0–U+00FF, one byte each |
| `utf8-likely` | yes | ASCII U+0020–U+007E only |
| `utf8-bom`, `utf16-bom` | no | — |

These are always rejected:
- `;` (`lexeme-semicolon`);
- CR and LF (`lexeme-line-break`);
- every other C0 control **including TAB**, plus DEL (`lexeme-control-character`);
- U+0080–U+009F (`lexeme-c1-control`);
- Windows-1252-only printable characters (€, †, ˜…), anything above U+00FF, astral characters and U+2028 (`lexeme-unrepresentable`);
- non-strings such as the number `11` (`lexeme-not-string`).

Nothing is normalized or transliterated. A decomposed `ø` is rejected and reported with `nfcRepresentable: true`, so a UI can explain why. The verifier also rejects **encoding-class drift**:
- an ASCII or single-byte source must not become valid multibyte UTF-8 (for example, writing `Ã¸` into an ASCII file);
- a UTF-8 source must stay valid UTF-8.

An ASCII file may become single-byte when a Latin-1 letter is written, as the plan allows.

**Reconciliation gate.** `reconcileGmiSourceIndex` reports a mismatch, and the document becomes `not-reconcilable`, unless all of the following hold:
- object counts and field names per geometry are equal;
- each object's `:L n`/`:P n` id, GUID, `_EXTENT` and valid-coordinate count equal the parser's;
- every parser lexeme equals its indexed span (`lexeme-span`, `lexeme-count`);
- **location invariants**: each `_FIELDVALUES` line lies between its object's header and the next object, belongs to only one object, and its spans tile the value region exactly between single `;` bytes. A span that points at identical text in another object is caught by these invariants. Plain text comparison cannot catch it (tested with three byte-identical objects);
- every parser warning is predicted, in order and by exact message: `field_shape` for each over-long `_FIELDVALUES` line, `coordinate` for each malformed vertex line, and the class counts agree.

Unpredicted trailing warnings (class `other`) make the document `unsupported` (`parser-warnings`). They are not a reconciliation failure.

The parser is **not** modified, and no parser defect was found.

## 4. Exact patch safety guarantees

| ID | Guarantee | Enforced by |
|---|---|---|
| P1 | No-change export: `editGmiFields(doc, [])` and `applyGmiPatches(doc, [])` return bytes identical to the source (SHA-256), as a fresh copy. | splice + verifier; T1 on 12 fixtures and 174 corpus files |
| P2 | Every byte outside the targeted value spans is identical and in the same order. This includes EOL bytes, header, `_INDEX`/`_EXTENT` padding, GUIDs, geometry, unparsed sections and malformed vertices. | output built from original subarrays; verifier checks 1, 2 and 5 |
| P3 | A patch range must be **exactly one editable field-value span** of the immutable source. A range covering a separator, two cells, the structural trailing slot, a coordinate or a header byte is refused (`range-not-a-field-value`). | `applyGmiPatches` |
| P4 | Every edit carries an exact expected original lexeme (`missing-expected-value`, `stale-expected-value`). Every raw patch carries expected original bytes (`missing-precondition`, `stale-precondition`). Whitespace is not trimmed. | plan + splice |
| P5 | Replacement bytes are re-validated in the splice: they must decode to an accepted lexeme and re-encode to the same bytes. | `validateGmiReplacementBytes` |
| P6 | Duplicate targets, overlapping ranges and two insertions at the same point are refused. Edit sets are all-or-nothing. | plan + splice |
| P7 | Fill (empty → value) and clear (value → `''`) are allowed wherever the cell is editable, including first, middle, last and trailing-empty columns. | T4 |
| P8 | The output is accepted only if the independent verifier passes. Otherwise no bytes are returned. | `editGmiFields` |
| P9 | The source document never changes. The input is copied. The parser result is deep-frozen. An integrity token (FNV-1a + length) is re-checked before every apply and every verification (`source-bytes-mutated`). | tests |

**Verifier checks** (`verify.mjs`). The verifier works only from the source, the intended `(target, lexeme)` list and the output bytes. It never receives the patches.
1. **Byte containment.** It walks source and output in step. Bytes outside the intended spans must be equal. Each span must hold the encoded new lexeme.
2. **Line and field level.** Both files are split on LF bytes. The line count must be the same. Untouched lines and every EOL must be byte-identical. On an edited line, the prefix up to the value region and every untargeted `;`-separated segment must be byte-identical. This is a byte-level re-derivation, independent of the text index.
3. **Reparse.** Running the production parser on the decoded output must give:
   - no errors;
   - warnings deep-equal to the source (text, order, class counts);
   - the same header and field names;
   - the same counts, ids, types, GUIDs, extents and coordinates;
   - every untargeted lexeme and value unchanged, and every target equal to the new lexeme.
4. **Structure.** The output, loaded as a new source document, must be `reconciled`. Its index signature must be the same: sections, objects, `_FIELDVALUES` lines and span counts, separators, coordinate and malformed-coordinate lines, and the predicted-warning lines. EOL counts and BOM must be unchanged, the encoding class must be allowed, and the counts must be the same.
5. **Malformed vertex lines** must be byte-identical.

A successful splice is never treated as proof. Mutation testing showed that each check is load-bearing (§7).

## 5. Coordinate-warning policy and results

**Policy (implemented as decided):** a file whose only parser warnings are `coordinate` warnings is **editable** when every predicted malformed vertex line reconciles with the parser warning by exact message (the message carries the line number and the raw line). A patched output is accepted only when all of the following hold:
- every malformed line is byte-identical;
- parsed geometry and coordinates are unchanged;
- the warning list is deep-equal: same text, line numbers, order and class counts;
- no warning or error has been added;
- every other check passes.

Malformed coordinates are never repaired, normalized or reinterpreted. The vertex the parser skips stays skipped.

Remaining fail-closed cases:
- **`other` warnings** (the real file with no L/P objects) stay **read-only**, reason `parser-warnings`;
- BOM, mixed EOL and CR-only stay read-only (§8). The existing plan does not support them, so I did not relax them.

Tests (in-memory variants of `core-crlf-latin1` with the masked real shapes `9.9 9.9 9.9 a` and `9.9 9.9 9.9 a9a 9.9`):
- the reference harness says `unsupported`; production says `reconciled`;
- edits on the owning objects (including a point left with 0 valid vertices) and elsewhere are verified;
- warnings are identical after the edit;
- removing the token ("repair"), blanking it ("normalize") and adding a new malformed line are all rejected (`malformed-coordinate-line-changed`, `warnings-changed`, `geometry-changed`);
- a tampered warning prediction makes reconciliation fail.

**Real corpus:** 10 files with coordinate warnings; 10/10 editable; 53/53 malformed lines preserved through verified edits; 10/10 "repairs" rejected.

## 6. Fixture and real-corpus acceptance results

**Fixtures (16 M0 fixtures, all used)**

| Criterion | Result |
|---|---|
| T1 | 12/12 editable fixtures: no-change output is byte-identical (manifest SHA-256), and mutating the returned copy cannot reach the source. The 4 read-only fixtures refuse edits and stay readable. |
| T2 | 16/16: status, reasons, counts and encoding/EOL equal the manifest and the reference harness. Every production span equals the harness span, and its raw bytes equal the encoded parser lexeme. The tampered-index gate is tested, including a span moved to identical text. |
| T3 | 12/12: one cell per fixture (the harness target, or an explicit one for `hyperlink-families`/`guard-irregular-objects`). The diff range lies within the patch range. Output is byte-identical to the reference splice and accepted by the **reference** verifier. Irregular objects are refused. |
| T4 | `sdr-empty`: first/middle/last/trailing-empty fills, a fill between two empty columns, whitespace-only replacement, and clears of first/middle/last columns, each alone and all together. Points: last column fill and clear. The LF twin's output differs from the CRLF output only in EOL bytes. The structural trailing slot (`unnamed-field`) and an absent column (`field-absent`) are refused. |
| T8 | Encoding table above. In `cp1252-c1-bytes`, 0x86/0x98 counts and C1 set are unchanged and the length delta is exact. A Windows-1252 value can be replaced with ASCII, but writing `†` is refused. UTF-8 file: ASCII-only, and the output is still valid UTF-8. ASCII file: Latin-1 → `single-byte`, and `Ã¸` → `encoding-class-drift` with no bytes. |

**Private corpus** (`GMI_EDIT_CORPUS` = REF_FILES; Downloads; `C:\temp\gmi-photo-test`; local paths only; counts only):

| Measure | Production | Reference (M0) |
|---|---|---|
| `.gmi` files / byte-unique / duplicates | 244 / 175 / 69 | same |
| Status | reconciled (editable) **174**, unsupported **1** (`parser-warnings`, class `other`) | reconciled 164, unsupported 11 (`parser-warnings`) |
| Agreement | 165 same outcome; **10** policy differences (`unsupported → reconciled`, coordinate-only warnings); **0 unexpected** | — |
| Encoding / EOL | single-byte 159, ascii 15, utf8-likely 1 / CRLF 175 | same |
| Objects / lexemes | 29,125 / **1,171,632** | 1,171,632 |
| Spans compared with reference / mismatches | 1,171,632 / **0** | — |
| Non-editable objects | 0 | 0 |
| T1 no-change identity | **174/174** editable; the 1 read-only file refuses edits and its bytes are identical | 175/175 |
| Single-cell edit (the same 174 targets the M0 harness chose, 97 of them SDR fills) | **174/174** verified; 174 byte-identical to the reference splice; 174 accepted by the reference verifier | 174/174 |
| Multi-cell edit (≤20 objects per file, first/middle/last editable column, one set) | **174/174** files, 6,777 cells (3,656 fills, 3,121 clears), all verified; byte-identical to the reference; reference verifier OK | — |
| Stale expected value rejected | 174/174 | — |
| Output tampered outside the target rejected | 174/174 | — |
| Coordinate-warning files | 10 editable; 53/53 malformed lines preserved; 10/10 repairs rejected | read-only |
| Source documents intact after all checks | 175/175 | — |
| Exceptions | 0 | 0 |
| Corpus file hashes unchanged; inventory unchanged | **244/244**; yes (each of the two corpus tests checks before and after) | same |

Timing: the production scan took about 19 s for the corpus. On the largest file (1.7 MB, 7,408 objects, 447,942 lexemes), document load took 0.83 s, a verified no-change export 1.36 s, a verified single-cell edit 1.27 s and a verified 60-cell edit 1.22 s.

## 7. Negative-test results

All of these pass (`tests/gmiEditProduction.test.mjs`):

- **Wrong target:**
  - each malformed target is refused with its own code: `invalid-target`, `unknown-scope`, `invalid-source-index`, `object-not-found`, `field-absent` (also for the wrong case `sdr`), `invalid-field`;
  - `:L n` and GUID guards both detect a mismatch (`object-identity-mismatch`);
  - for files without GUIDs, `guid: null` matches and any GUID does not;
  - a verified output for one cell does not verify a claim about another;
  - with three byte-identical objects, an edit of object 2 changes only object 2, and the same bytes fail a claim for object 1 or 3.
- **Stale expected value:** rejects the whole set, reports the edit index and returns no bytes. A missing expected value and a trimmed whitespace-only lexeme are also rejected.
- **Overlapping edits:** `duplicate-target` for edits; `overlapping-patches` for raw patches. Patch order does not matter.
- **Unsafe ranges and bytes:** two cells, value + `;`, coordinate, header, the structural trailing slot, invalid ranges, a missing or stale precondition, `;`, CR/LF, 0x86, 0x81 and non-byte replacements are all refused.
- **Coordinate changes:** `geometry-changed`, `unpatched-line-changed`, `byte-outside-target-changed`.
- **Unexpected header changes:** `_VERSION` (`header-changed`) and section `_EXTENT` padding, which the parser never sees and the byte proofs catch.
- **GUID change:** `object-identity-changed`.
- **Line-ending changes:**
  - CRLF→LF on an untouched line: the byte checks fire and the output is classified mixed-EOL (`output-not-editable`). Reparse alone would not see this change;
  - CRLF→LF on the edited line: `eol-changed`.
- **Also rejected:**
  - a `;` injected into a target (`field-count-changed`);
  - an unclaimed second change on the same line;
  - a metadata change *before* a correct target;
  - truncation, non-byte output, unchanged bytes for a claimed change, and invalid claims;
  - verification against a read-only document.

**Mutation check of the tests (temporary, reverted):** I disabled each of 14 guards in turn:
- in the patch engine: stale check, range-is-a-cell, overlap;
- in the verifier: containment, untouched lines, warnings, geometry, encoding drift;
- in the index: span tiling, warning prediction;
- in encoding: semicolon, C1;
- in document rules: mixed EOL, separator rule.

Each mutation made at least one test fail. The first run found one blind spot: no test changed bytes before a target. I added that case.

## 8. Files and grammar classes still read-only

| Level | Class | Reason code |
|---|---|---|
| File | > 10 MiB | `too-large` |
| File | Parser throws or reports errors (CR-only EOL, BOM, missing signature or L/P sections) | `parser-throws` / `parser-errors` |
| File | Index ≠ parser | `reconciliation-failed` (+ `mismatches[]`) |
| File | BOM; mixed EOL; CR-only EOL; UTF-8-BOM/UTF-16 class | `bom`, `mixed-eol`, `cr-only-eol`, `encoding-not-editable` |
| File | First line not exactly `[GMIFILE_ASCII]` (the parser then skips the header) | `nonstandard-signature-line` |
| File | Numeric `_INDEX` | `numeric-index-header` |
| File | Repeated `[L_]`/`[P_]`/`[+L_]`/`[+P_]` section; several `_FIELDNAMES` in one section | `repeated-section`, `repeated-fieldnames` |
| File | Parser warnings other than reconciled `field_shape`/`coordinate` (for example, no objects) | `parser-warnings` |
| Object | No / multiple `_FIELDVALUES`; more / fewer values than names | `object-not-editable` (`issues[]`) |
| Field | Structural trailing slot after the final `;`; duplicate column name; first value when `_FIELDVALUES` has no separator | `unnamed-field`, `duplicate-field-name`, `no-value-separator` |

In the real corpus, only **1 of 175** files is read-only: the file with no L/P objects. The fixtures `guard-repeated-section`, `guard-mixed-eol`, `guard-cr-only` and `guard-utf8-bom`, and the 4 irregular objects in `guard-irregular-objects`, remain refused as intended.

## 9. Differences between the reference harness and production

The harness was not changed and remains the oracle. Production is a separate implementation that is equal or stricter:

| Area | M0 harness | Production |
|---|---|---|
| Coordinate-only warnings | `unsupported` | editable under §5 (10 real files) |
| File-level rules | BOM, EOL, numeric `_INDEX`, repeated raw-`[` sections, other warnings | Also: non-exact signature line; several `_FIELDNAMES` in one section; sections the parser recognizes by trimmed marker; encoding class without a policy. No fixture or corpus file is affected (0 unexpected). |
| Field-level rules | `''` name not targetable | Also duplicate column names and the first value without a separator |
| Index | Resumes the data scan at the `/XYZ` line | Ports the coordinate scan and resumes exactly where the parser does. This differs only for pathological indented-marker vertex lines, which both reject. |
| Reconciliation | Lexeme text, counts, shape-warning count | Also ids, GUIDs, extents, coordinate counts, span location/tiling invariants, and every warning by exact message |
| Encoding | `encodeSingleByte` accepts every Windows-1252 character, including † and C1, and allows TAB | Rejects TAB, DEL, C1 and Windows-1252-only characters. Detects encoding-class drift. |
| Splice | Any range; `expect` optional | Exact editable cell spans only; precondition mandatory; replacement re-validated; source integrity checked |
| Verifier | Line diff, warning *count*, reparse | Byte walk, segment level, exact warnings, structure re-index, EOL/BOM/encoding, malformed-line identity. Returns no bytes on failure. |

## 10. Remaining issues and prerequisites for M2

1. **Column ownership is not enforced in M1.** The engine patches any editable column, including `S_HYPERLINK`, so that M7 can reuse it. M2/M4 must refuse field-editing ChangeSets on `S_HYPERLINK`, and the delivery composer must assert that the two modules' cell sets are disjoint.
2. **ChangeSets must compile to edits against the original.** M1 always patches the immutable source, and `expected` is the *original* lexeme. M2 should compute the effective lexeme per cell (last ChangeSet wins), then call `editGmiFields` once with one edit per cell. Reverting a cell to its original value is a valid no-op edit.
3. **Proposed dataset.** `verification.outputDocument` is a verified, reconciled and frozen document of the patched bytes. M2 can use its `parser` as the proposed dataset for `runGmiValidationV2`. Verification costs about 1.3 s on the largest real file, because the output is parsed and indexed twice. M2 should memoize per ChangeSet list and recompute only on discrete changes. If needed, step 4 can reuse the step-3 parse without losing independence from the patch engine.
4. **Fingerprint.** `createGmiSourceDocument` is synchronous with `fingerprint: null`. M3 should use `loadGmiSourceDocument`, or bind the fingerprint from `loadedGmiSources` (same format, parity-tested).
5. **`internalGmiSourceState` is exported for sibling modules only.** M2+ code outside `src/lib/gmi-edit/` should not import it. A lint rule is optional.
6. **Open product decisions:**
   - Windows-1252-only characters (€, †, ˜) are refused for now;
   - NFC is reported, not applied;
   - TAB is refused.
   Revisit with the Gemini gates G1/G2. Gemini VA acceptance of patched files is still unverified.
7. **The integrity token is non-cryptographic.** It guards against accidental mutation, not malice. The bytes are never handed out, which is the real protection.
8. **Out-of-scope M0 note (unchanged):** the `gmi-v32` manifest hashes do not match an autocrlf checkout. Not touched in this pass.

## 11. Verification run

| Run | Result |
|---|---|
| `node --test tests/gmiEditCorpus.test.mjs tests/gmiEditProduction.test.mjs` | 39 tests: **37 pass, 0 fail, 2 skipped** (both private-corpus tests without env), 0 todo |
| Same file, `GMI_EDIT_CORPUS` set, `--test-name-pattern "private corpus"` | 2 tests: **2 pass, 0 fail** (reference and production); 244/244 hashes unchanged in each |
| GMI/FOTO regression subset (`gmi*`, `photo*`, `hyperlink*`, `validationV2Gmi*`, `validationV2SyntheticGmiFixtures*`) | 1107 tests: **1012 pass, 0 fail, 95 skipped** (94 pre-existing opt-in suites + the new production corpus test) |
| Full suite `node --test tests/*.test.mjs` | 1857 tests: **1754 pass, 7 fail, 96 skipped**. The 7 failures are exactly the known baseline from M0: `appInfoUiContract` (1), `statsUiContract` (2), `terrainPhotoGml` optional real corpus (1), `validationV2WorkspaceInspector` (3). None involves gmi-edit. |
| `npx eslint --max-warnings 0` on `src/lib/gmi-edit/`, both test files and the new helper | Clean |
| `npm run build` | Success |
| `git status` | `M tests/gmiEditCorpus.test.mjs`; new `src/lib/gmi-edit/`, `tests/gmiEditProduction.test.mjs`, `tests/helpers/gmiEditProductionCorpus.mjs`, this report. Parser, fixtures and `.gitattributes` unchanged. New files are LF, like the M0 files. |

## 12. Recommendation

**M1 can be accepted.**
- The production API changes selected field values only through exact, precondition-checked spans.
- Its output is proven by an independent verifier that does not trust the splice.
- It returns nothing when integrity cannot be proven.
- It agrees with the M0 oracle byte for byte across 1,171,632 real lexemes and 6,951 real edits in 174 files.
- The original bytes were never modified, in memory or on disk.

Before M2 starts, settle items 1 and 2 of §10 in the M2 design: column ownership, and ChangeSets compiled against the original.
