# Stage 2 Slice 1 implementation review

**Review date:** 2026-08-12  
**Branch:** `feature/richer-upload-telemetry-app`  
**Scope:** complete uncommitted Slice 1 diff; repository-only review  
**Verdict:** **GO WITH CHANGES**  
**Safe to commit now:** **No**

## Review summary

The implementation has the right overall boundary. A valid richer telemetry object contains exactly the thirteen Stage 1 browser-derived fields, every value is selected from the exact database domain, and the object is currently only constructed in browser memory. It is not included in the existing `/api/track` request, logged, stored in Zustand, persisted, or sent to another endpoint. No Supabase, SQL, stats-read, feature-flag, or deployment behavior was added.

The KOF provenance correction, user-choice `assumed` state, unsupported-CRS handling, warning-emission helper, Norwegian inactive statistics shell, and `lang="no"` change are sound. Existing raw warning strings remain browser-local display data and do not drive telemetry classification.

Three high findings should be corrected before this Slice 1 diff is committed. The most important is that telemetry derivation still runs inside the upload's main parse-success `try` before legacy tracking is started. A classifier/allocation failure can therefore suppress the authoritative `/api/track` call and turn an otherwise successful upload into an error. SOSI also still performs permissive EPSG substring extraction before the shared strict classifier, and the new tests do not execute any real parser or FileUpload integration despite the implementation report saying that they do.

## Findings

### BLOCKER

None.

### HIGH

#### H1. In-memory telemetry derivation is not failure-isolated from successful upload completion and legacy tracking

**Relevant code:** `src/components/FileUpload.js`, `useFileLoader.handleFile`, especially the telemetry derivation between the `getDatasetCoordinate` call and `trackUploadSuccess`.

After `addLayer`, `setData`, and `setParsingDone`, the code performs several full-data classifications and builds the telemetry object before calling `trackUploadSuccess(datasetCoord)` and `onComplete()`. This work remains inside the outer parsing `try`. An exception or allocation failure in coordinate counting, XY/Z classification, or future classifier evolution therefore enters the parser-error catch, prevents the existing legacy `/api/track` request, and prevents `onComplete`, even though parsing and state installation already succeeded.

This is not merely theoretical for large uploads: `classifyZQuality` in `src/lib/telemetry/classifiers.mjs` uses `flatMap` to allocate an additional array containing every coordinate reference. It adds avoidable memory pressure precisely on the path that already handles exceptionally large files.

**Smallest safe correction:** make richer derivation a dedicated best-effort, non-throwing operation that returns either a valid bounded object or `null`, with no error-object logging. Ensure the legacy tracking call and successful completion occur regardless of that result. Replace the all-coordinate `flatMap` with a streaming count to avoid the large temporary allocation. Add a regression test proving a forced richer-classifier failure neither suppresses the one legacy tracking call nor changes successful completion.

#### H2. SOSI bypasses the shared strict EPSG extraction rule

**Relevant code:** `src/lib/parsing/sosiParser.js`, `SOSIParser.parse`, the `crsName`/`epsgMatch` extraction around lines 105–115; `src/lib/telemetry/crs.mjs`, `parseStrictEpsg` and `classifyCrs`.

SOSI currently applies the unanchored expression `/EPSG\s*:?\s*(\d+)/i` and writes its partial match to `header.COSYS_EPSG`. `classifyCrs` then sees a trusted numeric value and never evaluates the original `SRID` strictly. A malformed or extended value containing a supported EPSG substring can consequently become `declared`, skip the user-choice path, and be used by `getDatasetCoordinate` as operational CRS data.

GMI and KOF now use strict token parsing, so this is also a cross-format inconsistency and contradicts the implementation report's claim that one shared strict extraction path is used.

**Smallest safe correction:** route SOSI CRS recognition through the shared strict parser, or define one explicitly anchored allowlist for the exact SOSI CRS forms that `sosijs` legitimately emits and then pass the result into the shared classifier. Add supported, missing, malformed-prefix/suffix, invalid, and unsupported SOSI CRS tests.

#### H3. Tests do not exercise the modified parser or FileUpload integration paths

**Relevant code:** `tests/richerUsageTelemetrySlice1.test.mjs`; modified `GMIParser.parse`/`toObject`, `KOFParser.parse`/`toObject`, `SOSIParser.parse`/`toObject`, `getDatasetCoordinate`, and `useFileLoader.handleFile`.

The new suite meaningfully tests classifier functions, fixed domains, bucket boundaries, the warning helper, and the final thirteen-key builder. It does not import or instantiate any of the three parsers, `getDatasetCoordinate`, or FileUpload. The final test titled “parser errors cannot be represented as successful warning telemetry” only asserts that a locally created `errors` array is non-empty and then builds an unrelated valid telemetry object; it does not exercise the parser-error branch or tracking exclusion.

Consequently, the suite does not prove that:

- existing GMI/KOF display warnings remain unchanged while their safe summaries stay synchronized;
- GMI, SOSI, and KOF actually emit the intended `crsContext`;
- KOF declaration, projection, heuristic, missing, and short-line paths work end to end;
- parser errors skip telemetry and tracking;
- warning metadata is removed before parsed application data is stored;
- the `/api/track` body remains legacy-only; or
- richer derivation failure leaves successful upload and legacy tracking intact.

This falls short of both the reviewed Slice 1 plan and the implementation report's claim of synthetic GMI/SOSI/KOF fixture coverage.

**Smallest safe correction:** add minimal synthetic parser fixtures that execute the real GMI and KOF parsers and an isolated/stubbed SOSI parser boundary, then assert displayed-warning/summary parity and CRS provenance. Add a small integration seam or extracted pure upload-derivation helper so tests can prove parser-error exclusion, exact bounded output, no telemetry in the current fetch body, and failure isolation without requiring a broad browser test harness.

### MEDIUM

#### M1. Warning-summary consistency is guaranteed by current call sites but not validated by the classifier

`recordWarning` is the only current GMI/KOF warning-emission path, and it atomically updates the display array and fixed summary. That is the correct design. However, `classifyParserWarnings` accepts inconsistent summaries: it does not require the sum of fixed class counts to equal `total`, reject negative/non-integer class counts, or reject a positive class count when `total` is zero. Such input can yield an allowed but semantically inconsistent bucket/class pair.

**Recommended correction:** validate the full fixed summary invariant before reduction and return `null` on inconsistency. Parser fixture tests should also assert `warnings.length === warningSummary.total` and that class counts sum to the same total.

#### M2. The implementation report overstates behavior and test preservation

`docs/agent-reports/20260812-richer-upload-telemetry-stage2-slice1-implementation.md` says the current CRS selection behavior remains unchanged and describes synthetic parser coverage that is not present. The user-facing prompt mechanism is preserved, but its decision is intentionally changed: valid `COSYSVER_EPSG`/`SRID` values no longer cause an unnecessary prompt, strict malformed values do, and unsupported EPSG values no longer produce a resolver coordinate. Those are reviewed corrections, not unchanged behavior.

**Recommended correction:** after code and tests are corrected, update the implementation report to distinguish preserved upload outcomes from intentional CRS-decision fixes and list only tests that actually run.

### LOW

#### L1. Minor JSX indentation noise should be cleaned before commit

`src/components/StatsModal.js` contains extra leading spaces before the subtitle and the municipality label. This has no runtime effect and `git diff --check` does not flag it, but removing it keeps the focused diff clean.

## Privacy-boundary assessment

The final builder is appropriately narrow:

- `TELEMETRY_KEYS` contains exactly thirteen keys.
- `buildUploadTelemetry` rejects arrays, missing keys, extra keys, non-string values, and values outside the fixed domains.
- Filename and exact byte size are reduced by dedicated local classifiers before the builder call.
- Exact object and coordinate counts are reduced before the builder call.
- Parsed headers, coordinates, attributes, GUIDs, source lines, MIME data, raw warnings, and parser errors cannot be represented by the final object.
- The current `/api/track` body remains exactly `{ eventType, datasetCoord }`.
- `boundedTelemetry` is only assigned and discarded; it is not logged, stored, persisted, or transmitted.
- `warningSummary` is removed before parsed data is placed in application state.
- Existing exact parsed data and the transient legacy dataset coordinate remain separate from the richer object.

No privacy-sensitive telemetry transmission or persistence was found in the Slice 1 diff.

## CRS assessment

Subject to H2, the provenance model is correct:

- GMI supported explicit EPSG fields are `declared`.
- KOF `KOORDSYS 22/23` and supported explicit UTM projection text are `declared`.
- Only the KOF coordinate-value heuristic is `inferred`.
- A supported user choice after missing/invalid source CRS is `assumed`.
- Absent, unparsable, and parsed-but-unsupported values remain distinct as `missing`, `invalid`, and `unsupported`.
- Unsupported numeric CRS maps to `epsgCategory=other` and is not operational for the legacy resolver.
- `getDatasetCoordinate` and the FileUpload prompt now share `classifyCrs`/`getOperationalEpsg` instead of interpreting different header fields.

The changed prompt decisions for valid alternate CRS fields and strict malformed values are intentional correctness changes from the reviewed plan. No unrelated geometry or visualization behavior was changed by the diff.

## Parser-warning assessment

All existing GMI and KOF warning pushes in the modified parsers now pass through `recordWarning`; SOSI currently emits no warning entries. Display messages remain the same, and telemetry classification uses only total/class counts. Raw warning text is never inspected by a classifier or copied into the bounded object. H3 is required to turn this static finding into regression protection; M1 would make the summary invariant fail closed.

## Classifier and Stage 1 contract assessment

Manual comparison with `src/features/user-tracking/supabase_richer_usage_diagnostics.sql` found exact agreement for all thirteen browser domains. File-size, object-count, coordinate-count, warning-count, object-mix, CRS, EPSG, coordinate-status, XY, and Z boundaries match the Stage 1 contract. The final builder receives only already-reduced category values.

The browser categories remain client-manipulable, as expected; they are not sent in Slice 1. Slice 2 must still independently enforce exact keys, enum domains, request size, and cross-field consistency, while the database remains the final contract and atomicity boundary.

## FileUpload and legacy-path assessment

The fetch endpoint, method, content type, body shape, `keepalive`, once-only call pattern, and best-effort fetch catch remain unchanged. Sensitive browser logging of EPSG, sample count, returned location, and arbitrary errors was removed. Parser error checks still occur before telemetry derivation.

H1 is the exception to an otherwise preserved success path: the new derivation currently runs before the legacy request is initiated and before `onComplete`, so it needs an explicit local failure boundary.

## UI assessment

The new text is natural Norwegian and accurately presents an inactive state without figures, dates, or historical claims. The legacy labels now describe registered upload events and municipalities with registered activity rather than users. `<html lang="no">` is correct.

`DetailedStatsSection` is a durable component boundary and can be extended with fixed one-dimensional distribution props and explicit future states. It does not fetch data or fabricate charts. Before real statistics are shown in Slice 3, the absolute “kan ikke kobles” wording should be rechecked alongside the approved sparse-cell publication rule so the public explanation does not overstate what low-volume daily aggregates guarantee.

## Validation performed

- `node --test tests/richerUsageTelemetryDatabaseContract.test.mjs tests/richerUsageTelemetrySlice1.test.mjs tests/trackingRequestPolicy.test.mjs tests/wmsProxyPolicy.test.mjs` — **PASS**, 60/60 tests.
- `npm.cmd run build` — **PASS**, optimized Next.js production build completed.
- `git diff --check` — recorded after this report is written.
- `git status --short --branch` — recorded after this report is written.

The passing suite establishes classifier and existing policy correctness, but it does not remove H3 because the modified production parser/FileUpload paths are absent from the tests.

## Conclusion

**Verdict: GO WITH CHANGES.**

There are **0 BLOCKER**, **3 HIGH**, **2 MEDIUM**, and **1 LOW** findings. The privacy shape itself is sound and no richer telemetry leaves the browser, but Slice 1 is **not safe to commit in its current form**. Correct H1–H3 with narrow changes and rerun the same test/build/check matrix. No database, SQL, Supabase, Vercel, or deployment work is needed for those corrections.
