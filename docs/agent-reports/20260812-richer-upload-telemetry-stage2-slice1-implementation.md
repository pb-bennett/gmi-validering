# Stage 2 Slice 1 implementation report

**Implementation date:** 2026-08-12  
**Branch:** `feature/richer-upload-telemetry-app`  
**Scope:** bounded browser derivation, parser metadata, CRS provenance, synthetic tests, and the inactive statistics shell

## Files changed

Added:

- `src/lib/telemetry/classifiers.mjs`
- `src/lib/telemetry/crs.mjs`
- `src/lib/telemetry/warnings.mjs`
- `src/lib/telemetry/uploadTelemetry.mjs`
- `src/components/DetailedStatsSection.js`
- `tests/richerUsageTelemetrySlice1.test.mjs`
- `tests/richerUsageTelemetryParserIntegration.test.mjs`
- `tests/esmJsLoader.mjs`
- `docs/agent-reports/20260812-richer-upload-telemetry-stage2-slice1-implementation.md`

Modified:

- `src/components/FileUpload.js`
- `src/components/StatsModal.js`
- `src/app/layout.js`
- `src/lib/parsing/gmiParser.js`
- `src/lib/parsing/sosiParser.js`
- `src/lib/parsing/kofParser.js`
- `src/lib/tracking/datasetCoordinate.js`

Unchanged:

- Stage 1 SQL and database contracts
- `/api/track` server behavior and request shape
- `/api/stats` data contract and legacy source
- Supabase, Vercel, environment variables, and tracking policy

## Classifier architecture

`src/lib/telemetry/classifiers.mjs` owns the exact fixed domains matching the Stage 1 SQL. It provides deterministic classifiers for format, extension category, file-size bucket, object and coordinate buckets, object mix, XY quality, Z quality, coordinate status, and final telemetry construction.

Filename and exact file-size helpers reduce their inputs immediately. The final `buildUploadTelemetry` function accepts only the thirteen already-reduced category values, rejects extra keys, and returns exactly the thirteen browser fields. It does not accept files, metadata objects, parsed data, headers, attributes, coordinates, exact counts, or raw warnings.

The upload success path derives the bounded object in browser memory after parsing and does not send it to `/api/track`.

## CRS decisions

`src/lib/telemetry/crs.mjs` is the shared strict extraction path used by the upload prompt decision and `datasetCoordinate.js`.

- Supported explicit EPSG and format declarations are `declared`.
- KOF `KOORDSYS 22/23`, explicit KOF UTM projection text, GMI EPSG fields, and SOSI GeoJSON CRS are declarations.
- Coordinate-value heuristics are `inferred`.
- User-selected supported CRS values after a missing or invalid source are `assumed`.
- Absent source CRS is `missing`.
- Present but unparsable source CRS is `invalid`.
- Parsed unsupported numeric CRS is `unsupported` with `epsgCategory=other`.

The parser output carries a minimal `crsContext` in browser memory. Successful upload/install behavior and the existing UTM 32/33 prompt are preserved, while CRS decisions intentionally become stricter: valid alternate CRS fields can now avoid an unnecessary prompt, malformed CRS can prompt where permissive parsing previously did not, and unsupported CRS values no longer become operational resolver CRS. The operational context records the final assumed status rather than both the original defect and later user choice, matching the Stage 1 schema.

## Warning-summary design

`src/lib/telemetry/warnings.mjs` provides one `recordWarning` path. It preserves the existing display warning array while updating a minimal fixed-class summary containing only a total and counts for `coordinate`, `geometry`, `field_shape`, `crs`, and `other`.

GMI, KOF, and SOSI parser outputs retain their existing user-facing warning/error behavior. GMI coordinate and field-shape warnings, KOF short-line warnings, and KOF CRS heuristic warnings now emit fixed classes. The telemetry classifier consumes only the safe summary and emits the fixed warning bucket and class. Raw warning strings are never classified or included in the telemetry object. Parser errors are rejected by `FileUpload` before telemetry derivation. The classifier now fails closed unless the total and every fixed class count are non-negative integers with matching sums.

## Visible UI changes

- Root document language is now `<html lang="no">`.
- Existing historical labels now use `Registrerte filopplastinger` and `Kommuner med registrert aktivitet`.
- `DetailedStatsSection` is a reusable statistics section with an inactive state only. It does not fetch richer data or render counts, dates, example data, or fabricated statistics.
- The inactive section includes the Norwegian privacy note and independent-distribution explanation required for the later real distribution props.

## Tests

`tests/richerUsageTelemetrySlice1.test.mjs` covers:

- all fixed extension categories, uppercase, multi-dot, and missing extensions;
- every file-size, object-count, and coordinate-count boundary;
- all object mixes, XY outcomes, and Z outcomes;
- declared, inferred, assumed, missing, invalid, and unsupported CRS;
- all EPSG categories, KOF declarations versus heuristics, and user-assumption precedence;
- coordinate-status outcomes;
- warning bucket boundaries, single/multiple classes, and arbitrary warning-text exclusion;
- exact thirteen-key output and rejection of prohibited extra values; and
- inconsistent warning-summary rejection.

`tests/richerUsageTelemetryParserIntegration.test.mjs` executes the modified production paths with synthetic in-memory fixtures. It covers real GMI and KOF parser warnings and CRS provenance, KOF declaration/projection/heuristic/missing cases, an isolated SOSI parser boundary with supported/missing/malformed/unsupported CRS values, shared `getDatasetCoordinate` behavior, parser-error telemetry exclusion, legacy-only tracking body shape, and the forced telemetry-derivation failure seam that preserves tracking and completion. `tests/esmJsLoader.mjs` only enables Node to execute the repository's existing `.js` ESM parser modules in these tests.

The existing tracking-policy, Stage 1 database-contract, and WMS policy tests remain unchanged and pass. The production build also compiles all GMI, SOSI, KOF, telemetry, and UI changes.

## Privacy assertions

The new final telemetry object contains only fixed category strings. It contains no filename, exact size, object count, coordinate count, coordinate, bounding box, MIME type, timestamp, header, attribute, GUID, source line, raw warning, error string, IP, request header, request identifier, or per-upload fact row. The numeric operational EPSG and exact parsed values remain browser-local inputs used only before reduction and for the existing legacy coordinate path.

No telemetry object is logged, persisted, sent to `/api/track`, or sent to any new endpoint in Slice 1.

## Known limitations and Slice 2 boundary

- Browser-derived categories remain untrusted descriptive values until the later server validation work.
- The existing legacy transient dataset-coordinate tracking path remains unchanged and separate from the new bounded object.
- Richer request validation, resolver diagnostics, optional RPC wiring, feature flags, server-side app/schema values, and server-side richer-write failure isolation are not implemented.
- Detailed tables are not queried, and no richer statistics are exposed.
- Sparse-cell thresholds, activation dates, legacy stats read corrections, and debug-route remediation remain later reviewed work.

## Correction validation

- `node --test tests/*.test.mjs` — **PASS**, 66/66 tests.
- `npm run build` — **PASS**, optimized Next.js production build completed.
- `git diff --check` — **PASS**.
- `git status --short --branch` — recorded after the correction validation.
