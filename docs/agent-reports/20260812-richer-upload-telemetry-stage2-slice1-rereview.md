# Stage 2 Slice 1 focused re-review

**Review date:** 2026-08-12  
**Branch:** `feature/richer-upload-telemetry-app`  
**Scope:** closure verification for H1, H2, H3, M1, M2, and L1 only  
**Verdict:** **GO WITH CHANGES**

## Outcome

- Previous HIGH findings closed: **Yes**.
- H1: **Closed**.
- H2: **Closed**.
- H3: **Closed**.
- M1: **Closed**.
- M2: **Partially closed**.
- L1: **Partially closed**.
- Safe to commit Slice 1: **No**.

The implementation corrections close all three prior HIGH findings. Two audit-precision cleanups remain: the implementation report attributes parser-error exclusion to the wrong test file, and one StatsModal indentation artifact remains. Neither changes runtime architecture or privacy, but both were explicit prior findings and should be corrected before commit.

## H1 — closed

`src/lib/telemetry/uploadTelemetry.mjs` now contains a best-effort `deriveUploadTelemetry` function that catches derivation exceptions and returns `null`. `completeSuccessfulUpload` independently catches an injected derivation failure, then calls legacy tracking once and invokes successful completion once.

`src/components/FileUpload.js` delegates the post-parse work to this seam. The current integration test forces the derivation function to throw and verifies:

- the result is `null`;
- legacy tracking receives exactly one call with the original dataset coordinate; and
- `onComplete` receives exactly one call.

The legacy tracking body remains `{ eventType: 'upload_success', datasetCoord }`. `classifyZQuality` now counts coordinates and valid Z values with nested iteration and no longer creates a full `flatMap` coordinate array.

## H2 — closed

`SOSIParser` no longer extracts an EPSG substring into `COSYS_EPSG`. It retains the source CRS as `SRID`, and `src/lib/telemetry/crs.mjs` recognizes SOSI declarations only through the anchored `^EPSG:(\d+)$` form.

The SOSI parser-boundary test covers:

- supported `EPSG:25832` as declared;
- absent CRS as missing;
- malformed prefixes, suffixes, alternate separators, and arbitrary text as invalid; and
- numeric unsupported `EPSG:3857` as unsupported/other and unavailable to `getDatasetCoordinate`.

GMI, SOSI, and KOF continue to use the shared CRS classification and operational-EPSG semantics. KOF declarations remain declared, only its coordinate heuristic is inferred, user selection remains assumed, and unsupported CRS values remain non-operational.

## H3 — closed

`tests/richerUsageTelemetryParserIntegration.test.mjs` executes the modified production modules rather than checking constants alone:

- the real GMI parser executes field-shape and coordinate-warning paths;
- the real KOF parser executes declaration, projection, heuristic, missing, and short-line warning paths;
- the SOSI parser executes through an injected parser boundary while retaining its real post-parse transformation and CRS classification;
- `getDatasetCoordinate` executes inferred supported and unsupported CRS paths;
- `deriveUploadTelemetry` executes parser-error exclusion;
- `buildLegacyTrackRequestBody` verifies the current legacy-only body; and
- `completeSuccessfulUpload` verifies forced derivation-failure isolation, exactly one tracking call, and successful completion.

The integration-test titles accurately describe the paths they execute.

## M1 — closed

`classifyParserWarnings` now fails closed unless:

- `total` is a non-negative integer;
- the class container has exactly the fixed warning-class keys;
- every fixed-class count is a non-negative integer; and
- the sum of class counts equals `total`.

Unit tests reject negative and inconsistent summaries. Real GMI and KOF fixtures assert that displayed warning count, summary total, and summed class counts remain synchronized.

## M2 — partially closed

The implementation report now accurately distinguishes preserved upload behavior from intentional CRS decision changes: valid alternate CRS fields avoid unnecessary prompting, malformed values are handled strictly, and unsupported CRS values no longer become operational resolver CRS. Its integration-test description also matches the coverage now present.

One attribution remains inaccurate. Under the heading for `tests/richerUsageTelemetrySlice1.test.mjs`, the report says that file covers “parser-error exclusion from the successful telemetry path.” The test with the corresponding title in that file still builds an unrelated valid telemetry object and does not invoke `deriveUploadTelemetry` or the upload seam. The real exclusion coverage exists in `tests/richerUsageTelemetryParserIntegration.test.mjs`, where it is also correctly documented.

Smallest correction: remove the parser-error-exclusion bullet from the Slice 1 unit-test list or move it exclusively to the integration-test paragraph. No code change is required.

## L1 — partially closed

The extra indentation before the municipality metric label is gone. The subtitle in `src/components/StatsModal.js` still has one extra leading source-space before `Oversikt over registrerte filopplastinger`.

Smallest correction: align that text with the surrounding JSX indentation. There is no runtime impact.

## Privacy and scope regression check

The previously accepted privacy boundary is unchanged:

- `TELEMETRY_KEYS` still defines exactly thirteen browser fields;
- the final builder accepts only those keys and fixed allowlisted strings;
- richer telemetry is derived only in browser memory and discarded;
- it is not included in `/api/track`, logged, placed in application state, persisted, or sent elsewhere;
- parser warning summaries are removed before parsed application data is stored; and
- no server route, API contract, Supabase code, SQL, Vercel configuration, or environment handling changed.

## Validation

- `node --test tests/*.test.mjs` — **PASS**, 66/66 tests.
- `npm run build` — PowerShell blocked `npm.ps1` before npm executed due the host execution policy.
- `npm.cmd run build` — **PASS**, optimized production build completed.
- `git diff --check` — recorded after this report was written.
- `git status --short --branch` — recorded after this report was written.

## Verdict

**GO WITH CHANGES.**

All previous HIGH findings are closed. Slice 1 is not yet safe to commit solely because M2 and L1 are not fully closed. The remaining corrections are two small, non-architectural edits: correct one test-coverage attribution in the implementation report and remove one leading JSX space. After those edits and a clean `git diff --check`, the six-item re-review would support **GO** and safe-to-commit status.
