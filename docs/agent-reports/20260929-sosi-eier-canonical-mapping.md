# SOSI Eier canonical mapping

## Scope

Added the verified SOSI owner alias to the existing canonical attribute adapter and included canonical Eier in compact line and point hover labels. No parsing, validation policy, popup, map styling, or layer behavior was changed.

## Verified source field

Inspection of sosijs output from the four ignored files in REF_FILES/SOSI-eksempler/ shows geodataeier is nested under the feature's thematic property group, not a direct feature property: EGS_LEDNING.geodataeier for lines and EGS_PUNKT.geodataeier for points. The raw exports represent this attribute as SOSI ...EIER. A single-level exact path is therefore used for each geometry group; there is no recursive or case-insensitive lookup.

## Canonical mapping

The line mapping copies EGS_LEDNING.geodataeier to top-level Eier. The point mapping copies EGS_PUNKT.geodataeier to top-level Eier. Both use the mapper's existing code normalization and fill helper.

## Precedence and preservation

The mapper copies source properties first. fill only reads from the verified group path when top-level Eier is absent, null, or empty, so an existing non-empty canonical value wins. The code normalization preserves source strings verbatim, including unknown values and whitespace. Nested groups and their geodataeier values remain unchanged; no DRIFTSANSV or SID mapping was added.

## Line and point coverage

Mappings cover LineString and Point; polygons follow the existing line mapping path. Missing owner fields produce no canonical Eier. No owner is inferred for records without the field.

## Downstream availability

The SOSI parser stores the returned attributes on parsed features. Existing field inspection, generic object data views, and popup content consume top-level attributes without SOSI-specific branches, so canonical Eier becomes available through those existing paths. The Validator V2 implementation and its GMI-only policy were not changed.

## Tooltip integration

The formatter reads only canonical top-level Eier. For lines it follows installation year and precedes Stedfestingsårsak; for points it follows current identity parts and precedes Stedfestingsårsak. Missing or placeholder values are omitted. Values such as K, P, and other codes are displayed as stored, without translation.

## Real export verification

All four REF_FILES/SOSI-eksempler/ exports parsed with zero errors after the mapping. The known municipality exporter profile contained geodataeier on 999/999 lines and 514/1,102 points. In the parsed source groups, distinct values across those exports were A, K, P, and P1; each source-backed object also had the same value in top-level Eier after canonicalization. These observations describe this exporter profile, not universal SOSI structure or coverage.

## Tests

node --test tests/sosiCanonicalAttributes.test.mjs tests/featureHoverTooltip.test.mjs tests/featurePopupContent.test.mjs tests/validationV2WorkspaceInspector.test.mjs passed 32 tests. node --experimental-loader ./tests/esmJsLoader.mjs --test tests/objectTableInspection.test.mjs passed 15 tests. Coverage includes line and point mapping, canonical precedence, source preservation, missing and unknown values, tooltip order and source parity, generic inspection surfaces, and unchanged Validator V2 workspace behavior. git diff --check passed.

## Files changed

- src/lib/parsing/sosiCanonicalAttributes.js: explicit line and point group aliases.
- src/lib/map/featureHoverLabel.mjs: canonical owner segment.
- tests/sosiCanonicalAttributes.test.mjs: mapping and preservation coverage.
- tests/featureHoverTooltip.test.mjs: line/point owner ordering and value coverage.
- docs/agent-reports/20260929-sosi-eier-canonical-mapping.md: this report.

## Final repository state

Changes are uncommitted on feature/compact-hover-tooltip; no build, commit, or push was performed. The pre-existing data/usage/aggregates.json modification remains untouched. REF_FILES/ was read for verification only and was not modified.
