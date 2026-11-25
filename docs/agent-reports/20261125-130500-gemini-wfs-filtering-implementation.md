# Batch 2A-WFS: Gemini WFS filtering implementation

**Status: implemented and verified on synthetic data only. Real-service classification is not accepted.**
Branch `feature/photo-workspace`, HEAD `70ca51d`. Follows `20261125-122023-gemini-wfs-filtering-investigation.md`.

## Outcome

Five independently collapsible groups in the existing Gemini WFS card: Status, Anleggstype, Eierskap, Materiale and Dimensjon. Each has values, counts, checkboxes, "Vis alle" and "Skjul alle"; "Nullstill filtre" resets all groups. Filtering uses loaded records only. No session, client, parser, proxy, survey store, Rettinger, FOTO or export code changed.

| File | Change |
| --- | --- |
| `src/lib/gemini-wfs/geminiFilters.mjs` (new) | Field mapping, classification, counts, visible subset |
| `src/lib/gemini-wfs/geminiFilterPreferences.mjs` (new) | Per-service storage |
| `src/lib/gemini-wfs/geminiReferencePresentation.mjs` | Filter state and commands in the existing owner |
| `src/components/gemini-wfs/GeminiFilterGroups.js` (new) | Filter UI |
| `src/components/gemini-wfs/GeminiReferenceCard.js` | Groups, totals and notices |
| `src/components/gemini-wfs/GeminiReferenceLayer.js`, `GeminiInspectionSide.js` | In-place visibility |
| `tests/geminiFilters.test.mjs`, `tests/geminiFilterBrowser.test.mjs`, `tests/browser/geminiFilterApp.js` (new) | Tests |
| `tests/helpers/geminiUiHarness.mjs` | Optional bundle entry; default unchanged |
| `tests/geminiReferencePresentation.test.mjs` | Snapshot key contract extended by three keys; "no source data" assertion added |

## Attribute mapping

| Group | Lines | Points | Evidence |
| --- | --- | --- | --- |
| Status | `STATUS_TITLE`, else `STATUS` | Same | Field names confirmed. Titles `Drift`, `Nedlagt`, `Fjernet` observed by the user in Gemini. WFS text not verified |
| Anleggstype | `FCODE_TITLE`, else `FCODE` | Not filtered | Names confirmed. Titles already drive the line colours accepted in hosted review. `FCODEGROUP` values unverified, so not used |
| Eierskap | `OWNER_TITLE`, else `OWNER` | Same | Names confirmed; two titles observed. Full vocabulary unverified |
| Materiale | `MATERIAL_TITLE`, else `MATERIAL` | Not filtered | Names confirmed; values unverified |
| Dimensjon | `DIM` | Not filtered | Name confirmed; units unverified, so none shown |

`NETTYPE`, `CUST_FUNC` and `RESPONSIBLE` are not used. A value without a title is shown as "Kode X" (raw text for Dimensjon) and is never mapped to a title. Dimensions merge by number ("160.00" and "160"); "0" stays an ordinary value.

## Defaults and missing values

- Operational means a title exactly equal to "Drift" after trimming and case folding. Codes, "I drift" and "Midlertidig ute av drift" do not match.
- Status shows only Drift by default. All other groups show everything. Missing, empty and nil form "Mangler verdi", hidden by default in Status.
- **Recognition is per service, and sticky.** Once any loaded record has one of the three observed titles, the strict default applies to that service from then on, including after reload and reset, so a later extent with only removed infrastructure does not change it.
- Until then, all statuses are shown with a notice that they are not recognised. A first extent containing none of the three titles therefore starts in this fallback.
- With the strict default and no Drift loaded, the card says so, also while collapsed.
- When filters hide anything, the card shows visible of loaded totals and the hidden count, also while collapsed. These totals describe the filter and do not include the master or side toggles.

## Persistence

Key `gmi-gemini-wfs-filters-v1`, per `normalizeGeminiWfsUrl`. Stored: schema version, URL, group base (`default/all/none`), value choices and the status-recognised flag. Not stored: credentials, account data, coordinates, IDs, counts, features or disclosure state. Bounds: 20 services, 200 choices per group, 100 characters per value.

Eierskap choices are stored only when the title equals a category in the repository's authoritative owner table, or is missing. Other owner values stay in the session. Malformed or unknown-schema content falls back to defaults and is replaced only by a user edit. Storage failure keeps filtering in memory and is stated on the card. Accounts using the same service in one browser profile share choices.

## Rendering

Existing Leaflet elements are shown or hidden in place (line, casing and point); only changed objects are repainted. Popups stay open for visible objects and close when their object is hidden. Zoom still covers all loaded geometry.

## Verification: level Expanded

| Check | Result |
| --- | --- |
| New filter Node tests | 14 passed (included in the next row) |
| All non-browser `gemini*` tests plus `layerHighlight*`, `featureHover*`, `semantic*` (`node --test`) | 171 passed, 0 failed, 0 skipped |
| `geminiFilterBrowser`, `geminiReferenceBrowser`, `geminiPopupBrowser`, `geminiWorkflowBrowser` (`node --test --test-concurrency=1`) | 66 passed, 0 failed, 0 skipped |
| `npx --no-install eslint` on affected files | Passed |
| `npm run build` | Passed |
| `git diff --check` | Passed |
| Synthetic 2000/2000, 2000 objects changed | 112-155 ms per toggle (two runs, this PC) |

Screenshots of the expanded card at 1280x720 and 1366x768 were inspected: no clipping or horizontal overflow; the sidebar scrolls. They were written to the session scratchpad, not the repository; regenerate with `GEMINI_FILTER_SCREENSHOT_DIR`. The harness page lacks the app's Roboto setup.

Deliberately omitted: full Node and browser suites, `geminiServiceBrowser`, `geminiGmlBrowser` and WFS proxy suites (no transport, parser or session change). No live request was made. No existing assertion was weakened.

## Remaining risks and manual acceptance

1. Verify real `STATUS_TITLE`, `OWNER_TITLE`, `FCODE_TITLE` and `MATERIAL_TITLE` text on both sides (investigation section 3.5). **If a service uses, for example, "I drift" together with "Nedlagt", live infrastructure is hidden by default**; the card then shows the no-Drift notice and hidden count.
2. If points carry status codes without titles, they are hidden once the service is recognised.
3. Confirm whether missing status is common on real objects.
4. Confirm whether point `FCODE` is a useful Anleggstype; it is not filtered now.
5. Check real data with removed infrastructure, a second area, refresh, reload, reconnect and several areas at once. Very large merged results were not measured beyond 2000/2000.
6. Colour contrast was reviewed visually, not measured.

## Git

Nothing was staged, committed, pushed or deployed. The five pre-existing modified test files and the untracked pre-release audit were left untouched.
