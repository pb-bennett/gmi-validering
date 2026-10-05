# Photo filename copy correction

## Scope

Corrective pass on the existing uncommitted implementation. Before editing, verified branch `feature/photo-filename-copy`, HEAD `135dc2a`, and all original photo-copy files (extractor, clipboard lifecycle, React copy button, table integration, popup integration, tests and original report). No work was discarded or overwritten wholesale. No REF_FILES access or operations on runtime data; no reset/restore/stash/clean/switch/commit/push. Single agent.

## Browser-discovered failure

User browser acceptance found that a simple link wrapper works, but a wrapper with newline-separated sign metadata exposes only raw text and no copy control. The popup's working action also used visible `Kopier filnavn` text instead of the compact icon used in the table.

## Root cause

The shared extractor's whole-wrapper regex accepted only `link:"..."` members. The otherwise valid `sign:"NOSEVIE"` member prevented the wrapper from matching, so extraction returned an empty array. Both surfaces consequently had no copy control. This was an extractor grammar limitation, not a clipboard or Data Table search problem.

## Verified link + sign syntax

Browser-observed value supplied by the user:

```text
h:1(link:"Attachments\20251119_154646.jpg"
sign:"NOSEVIE")
```

Expected filename: `20251119_154646.jpg`. The metadata variant is verified by the user's browser observation, not by an ignored production file or an existing tracked GMI fixture. Tests explicitly reproduce it with newline, CRLF/indentation, same-line whitespace and comma separation.

## Extractor correction

`extractHyperlinkFilenames` still validates complete recognizable `h:N(...)` wrappers and permitted separators between wrappers. Members now use a named-key, colon, double-quoted-string grammar instead of requiring every key to be `link`. Names support letters/underscore followed by letters/digits/underscore/hyphen. Only members whose key is exactly `link` (case-insensitive) contribute references. `sign`, `description` and other named metadata are ignored regardless of their value; no hard-coded NOSEVIE suffix and no arbitrary-text scraping.

Incomplete wrappers, unquoted metadata, unrelated trailing text and malformed members still reject the wrapper. Filename derivation, URL handling, array traversal and deduplication remain unchanged. Source values are never modified.

## Preserved supported forms

Existing regression coverage retains simple wrappers, Windows and forward-slash paths, HTTP/HTTPS basenames with query/hash removed, percent-encoded filenames, ordinary unknown paths, arrays/cycles, exact duplicate removal, source order, multiple wrappers and multiple links. Metadata between links does not change filename ordering; metadata-only wrappers produce no filenames. The original tracked GMI URL fixture remains covered.

## Data Table result

No Data Table code or React copy-button code changed in this correction. Its existing memoized `HyperlinkCell` continues to use the same shared extractor; valid link/sign values now return filenames and automatically expose copy icons. Source/UI contracts verify the shared extraction → non-empty filenames → per-filename button condition for simple wrappers, metadata wrappers and malformed inputs. Raw/truncated text, search, row IDs, sorting, virtualization, and click isolation are preserved.

## Popup icon-button refinement

The existing DOM popup remains DOM-built. Visible action text was replaced by a 12px Phosphor regular Copy SVG, using the exact path from installed `@phosphor-icons/react` 2.1.10 (verified against its regular icon definitions). Success switches to the corresponding exact regular Check path and reset returns to Copy. SVGs use `createElementNS`, fixed trusted path constants, `currentColor` and the same 256px viewBox as the React icons. No innerHTML, SVG string injection, React popup rebuild or additional dependency.

Button classes now match the table's compact 20px-high, padded, flex-aligned GMI action. The filename remains visible beside the icon and raw S_HYPERLINK stays unchanged above the derived reference lines. Multiple filenames retain independent buttons.

## Accessibility and clipboard feedback

Buttons remain actual type=button elements, with `Kopier filnavn <filename>` accessible labels and titles, visible GMI focus styling, and aria-hidden/non-focusable SVGs. Local status text still shows `Kopiert` only after a successful basename-only clipboard write and `Ikke kopiert` after failure. Existing shared pending-state protection, 1400ms reset and event propagation isolation remain unchanged. Copy does not invoke row/map/3D/inspection actions. Failure resets the icon to Copy and leaves controls usable.

## Tests

Added extractor regressions for the real newline/sign case, whitespace variants, arbitrary named metadata ignored, multiple links around metadata, metadata-only wrappers and malformed metadata rejection. Updated table control visibility contract and popup DOM test expectations for icon-only controls. Added popup regression covering exact observed value, raw preservation, basename write, event isolation, Copy→Check→Copy transition and local feedback reset. Existing popup success/failure and generic action tests remain.

- Focused command: `node --loader ./tests/esmJsLoader.mjs --test tests/hyperlinkFilenames.test.mjs tests/tableSearch.test.mjs tests/featurePopupContent.test.mjs tests/objectTableInspection.test.mjs tests/validationV2Diagnostics.test.mjs tests/validationV2SyntheticGmiFixtures.test.mjs tests/validationV2GmiA8.test.mjs`: **88/88 passed**.
- Same broader regression set as the original implementation: all files discovered with `rg --files tests -g '*.test.mjs'`, run with the existing ESM loader: **581/582 passed**. Only the known unrelated `AppInfo reclaims desktop height only in constrained viewports` source contract failed. AppInfo was not changed.
- ESLint on both directly changed source files: **passed, 0 warnings/errors**.
- `git diff --check`: **passed** across the current worktree diff.
- Production build was not rerun for this correction. The original pass recorded an external Roboto/Google Fonts fetch failure; font configuration remains unchanged. No successful build is claimed.
- Detailed test/lint logs reside in temporary files; no large payloads or logs were printed.

## Manual acceptance

No browser session was available for this correction; browser acceptance remains pending. Tests exercise pure extraction and actual popup DOM handlers with the repository fake document/mocked clipboard, plus Data Table source contracts. Verify in browser:

1. Observed link/sign row gets a table copy icon and popup derived filename/icon.
2. Copy from either surface yields only `20251119_154646.jpg`.
3. Simple `20251120.OV1.5_20251120_1720_01.jpg` wrapper still works.
4. Popup action is icon-only, temporarily becomes Check and shows Kopiert, then resets.
5. Popup stays open, row actions remain isolated, and multiple references stay separately copyable.

## Files changed

Correction edits only `src/lib/hyperlinkFilenames.mjs`, `src/lib/map/featurePopupContent.mjs`, `tests/hyperlinkFilenames.test.mjs`, `tests/featurePopupContent.test.mjs`, and this new report. The initial implementation's other uncommitted files remain in place unchanged.

## Final repository state

Branch and HEAD remain `feature/photo-filename-copy` / `135dc2a`. No commit or push. Runtime `data/usage/aggregates.json` is pre-existing and was not opened or modified; ignored REF_FILES were not accessed. The initial implementation remains uncommitted, together with this correction.

Observed `git status --short`:

```text
 M data/usage/aggregates.json
 M src/components/LayerDataTable.js
 M src/lib/map/featurePopupContent.mjs
 M tests/featurePopupContent.test.mjs
?? docs/agent-reports/20261005-photo-filename-copy-correction.md
?? docs/agent-reports/20261005-photo-filename-copy.md
?? src/components/FilenameCopyButton.js
?? src/lib/filenameClipboard.mjs
?? src/lib/hyperlinkFilenames.mjs
?? tests/hyperlinkFilenames.test.mjs
```
