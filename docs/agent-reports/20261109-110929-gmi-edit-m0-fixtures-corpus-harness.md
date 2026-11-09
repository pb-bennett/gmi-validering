# GMI editing M0: byte-exact fixtures and corpus test harness

Date: 2026-11-09. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, HEAD `a2897d7`.
Scope: Milestone **M0 only**, from `docs/agent-reports/20261108-gmi-editing-combined-delivery-planning.md` §9.1, §9.2, §10.
No production code, parser or existing fixture changed. No commit, no push.

---

## 1. Files created or changed

All new. No tracked file was modified.

| File | Purpose |
|---|---|
| `.gitattributes` (new) | One narrow rule: `tests/fixtures/gmi-edit/*.gmi -text`. No repository-wide EOL change. |
| `tests/fixtures/gmi-edit/*.gmi` (16) | Fabricated byte-exact fixtures (§2). |
| `tests/fixtures/gmi-edit/manifest.json` | Per fixture: id, file, size, SHA-256, encoding, EOL, description, coverage tags, expected harness classification. |
| `tests/fixtures/gmi-edit/README.md` | Rules for the fixtures, how to regenerate, how to run the private corpus. |
| `tests/helpers/gmiEditFixtures.mjs` | Deterministic generator and encoders (`node tests/helpers/gmiEditFixtures.mjs --write`). |
| `tests/helpers/gmiEditHarness.mjs` | **Test-only** M0 reference harness (§3). |
| `tests/gmiEditCorpus.test.mjs` | 20 automated tests, 1 opt-in private-corpus test, 5 `todo` M1 acceptance placeholders. |

## 2. Fixture inventory and coverage

Every value is fabricated: GUIDs `5ec0e000-…`, filenames `SYNT_*`, signers `Feltmåler A/B`, and simple coordinates.
From `realGrammarFamilies`, only the **shape** of each value is reused (wrapper count, which wrappers carry `sign`, trailing space). The fixture is then checked against those shapes. A test also asserts that no real signer name or filename from those families appears in the fixture.

| Fixture | Encoding | EOL | Expected status | Bytes | SHA-256 |
|---|---|---|---|---|---|
| core-crlf-latin1 | latin1 | crlf | reconciled | 1808 | `47d607afc814fc75e85366264caa036371d6cf3c4cceb3d1c1f3aca9ff93dd4e` |
| core-lf-latin1 | latin1 | lf | reconciled | 1755 | `e82614f856a8ff48cad45315cc8a5010c909d423cc32d6a26560f8246b9ee349` |
| cp1252-c1-bytes | cp1252 | crlf | reconciled | 1115 | `b31351fd7e471aac6d811482e94f2db8fc0e1135d3240ac127e0f73ce4cb337b` |
| utf8-no-bom | utf8 | crlf | reconciled | 968 | `6b6c3135cd932c14025a7b36a593b4b0914934742d1d5157e5de7a63bd68785c` |
| extra-sections | latin1 | crlf | reconciled | 2620 | `2999b8af05e3c0c63bdb55f84c944c042b9cacba19b60ccfabb670e0bb237e61` |
| no-guid | latin1 | crlf | reconciled | 1038 | `fd7f17d39acc320afd44dbc283385c76f51c17e56dca8813245e562c4bcefdfb` |
| hyperlink-families | latin1 | crlf | reconciled | 6967 | `541f9680fa734cf8fe3ff70947e5f368b0c033b5e56bc248ada971e013a076d2` |
| shared-photo | latin1 | crlf | reconciled | 1244 | `0f7a642fe75832b761ca3ca1e8c92c57500b4e81ba6ac31e39e13f3ed3c53b61` |
| merknad-quotes | latin1 | crlf | reconciled | 981 | `1a11910438463c97d0a644c30155e215018b687e71eab9f4233ecacbf5037293` |
| sdr-empty | latin1 | crlf | reconciled | 1226 | `bf6a5f52d00abfb48546d1a1c5a10184e8c0b5dfc42a158ea6d9e5b1a6a6b125` |
| sdr-absent | latin1 | crlf | reconciled | 811 | `e88c150518b5c891a35570b4e5f31c02cf0476fd3ce2300abed1a5ef10509dae` |
| guard-irregular-objects | latin1 | crlf | reconciled (4 non-editable objects) | 1016 | `017cef2488008630e511cc35f50e2bb5f8ddd816c192e11d25c857df1c7299b2` |
| guard-repeated-section | latin1 | crlf | unsupported (repeated-section) | 604 | `6c1c73ce7f82d8768e9ad79a52b8da4595384ade5e5acd7af2d741142d6533a6` |
| guard-mixed-eol | latin1 | mixed | unsupported (mixed-eol) | 1798 | `fd7cc353ee903ac87e1c7ab6e37ecd8fbae7f6737ce55fb4804e53c55426338f` |
| guard-cr-only | latin1 | cr | parser-error | 1755 | `6aafb0e150d1a9f4468635fbbd6ef4ee13108f70c92f6d70c845a787fc68cd99` |
| guard-utf8-bom | utf8-bom | crlf | parser-error | 1824 | `ba682d4a87d6a6f58405a07905890fb375d8ba2e9cfe677389cdb9e52780f999` |

Coverage of the requested grammar families. Each one is asserted in a test.

| Requirement | Where |
|---|---|
| CRLF / LF | `core-crlf-latin1` and its LF twin `core-lf-latin1`. The test proves they differ only in EOL bytes. |
| Latin-1 Norwegian | `core-*`: `Rør` is stored as `52 F8 72`, and the file is not valid UTF-8. |
| Windows-1252 `0x86`, `0x98` | `cp1252-c1-bytes`. Byte counts are unchanged after an edit. |
| UTF-8 without BOM | `utf8-no-bom` (`ø` = `C3 B8`). Classified `utf8-likely`. |
| Trailing `;` names/values | All fixtures. The trailing empty name `''` cannot be targeted. |
| `_INDEX` / `_EXTENT` padding | Header `_INDEX` + 20 `!`. Section `_EXTENT` padding of 24, 32 and 52 `!`. Object `_EXTENT` has a trailing space. |
| `[T_]` with `_label`/`_rot`, `[Y_]`, `[O_COORDOBS]`, `/XYH` | `extra-sections` (also `[N_]` with `_OFFSET_NE`/`/POINTS2`, and `/XY`). |
| Objects without GUID | `no-guid` (one line also has no `_EXTENT`). |
| `S_HYPERLINK` mid-row | Column 4 of 6 for points, column 7 of 9 for lines. |
| 1–6 wrappers (plus 7) | `hyperlink-families`: all 12 real family shapes, plus a fabricated 5-wrapper case (no real family has exactly 5). |
| `sign` metadata, unwrapped paths | Signed families. `bare-relative-path`, `bare-filename`. |
| PDF, SOS, directory-only | `pdf-signed`, `sos`, `mixed-photo-pdf-sos`, `directory-only` (also deeper paths, no trailing space, leading space). |
| Same photo, two objects | `shared-photo`: one point and one line link `SYNT_DELT_1.jpg`. |
| Irregular quotes in `Merknad` | `merknad-quotes`: odd `"` counts, a lone `"`. |
| Empty SDR vs absent SDR column | `sdr-empty` (empty, whitespace-only, `11.0`, `17.0`) vs `sdr-absent`. |
| Fail-closed / non-editable cases | `guard-*`: double `_FIELDVALUES`, more/fewer values than names, no `_FIELDVALUES`, repeated `[P_]`, mixed EOL, bare CR, BOM. |

**Git byte stability**, verified in a test:

- `git check-attr text` reports `unset` for every fixture.
- `git hash-object` equals `git hash-object --no-filters`, so adding a fixture causes no conversion even with this machine's `core.autocrlf=true`.
- `src/` files are unaffected by the rule.

## 3. Harness architecture and limitations

`tests/helpers/gmiEditHarness.mjs` ports the planning prototype. It is test-only, is not imported from `src/`, and is not the M1 API.

1. **Bytes and characteristics.** `describeGmiBytes` reports SHA-256, BOM, encoding class (`ascii` / `single-byte` / `utf8-likely` / `utf8-bom`), C1 bytes, and EOL counts and kind (`crlf`/`lf`/`cr`/`mixed`, final EOL).
2. **Parsing.** Decoding uses the production `decodeGmiBytes` and parsing the production `GMIParser`. The parser is unchanged.
3. **Independent span index.** `indexGmiSource` is a line-for-line mirror of `GMIParser._parseInternal`: the header loop, last-wins `[L_]`/`[P_]` definitions, data sections that end at a raw `[`, property scans that end at `:`/`[`, and `/XYZ` ending the property scan. It also follows the parser's one-separator rule after `_FIELDVALUES` and `;` splitting with no quote awareness. It records every `_FIELDVALUES` line per object, so last-wins and irregular objects are visible.
4. **Reconciliation gate.** The gate checks:
   - object counts and field names per geometry;
   - every `GMI_SOURCE_LEXEMES` entry equals its indexed span;
   - parser `field_shape` warnings equal the indexed over-long lines.

   Outcomes are `reconciled`, `unsupported` (file-level fail-closed: BOM, mixed/CR EOL, repeated L/P section, numeric `_INDEX`, non-shape parser warnings), `not-reconcilable`, `parser-error` and `too-large`. Object-level issues make that object non-editable without blocking the file. An injectable `indexer` lets a test prove the gate rejects a wrong index.
5. **No-op identity.** Every cell is re-emitted from the **parser** lexeme, encoded through an inverse table of the upload decoder, at the **indexed** span, then spliced. The test requires one patch per lexeme and byte identity, and shows that a one-byte span drift breaks identity. It does not pass the input through untouched.
6. **Targeted change.** `applyCellChanges` builds patches with `expect` bytes; the splice rejects overlap, stale `expect` and out-of-range patches. `verifyCellChanges` checks independently:
   - no line-level byte change outside the patched lines;
   - the line count is unchanged;
   - a reparse leaves the header, field names, warning count, id, type, GUID, extent and coordinates of every object, and every untargeted lexeme and value unchanged;
   - target cells hold exactly the new lexeme.

   Negative tests prove it catches a wrong cell, a moved coordinate, a header edit and a CRLF→LF change.
7. **Hyperlink removal.** `planWrapperRemoval` removes a whole wrapper plus its following whitespace. It returns `''` when nothing remains, clears a bare value, refuses multi-link wrappers and invalid grammar, and **does not renumber** (Q3 is still open). `verifyWrapperRemoval` proves that the retained members, raw wrappers, numbers and `sign` metadata are unchanged and in order. `checkHyperlinkRemoval` removes one photo wrapper per value in a single patch set and reparses. Through the production `createGmiPhotoSource`, it then proves that the remaining references are exactly the original multiset minus those removed. Non-photo, directory-only, multi-link and invalid values are never touched.
8. **Corpus scan.** `discoverGmiFiles` and `scanGmiCorpus` work read-only, deduplicate by SHA-256, and return aggregate counts and reason codes only. No filenames or values are reported.

**Limitations**

- The index mirrors today's parser. If `GMIParser` changes, the gate fails and the index must follow. That is intended.
- Ordinal renumbering, column add (T5), ChangeSets and batch eligibility are not covered. They belong to later milestones.
- Removal candidates use `targetValid` (photo extension). They do not use a FOTO ledger `confident` edge, which is M7/M9 policy.
- The single-cell target is chosen automatically: the first empty SDR, otherwise the first empty named non-hyperlink cell. One cell per corpus file.
- No Gemini VA import was attempted. The G-gates remain manual.

## 4. Tests, lint and build

| Run | Result |
|---|---|
| `node --test tests/gmiEditCorpus.test.mjs` | 26 tests: **20 pass, 0 fail, 1 skipped** (private corpus, env absent), **5 todo** (M1 pending). Repeated 3×, identical results. |
| Same, with `GMI_EDIT_CORPUS` set (private test only) | 1 pass, 0 fail. |
| GMI/FOTO regression subset (`gmi*`, `photo*`, `hyperlink*`, `validationV2Gmi*`, `validationV2SyntheticGmiFixtures`) | 1094 tests: 995 pass, **0 fail**, 94 skipped (pre-existing opt-in suites), 5 todo. |
| Full suite `node --test tests/*.test.mjs` | 1844 tests: 1737 pass, **7 fail**, 95 skipped, 5 todo. |
| Pre-existing check of the 7 failures | Rerun in a clean detached worktree at HEAD `a2897d7`: **the same 7 fail** (`appInfoUiContract`, `statsUiContract`, `terrainPhotoGml` optional real corpus, `validationV2WorkspaceInspector` layout contracts). They are unrelated to this pass, which changed no tracked file. |
| `npx eslint --max-warnings 0` on the 3 new modules | Clean. |
| `npm run build` | Success. |

## 5. Private-corpus results (aggregate counts only)

`GMI_EDIT_CORPUS` = REF_FILES; Downloads; `C:\temp\gmi-photo-test` (the paths are local only and not committed).

| Measure | Count |
|---|---|
| `.gmi` files / byte-unique / duplicates | 244 / 175 / 69 |
| Status | reconciled 164, unsupported 11 (reason `parser-warnings`), not-reconcilable **0**, parser-error 0 |
| Encoding class | single-byte 159, ascii 15, utf8-likely 1. Files with C1 bytes: 3 |
| EOL | CRLF 175 |
| Objects / lexemes reconciled | 29,125 / 1,171,632, **0 mismatches** |
| Non-editable objects | 0 |
| No-op identity | **175/175** |
| Single-cell change contained and reparse-verified | **174/174** applicable (97 SDR fills). 1 file has no empty eligible cell |
| Hyperlink values / lexeme-level removal checks | 2,035 / 2,248, 0 failures |
| File-level removal (one wrapper per value, reparse, multiset check) | **43/43** files, 2,025 references removed. Never removed: 10 values with no photo target |
| Harness exceptions | 0 |
| Corpus file hashes unchanged after run; inventory unchanged | **244/244**; yes |

These match the planning prototype: 175 unique files, 3 C1 files, 1 UTF-8 file and 2,035 hyperlink values.

## 6. Issues discovered

1. **Coordinate-warning files are classified `unsupported` (needs an M1 decision).** 10 real files have vertex lines with a trailing non-numeric token (masked shapes `9.9 9.9 9.9 a`, `9.9 9.9 9.9 a9a 9.9`; 53 lines). `GMIParser` drops these vertices with a `coordinate` warning. One more file has no L/P objects (`other` warning). All 11 reconcile and pass the no-op, single-cell and removal checks. They are read-only only because the harness follows the report's "parser warnings → read-only" rule. Byte splicing preserves those lines, and the verifier compares warning counts. **Recommendation:** M1 should treat `coordinate`-class warnings as non-blocking, provided the warning count and parsed geometry are unchanged after reparse, and keep the rule for other classes. This is a pre-existing parser limitation; no repair was attempted.
2. **Existing `gmi-v32` manifest hashes do not match an autocrlf checkout.** Git stores those fixtures as LF (`i/lf w/crlf`), so on this machine 0/13 working-tree SHA-256 values match `manifest.json`. No current test asserts them, so nothing fails. The new harness still reconciles all of them. Fixing it (extending the `-text` rule and renormalizing) changes existing fixture handling, so it was left for a separate decision.
3. **No real 5-wrapper shape among `realGrammarFamilies`.** The families have 1, 2, 3, 4, 6 and 7 wrappers. A fabricated 5-wrapper case was added. The corpus does contain 5-wrapper values.
4. **No parser-reconciliation defect found.** The mirror index agrees with `GMIParser` on every fixture, every `gmi-v32` fixture and every corpus file.

## 7. Remaining M1 acceptance requirements

These are recorded as `todo` tests, and the production `src/lib/gmi-edit` must satisfy them against these fixtures and the corpus:

- **T1:** a production no-change export returns the original bytes.
- **T2:** `GmiSourceDocument` reconciliation is equivalent to this harness; non-reconcilable inputs are read-only with a reason.
- **T3:** `applyGmiPatches` plus the post-condition verifier: diff ranges stay within patch ranges, and the reparse differs only in the intended cells.
- **T4:** fills and clears in first, middle, last and trailing-empty columns.
- **T8:** lexeme validation (`;`, CR, LF, C0 rejected) and a per-encoding-class encoder (Latin-1 → one byte; ASCII only for `utf8-likely`; Windows-1252-only characters policy).
- Decide the coordinate-warning policy (§6.1) and the BOM / mixed-EOL behaviour (currently fail-closed).
- When M1 lands, replace the `todo` placeholders with tests that run the production API over `GMI_EDIT_FIXTURES` and `GMI_EDIT_CORPUS`, comparing results with this harness.

## 8. Recommendation

**M0 is ready to accept.** The fixtures are byte-stable in Git, and their bytes, generator and checksums are cross-checked. The harness is deterministic and fails closed, and its negative tests show the checks catch real violations. The opt-in corpus mode ran cleanly over 175 unique real files without modifying any of them. Before M1 starts, decide §6.1, and optionally fix the `gmi-v32` EOL issue (§6.2) separately.
