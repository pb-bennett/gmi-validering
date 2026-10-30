# Gemini WFS M7 UX and connection integration

## Workspace coverage continuation (current)

Continuation from **`241e94f Add configurable Gemini WFS connections`**, branch `feature/photo-workspace`, initially clean. **Implementation and local validation complete; hosted workspace acceptance pending.** No commit/push/deployment, model change or sub-agents.

The single-file connection selector/ownership model is removed. Connection is workspace-wide and allowed with no surveys; the connected source guides users to load an innmålingsfil or use **Hent for kartutsnitt**. Geometry-bearing GMI/SOSI/KOF survey layers are identified through the existing layer-type abstraction, independently of visibility. FOTO, WMS, explicit external/reference types and empty/non-geometric layers are excluded. Each survey has its own strict EPSG:25832 extent and fixed 100 m buffer. Two coverage units run concurrently at most (four HTTP requests because each unit has one line/point pair); no union/overlap rectangle is fetched.

Coverage units preserve provenance and immutable pair results. One merged source deduplicates using parsed connection/namespace/type/provider GML identity. New loaded layer IDs fetch automatically once; ordinary geometry/presentation/selection changes do not. Layer removal subtracts only its coverage with no WFS request, retaining features shared with other survey/manual areas. **Oppdater** refreshes every active area, recalculates survey extents and retains recorded manual BBOXes; pair success replaces that area atomically, while failure retains its previous good pair and unrelated results.

The manual action reads current Leaflet bounds through a getter, strictly projects the view envelope without adding 100 m, and refreshes/reuses metre-equivalent manual keys. Central warning: **>750 m width/height OR >500,000 m²**; confirm with **Avbryt / Hent likevel**. Hard block: **>1,500 m width/height OR >2,000,000 m²**, with no override. Server ceiling remains **2,000 m per side / 4,000,000 m²**. This leaves conservative headroom under the established 3 MiB and parser/resource limits for queries larger than the observed hundreds-of-metres survey requests. Manual areas/data are session-only and disappear on disconnect/reconnect/reload. Pending confirmation is also discarded. Saved `{id,name,url}` and native password-manager fields remain unchanged.

Approved semantic colours/symbols, compact hover/full curated popups, master checkbox and subtype eyes/counts, zoom and shared Lagmarkering remain. Presentation ownership is now the connection/account session, so adding/removing coverage preserves current choices; reconnect restores Lagmarkering OFF. MapInner, survey/photo store schema, renderer/hover/popup definitions and pinned transport/security checks are unchanged. The proxy only imports the unchanged absolute BBOX constants from the new central policy.

**330 Node tests across 28 files + 102 Chromium tests across all five Gemini browser suites = 432 passed, 0 failed/skipped.** Focused ESLint passed with 0 errors/warnings; production build passed (Next.js 16.1.6, TypeScript, eight static pages); `git diff --check` passed. The existing font download required network access; no font mock/change. Chromium needed unsandboxed local debugging. Existing Browserslist/Node harness warnings only. No unrelated MapInner lint repairs, real-service fixtures, matching/topology/comparison or photo work.

See [the completion report](20261030-1311-gemini-wfs-workspace-coverage.md) for exact test selection, implementation boundaries and remaining hosted checks. Earlier sections below are historical; their single-file ownership and initial presentation/build statements do not describe this continuation.

## Previous configurable-connection continuation

**Latest status: UX and configurable-connection implementation complete; hosted verification pending.** Starting HEAD: `2a0d894 Finish Gemini WFS presentation integration`, branch `feature/photo-workspace`, initially clean. This pass adds compact shared hover vocabulary/natural bounded tooltip width, a source visibility checkbox retaining subtype choices, and persisted non-secret connection settings with a restricted/pinned upstream policy. No commit, push or deployment. Earlier correction/review/build statements below are historical; see **Configured connection and source UX (current)** for the current design/results.

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

## Configured connection and source UX (current)

Starting HEAD: **2a0d894**, branch `feature/photo-workspace`, initially clean. Requested implementation and local validation complete. **Hosted acceptance remains pending.** No commit, push or deployment.

### User-facing changes

- Hover labels for both data domains share compact exact descriptions derived from existing authoritative value tables/status labels: e.g. Polyvinylklorid ? PVC, Kommunal ? K, Drift ? D. Unknown or ambiguous values stay intelligible. Source attributes and full curated popup values are unchanged; semantic line colours/point symbols are not redesigned.
- Shared tooltip width grows naturally up to `min(720px, 85vw, 90cqw)`, stays on one line and uses clipping only at the cap instead of premature ellipsis. An actual browser label wider than the old 260px cap fits untruncated.
- Gemini has the ordinary layer checkbox style at the left of its source card. Master OFF hides both batches and keeps data/session/marking/subtype preferences. ON restores those preferences, including lines-on/points-off. Eyes remain available. If both eyes are off, the checkbox is unchecked; checking it restores both. Refresh retains the current presentation choices. No fetch or survey-store insertion occurs.
- The native connection form adds a name, WFS URL and save action while retaining username/password autocomplete fields. It saves only `{id,name,url}` in `gmi-gemini-wfs-connection-v1` localStorage. Neither username nor password is app-persisted. Settings restore when reopening the dialog after a later visit; unavailable storage permits in-session use with a notice. The configured display name appears on the source card.
- A URL edit receives a new stable local UUID and cancels/clears old requests, credentials and results. Name-only edits retain identity/data. Disconnect retains non-secret configuration. Request identity includes configured ID/URL plus survey/revision/account/BBOX; parser source keys use the configured connection ID. No fixed F?rder URL/identity remains in production runtime code.

### Changed security boundary

The editable field is restricted to **HTTPS, default/443 port, one ASCII tenant label under `.geminisuite.com`, exact `/portal/api/proxy/map/<slug>.wfs`**, with bounded slug characters. Userinfo, fragments, query parameters, whitespace/controls, percent/backslash/path confusion, IP literals, arbitrary hosts and custom domains are rejected. Only fixed VA_LINE/VA_MPNT GetFeature parameters are generated server-side; caller headers are forbidden. Local connection IDs label ownership and grant no authorization.

`wfsPinnedTransport.mjs` reuses the WMS public-address checker for every resolved address and rejects mixed private/public DNS answers. Node HTTPS pins a selected public address through a custom lookup, preserves validated tenant Host/TLS SNI and normal certificate checks, disables pooling and never follows redirects. This avoids validating DNS and then letting generic fetch resolve again. Browser Cookie/Authorization/Vercel cookies are not forwarded; only server-created Basic and fixed Accept are set. Abort/deadline checks prevent a late DNS result opening a socket, and decoded response bytes retain existing bounds. No new dependency or proxy infrastructure is required by the existing Node/Vercel runtime.

The browser's same-origin credential mode, origin/CSRF policy, 100m BBOX buffer, WFS version/types/CRS, parser/resource/featureMembers safeguards, atomic publication, stale-request handling, curated popups and marking-default-OFF lifecycle remain intact. The guarded plain text/html exception now covers admitted configured profile URLs, with the same complete strict GML validation before returning original bytes. Parser grammar is unchanged; only connection identity is parameterized. Historical fixed-endpoint security statements above/below are superseded by this design.

### Validation and remaining work

**290 Node + 97 Chromium browser tests passed: 387 distinct selected tests, zero failures/skips.** Node selection: 24 files spanning all eleven non-browser Gemini suites, new configured-transport tests, WFS policy/handler/MIME, shared tooltip/line/halo/panel/order/presentation/map controls and WMS policy. Browser selection: all five Gemini suites, including actual reload/edit/storage privacy, master isolation/restoration and compact width/full-popup checks. Transport coverage includes the real POST route through mocked DNS/socket dependencies, pin/SNI/header checks, private/mixed DNS, redirects, late abort, malformed status and decoded response cap. No real service, credential or municipal payload was used.

Focused ESLint passed (0 errors/warnings); `MapInner.js` is unchanged and its unrelated baseline was not touched. **Production build passed** (Next.js 16.1.6, TypeScript, eight static pages, dynamic API routes). Existing Browserslist-age and Node harness warnings only. `git diff --check` passed. Full repository suite not run. Production font configuration is unchanged.

Main production files: shared hover formatter/CSS plus new `map/compactDisplayValue.mjs`; Gemini card/layer/presentation and marking visibility adapter; connection modal plus new `geminiConnection.mjs`; client/session/parser identity changes; proxy policy/handler plus new `wfsPinnedTransport.mjs`. Tests share an invented connection fixture and add connection-persistence and configured-transport suites. Survey store, shared semantic renderer and popup field definitions are unchanged.

**Next:** redeploy; save the actual name/URL once; verify normal browser credentials/fetch through the pinned transport, reload/edit, compact hover/full popup values, master/subtype visibility, refresh and reconnect. These changes have no hosted manual acceptance yet. No matching, topology, comparison, validation or photo work was started. See the [full security design and validation record](20261029-gemini-wfs-m7-real-service-acceptance.md#configured-connection-and-source-ux).

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
