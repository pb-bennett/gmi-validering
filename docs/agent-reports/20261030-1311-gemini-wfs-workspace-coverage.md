# Gemini WFS workspace coverage completion

2026-10-30, Europe/Oslo. Repository `C:\GitHub\gmi-validering-test`; branch `feature/photo-workspace`; starting/current HEAD `241e94f`. Initially clean. Implementation, selected validation and reports complete. **Hosted acceptance pending. No commit, push or deployment.** Current model retained; no sub-agents.

## Behavior and ownership

- Removed the connection's innmålingsfil selector and its source-selection helpers. Name/URL/native username/password fields remain, including password-manager autocomplete and native FormData submission. Only `{id,name,url}` is saved; credentials remain private in memory. Empty workspaces can connect and show guidance to load a file or use **Hent for kartutsnitt**.
- Eligibility uses existing `getLayerType`: loaded GMI/SOSI/KOF survey layers with point/line coordinates, including hidden layers. Explicit FOTO/WMS/external/reference types, unknown formats and empty/non-geometric layers are excluded. Real `addLayer()` and `removeLayer()` store operations are covered by integration tests.
- Each survey gets one coverage unit keyed by layer ID, with the existing strict all-points/all-line-vertices CRS transform to EPSG:25832 and fixed outward-rounded **100 m** buffer. Distant jobs have separate BBOXes. Overlap is never replaced by a larger union rectangle.
- The bounded FIFO queue runs at most **2 coverage units**, each an atomic VA_LINE + VA_MPNT pair, hence at most **4 HTTP requests** concurrently. Pending same-unit calls coalesce. Completed ordinary fetches reuse units. An invalid layer cannot prevent other valid layers from completing.
- Units retain survey ID or manual BBOX provenance, bounds/CRS/buffer, complete result/time and safe error. The visible dataset derives from active units and deduplicates by existing parsed key: **connection ID + feature namespace + feature type + provider GML ID**. Geometry, labels and attributes never determine identity. Original immutable source records and corresponding display features are retained. Sidebar counts are unique merged counts.
- Store binding compares layer ownership after changes to the layers map. It inspects geometry only for a newly observed ID. New eligible layers enqueue once; visibility, colour, Lagmarkering, selection, metadata and individual geometry edits do not fetch or hash geometry. Manual refresh handles later geometry changes. Removing a layer cancels its pending work and removes only its unit without fetching; shared objects remain through other units, including manual areas.
- **Hent for kartutsnitt** reads the actual Leaflet viewport at click time through a mounted-map getter. Strict WGS84-to-EPSG:25832 projection samples corners/edges to form the viewport envelope, without survey buffer or integer rounding. Manual keys round the BBOX to metre equivalence to avoid accumulating jitter duplicates; equivalent submissions refresh the same unit. All units use the same bounded queue.
- **Oppdater** processes all active survey and manual units. Survey bounds are recalculated from current geometry; manual areas retain their recorded BBOX. A successful complete pair replaces only its unit. Pending/failed refresh retains old complete data; unrelated successful units remain. Safe errors disclose no raw provider text.
- Disconnect/account/destination changes invalidate queued/running work and clear coverages, results, private credentials and owned hover/popup/selection/confirmation state. Saved non-secret configuration survives. Reconnect discovers current surveys afresh, discards old manual areas and starts with Lagmarkering OFF. Features/BBOXes are never written to browser storage.

## Central limits and rationale

`geminiCoveragePolicy.mjs` defines all thresholds and concurrency. A threshold is exceeded strictly (`>`); its exact boundary is permitted.

| Guard | Either side | Area | Behavior |
| --- | ---: | ---: | --- |
| Manual soft warning | 750 m | 500,000 m² (0.5 km²) | Either condition requires Avbryt / Hent likevel confirmation before requests |
| Manual hard limit | 1,500 m | 2,000,000 m² (2 km²) | Either condition blocks; no override |
| Absolute proxy sanity ceiling | 2,000 m | 4,000,000 m² (4 km²) | Existing server ceiling retained; oversized crafted POST rejected before transport |

Observed M7 survey requests were hundreds of metres across. Soft warning starts above that routine scale; the hard UI cap deliberately leaves headroom below the pre-existing server ceiling. Width/height checks catch long thin queries; area checks constrain dense broad queries. The unchanged **3 MiB per response**, parser feature/coordinate/resource bounds and deadlines still apply independently. No area threshold can predict municipal feature density, so real hosted usage may require tightening or adjusting these conservative initial values. Survey requests retain their existing absolute ceiling and strict 100 m buffer behavior.

## Presentation and security preservation

One Gemini source/card remains, with master checkbox, independent Ledninger/Punkter eyes and deduplicated counts, current connection name, compact coverage count, zoom, Oppdater, Tilgang and Koble fra. Shared semantic line colours/point symbols, compact hover, curated popups and Lagmarkering are unchanged. Adding/removing/refreshing coverage keeps connection/account presentation ownership; reconnect resets defaults. Zoom frames the merged returned dataset. Empty results do not use a coverage-bounds zoom fallback.

Saved configuration remains `{id,name,url}` only. The restricted `.geminisuite.com` HTTPS/default-port/path profile still forbids userinfo/query/fragment. Public-only DNS validation rejects private/mixed answers; HTTPS remains DNS-pinned with verified hostname/TLS SNI, no redirects, no incoming Cookie/Authorization forwarding, and request-local Basic. Same-origin browser credentials/Vercel protection, origin/CSRF policy, fixed GetFeature/types/CRS, strict MIME/GML and deadlines/response bounds remain. Proxy behavior changes only by importing its unchanged absolute BBOX values from the shared policy. No survey-store insertion/schema changes, matching, topology, comparison or photo implementation. `MapInner.js` and its baseline lint debt are untouched.

## Validation

**432 distinct selected tests passed: 330 Node + 102 Chromium, zero failures, cancellations or skips.** Browser counts include five parent tests. Fixtures are invented; no real service requests, credentials or municipal payloads were used/persisted. The first sandboxed Chromium run could not establish its debugging connection; local suites passed outside the sandbox. Obsolete single-file assertions and two test-string encoding mistakes were corrected before the final passing run.

Node selection (28 files, run together with `node --test`):

```text
featureHoverTooltip.test.mjs       featurePopupContent.test.mjs
geminiClient.test.mjs              geminiConnection.test.mjs
geminiCoveragePolicy.test.mjs      geminiExtent.test.mjs
geminiGmlParser.test.mjs           geminiNodeXmlParser.test.mjs
geminiPopupContent.test.mjs        geminiReferencePresentation.test.mjs
geminiSemanticPresentation.test.mjs geminiSession.test.mjs
geminiStoreLifecycle.test.mjs      geminiWorkflowUi.test.mjs
layerHighlightHalo.test.mjs        layerHighlightPanel.test.mjs
layerOrder.test.mjs                layerPresentation.test.mjs
lineStyle.test.mjs                 mapBackgroundControl.test.mjs
photoImportLayers.test.mjs         photoResetIntegration.test.mjs
sosiCanonicalAttributes.test.mjs   wfsConfiguredTransport.test.mjs
wfsMimeCompatibility.test.mjs      wfsProxyHandler.test.mjs
wfsProxyPolicy.test.mjs            wmsProxyPolicy.test.mjs
```

Chromium selection (`node --test --test-concurrency=1`): `geminiGmlBrowser`, `geminiPopupBrowser`, `geminiReferenceBrowser`, `geminiServiceBrowser`, `geminiWorkflowBrowser` (all `.test.mjs`). Covers actual React/Leaflet forms, empty-workspace connection, separate automatic pairs, unique counts, UI-only changes without requests, viewport projection/no buffer/reuse, warning cancellation/confirmation, hard blocking, refresh retention, disconnect/reconnect and pending-confirmation cleanup, password manager/privacy/storage reload, master/subtype presentation, hover/popups and photo interactions. Node tests additionally cover failed coverage isolation, queued removal/cancellation, immutable dedupe and crafted oversized proxy POSTs.

Focused ESLint on every changed/new JS/MJS file: **0 errors, 0 warnings**. Production build: **passed**, Next.js 16.1.6, TypeScript, eight static pages, API routes dynamic. The initial sandboxed build failed downloading existing Roboto; the final build with network access passed without font changes/mocks. Existing Browserslist-age, Node module-type and Node storage-harness warnings only. **`git diff --check` passed.** Full repository suite was not run.

## Remaining hosted checks

After deployment, connect once with overlapping and distant GMI/SOSI/KOF jobs; verify unique counts and alignment, hidden-layer eligibility, new imports/removal, manual ordinary/soft/hard view fetches, partial failure/large-response behavior under real density, all-area refresh retention, browser autofill, current presentation/hover/popups and clean disconnect/reconnect/reload. Confirm thresholds and concurrency suit real service latency and volume. Historical 461-line/329-point observations establish prior single-file service success, not this workspace behavior.

Updated companion reports: [M7 service acceptance](20261029-gemini-wfs-m7-real-service-acceptance.md) and [M7 presentation/connection closeout](20261030-gemini-wfs-m7-presentation-closeout.md).
