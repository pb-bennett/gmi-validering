# Validator 2.0 v3.2 — real-file test-readiness audit and roadmap

Date: 2026-09-06. Requested workflow: GPT-6 Astra Medium, direct work, no delegation. This records the requested workflow, not an independently verified model variant. Audit only; this report is the sole permitted repository change.

## 1. Executive conclusion

**NOT YET READY FOR REAL-FILE TESTING under the requested trustworthy-results criterion. One genuine pre-test blocker: inconsistent Merknad text evidence between evaluation and Fildata.** Complete one narrow evidence-consistency batch, then start supervised real-file testing immediately. Do not add rules or implement applicability first.

The engine is mature enough for useful testing. The selected-layer, canonical-binding, ObjectRef, geometry and replacement-revision boundaries are implemented. Both planned point batches are committed, pushed and independently closed. There is no architectural reason to postpone testing for polygon, topology, conditional requiredness or complete line-value coverage.

However, independent real-parser probes found a gap outside the closed Batch 2 regressions: a dataset containing one 255-space Merknad and one 256-space Merknad correctly produces one PASS and one FAIL, but Fildata combines both into a single `Gyldig` bucket. Reversing object order makes both appear `Ugyldig`. Mixed ordinary-text/whitespace duplicate columns also discard supplied competing text before length evaluation. This is a small, concrete trust defect in the very inspection path proposed for real-file testing, not a missing v3.2 requirement.

Additional input and presentation defects need stabilization before a broader beta, but need not prevent a supervised first test with an independently inspected, supported GMI export. These include forced Latin-1 decoding, exact repeated header overwrite, changing schemas within a file, ambiguous aggregate wording, and limited finding navigation. Their exclusion/inspection conditions are explicit below; arbitrary GMI uploads are not certified safe by this verdict.

### Checkpoint and audit evidence

- Initial `git status --short`: clean.
- Branch: `feature/validator-v2-v32-baseline`.
- HEAD: `f21e9d360e6540850ae5ce3c261452c66aedb498`, `Complete v3.2 point field validation batch 2`.
- Local/upstream comparison: `0 0`. A live read-only `git ls-remote --heads origin feature/validator-v2-v32-baseline` independently returned the same full SHA. No fetch, push or ref mutation was needed.
- Batch 1's final documentation closure and Batch 2's final closure both say no remaining findings and approved for commit. Earlier rejection sections are preserved history, not open findings at this checkpoint.
- Independent runtime imports/run: **45 active rules, 38 point rows, 21 line rows, 45 RuleResults even on an empty engine input**. These are control counts, not unique fields, affected objects or percentage completeness.
- Applicability independently confirmed: revision **2026-09-04.3**, **88 cells / 71 APPLICABLE / 9 NOT_APPLICABLE / 8 UNKNOWN**. Targeted import/use inspection found **zero active applicability consumers/results**. Metadata export is not runtime rule consumption.
- Targeted tests: `node --test --test-reporter=dot tests/validationV2GmiA6.test.mjs tests/validationV2GmiA81ResultsWorkflow.test.mjs tests/validationV2GmiA81FieldInfo.test.mjs tests/validationV2GmiV32Batch2.test.mjs` — **30/30 passed**. These materially tested ownership, presentation, lazy Fildata and the completed scalar contracts; they did not detect the new probes below.
- No full suite/build was run. Batch 2 records 350/350 and a successful implementation build, then narrower final-remediation verification; this audit does not relabel those historical checks as independent checks of this session.
- No customer files were opened or transmitted. Probes used in-memory synthetic GMI text through the actual parser/engine. UI assessment is source-based; no browser render, keyboard session or representative performance benchmark was performed.

### Evidence chain and authority

The five requested 20260906 point-roadmap/Batch 1/Batch 2 reports were read, including remediation and final closure. Relevant earlier evidence was traced through:

- [GMI adapter specification](20260823-validator-v2-gmi-adapter-spec.md), [A1 schema binding](20260823-validator-v2-gmi-a1-schema-binding.md), [A2 ObjectRef implementation and correction](20260823-validator-v2-gmi-a2-objectref.md), and [A6 beta integration](20260823-validator-v2-gmi-a6-beta-ui.md).
- [A8.1 results/Field Info/Fildata implementation](20260824-validator-v2-a81ab-results-field-info-implementation.md).
- [v3.2 rebaseline/source ledger](20260831-validator-v2-v32-rebaseline-plan.md), especially source inventory, conflicts, conditional dependencies and delivery requirements.
- [Accepted code-text product policy](20260902-validator-v2-v32-code-text-fallback-policy.md) and [current applicability domain policy](20260904-validator-v2-v32-point-applicability-domain-policy.md).
- The [point roadmap](20260906-validator-v2-v32-point-field-roadmap-astra.md) consolidates numeric, representation and remaining point-source decisions; there was no need to reconstruct those field-by-field plans.

Historical plans do not override implementation or later source decisions. In particular, current ObjectRefs use **index-only local identity**, not the adapter plan's proposed GUID preference; no old proposed SP/OV/VL hydraulic mapping is authoritative now; old A6 status/individual-finding UI descriptions have been superseded by the compact A8.1 UI; old rebaseline deferrals for subsequently implemented scalar rules are closed only for those implemented facets.

Production evidence: `src/lib/parsing/gmiParser.js`; `src/components/FileUpload.js`; selected `src/lib/store.js` layer actions; `src/lib/validation-v2/{gmiLayerSchemaBinding,objectRef,objectFieldValue,temaIdentity,ruleEvaluation,validationRunner,datasetRevision,uiIntegration,validationViewController,resultPresentation,fieldData}.js`; rule/canonical/Field Info registries; and the three `src/components/validation-v2/ValidationV2{Workspace,RuleList,FieldInfoModal}.js` components. Focused test sources were inspected alongside these paths.

Pinned primary sources were hash-verified locally:

| Reference | Local file under `REF_FILES/innmalingsinstruks/2026-v3.2/` | SHA-256 |
|---|---|---|
| A | `Innmålingsinstruks 2026 vedlegg-a.pdf` | `669F4C1AC0D4943BD70F1D4C78C9DDE4C5346823060EFBCCD9ABA93D307086D5` |
| M | `Innmålingsinstruks 2026.pdf` | `36273756BBFBBB14D2C449CCF32CF5AEB9579C10A099783A790AF662B3DED81F` |

Actual on-disk names use decomposed å. A4–6, A9, A16, A22 and M10, M25, M28–29 were independently extracted and inspected for this audit. Page numbers are physical PDF pages. Existing reviewed lists were reconciled through the prior source ledger and actual active registry, not retranscribed in full. Local v3.2 references remain untracked; tracked `src/data/` PDFs are older v3.1 and are not this audit's authority. No internet source was substituted for the pinned version.

The primary reread preserves the A5/A9 Utvendig_høyde requiredness conflict, A5/A9 distance-scope uncertainty, and A5/A22 Ringstivhet plastic-gravity versus gravity scope conflict. It does not supply an authoritative Tema-to-pressure/gravity table. M25 permits explanatory code text; rejection by exact automation is the separately accepted product policy, not proof that all explanatory text violates the instruction.

## 2. Current capability inventory

“Implemented” means trustworthy for the stated question on supported, correctly decoded and structurally preserved input. It does not mean full delivery compliance.

| Capability | Status and actual scope | What a user can trust it to say |
|---|---|---|
| File parsing / geometry input | **Partial.** GMI ASCII signature and point/line sections; `_FIELDNAMES`, `_FIELDVALUES`, GUID properties and `/XYZ`. Loader rejects parse errors and files with no parsed point/line objects. No GML/polygon adapter or full grammar/version acceptance gate. | Recognized point/line records can supply attribute evidence. Successful import does not establish complete parsing, valid geometry, correct CRS, a supported export version or complete delivery. |
| Required presence | **Implemented for the active baseline; conditional coverage deferred.** Common: Anleggsår, Datafangstdato, Innmålt_av, Saksnummer, Nøyaktighet, NøyaktighetHøyde, MaksAvvikHorisontalt, MaksAvvikVertikalt. Point Tykkelse; line Tykkelse and Dimensjon. Required lists below also enforce presence. | Known schema without the field differs from a bound field without an object value. Both fail required controls; unresolved binding remains uncertain. Presence alone proves neither correct value nor meaningful name/identifier/measurement. |
| Required exact lists | **Implemented.** Common Høydereferanse, Målemetode, MålemetodeHøyde, Vertikalnivå, Stedfestingsforhold, Stedfestingsårsak. Separate point/line Tema and InnvendigUtvendig. Line Material, Nett_type, Rørform. | The supplied authoritative spelling belongs to that geometry's current list. XY and Z measurement lists remain distinct, including code 97. Provisional current Tema codes pass; unlisted/legacy/explanatory codes fail automated verification and need manual validation. |
| Optional exact lists | **Implemented, point-only.** Type, Kumform, Byggemetode, Kjegle, Eier, Adkomst. | A supplied value matches the current exact list. Missing values do not fail these rules. This deliberately does not settle source-requiredness/applicability of construction fields. Line Eier has no active value control. |
| Type/Tema compatibility | **Implemented, point-only.** Exact reviewed pairs; both list prerequisites required. | Two valid codes form an authorized pair. Missing optional Type skips; definite failed list prerequisites suppress relationship evaluation; structural conflicts remain indeterminate. No hydraulic or cross-object relationship is inferred. |
| Integer format | **Implemented, point-only.** Bredde, Lengde, four accuracy/deviation fields, Tykkelse, Utvendig_høyde, NOBB-VAVVS-nr and NOBB-VAVVS-nr-ramme. | Original signed base-10 integer spelling is valid under the accepted technical grammar. Zero, negatives and leading zeros are accepted. No positive-domain/range, exact NOBB length, catalogue or measured correctness check. Unsafe runtime integers without lexemes remain uncertain. |
| Decimal format | **Implemented narrowly, point distance only.** Avst_BunnInnvUnderUtv accepts plain signed digits with optional dot/comma fraction, including integer spellings. | Recognized decimal notation passes; coherent alternative notation such as exponent/grouping/`.5`/padding is uncertain; malformed nonnumeric text fails. No precision, sign restriction, requiredness, geometry subtraction or acceptance threshold. |
| Year/date lexical format | **Implemented, point-only.** Four ASCII digits; exact DD.MM.YYYY shape. | Spelling matches the declared format. `0000`, `31.02.2026` and `00.00.0000` demonstrate the intentional absence of plausibility/calendar checks. Lines currently have presence only. |
| Text length | **Partial due to A1 below.** Point Merknad, inclusive 255 Unicode code points; original whitespace counts. | Ordinary supplied text length is checked; current whitespace evidence/aggregation defects prevent an unqualified trust claim. No content, byte, grapheme or external-storage check. Line Merknad is unchecked. |
| Canonical binding / ambiguity | **Implemented after the parser boundary.** 41 canonical concepts, direct names and safe Unicode NFC/case-only comparison. Exact source keys retained by the binder. Only Tema permits S_FCODE fallback. | Disabled aliases do not satisfy a field. Point Bredde is not DIM/Dimensjon/DIAMETER. Multiple surviving accepted keys with conflicting present lexemes remain ambiguous. This cannot recover identical keys already overwritten or source header padding already trimmed by the parser. |
| Tema identity | **Implemented.** Direct preference when usable accepted evidence agrees; S_FCODE fallback; exact lexical disagreement becomes CONFLICT. | Resolution describes supplied identity evidence, not domain classification. An unlisted but resolved Tema still fails its list. PTEMA/LTEMA/FCODE and dotted candidates are not newly accepted. |
| Object/result ownership | **Implemented.** ObjectRef key includes layer, opaque dataset revision, geometry and local source index. Results frozen; explicit ownership guards. | Findings refer to the selected dataset's own objects. Parser IDs/GUIDs are not used to search another layer or prove stable cross-file identity. |
| Result reuse/revision handling | **Implemented for replacement datasets.** One run produces both geometry views. Revision is keyed to the in-memory dataset object. | Switching tabs/filter/sort does not rerun validation. A different dataset object or selected layer cannot use the old workspace result. In-place mutation is outside this revision contract. |
| Point results | **Implemented with inspection limitations.** 38 rule rows; some fields have separate presence and format rows. | Counts distinguish per-rule pass/fail/uncertain/skipped outcomes; they are not 38 independent fields or a delivery verdict. No current fail-only object-table handoff. |
| Line results | **Implemented baseline; supplied formats intentionally incomplete.** 21 rule rows. | Required attributes and current lists can be tested. Supplied line dimensions, thickness format, year/date formats and other remaining line scalars are not thereby validated. |
| Field Info | **Implemented for active rules.** Geometry/source qualifications, formats, units, lists, compatibility table and source pages. | Explains the selected control and separates many source conflicts from automation. Inactive canonical concepts are not a browsable catalogue. Per-rule “Ikke påkrevd” must not be read as field-wide optionality. |
| Fildata | **Partial due to A1.** Lazy owned scan, shared scalar evaluators, exact-value buckets, eight-entry per-dataset cache, 500 displayed buckets with omission count. Relationship Fildata disabled. | Normally explains delivered versus parsed values and frequency for the selected field/geometry. It does not identify failing objects, preserve all conflict pairs for inspection, or guarantee that a rare invalid bucket is among the first 500. |
| Applicability | **Implemented metadata only; runtime intentionally deferred.** 88 policy cells. | No current outcome asserts field applicability, unexpected presence or conditional requiredness. APPLICABLE is not REQUIRED; UNKNOWN is not NOT_APPLICABLE. |
| Advanced v3.2 semantics | **Blocked by authority/evidence architecture or deliberately deferred.** See section 7. | No claim about polygon completeness, GUID/SID relationships, attachments, topology, hydraulics, physical measurement quality or missing real-world objects. |
| Other formats / retired fields | **Not applicable to this V2 adapter.** SOSI/KOF are gated out; Synbarhet is retired. | Their absence from active V2 rows is intentional, not successful validation or a missing implementation ticket. |

Reconciliation only: 11 required-only controls + 19 list controls + 10 point integer controls + four Batch 2 scalar controls + one relationship control = 45. New supplied-value controls never silently make a missing field required.

## 3. Real-file test-readiness verdict and end-to-end path

After A1 is closed, use a **supervised supported-profile test**, not an unrestricted customer beta. Start with a normal Latin-1-compatible GMI export with one effective schema per geometry, recognizable point/line records, independently known counts and known encoding. Keep originals unchanged. Deliberately test unsupported cases separately and label their current results unreliable where indicated.

| Stage | Observed behavior / readiness implication |
|---|---|
| File selection | `useFileLoader` is shared by upload/drop. Every successful file becomes one application layer; multiple uploads are multiple layers. A single file's internal application layers are not separately discovered/selectable. |
| Decode and parse | GMI goes through `readAsText(file, 'ISO-8859-1')`; this is an input restriction, not charset detection. Schema names are trimmed; attributes are semicolon-split and typed; hidden original value lexemes normally survive. |
| Import gate | Parser errors and zero total objects reject import. Warning-only/partially understood input may continue. The V2 workspace does not present a parser-integrity summary. Record counts must be checked independently. |
| Layer selection | `layers[selectedLayerId]` supplies the run; visible/global merged datasets do not. Adding a file need not change V2's requested layer selection. Always read the Lag selector, especially when filenames repeat. |
| Binding/ObjectRefs | Point and line schemas remain separate. Explicit `fieldAnalysis` keys take precedence over inferred attribute keys. Ownership is local layer/revision/geometry/index, not domain ID. |
| Execution/results | Synchronous run, one immutable completed result, sparse FAIL/INDETERMINATE findings plus counters. 45 RuleResults; views expose 38/21 scopes. No workers/cancellation/performance assurance. |
| Tabs and inspection | Geometry tabs reuse results. Field Info explains active rules; Fildata scans lazily. Aggregates currently do not show individual affected objects or relationship pairs. Small source-known files remain manually inspectable. |
| Replacement/rerun | Replacement dataset object gets a new revision; stale workspace result is hidden. Explicit layer changes clear result/modal state. Same-object mutation would retain revision and Fildata cache; use file reimport for revisions. |

These conclusions are supported by code and targeted tests, not a claim that the entire browser path has already passed real-file acceptance.

## 4. Findings: blockers, beta defects and acceptable limitations

Classification: **A** prevents trustworthy first testing as proposed; **B** fix before broader beta; **C** documented supported-scope limitation; **D** advanced future capability. A blocker count is a count of coherent trust problems, not every edge-case manifestation.

### A1 — Merknad supplied evidence is inconsistent across evaluation and inspection

Two related manifestations must be closed in one text-evidence batch:

1. **Cross-object Fildata aggregation:** two ordinary point records under one `Merknad` column, containing respectively 255 and 256 spaces. Parser warnings/errors are empty. The rule reports PASS=1, FAIL=1. Fildata reports `missingCount=2`, one `missing:null` bucket, count=2, `Gyldig`. Reverse object order: same correct rule counts, but the bucket becomes `Ugyldig`. Adding truly empty text can similarly make a shared bucket's acceptance depend on which object is seen first. This is not the already-fixed within-object 255/256 duplicate test.
2. **Mixed candidate evidence:** one object with accepted `Merknad;MERKNAD` columns and `ok;` followed by 256 spaces passes the length rule. Swapping the two values also passes. Shared extraction filters parser-null whitespace out of `presentCandidates`; text recovery only runs for overall VALUE_MISSING. Yet Batch 2 explicitly treats non-empty whitespace as supplied text. Both supplied strings should participate in text-specific conflict resolution; neither should silently win.

Evidence: `objectFieldValue.js` candidate filtering and present/missing branches; `ruleEvaluation.js:getTextLexicalEvidence` and `evaluateTextMaxLength`; `fieldData.js:extractRecord`, `getDeliveredKey`, `scanFieldData`. Fildata uses the shared evaluator but evaluates only the first record represented by each bucket. Shared evaluation alone does not make an unsound bucket safe.

Why A: there is no visible guard for this input, and the proposed tester's main evidence view can call a failing supplied value valid or hide its source spelling. Blank note fields are plausible exported data. Excluding every whitespace note manually would work around a small fix while leaving a misleading inspection tool. Ordinary exploratory loading is possible now, but it should not be recorded as trustworthy acceptance testing until this closes.

### B findings — managed in the first supervised test; close before broader beta

| ID | Concrete problem and evidence | First-test handling / beta acceptance target |
|---|---|---|
| B1 | **Charset assumption changes source identity.** `FileUpload.js` forces Latin-1. An independent UTF-8-byte → browser-equivalent Latin-1 decode probe changes Nøyaktighet's `ø` U+00F8 into U+00C3/U+00B8: required presence fails and integer evaluation skips, whereas correctly decoded input passes both. | Independently establish first-file encoding and inspect Norwegian names/values. For beta, support explicitly recognized encodings or reject/request a choice before presenting attribute results; no heuristic silent rewriting. Byte-level import tests are necessary. Existing string-parser Unicode tests do not test decoding. |
| B2 | **Identical repeated source names overwrite evidence.** `_FIELDNAMES Eier;Eier`, `_FIELDVALUES BAD;AN` yields one `Eier=AN`, no warning, PASS and `Gyldig`. Both attribute and lexeme maps use field name as key. This differs from preserved `Eier;EIER` case variants. Header trimming can also make distinct padded names collide. | Preinspect headers and exclude such files from baseline acceptance. Beta must visibly reject/mark ambiguous before loss or preserve occurrences. Do not choose first/last value, and do not pretend a binder-only change can recover overwritten input. |
| B3 | **Changing schemas lose earlier schema authority.** First point section declares Eier and supplies AN; second declares Merknad and supplies ok. Two points survive, but `fieldAnalysis.points` contains only Merknad. Eier evaluation skips both objects, including the one actually carrying Eier. No parser warning. | First corpus uses one effective schema per geometry. Repeated-schema adversarial file is diagnostic only. Beta needs an explicit supported profile/rejection or correctly owned section schemas. Merely unioning fields would need reviewed absence semantics for each section. No source claim is made that this synthetic grammar is a valid official export profile. |
| B4 | **Presentation overstates/obscures states.** Zero evaluations and wholly absent optional fields map to amber `Delvis oppfylt` and attention filtering. Top `X må rettes` sums rule/object failures, not unique objects, and also includes unverified explanatory code text. Several presence/format controls have identical short names. | Brief testers on counters; expand rows and inspect skip counts. Beta: neutral `Ikke kontrollert`, distinguish `Må vurderes`, label counts as control outcomes, distinguish presence/format names, qualify strict-code automation. Preserve engine states. |
| B5 | **Limited diagnosis.** Rule expansion shows only counts; Fildata disables relationship rules, collapses conflicts to generic buckets and renders at most 500 most-frequent values. Unknown-field disclosure gives counts without names. | Use small files with source-known oracle rows and a source editor. Before broader beta, provide bounded affected-object/reason inspection (including Type/Tema pairs), exact unsupported column names, and a way to find invalid/uncertain low-frequency buckets. Full map integration is unnecessary. |
| B6 | **Parser coverage is not surfaced at V2 boundary.** Unknown sections are ignored; coordinate parsing can skip malformed coordinates, accepts two components with null Z, and tests NaN rather than finite values. Schema/value arity warning only covers extra values; no general quoting/embedded-semicolon grammar is implemented. | Independently reconcile object/coordinate counts and source text. Beta needs visible partial/unsupported-input diagnostics, without fabricating v3.2 geometry failures. An unsupported-only file is rejected by the loader's zero-object gate; mixed supported/unsupported content is the harder case. |

B1–B3 are not evidence that the canonical adapter should accept aliases or normalize code values. They occur before that adapter. They become blockers for any particular test file that uses those input forms; the file must leave the supported acceptance corpus until handled. The first test need not wait for a generalized parser redesign.

### C and D boundaries

- **C:** Empty whole file is rejected on upload; an empty geometry within a mixed file has zero per-object outcomes, not successful validation. Engine-only empty input retains 45 rows. Amber wording is B4, not a new engine failure.
- **C:** WeakMap revision assumes dataset replacement. Targeted store inspection showed file import stores the dataset without deep cloning its attribute objects, preserving lexical symbols. No ordinary scalar-edit mutation path was established in this audit. A future editor must replace/invalidate datasets explicitly.
- **C / follow-up browser check:** Cached modal state is local; it is not independently keyed by dataset/result changes while already open. Workspace freshness guards are sound, but replacement/removal while a modal is open should be exercised in the browser. No reachable ordinary-user stale-modal reproduction is claimed from static inspection alone.
- **C:** Scalar validation does not verify coordinates/CRS. The loader may ask the user to choose UTM 32/33 when CRS is missing/invalid and updates the working header. Record that choice as user-supplied context, never evidence that the original file carried valid CRS metadata.
- **C:** Point coverage exceeds line coverage by design. Calendar validity, numeric plausibility, measurement acceptance and unusual NOBB digit counts are intentionally outside active format contracts.
- **D:** Polygon/GML, typed observations, delivery completeness, GUID/SID relationships, topology, hydraulics and attachment/provenance remain separate evidence-dependent work.

## 5. Real GMI test corpus and manual matrix

### Minimum useful corpus

Obtain **four representative real files**, preferably from at least two projects/export histories: R1 small ordinary point export; R2 small ordinary line export; R3 mixed point/line delivery; R4 a typical large work delivery. R3 may belong to a package with additional files: load R1/R2/R3 together to exercise application-layer isolation. Keep a separate list of any GML/attachments without implying those are validated. An exporter/domain owner must independently confirm counts, encoding, a few expected field values and applicable source version. “Known good” means checked against the active bounded controls, not previously accepted by Validator 1.0.

Use a small **synthetic companion pack**, generated in a future authorized task: S1 baseline points plus controlled scalar variants; S2 baseline lines plus scope controls; S3 Tema/binding variants; S4 note boundaries and duplicate evidence; S5 unsupported/charset/schema variants; S6 generated scale/high-cardinality values. Multiple rows can share one file where schemas permit; incompatible headers need separate variants. Twenty categories do not require twenty real files.

For every fixture keep a test-owned expected-outcome sheet: file ID/hash, exact schema, geometry, local source ordinal, changed field/lexeme, expected rule/state/reason and source/policy reference. Do not derive expected values from production rule arrays. Preserve actual file bytes and never “clean” the original customer export to make it green. Synthetic Unicode values outside Latin-1 cannot currently be used as successful browser-import cases; keep them as engine evidence and explicit charset tests until B1 is closed.

### Common procedure

1. Run the feature branch locally or in an explicitly approved test environment; do not use live `main` as if it contains this checkpoint. Activate `?testmodus=1` before loading and wait for the visible Testmodus indicator. Actual code gates usage tracking through `completeSuccessfulUpload`; Testmodus is not a claim that every map/network service is disabled.
2. Record commit, browser, corpus ID/hash, byte size, source version/exporter/encoding, expected point/line counts and CRS provenance. Keep customer identifiers and raw records in the approved local evidence location, not committed fixtures or a public issue.
3. Upload the file, reconcile imported counts and Norwegian names with the source. Stop acceptance interpretation for decode/structure/count mismatches; log an input defect rather than dozens of apparent field violations.
4. Open field validation, explicitly select **Validator 2.0 (beta)** (legacy is the default), read the **Lag** selector, select the intended file and press **Kjør once**.
5. Inspect both geometry tabs, relevant row counts, Field Info and Fildata. Record PASS/FAIL/INDETERMINATE/NOT_EVALUATED separately; record findings per rule, not as unique objects. Reset filters before interpreting a missing row.
6. Repeat tab/filter/sort actions; results must remain unchanged. Load another layer with different expected results, explicitly select it and run. Reimport a changed copy as a new layer/revision and verify no old result is presented for it.
7. For each discrepancy save a concise local reproduction and classify: genuine bad supplied data; input decoding/structure defect; validator defect; intended limitation; source/policy question; usability problem. No automatic acceptance/rejection of the delivery.

### Matrix

Expected outcomes refer to the current scalar contracts **after A1 remediation**. Known current deviations are named. P=point, L=line. PASS/FAIL are per active control, not whole-file verdicts.

| # / category | File/evidence needed | User action | Expected result | Defect criterion | Synthetic or real? |
|---|---|---|---|---|---|
| 1 Ordinary good P | R1, known count and hand-checked required/list/scalar fields | Common procedure; inspect Tema, Type and representative scalar rows | Required/list checks pass where supplied correctly; optional absence skips; no line outcomes | Unexplained false positive, missed supplied defect, wrong count or source column | **Real required**; S1 is control |
| 2 Ordinary good L | R2 with hand-checked current Tema, Material, Nett_type etc. | Run L; inspect thickness/dimension presence and list rows | 21 line rows; no point integer/date/note checks on L | Applying point Tykkelse integer grammar to L or claiming line format coverage | **Real required**; S2 control |
| 3 Mixed / multiple layers | R3 with both geometries; load R1/R2 alongside with overlapping local IDs | Run each selected layer; switch tabs; toggle other layers' visibility | Counts/values stay selected-layer-local; one completed run serves both views | Borrowed values/objects, tab-triggered run, stale result for replacement | **Real required**, synthetic contrast useful |
| 4 Direct Tema only | Current valid P KUM and L SP, no S_FCODE | Open Tema Fildata after run | Correct geometry list passes; direct column identified | Requiring fallback or wrong geometry list | Synthetic sufficient; capture real pattern |
| 5 S_FCODE fallback | Missing/empty direct Tema, valid S_FCODE | Inspect Tema values and source columns | Fallback passes; ordinary null direct does not defeat it | FIELD_ABSENT/failure despite accepted fallback, invented alias | Synthetic plus real export desirable |
| 6 Tema/S_FCODE conflict | KUM/SAN; KUM/` KUM `; equivalent control pair | Run; inspect uncertainty and Type relationship | Conflict is indeterminate; no silent winner; equal exact pair resolves | Normalization resolves disagreement, definite pair failure fabricated | Synthetic useful; real example desirable |
| 7 Unicode case-only names | Nøyaktighet/NØYAKTIGHET with equal values; safe current encoding | Inspect binding/Fildata and compare to single-key control | Equal accepted surviving names agree; original columns retained; transliterations not accepted | Wrong canonical target, lost Norwegian characters or alias acceptance | Synthetic bytes useful; ASCII/correct Latin-1 first; broader Unicode waits for B1 |
| 8 Conflicting duplicate lexemes | `Eier;EIER` AN/` AN `; Type KSTA/` KSTA `; integer 1/1.0; reversed order | Inspect list/integer/relationship states and Fildata | INDETERMINATE/BINDING_AMBIGUOUS independent of ordering | Any selected normalized winner; Fildata calls conflict Gyldig | Synthetic; identical spelling `Eier;Eier` is separate **known B2** |
| 9 Optional absent | Omit Type, Eier, Adkomst, NOBB, Merknad; separate empty cells | Expand optional rows and Fildata | NOT_EVALUATED / `-`; no optional-required failures. Current amber is B4 | FAIL for absence or interpreting skip as PASS | Synthetic sufficient; common in real files |
| 10 Required absent | Remove Anleggsår column; separate declared-but-empty variant | Inspect presence and format rows | Required FIELD_ABSENT vs VALUE_MISSING fail; optional format skips | Borrowing from other geometry/layer; format failure instead of missing evidence | Synthetic sufficient |
| 11 Invalid exact codes | Eier ZZ; Material PVC-0; unlisted descriptive text; XY/Z 97 contrast | Inspect relevant list rows/Field Info | Unlisted fails automated verification with manual qualification; XY97 passes, Z97 fails | Silent substitution, text claimed categorically forbidden by M25 | Synthetic plus real unlisted example |
| 12 Padded exact codes | ` KUM `, ` KSTA `, ` AN `, ` 11 ` with exact controls | Compare delivered and parsed Fildata | Present padded codes fail despite parser trimming; relationship suppressed after definite prerequisite FAIL | Trimmed value passes or discarded lexical evidence | Synthetic real-parser files |
| 13 Integer edges | P `+1`, `-1`, `0`, `001`, `1.0`, `1e2`, ` 1 `; very long digits | Inspect Bredde/accuracy/NOBB | First four pass; decimal/exponent/padding fail; original huge digit lexeme is not a JS range failure | Coercion to pass; invented positive/range/NOBB-length rule | Synthetic; no-lexeme unsafe number is engine-only |
| 14 Decimal edges | P distance `1`, `-1.5`, `+01,50`, `.5`, `1e2`, `1,234,567`, ` 1 `, `1--2`, `abc` | Inspect decimal row and Fildata | Plain forms pass; coherent alternatives uncertain; malformed fragments fail | Alternative notation normalized to pass or all punctuation treated numeric | Synthetic sufficient |
| 15 Anleggsår | `2026`, `0000`, `26`, `+2026`, `2026.0`, padding; identical L values | Inspect separate presence/format rows | P first two format-pass; other supplied forms fail. L presence only | Calendar/plausibility claim, hidden normalization or line scope expansion | Synthetic sufficient |
| 16 Datafangstdato | `06.09.2026`, `31.02.2026`, `00.00.0000`, ISO and short-width variants | Read Field Info then inspect rule | First three format-pass; ISO/width variants fail; no calendar check | Calling intended calendar-shaped PASS a bug; undocumented calendar enforcement | Synthetic sufficient |
| 17 Merknad boundaries | 254/255/256 chars; whitespace-only 255/256/empty in **same file**, reverse order; ordinary/whitespace duplicate keys | Compare engine counts with every Fildata bucket | Length boundaries and exact distinct evidence agree; competing supplied text ambiguous; no order dependence | Current **A1** reproductions; merged PASS/FAIL buckets; false missing count | Synthetic essential; astral/combining engine cases until charset support |
| 18 Unusual/null/empty | Empty/whitespace, lexical `null`, `false`, `0`, missing trailing cells and extra values | Inspect delivered/parsed meanings and parser diagnostics | Empty numeric/code cells skip/fail presence as specified; zero/false are supplied; literal `null` is text, not null | Global truthiness makes 0 missing; silent structure loss; text evidence contradicts A1 contract | Synthetic plus real export conventions |
| 19 Deferred applicability | KMR/SUMP plus LOK/KRN, with and without construction values | Compare supplied-value outcomes across Tema | No applicability rows/absence/unexpected-field findings. Supplied code/integer checks still run even on NOT_APPLICABLE metadata cells | Runtime policy consumption or UNKNOWN treated as invalid/negative complement | Synthetic sufficient; real objects useful for later design |
| 20 Representative scale | R4; known object count and approximate value diversity | Time import, Kjør, first/repeated Fildata; inspect rare failures and UI response | Counts reconcile; no crash; unchanged reruns. 500-bucket truncation disclosed | Lost objects, unavailable rare failure, freeze preventing practical inspection | **Real required**; S6 supplements, never substitutes |
| 21 Unsupported structure / geometry | Unsupported-only and mixed sections, repeated point schemas, exact duplicate keys, malformed arity, unusual /XYZ | Attempt import; reconcile with independent source inventory | Unsupported cases excluded from acceptance; current B2/B3/B6 documented; no full-delivery claim | Silent omission treated as validation success | Synthetic adversarial; real examples decide supported profile |
| 22 Charset / schema metadata | Byte-identical content encoded in Latin-1 and UTF-8; BOM variants; explicit empty/malformed runtime metadata | Browser-load byte fixtures; metadata cases through engine probes | Current UTF-8 corruption is B1, not bad customer fields. Malformed metadata may infer from same-geometry attributes; known empty schema takes precedence | Claims that string-parser tests prove byte decoding; opposite geometry used for inference | Synthetic bytes; real exporter evidence needed |
| 23 Lifecycle / zero geometry | P-only, L-only, replacement copies; duplicate filenames | Switch/remove/reimport, reopen Fildata, inspect empty tab | New selected input requires current run; zero geometry has zero outcomes; no stale modal data | Old values/results under new file/layer; empty geometry presented as passed | Real plus synthetic; browser session required |

For R4 record actual seconds and browser/machine; do not invent a source-mandated performance threshold. A proposed beta usability target is that ordinary work files remain inspectable without browser failure and that any long operation has understandable feedback. Set a numeric target after measuring R1–R4.

## 6. User-facing testing assessment

The compact result workflow is usable for a guided tester who knows the source files. It is not yet self-explanatory for an unbriefed customer.

- **State vocabulary:** Fildata `Gyldig`, `Ugyldig`, `Må vurderes`, `-` corresponds to per-value PASS, FAIL, INDETERMINATE and NOT_EVALUATED. Aggregate rows instead use Oppfylt/Delvis oppfylt/Ikke oppfylt. Show a compact explanation and give no-evaluation a neutral label. Do not map all uncertainty to failure, and do not imply partial compliance when nothing was evaluated.
- **Separate checks on one field:** repeated Nøyaktighet, year/date and Tykkelse rows need a small qualifier such as `utfylt`, `heltall` or `format`. Actual rule descriptions already distinguish their purpose but are not shown in the collapsed/expanded row. No visual redesign is needed.
- **Norwegian wording:** replace exposed `point/line`, `requiredness` and `Whitespace` with `punkt/ledning`, `påkrevdhet` and `mellomrom/blanktegn`. Keep technical counting details in Field Info where useful. “Denne regelen: Ikke påkrevd” should explain “Kontrollerer levert verdi; påkrevdhet kontrolleres separat” for format rules on required fields.
- **Severity qualification:** `Må rettes` and `Ugyldig` need the exact-code policy explanation: “Består ikke automatisk kodekontroll; må valideres manuelt.” This prevents users treating every explanatory M25 value as forbidden. Counts should say findings/control outcomes, not suggest distinct objects.
- **Scope statement before broader beta:** add visible wording equivalent to “Kontrollerer utvalgte felt i valgt GMI-lag mot v3.2. Geometri, fullstendighet, vedlegg og betingede krav er ikke kontrollert. Ledningsfelt har foreløpig færre formatkontroller.” Link to a short coverage/limitations view. A `Beta · GMI · 45 regler` badge alone is insufficient. The existing “Beta” label is not evidence that the milestone below is met.
- **Field Info:** useful sources, allowed values and source-conflict qualifications should remain. Date's format-only limit, Utvendig_høyde conflict and deferred distance-requiredness are already documented. Do not manufacture dummy rules to expose inactive documentation.
- **Fildata:** fix A1 first. Then improve diagnosis only where necessary: exact conflict sources, low-frequency invalid values, and an affected-object/pair view. Generic “motstridende kilder” plus counts can establish uncertainty but cannot explain which object to investigate. Preserve local ownership and bounded rendering.
- **Unknown fields and parse limitations:** names and concise structural warnings are materially more useful than counts alone. They should not become extra standard-validation failure rows.

First manual testing should explicitly include keyboard opening/closing, focus restoration, filter reset, layer/revision replacement and the modal already open during a lifecycle change. Source assertions in unit tests are not substitutes for that browser exercise.

## 7. What must wait / explicit non-goals

| Deferred area | Why it must wait and how real-file evidence can change design | Exact prerequisite for later automation |
|---|---|---|
| Applicability runtime / conditional requiredness | Current metadata is not a requirement engine. Files reveal which unknown cases and explanatory needs matter, not what the standard mandates. Testing may favor a small consumer over a generic engine. | Approved field-specific requiredness and exception policy, provenance and UNKNOWN behavior; preserve 88-cell policy independently. |
| Point representation / polygon / GML | Current flat arrays cannot prove an owned boundary or a complete companion delivery. Actual GML profiles and relationships could substantially change parsing/ownership design. | Pinned profile, delivery membership/completeness and authoritative object/polygon ownership. No closed-line, proximity or same-coordinate proxy. |
| Utvendig_høyde / distance requiredness | Real population does not resolve A5/A9 precedence or Boolean conditions. | Publisher/domain-owner decision with exact scope and unknown treatment; later shape/construction/representation evidence. |
| Hydraulic classification / SDR / Ringstivhet / Trykklasse semantics | No authoritative current Tema mapping. Actual exports may carry explicit provenance useful for a future classifier. Target-field population cannot supply it. | Approved pressure/gravity authority; Ringstivhet plastic/gravity scope resolution; any permitted numeric-code spelling policy. No inference from Material/Nett_type/SDR/Ringstivhet/Trykklasse. |
| GUID / SID / cross-file identity | Duplicate IDs and companion structures may be legitimate by role. Real packages materially determine cardinality and alternative identity contracts. | Exact GUID preservation, file/revision ownership, SID binding/semantics, relation roles/cardinality and completeness. No arbitrary UUID regex or SID alias. |
| Topology / stikkledning | Current vertices do not identify surveyed own-pipe top, main/service roles or intended connectivity. Files determine whether evidence is available at all. | Owned endpoints and related objects, observation roles/provenance, tolerances and explicit main/service contracts. |
| Measured-height arithmetic / acceptance thresholds | Scalar validity cannot establish measured truth. Reported 3/5 cm and deviations have context/exceptions; no supplied-number shortcut. | Agreement/override evidence, units, measured-vs-derived roles, equations/sign and accepted tolerances. |
| Attachments / source application / provenance | S_HYPERLINK presence does not prove Gemini Terreng origin or bundle completeness. Real delivery manifests determine scope. | Trusted application/profile evidence and owned attachment manifest; no automatic link fetching. |
| Remaining line supplied values | Valuable later, but first feedback may expose larger import/diagnosis issues. Batch common formats together; point Tykkelse cannot simply be promoted to lines. | Source/technical contracts for line distinctions; ordinary line corpus feedback. Do not add conditional requiredness incidentally. |
| UI redesign / general refactors | No evidence they are prerequisites. Existing boundaries prevent real ownership errors and should be retained. | A measured usability/performance problem with a bounded change; no general schema DSL, cache/result rewrite or field-by-field ceremony. |

Calendar validity could be a later bounded product decision; it does not need topology and is not blocked forever. It is simply outside the agreed format-only baseline and not a prerequisite to first testing.

## 8. Smallest pre-test implementation batch

**Batch: Merknad supplied-text evidence and Fildata consistency. No new rules; retain 45/38/21/45 and metadata-only applicability.**

| Item | Implementation contract |
|---|---|
| Problem/evidence | Close A1's multi-object aggregation and mixed ordinary/whitespace duplicate manifestations. The real-parser repros are specified in section 4 and matrix 17. |
| Likely components | `ruleEvaluation.js` text evidence helper; `fieldData.js` text record/bucket construction; focused Batch 2 and Field Info tests. Extract a small shared text-evidence helper only if needed so both paths use the same decision. Avoid changing shared numeric/code missing semantics or parser coercion. |
| Accepted behavior | For TEXT_MAX_LENGTH, every accepted non-empty string lexeme counts as supplied, including whitespace. Compare all such candidates before choosing text. Different supplied text is ambiguous; equal text is length-checked. Truly empty/absent text remains NOT_EVALUATED. Preserve existing structural uncertainty and ownership. |
| Fildata acceptance | Each displayed bucket represents equivalent authoritative evidence with one valid shared outcome. Separate 255-space, 256-space, empty and conflicting text; expose the supplied spelling, classify supplied whitespace consistently, and reconcile counts. Reversing object/candidate order cannot change outcomes or totals. |
| Focused tests | Multi-object same-file 255/256/empty notes, reversed object order; mixed ordinary/whitespace accepted keys, reversed candidate values/order; equal duplicates; conflicting whitespace duplicates; astral/combining boundaries; Fildata totals/acceptance versus engine counts; numeric/code whitespace regressions; geometry/layer/replacement ownership. Use the actual parser and test-owned expectations. |
| Model/workflow | **Luna Medium can implement** this bounded correction; **Sol Medium** independently reviews the evidence contract and multi-object aggregation. No Astra re-plan required. |
| Done | All stated reproductions closed, focused checks pass, only necessary code/tests/docs changed, diff reviewed, one independent closure. No line, parser, applicability, UI redesign or domain-policy expansion. Commit/push only when separately explicitly authorized. |

Do not append B1–B6 to this pre-test batch. Record them for the supervised test and next stabilization batch. If the chosen first real file actually needs UTF-8 decoding or unsupported structure, choose another representative supported export or address that specific input blocker before counting its results as acceptance evidence.

## 9. Post-test development roadmap

This ordering deliberately puts observed input/result usefulness ahead of conditional-specification expansion. Phases are substantial batches, not a promise to implement every field before beta.

| Phase | Objective and prerequisite | What becomes possible / what stays blocked | Recommended workflow |
|---|---|---|---|
| 0 Evidence consistency | Close A1; prerequisite is this concrete brief | Trustworthy scalar inspection; input-profile limitations remain | Luna Medium implementation → Sol Medium review |
| 1 Real-file acceptance session | R1–R4 plus synthetic companion cases; phase 0 closed | Measured false positives/negatives, encoding/profile evidence, diagnostic and scale priorities. No new normative authority inferred | Domain tester + Sol Medium triage; Luna only for authorized concrete fixes |
| 2 Real-file stabilization and beta clarity | Fix reproduced B-class issues affecting supported corpus, add minimal parse/coverage/state/diagnostic clarity | Repeatable supported-profile beta; unsupported formats rejected or clearly excluded. No need for complete line or geometry semantics | One coherent Luna Medium batch per input or inspection contract, one Sol Medium review; Astra only if section ownership/profile architecture truly requires a decision |
| 3 Remaining line supplied-value completion | Stable representative L import and source-qualified line contracts | Broader safe scalar coverage; bundle common format/list scope extensions and genuine line distinctions. Conditional hydraulic/shape requiredness remains blocked | Luna Medium implementation, Sol Medium source-aware review; no per-field Astra planning |
| 4 First conditional consumer | Actual user need plus approved applicability/requiredness/unknown/exception contracts | One justified conditional requirement with traceable policy. Polygon-dependent and unresolved fields remain deferred | Sol Medium bounded plan; Astra Medium only for materially competing evidence models; Luna Medium implementation → Sol Medium review |
| 5 Delivery/profile/relationship foundation | Representative companion GML/attachments and explicit completeness, GUID/SID/profile decisions | Owned package members and cross-file relations, then representation/attachment consumers. Flat GMI alone remains insufficient | Astra Medium architecture where useful; bounded Luna Medium implementations → Sol Medium reviews |
| 6 Domain and geometry consumers | Relevant phase 5 ownership plus independently approved hydraulic/topology/observation contracts | GUID relationships, polygon requirements, then narrowly supported topology/height/hydraulic checks. Unresolved source conflicts remain blocked individually | Sol Medium source review; Astra Medium for new architecture; Luna Medium implementation where bounded |
| Beta/release gate, after phase 2 | Section 11 criteria, not phases 3–6 completion | A trustworthy limited beta can precede advanced work. Production integration/configuration and any main drift require a separately scoped release review/approval | Sol Medium beta review; user selects any separate higher/security review. No implicit production authorization |

Phases 4–6 are dependency branches, not a forced serial queue: a non-polygon conditional rule can proceed without GML; hydraulic authority does not arise automatically from topology; delivery provenance may be more valuable than either. Reprioritize from real feedback instead of treating the roadmap as authorization to build everything.

## 10. Workflow recommendation

Use **coherent implementation batch → one independent review → narrow remediation of concrete findings → explicitly authorized commit/push → real-file feedback**. The project already has reusable evaluators, owned evidence and focused regression boundaries. Replanning every integer or list offers little benefit; the new defect illustrates that cross-object/real-parser cases are more valuable than another count-only ceremony.

For each batch agree one short behavior contract, files likely affected, independent expected outcomes and exclusions. Luna Medium implements; Sol Medium reviews the changed contracts and their interaction with existing evidence. Review closure should be limited to the actual finding, without reopening settled date/calendar or source-policy decisions unless new evidence contradicts them.

Run targeted checks during implementation. Run the full agreed suite/build once at an explicitly requested substantial checkpoint; repeat only for meaningful new risk. Keep one concise implementation record and one review record per substantial batch. Corpus feedback should refer to file IDs, hashes and minimal local reproductions, not copy whole work deliveries into Git.

Astra Medium is useful for reconciling contradictory authority or selecting the first delivery/ownership/conditional architecture. It is unnecessary for extending settled lists, adding another existing integer evaluator, routine UI wording, a reproducible cache/grouping defect or review closure. No automatic model change or delegation. Commit, push, merge, deployment and production configuration remain separately authorized actions under AGENTS.md.

## 11. Definition: “Validator 2.0 v3.2 testable beta”

### MUST HAVE

- An identified reviewed commit on the feature/test branch; active inventory and policy revision recorded; no unresolved A-class trust defects. A1 closed.
- R1 ordinary points, R2 ordinary lines, R3 mixed/multi-layer and R4 representative scale have documented manual outcomes. Both valid supplied controls and deliberate invalid/uncertain/missing controls have been inspected in the app. Every material discrepancy is fixed or explicitly bounded out of supported scope.
- Supported encoding/export structure is explicit. Inputs that can lose/change authoritative evidence are correctly handled or visibly refused/flagged before users rely on attribute results. B1–B3/B6 cannot remain silent inside the supported profile.
- Selected layer and counts are clear; no leakage, wrong-object ownership, stale replacement results or tab-triggered reruns. Modal/Fildata lifecycle has a real browser check.
- Per-rule PASS/FAIL/INDETERMINATE/NOT_EVALUATED remain distinguishable; zero objects/optional absence is not presented as successful or partial compliance. Code-policy failures are qualified as automated verification/manual review, not categorical source violations.
- A visible v3.2 coverage/limitations statement explicitly excludes advanced unimplemented checks and explains narrower line coverage. No whole-delivery “approved” claim.
- Users can investigate a reported failure/uncertainty on supported representative files: find the supplied value, relevant source/qualification and affected local object or reproducible source location; Type/Tema mismatch must be inspectable. This need not be map navigation or a full table redesign.
- Fildata and rule outcomes agree, including missing text, duplicate/conflicting evidence, rare values and displayed truncation. Field Info states technical conventions and unresolved source requiredness accurately.
- Testmodus behavior and local handling of work evidence are verified before the session; no customer corpus/raw notes/identifiers are introduced into committed fixtures or new telemetry. Existing external map services are not conflated with local validation.
- Proportionate automated checks and a browser smoke/keyboard session are recorded for the milestone; a full suite/build checkpoint is performed when explicitly requested for beta readiness. This audit's tests alone do not award the beta label.

### SHOULD HAVE

- At least two export histories/projects in the real corpus and a recorded source-version distinction for older deliveries.
- Concise Norwegian labels, presence/format row qualifiers, exact unsupported column names and filter/reset clarity.
- Performance measurements with practical limits/feedback for expected work sizes; bounded finding inspection and rare-invalid-value access.
- A small reusable synthetic pack with independent outcomes and a short tester feedback template.
- Remaining safe line formats prioritized from actual demand; broader line completion is useful but not mandatory for an honestly scoped beta.

### DEFERRED / KNOWN LIMITATION

- Full v3.2 completeness; runtime applicability and conditional requiredness; polygon/GML and complete-delivery proof; GUID/SID/cross-file semantics; topology/stikkledning; hydraulics; attachment/provenance; measured-height arithmetic and accuracy acceptance thresholds.
- Physical truth of self-reported attributes, omitted real-world objects, calendar validity/plausibility, catalogue checks and unsupported format/profile/encoding variants.
- Full map/table synchronization, UI redesign, universal field catalogue, general architecture refactors and production deployment.

The milestone is a **limited but trustworthy product surface tested on real work files**, not an implementation percentage of the instruction. It can be reached after phases 0–2.

## 12. Recommended exact next action tomorrow

Assign **one Luna Medium pass implementing section 8 only**, then one Sol Medium review of the new real-parser, multi-object and Fildata evidence cases. Do not commission another rule roadmap. Separately arrange R1–R4 with the domain tester while that small correction is being made.

Immediately after closure, start with **R1: a small, independently checked ordinary point GMI export**, known Latin-1-compatible, one point schema, known count, valid direct Tema and recognizable Norwegian field names. Activate Testmodus, select V2 and the correct layer, run once, inspect required presence plus one exact list, integer, date and note control through Fildata/Field Info. Then load the ordinary line file beside it and test isolation. Record actual mismatches before choosing the stabilization batch.

### Verification / safety record

Only this report was authored. No source/test edits, fixture files, customer-data inspection, database changes, commit, push, merge, deployment or production configuration change. PDF reads used the already-installed local reader with bytecode writes disabled. The read-only remote check and local PDF reader required sandbox approval; neither changed repository or external state.

Final checks: `git diff --check` and `git diff --no-index --check -- NUL docs/agent-reports/20260906-validator-v2-v32-real-file-test-readiness-astra.md` passed; only the usual LF-to-CRLF warning was emitted for the new report. `git status --short` showed exactly `?? docs/agent-reports/20260906-validator-v2-v32-real-file-test-readiness-astra.md`. No test suite/build is repeated for report-only edits.
