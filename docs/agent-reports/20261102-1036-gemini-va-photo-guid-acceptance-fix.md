# Gemini VA photo GUID acceptance fix

Date: 2026-11-02, Europe/Oslo. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. Starting HEAD: **`ed73ec2 Add experimental Gemini photo export profile`**. Root, branch, exact HEAD and clean worktree confirmed before edits. No sub-agents, commit or push.

## Reason and empirical acceptance

The user reports that the app-generated four-photo package reached Gemini's FME conversion service and received `Translation Successful`, yet produced no usable Foto rows. Diagnostics rejected all four Skråfoto with `SOSI.SOSI_Objekt.identifikasjon.lokalId is not a valid guid`. Those IDs were deterministic UUIDv5.

Replacing all export UUIDs with UUIDv4 in a controlled package succeeded: all four Foto records were found, GUIDs populated, photo extent/symbols shown, final import completed, and photos registered in GeoFoto. This is **empirically confirmed Gemini VA/FME compatibility behavior**. The available tested context is the user's FME-based photo conversion, Foto mapping and Gemini VA/GeoFoto import workflow; exact Gemini/FME version/build is not provided. We do not infer that every version rejects UUIDv5. Evidence is the user's supplied test account; no raw conversion logs/artifacts were separately inspected here.

Acceptance level: **Experimentally accepted in the user's tested Gemini VA/FME import path** for the controlled manually patched package. The production-code fix is ready for the final untouched UI-package test, not itself manually reaccepted yet.

Read both requested reports, current contract/plan/serializers/package and Gemini/export/browser tests/helpers. Inspected `REF_FILES\GML-leveranse` read-only: one GML, 40 JPEGs, 81 UUIDv4 collection/feature/Point identities and 40 corresponding localIds. All 41 reference file hashes remain unchanged. Only aggregate findings are reported; no customer identifiers, coordinates or photographs enter committed fixtures.

## Implementation

Only `gemini-legacy2019` requests platform `globalThis.crypto.randomUUID()`. Allocation happens during plan construction: one UUID per photo feature, a separate one per Point and one for FeatureCollection. A per-plan Set rejects a duplicate rather than issuing a colliding document. Platform UUIDs have canonical lowercase hyphenated text, version nibble 4 and RFC 4122 variant bits. No dependency or custom UUID algorithm was added.

The feature's `gml:id` is `id<UUID>` and identification/localId contains that exact UUID. Point and collection have distinct `id<UUID>` IDs. The immutable plan owns all IDs: repeated XML serialization or repeated package downloads from the same plan are stable and make no UUID generator calls. New plans request fresh random IDs. No random export identity is written into canonical state, provenance or persistence.

Legacy 2019 and AsBuilt 5.2 still use the existing deterministic UUIDv5 strategy, fixed collection ID and photo-/point- prefixes. Synthetic SHA-256 baselines captured before editing assert their entire serialized XML is unchanged, alongside existing schema/identity tests. Filename planning and physical attachment bytes remain unchanged.

The successful manually patched package had two refinements absent from starting HEAD: explicit dimension 3 on gml:pos, and root attributes in contractor order. These are now included for Gemini only. The root order is xmlns:gml, gml:id, xmlns:app, xmlns:xlink, xmlns:xsi, schemaLocation. Existing namespace, envelope-only EPSG:5972, XYZ/export-only zero Z, deterministic bounds, filename names, backslash XML links, slash ZIP members, empty navnerom, legacy Retning, optional local capture time and omitted image-information remain intact. No broad serializer refactor or UI change.

Earlier nonzero-Z/non-degenerate-envelope, pos-dimension-only and root-order-only experiments did not resolve the issue. Those conventions must not be promoted to independently confirmed causal requirements. Collection/Point UUIDv4 was present in the successful package; the diagnostic specifically names feature localId. The public Legacy-XSD required timestamp versus accepted missing-time dialect remains documented, with 14/40 missing timestamps in the contractor file.

## Files changed

- `src/lib/photos/export/photoExportPlan.mjs`: profile-specific platform UUIDv4 allocation, uniqueness guard and plan-owned IDs; standards UUIDv5 unchanged.
- `src/lib/photos/export/photoExportXml.mjs`: Gemini pos dimension and contractor root attribute ordering only.
- `tests/helpers/geminiPhotoConventions.mjs`: canonical UUIDv4/variant, uniqueness/count checks for every root/photo/Point ID; used by reference and real browser download checks.
- `tests/photoGeminiCompatibility.test.mjs`: same-plan XML/ZIP stability, controlled generation-count/new-plan tests, duplicate guard, standards whole-XML byte baselines, reference aggregate UUID findings.
- `tests/helpers/generateGeminiPhotoPackage.mjs`: verify generated ZIP XML conventions, layout and original-byte equality using the same production plan/serializer/package as UI.
- `docs/agent-reports/20261102-0928-gemini-va-photo-export-compatibility.md`: dated acceptance continuation and explicit historical/current uncertainty distinction.
- This report.

## Validation

| Selection | Tests | Pass | Fail | Skip |
| --- | ---: | ---: | ---: | ---: |
| Gemini compatibility, export plan/serializer/package + contract checks, capture metadata and direction (6 files) | 71 | 71 | 0 | 0 |
| Loaded-GMI full production browser/export acceptance (1 file, includes nested cases) | 11 | 11 | 0 | 0 |
| **Disjoint Node total** | **82** | **82** | **0** | **0** |
| Existing independent XSD expectation harness | 9 | 9 | 0 | 0 |

The 12 Gemini tests include an optional reference comparator which **ran**, not skipped: 81 v4 XML identities, 40 matching v4 localIds, private values excluded. Without that directory it explicitly skips; synthetic tests remain portable. Explicit UUID regex checks require lowercase canonical text, version 4 and RFC variant [89ab]. The concise regression comment documents the FME rejection/GeoFoto result. Controlled platform mocking proves generator calls occur only while constructing each plan, avoiding probabilistic fresh-plan inequality assertions. Tests assert stable frozen-plan XML and ZIP and catch document collisions.

The unchanged loaded-GMI browser test now exercises the stronger shared UUIDv4 comparator on its actual downloaded four-feature package, while retaining original-byte and shared attachment checks and WFS isolation assertions. Its test-only generator does not replace production behavior: browser/UI and synthetic helper both use buildPhotoExportPlan -> serializePhotoExport -> buildPhotoExportPackage.

Focused ESLint (5 changed JS/MJS files): **0 errors, 0 warnings**. `npx.cmd next build --webpack`: **passed**, including compilation, TypeScript and static generation. `git diff --check`: **passed**. No runtime/dependency or lockfile changes. Existing module-type/Browserslist notices remain; unrelated debt was not repaired.

Existing TEMP lxml/XSD harness/cache was available and ran unchanged against fresh compatibility XML: all-times-present output validates; missing-time output intentionally does not. Both standards baselines validate, the contractor file retains exactly 14 missing-time errors, and four expected negative controls remain rejected (Legacy missing direction/wrong sequence, modern missing quality/partial image info). Nine expected outcomes passed; this does not claim nine schema-valid files or general importer acceptance. No remote schema edits were made.

Reproduction:

```powershell
node --test --test-concurrency=1 tests/photoGeminiCompatibility.test.mjs tests/photoExportPlan.test.mjs tests/photoExportSerializers.test.mjs tests/photoExportPackage.test.mjs tests/photoCaptureMetadata.test.mjs tests/photoDirection.test.mjs
# Against the fresh local production build, with PHOTO_UI_URL=http://127.0.0.1:3100:
node --test --test-concurrency=1 tests/photoLoadedGmiUi.test.mjs
node tests/helpers/generateGeminiPhotoPackage.mjs
python $env:TEMP/gemini-va-photo-compatibility/validate.py
```

Logs: `%TEMP%\gemini-va-photo-guid-fix\{domain,browser,build,lint,xsd,artifact}.log`. All final selections passed on the first run. Reference and previous attachment hashes were held outside Git only.

## Fresh synthetic package

Exact path: `C:\Users\GEMINI~1\AppData\Local\Temp\gemini-va-photo-compatibility\gemini-compatibility-synthetic.zip`.

Already extracted at `C:\Users\GEMINI~1\AppData\Local\Temp\gemini-va-photo-compatibility\extracted\photos.gml` with sibling `Attachments`.

Verified 3 photo features, 2 original JPEG attachments, 1 shared attachment, **7 distinct UUIDv4 XML identities** (1 collection + 3 features + 3 Points), matching feature/localId values, 3 zero-Z placeholders, 1 missing time and 2 timezone lexical removals. Structural comparator and physical `photos.gml` / `Attachments/<filename>` ZIP layout pass. Both JPEG SHA-256 hashes match the package generated before this fix, and original-byte equality is checked before saving. These are synthetic 64x64 color patterns, not reference photographs. `gemini-present.gml` and `gemini-missing.gml` were regenerated for independent XSD checks.

## Final manual acceptance and limits

Deploy/update the app. Generate **Gemini VA · Skråfoto 2019 (eksperimentell)** directly from the normal UI, extract ZIP, import the untouched `photos.gml` with sibling `Attachments`, and confirm that Foto records appear and final import registers them in GeoFoto. Record diagnostics, counts and attachment opening. Do not manually patch this final package.

This last test establishes production-exporter equivalence with the successful manually patched package. It remains pending. No general compatibility or certification is claimed, and no UI/date picker/EXIF redesign, AsBuilt compatibility work, object relations, canonical Z, persistence, WFS/map/provenance/source-ranking/topology change or vendor contact was performed. No commit or push.
