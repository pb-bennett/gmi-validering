# Photo filename copy

## Scope

Before editing, verified branch `feature/photo-filename-copy`, HEAD `135dc2a` (Add Data Table search). Single-agent implementation. No operations on ignored reference material or pre-existing runtime data; no reset, restore, stash, clean, branch change, commit or push.

## Existing S_HYPERLINK architecture

Pre-edit audit: `gmiParser._parseFieldValues` splits semicolon-delimited fields, trims each scalar, and converts numeric/boolean values; all other values remain strings. It does not parse hyperlink expressions into attachment objects or arrays. Original lexemes are non-enumerable metadata. Validation maps `attachmentLink` to `S_HYPERLINK` and evaluates presence/applicability without URL validation. No reusable hyperlink/filename helper was found.

`LayerDataTable` uses generic memoized `DataCell`, with accessors reading original attributes. Local search scans attributes before TanStack sorting/row virtualization. `MapInner` delegates Leaflet popup construction to `src/lib/map/featurePopupContent.mjs`, a generic text-safe DOM renderer, followed by existing 3D/inspection/profile buttons. Popup actions use dedicated classes and feature metadata. `ShareQrModal` uses Clipboard API with local 1400ms feedback and catches failure; no shared clipboard utility/fallback exists.

The separate `3D/Tooltip3D.js` inspector also renders generic attributes (first 20 non-internal keys). This change targets the requested Data Table and Leaflet map-object popup; that separate 3D inspector is unchanged.

## Verified hyperlink shapes

Tracked GMI fixtures `batch2-oracle.gmi`, `point-clean-modern.gmi`, and `point-applicability-tema.gmi` declare `S_HYPERLINK`; batch2 supplies `https://synthetic.invalid/a`. Tests also use synthetic opaque attachment strings. The user's observed runtime syntax is `h:1(link:"Attachments\DRENS.2.5_20260625_0909_01.jpg")`; tracked fixtures do not verify that wrapper. No evidence of parser-produced arrays or a nested photo-object schema was found. Array/multi-wrapper support is defensive derived presentation, not a change to GMI parsing. No REF_FILES were accessed.

## Shared filename extraction

`src/lib/hyperlinkFilenames.mjs` exports the one pure `extractHyperlinkFilenames(value)` implementation used directly by both surfaces. It returns derived basenames without rewriting any source. Supported inputs: strings, nested arrays of strings, valid double-quoted `h:N(link:"...")` wrappers, consecutive wrappers, and wrappers with multiple comma/semicolon-separated quoted link entries. Multi-wrapper grammar is defensive support, not claimed as a verified parser output. The whole wrapper string is validated before extracting links, so incomplete expressions or extra arbitrary text do not produce fake filenames.

Windows/drive paths and forward-slash paths use their final component. HTTP/HTTPS references use URL pathname only, dropping query/hash and decoding percent-encoded filename text. Literal paths preserve spaces, underscores, dots, parentheses and Norwegian characters. Basenames are trimmed. A bare filename needs an extension; an explicit path or URL may have an extensionless basename (important for the tracked `/a` fixture). Null, undefined, blank strings, numbers/booleans, arbitrary objects, unsupported URI schemes, roots/directories and malformed wrappers produce no copy action. Unsupported Windows filename characters are rejected. Plain local paths are not URI-decoded or treated as URL queries. No file access, navigation, download, upload or dependency was added.

## Multiple references

All supported references are processed in source order. Exact repeated basenames are deduplicated even when directories differ; case variants remain distinct. Nested arrays are cycle guarded and not modified. Arbitrary nested objects and unverified delimiter-separated plain strings are intentionally not interpreted as reference schemas. Each extracted filename has its own action; there is no combined ambiguous clipboard value.

## Data Table integration

Only column ID `S_HYPERLINK` selects the new memoized `HyperlinkCell`. It retains the original `DataCell` (including raw truncated text, full-value tooltip and scalar search highlighting) and adds a compact copy rail. A single reference gets one regular Phosphor Copy icon; multiple references get numbered icons in source order. The rail is bounded to 6rem and horizontally scrollable for many references, with keyboard focus and filename-specific title/accessibility labels keeping every action available within the existing 28px row. Copied state shows Check icon and visible `Kopiert` text. Existing widths, column accessors, sorting, virtualizer and stable original source indices are unchanged. Extracted filenames are memoized per value for rendered cells only.

## Popup integration

The existing DOM field renderer retains every ordinary field exactly as before, including raw `S_HYPERLINK` text. A small branch for that key appends one line per derived filename with a `Kopier filnavn` button. Text remains rendered through textContent/text nodes (no HTML injection). Existing `Vis i 3D`, `Inspiser data`, line profile actions, classes and feature metadata remain unchanged. Copy buttons have no feature-action classes or metadata and stop propagation, leaving the popup open without invoking map selection/navigation.

## Clipboard behavior

`src/lib/filenameClipboard.mjs` provides a shared action lifecycle used by the tiny React `FilenameCopyButton` and the popup DOM button. It writes only the passed derived filename through `navigator.clipboard.writeText`. Click propagation is stopped before asynchronous work. Pending copies suppress duplicate writes and disable their own button. Fulfilled writes alone produce success; rejected/unavailable Clipboard API produces local `Ikke kopiert` feedback without throwing into rendering. Feedback resets after 1400ms, following the existing ShareQrModal timing. React controls dispose their action/timer on unmount; pending completion after disposal cannot update state. Popup feedback uses a single short-lived timer per clicked button. No persisted clipboard state, fallback subsystem or toast was added.

## Feedback and accessibility

Actual type=button controls use `gmi-compact-button`, `gmi-focus-ring` and existing GMI text/surface styles. Accessible names are `Kopier filnavn <filename>`, with matching tooltips. React Copy/Check regular icons are aria-hidden; filename numbering is only an additional visual cue. Each control has local `role="status"` text for visible success/failure. Keyboard button activation uses the same isolated handler. Feedback appears only on the clicked action; another filename remains independently usable.

## Data Table search compatibility

Search continues to consume original logical attributes, including raw wrapper paths and nested data; extraction does not feed table search or sorting. An integrated helper/controller regression finds an observed-form `IMG_4827.JPG` reference using `4827`, extracts the basename, verifies the exact clipboard write, and checks that the original hyperlink remains byte-for-byte identical. Existing off-screen/nested/scalar highlight/search, scope composition, TanStack sorting and original-index tests continue to pass.

## Tests

- `tests/hyperlinkFilenames.test.mjs`: observed GMI wrapper, Windows/Unix paths, HTTP query/hash stripping, percent decoding, Norwegian/spaces/parentheses/multiple dots, missing/malformed/unsupported input, ordered multi-reference output, exact duplicates and arrays/cycles, no mutation, actual parsed tracked batch2 URL, search-to-copy workflow, clipboard content and event isolation, success reset, failure/retry, pending duplicate suppression/disposal, and Data Table source contracts.
- `tests/featurePopupContent.test.mjs`: actual DOM construction via the existing fake document, raw preservation, individually accessible multiple buttons, basename-only writes through mocked Clipboard API, local success/failure, type/focus/event isolation, no actions for invalid references, and unchanged Eier/Status/3D/inspection metadata. Existing hostile-content safety and generic point/line/profile tests pass.
- Focused command: `node --loader ./tests/esmJsLoader.mjs --test tests/hyperlinkFilenames.test.mjs tests/tableSearch.test.mjs tests/featurePopupContent.test.mjs tests/objectTableInspection.test.mjs tests/validationV2Diagnostics.test.mjs tests/validationV2SyntheticGmiFixtures.test.mjs tests/validationV2GmiA8.test.mjs`: **85/85 passed**.
- Broader command: all test files returned by `rg --files tests -g '*.test.mjs'`, using the existing ESM loader: **578/579 passed**. The sole failure is the known unrelated `AppInfo reclaims desktop height only in constrained viewports` source contract. AppInfo was not modified.
- ESLint on all five changed source files: **0 errors**, one existing `react-hooks/incompatible-library` warning at TanStack `useReactTable`. No warning suppression or unrelated source edits.
- Installed Phosphor ESM CopyIcon/CheckIcon exports were verified. Production build (`npm.cmd run build`) failed on the known external `next/font` Google Fonts Roboto fetch. Font configuration was not changed; no successful production build is claimed.
- `git diff --check`: **passed**.
- Detailed output remains in temporary logs rather than terminal payload/diff/test dumps.

## Manual acceptance

Browser acceptance was **not run**: this session exposes no browser tool and has no Playwright installation. DOM callback tests verify clipboard values and propagation but do not replace visual/browser acceptance. Remaining checks:

1. Open table with an observed wrapper value; confirm compact control and raw tooltip.
2. Copy; observe temporary `Kopiert`; paste into Notepad/Explorer and confirm basename only.
3. Verify the row is not selected/zoomed by copying; normal row actions still work.
4. Open the same Leaflet popup; copy the same filename and confirm the popup stays open.
5. Search part of filename; copy from result; clear restores original scoped rows.
6. Use a multi-reference test object; copy every filename independently, including the scrollable table rail.
7. Test denied clipboard permission; confirm local `Ikke kopiert` and usable controls.

No attempt was made to resolve/open a delivered photo folder or a local file.

## Files changed

- `src/lib/hyperlinkFilenames.mjs`: shared pure extractor.
- `src/lib/filenameClipboard.mjs`: shared clipboard action lifecycle and feedback text.
- `src/components/FilenameCopyButton.js`: small React filename action.
- `src/components/LayerDataTable.js`: field-specific raw-plus-copy cell.
- `src/lib/map/featurePopupContent.mjs`: raw-preserving per-reference popup actions.
- `tests/hyperlinkFilenames.test.mjs`: extractor/controller/search/table regressions.
- `tests/featurePopupContent.test.mjs`: DOM popup regressions.
- `docs/agent-reports/20261005-photo-filename-copy.md`: audit and verification report.

## Remaining issues

Known unrelated AppInfo test failure remains. Browser visual/clipboard acceptance is unverified. Multi-wrapper/array support is tested defensively, with no claim of a verified multi-reference delivery schema. Existing GMI semicolon field splitting was not changed; this presentation helper cannot recover references already lost by upstream parsing. Clipboard requires normal browser Clipboard API availability/permission; failures remain local.

## Final repository state

Branch/HEAD remain `feature/photo-filename-copy` / `135dc2a`. No commit/push or forbidden worktree operations. `data/usage/aggregates.json` remains the pre-existing runtime modification and was not opened or changed. Diff check passed; lint/build limits are recorded above.

Observed `git status --short`:

```text
 M data/usage/aggregates.json
 M src/components/LayerDataTable.js
 M src/lib/map/featurePopupContent.mjs
 M tests/featurePopupContent.test.mjs
?? docs/agent-reports/20261005-photo-filename-copy.md
?? src/components/FilenameCopyButton.js
?? src/lib/filenameClipboard.mjs
?? src/lib/hyperlinkFilenames.mjs
?? tests/hyperlinkFilenames.test.mjs
```
