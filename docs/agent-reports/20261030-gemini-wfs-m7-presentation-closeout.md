# Gemini WFS M7 shared presentation correction

**Latest status: hosted review of `fbaf556` confirms the shared semantic colours, point symbols and Lagmarkering presentation look good.** This continuation adds the missing shared hover tooltip and changes Gemini marking to default OFF. Those two final changes are implemented and locally validated, with hosted verification pending. Starting HEAD: `fbaf556 Integrate Gemini WFS with shared map presentation`; branch `feature/photo-workspace`; initially clean. No commit, push or deployment. Earlier implementation details and validation below describe the previous correction; see the final continuation section for current results.

Hosted review rejected `7002c71`: pipe foregrounds appeared uniform/dark, normal semantic VA colouring was lost, and Gemini marking was fixed rather than participating in Lagmarkering. The prior closeout below is historical and does not establish visual acceptance.

## Correction and shared contract

- Extracted the existing colour/category functions, dimension-based line widths and point SVG generator from `MapInner.js` to `src/lib/map/semanticPresentation.mjs`. Both survey and Gemini consumers call `getSemanticLineStyle` and `getSemanticPointSymbol`. Survey legend exports remain compatible. The functions and symbols were moved, not reimplemented as Gemini variants.
- `geminiPresentationAdapter.mjs` supplies presentation-only `{ S_FCODE, DIM }` inputs from immutable source records. Canonical codes and unambiguous Norwegian titles map to existing categories (water, wastewater, stormwater, drainage; supported manhole/lid/sluk/sandfang point titles). Numeric provider lookup IDs are never interpreted as survey codes; unknown or ambiguous titles use the existing unknown/default renderer. NETTYPE does not infer a physical point symbol. There is no Gemini colour/symbol table.
- Removed Gemini-specific navy foreground, circle-point and selection style functions. Gemini uses the same semantic colour, dimension scaling, overflow/drainage dashes, SVG symbols, cyan emphasis, point halo, and marker selection-order helper as survey rendering. Existing curated popup binding remains domain-specific.
- `LayerHighlightControls` now accepts a source/settings object and action callbacks. The existing Lagmarkering panel lists Gemini using that exact component and controls, with no new panel. Survey callbacks still target the survey store; Gemini callbacks target only its presentation snapshot. External source reordering is not offered because its reference pane remains below survey geometry.
- Gemini has a session-scoped presentation identity/settings object, default marking enabled and indigo default colour. Colour/strength/width/reset/disable use the existing style normalization and casing/SVG helpers. Colour changes never replace semantic foreground colour. Refresh retains same-owner settings; disconnect/source-owner changes reset them. The source card swatch follows the current marking colour.
- Slider drafts now reconcile external reset/source values during render and commit on the existing release/keyboard/blur events; this removes the old synchronous-effect lint error while retaining the existing controls.

## Architecture and preservation

No Gemini insertion into survey `addLayer()`, validation or analysis. No survey-store, WFS protocol/security, parser, projection, fetch/client or credential/session changes. Presentation snapshots contain only visibility, marking settings and zoom intent. Line/point visibility, zoom, refresh, disconnect, curated popups, local selection and tool suppression remain covered by browser regressions. No photo, matching, topology or comparison work.

## Evidence and validation

- **267 Node tests passed, 0 failed/skipped**, across 22 files: all ten non-browser Gemini suites (including new semantic reuse tests), shared line/halo/panel/order/presentation/hover tests, map pane/background, WFS proxy/policy/MIME and WMS policy.
- **92 Chromium browser tests passed, 0 failed/skipped**, including parents, across all five Gemini browser suites. The new native-control test changes Gemini marking colour/strength/width, disables/restores marking, verifies the popup survives, verifies semantic foreground is unaffected, and confirms dataset/survey identity and request count are unchanged.
- **359 distinct selected tests passed.** Direct extraction comparison against `7002c71` verified identical output for **198 symbol combinations and 10 line-width cases**, plus colour/category parity. No duplicate fixture table was added.
- Focused ESLint passed for all changed/new JS/MJS except the separately audited MapInner baseline: the same **8 existing refs errors and 4 warnings** (three dependency warnings, one unused suppression), no new diagnostics. No unrelated lint debt was repaired.
- `git diff --check` passed. `npm.cmd run build` was attempted twice and failed downloading the existing Roboto CSS from Google Fonts. Direct Node and Windows probes also failed. **Production build is not passed for this correction** and must be rerun when the public font endpoint is reachable; no font configuration was changed or mocked. Browser bundles/tests passed. Full details are in the M7 acceptance report's correction section.

Previously established manual hosted evidence remains **461 lines / 329 points**, alignment, both curated popups, browser autofill and disconnect/reconnect with identical counts. No new hosted semantic colours, point symbols or marking controls are claimed manually accepted. **Redeploy and review those before closing visual acceptance.**

## Files in this correction

`MapInner.js`; `map/semanticPresentation.mjs` (new extraction); `LayerHighlightPanel.js`; `geminiPresentationAdapter.mjs` (new adapter); `geminiReferencePresentation.mjs`; Gemini reference layer/card/inspection components; `geminiSemanticPresentation.test.mjs` (new); existing reference/popup and shared halo/panel/order tests; browser workflow harness; both M7 reports.

## Final hover/default-marking continuation (current)

Starting HEAD: **fbaf556**, initially clean. The user confirmed the hosted shared semantic colours, shared point symbols and existing Lagmarkering integration look good. This hosted review supersedes the previous pending shared-presentation review. Two residual issues were corrected locally; **these changes still await hosted verification**.

- Gemini line/point events now enter the **same map-wide hover controller and tooltip** used by GMI/SOSI. There is no separate tooltip component, formatting table, controller, timer or CSS. The existing 500 ms delay, single-tooltip behavior and movement cancellation are retained. Gemini click popups remain unchanged and take priority over hover.
- The presentation adapter supplies canonical hover fields from immutable source attributes; `getFeatureHoverLabel` formats both data domains. The existing colour helper accepts an optional external presentation source, avoiding survey-store ownership. Hover uses inert text, adds no requests and does not alter survey selection. Leave/removal/replacement/tool suppression clean up pending/visible hover through the shared controller.
- Gemini marking defaults **OFF**. Semantic colours and symbols remain visible. Indigo remains the configurable default colour; manual enablement restores existing halo controls. Same-owner refresh retains the current marking choice/settings, while disconnect/reconnect/new owner reset to off. Survey defaults are unchanged.

Changed production files in this continuation: `MapInner.js` (controller/source-colour wiring), Gemini reference/inspection components, `geminiPresentationAdapter.mjs` (hover fields), `geminiReferencePresentation.mjs` (off default), and shared `featureHoverLabel.mjs` (optional presentation source). Updated existing tooltip, semantic, presentation and browser tests; no new parallel system. WFS/security/parser/client/session, survey store and shared semantic renderer have no changes.

Validation: **269 Node + 94 Chromium browser tests passed (363 distinct selected tests), zero failures/skips**. Final focused hover/popup rerun: **15 passed**, overlapping the 94. Focused lint has zero errors/warnings outside MapInner; MapInner retains exactly its previous **8 errors / 4 warnings**, with no new diagnostics. **Production build passed**, including the final cleanup-adjustment rerun; Google Fonts was reachable this time and no font configuration changed. `git diff --check` passed. Full repository suite not run.

Tests cover both actual-pointer Gemini tooltip types, shared survey hover, unchanged requests/survey selection, click popup after hover, tool suppression, default-off visible semantic geometry, enabled marking controls, refresh and new-session defaults. Previously established real hosted 461-line/329-point and popup/reconnect evidence remains valid. Exact selections and results are in the final section of the M7 acceptance report.

**Next:** redeploy and verify hover plus default-off marking before claiming final hosted acceptance. No commit/push/deployment. No photo, matching, topology or comparison work.

## Historical checkpoint 7002c71 (superseded)

Date: 2026-10-30. Repository: `C:\GitHub\gmi-validering-test`. Branch: `feature/photo-workspace`. Starting checkpoint: `8266e5a`; initially clean. **Requested implementation and validation complete. No commit/push/deployment.**

Gemini WFS now has clear navy lines, white-filled point markers, a reserved indigo source halo (`#4338CA`), hover emphasis and cyan selection tied to its existing curated popups. The source card repeats the halo colour. Geometry stays in the independent Gemini session/reference domain, below survey geometry; no survey insertion or analysis participation was added.

Inspected GMI/SOSI rendering in `MapInner.js` first. Reused its existing line-casing and point-halo-spread helpers. Survey source colours are assigned per layer, not fixed per file format. The Gemini colour sits outside that automatic palette and avoids red/amber/green validation colours. Existing survey palette/functions/rendering are unchanged. Custom survey colours can still be chosen by users, so absolute uniqueness against custom colours is not guaranteed.

### Files changed

| Files | Change |
| --- | --- |
| `src/lib/map/layerHighlight.mjs` | Export reserved Gemini halo; no changes to survey helpers or palette. |
| `src/lib/gemini-wfs/geminiReferencePresentation.mjs` | Primary, halo, hover and selection style functions, using existing casing helpers. |
| `src/components/gemini-wfs/GeminiInspectionSide.js` | Paired SVG foreground/casing layers, wider hit area, local hover/selection with popup cleanup and tool suppression. |
| `GeminiReferenceCard.js`, `GeminiConnectionButton.js`, `GeminiConnectionModal.js` in the same component directory | Shared source swatch and correct Gemini WFS labels; retain independent controls/form identity. |
| `src/lib/gemini-wfs/geminiPopupContent.mjs`, `geminiWorkflowUi.mjs` | Integration provenance/error terminology only; curated fields unchanged. |
| `tests/geminiReferencePresentation.test.mjs`, `geminiReferenceBrowser.test.mjs`, `geminiPopupBrowser.test.mjs`, `geminiPopupContent.test.mjs`, `geminiWorkflowBrowser.test.mjs`, `geminiWorkflowUi.test.mjs` | Halo/helper distinction, selected styles, hover/restore, both pointer popups, source isolation, visibility and terminology expectations. |
| Existing M7 acceptance report and this report | Hosted evidence, implementation, validation and limits. |

Line/point visibility controls still operate independently without fetching, replacing the dataset, duplicating primary features, or changing imported surveys. Zoom, refresh and disconnect remain available. One foreground and one casing path per feature is intentional. Popup ownership clears selection on close/hide/replacement/tool suppression/disconnect; survey selection is untouched.

### Architecture and security preserved

`MapInner.js`, survey store, client/session, parser/projection and WFS proxy/policy have no changes. Fixed upstream/types/WFS 2.0.0/BBOX/100 m buffer/EPSG:25832, GML featureMembers and guarded MIME support, resource limits/no redirects, same-origin API credentials, no incoming cookie/Authorization forwarding, request-local Basic, no app credential persistence, CSRF checks, stale-request handling and atomic pairs are preserved. Genuine references to the separate Gemini VA program remain unchanged; dedicated WFS integration labels are corrected. Internal form IDs remain stable for autofill.

### Acceptance and validation

The user verified hosted protected-preview success on 2026-10-30: browser password-manager/autofill, **461 lines / 329 points**, rendering/alignment of both, both curated real popups, distinct source geometry Z/COVER_Z, disconnect/reconnect and identical counts after reconnect. These are user-supplied manual observations from the main work PC. No real credentials/service requests were needed in this pass.

- **259 Node tests passed** across 21 files: all nine non-browser Gemini suites, WFS proxy/policy/MIME, survey line/hover/halo/panel/order/presentation, map pane/background, WMS policy. Final affected-unit rerun: 27 passed (overlaps the 259).
- **91 Chromium browser tests passed**, including parents, across all five Gemini browser suites. Includes cookie protection, form/session/privacy, real-pointer inspection, local hover/selection, visibility/zoom/refresh/disconnect, tool suppression and cap-sized synthetic rendering.
- **350 distinct selected tests passed, 0 failed/skipped**. Focused ESLint and `git diff --check` passed.
- Production build passed: Next.js 16.1.6, TypeScript and eight generated pages; API routes dynamic. Existing Browserslist-age and Node harness warnings only. Full repository suite not run.
- Local synthetic screenshot reviewed; no pixel-perfect assertions. New selection-switching test explicitly waits for Leaflet popup fade cleanup. Actual line/point targeting has separate pointer tests.

### Remaining checks and stopping point

No manual hosted checks are claimed for new styling, refresh, independent visibility, zoom, or appearance against both Kartverket basemap variants. Functional behavior is automatically covered; hosted visual review follows deployment. These limits are also recorded in [the M7 acceptance report](20261029-gemini-wfs-m7-real-service-acceptance.md#hosted-acceptance-and-presentation-closeout).

No matching, topology, existing-network validation, snapping, photo work or automatic correspondence detection was introduced. Work stops at M7 presentation closeout; photo support can resume when requested.
