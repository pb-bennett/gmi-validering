# Gemini VA WFS M5: connection and explicit retrieval workflow

Date: 2026-10-28  
Scope: **M5 only** from [the integration plan](20261028-gemini-wfs-integration-planning.md).

## Baseline and architecture check

Before edits: branch `feature/photo-workspace`, HEAD `e5d9b62eb93767b8146124750882ba0a636715dd` (`Add Gemini WFS map reference presentation`), clean worktree. No unrelated changes needed preservation. No branch switching, commits, delegation or sub-agents were used.

Read the planning and M1–M4 implementation reports. Inspected the WMS modal's real form/autocomplete conventions, Home's connection-control/modal ownership, Sidebar/LayerManager/card callback path, current layer naming/types, photo native-dialog lifecycle/focus handling, styling tokens, M3 APIs and M4 presentation/browser harness. M5 fits those contracts without backend, parser, session or map-renderer changes.

The explicit task supersedes the planning report's optional editable endpoint/session buffer refinements: the connection remains fixed, the product buffer remains 100 m, and no preference/configuration persistence is introduced.

## Files changed

| File | Change |
| --- | --- |
| `src/components/gemini-wfs/GeminiConnectionButton.js` | Discoverable Gemini VA entry using existing compact map-control styling and Phosphor Regular icon. |
| `src/components/gemini-wfs/GeminiConnectionModal.js` | Native dialog, survey selector, real credential form, M3 submission, cancellation, safe errors and credential-field cleanup. |
| `src/lib/gemini-wfs/geminiWorkflowUi.mjs` | Pure eligible-source/default-selection helpers and centralized fixed Norwegian error mapping. |
| `src/app/page.js` | Own the optional Gemini modal target; mount entry beside WMS; pass the card callback through Sidebar. |
| `src/components/Sidebar.js` | Pass `onOpenGemini` through to LayerManager. |
| `src/components/LayerManager.js` | Pass the connection callback into the existing result-driven card. |
| `src/components/gemini-wfs/GeminiReferenceCard.js` | Explicit refresh, access/source modal entry, disconnect, and mapped retry errors; existing rendering/visibility/zoom remain. |
| `tests/geminiWorkflowUi.test.mjs` | Six source/error/form/ownership contract tests. |
| `tests/geminiWorkflowBrowser.test.mjs` | Fifteen native-browser workflow cases plus parent. |
| `tests/browser/geminiWorkflowApp.js` | Synthetic real-component app with private generated test credentials, injected proxy responses, gates and privacy audits. |
| `tests/helpers/geminiUiHarness.mjs` | Local Next/SWC/Tailwind browser harness using the established M4 approach and compiler/Chrome helper. |
| `tests/geminiReferencePresentation.test.mjs` | Update M4's pre-M5 no-network card expectation to require explicit refresh/disconnect, while preserving strict no-fetch/no-credential assertions for rendering/presentation state. |
| This report | Scope and validation evidence. |

No M1 proxy/request contract, M2 parser/display adapter, M3 client/session/store, M4 renderer/pane/presentation state, WMS modal/proxy, shared Chrome harness, dependencies, deployment or configuration files changed. Survey/analysis/photo ownership remains unchanged.

## Entry point and modal architecture

Home owns only `geminiDialog` (null or a credential-free source target), similarly to its WMS modal state. The **Gemini VA** button sits beside the existing WMS map control and is available before any Gemini result. It does not depend on a successful result or create a dormant sidebar card. The workspace map becomes available after survey/photo import under the existing Home layout; photo-only workspaces can open the modal and see the no-survey explanation.

The card's **Tilgang** action reopens the same Home-owned modal with that result's source ID. After authentication failure, **Oppgi tilgang** follows the same path. Prop plumbing is Home → Sidebar → LayerManager → GeminiReferenceCard; no credential or modal state is placed in Zustand.

The modal is conditionally mounted and uses native `dialog.showModal()`, matching the photo workflow's background inertness, focus containment and Escape behavior. It labels the dialog from its heading, labels all controls, associates errors with the form, uses alert/status semantics, focuses the source selector for multiple choices or username for a single choice, locks background scrolling, and restores the connected opener on cleanup. Close and Escape cancel current Gemini loading work rather than leave hidden retrieval in progress. Unmount also cancels an operation started by this modal.

The compact 440 px dialog uses existing neutral surfaces/borders, Navy/Text/Muted colours, native compact fields, primary buttons, focus rings and Phosphor Regular icons. It scrolls within 90dvh rather than overflowing a constrained viewport. No global styling system or semantic colour changes were made.

## Source selection

`getGeminiSurveySources` uses existing `getLayerType`, authoritative survey `layers`/`layerOrder`, current IDs and file/display names. Eligible types are GMI/SOSI/KOF with data. FOTO/WMS/reference/unknown domains are excluded. It does not create or normalize a survey.

One source is auto-selected. Multiple sources have a compact selector, retaining a valid initial/current M3 source if available; otherwise the user chooses explicitly. With no source, the action and credential fields are disabled and the form explains that a GMI/SOSI/KOF innmåling must be imported first.

Only an unsubmitted source draft is local to the form. Changing that draft does not fetch or alter M3 ownership. Submission calls M3 `selectSource` and `fetch` for the resolved ID. The component does not calculate BBOX, transform geometry, call the proxy or parse XML. Previous result labels continue to derive from their own provenance, including while a different source is loading.

## Form and credential lifetime

The stable real form is `gemini-va-connection-form`, uses `method="post"`, and handles normal submit events. There is no URL/action exposing the upstream endpoint or any editable connection/CRS/operation setting.

| Field | ID | name | type | autocomplete |
| --- | --- | --- | --- | --- |
| Username | `gemini-va-username` | `username` | `text` | `username` |
| Password | `gemini-va-password` | `password` | `password` | `current-password` |

The fields remain mounted while typing and during errors/loading. Native `FormData` reads current values, including browser autofill that does not dispatch React change events. Username/password are deliberately uncontrolled native values: they are not copied into React state, Home state, Zustand, presentation/session snapshots or configuration. Passwords are never trimmed or normalized. M3 performs its existing credential validation.

On a submission with credential values, the form passes the exact pair to M3 `setCredentials`. That intentionally rotates account generation and clears old-account reference data. If already `connected`, leaving both fields empty reuses M3's private credentials; a partial new pair is rejected rather than silently mixed with old credentials. No credential getter or private-state prepopulation was added. The UI says only that access has been supplied for the session, rather than claiming independent successful authentication.

Inputs are cleared after completed/failed submission and on explicit close, and unmounted on successful closure. In particular, failed passwords are not cached for retries. During an active submission, ordinary current input values remain in the disabled form; this supports normal login-like form observation without adding a long-lived credential copy. The M3 private memory slot remains the only application owner after closure. Disconnect/full M3 reset clear it. Cancelling retrieval alone leaves the session credential slot available for a later explicit attempt.

No app credential storage was added to localStorage, sessionStorage, IndexedDB, cookies, URLs, telemetry, analytics, logs, environment variables or committed configuration. Browser/password-manager remembering remains outside app persistence. Actual saved-password prompts/autofill on the deployed hostname remain browser/user behavior; this pass verifies the normal structural contract, not the browser's saved-password UI.

## First fetch, refresh, reconnect and disconnect

First submit uses a synchronous pending ref plus disabled/busy controls to prevent duplicates, supplies credentials to M3, selects the source and awaits `geminiSession.fetch`. Loading has readable progress text and a spinner; source/credential editing and duplicate submit are disabled. On success, the modal closes and M3/M4 naturally publish/render the complete pair. UI code never inserts a card or builds map features.

If credentials already exist and both input fields are empty, a confirmed form submission uses `fetch` with those credentials. M3 may reuse an already-good matching result according to its existing contract. **Oppdater** on the result card always calls `geminiSession.refresh(result.provenance.sourceLayerId)` and bypasses successful-result reuse. It never calls `setCredentials` or rotates account generation. The previous complete result/provenance and visibility choices remain during loading/failure; success replaces both sides atomically through unchanged M3/M4 behavior.

Authentication failure causes M3 to clear its credential slot. The modal stays usable on a failed first attempt; a retained result card switches from refresh to **Oppgi tilgang**, opening the credential-required form. Corrected values explicitly replace account access and can succeed. Permission failures have distinct wording and are not labelled password failures.

**Tilgang** or the persistent map entry lets users change account or source. New supplied credential values intentionally clear previous-account data. Merely changing the draft source or opening/closing the modal does not do so.

**Koble fra** is a distinct, deliberately labelled action on the card and in an already-configured modal. It calls M3 `disconnect`, clearing credentials, result, selection and generations. The card/reference geometry disappears through M3/M4 subscriptions. Surveys, photos and WMS remain intact. Closing a modal alone is not disconnect. No duplicate clear-result control was added.

There is no upload/viewport/visibility/modal-open/modal-close/periodic automatic fetching. Retrieval, refresh and cancellation remain explicit user actions. The connection is solely the approved M1 identifier; no endpoint/profile editing or shared credentials exist.

## Error mapping and retained results

`getGeminiUiError` is shared by the modal and card. It uses allowlisted codes and fixed Norwegian text, ignoring `error.message`, stacks, provider bodies, raw XML, unknown code text and parser details. It distinguishes authentication, credentials required/invalid, permission, no source/geometry, unsupported CRS, invalid coordinate/projection/BBOX, oversized area, timeout/rate limiting, oversized response, unsupported encoding/MIME, GML/profile failure, display projection, unsupported feature type, cancellation and ended session. Other transport/proxy failures receive a fixed generic retry message.

Area errors may append finite bounded width/height rounded upward to metres, with the 2000 × 2000 m limit; they never crop or tile. Staleness uses the existing M4 notice and a compact modal source-change message. Card errors append that the previous result remains visible, without relabelling old provenance or hiding geometry. Errors never require a new survey/analysis inspector.

## Tests and validation

### Node contracts and regressions

```powershell
node --test tests/geminiWorkflowUi.test.mjs tests/geminiReferencePresentation.test.mjs tests/wfsProxyPolicy.test.mjs tests/wfsProxyHandler.test.mjs tests/geminiGmlParser.test.mjs tests/geminiExtent.test.mjs tests/geminiClient.test.mjs tests/geminiSession.test.mjs tests/geminiStoreLifecycle.test.mjs tests/wmsProxyPolicy.test.mjs tests/mapPaneToolbar.test.mjs tests/mapBackgroundControl.test.mjs tests/layerOrder.test.mjs tests/layerPresentation.test.mjs tests/photoMapFeatures.test.mjs tests/photoWorkspace.test.mjs tests/photoWorkspaceUx.test.mjs tests/photoResetIntegration.test.mjs tests/photoSession.test.mjs tests/featurePopupContent.test.mjs tests/richerUsageTelemetryParserIntegration.test.mjs tests/photoImportLayers.test.mjs
```

**203 passed, 0 failed, 0 skipped** (exit 0): six new M5 Node tests plus 197 regressions. Includes all M1 tests, M2 Node tests, M3 extent/client/session/store lifecycle, M4 pure presentation, WMS policy, map/sidebar controls, survey CRS/import/layers, photo workflow/reset/session and popup safety. Existing Node module-type/unavailable-localStorage harness warnings were left alone. The updated M4 card contract explicitly requires the newly authorized refresh/disconnect behavior while retaining strict isolation assertions for rendering and view state.

### M2–M4 and photo browser regressions

```powershell
@'
delete process.env.PHOTO_GML_FIXTURE;
await import('./tests/geminiGmlBrowser.test.mjs');
await import('./tests/geminiServiceBrowser.test.mjs');
await import('./tests/geminiReferenceBrowser.test.mjs');
await import('./tests/terrainPhotoGml.test.mjs');
'@ | node --input-type=module
```

**56 Node-reported tests passed, 0 failed, 0 skipped** (exit 0), including native M2/M3/M4 acceptance and the photo browser parent with seven internal XML/EXIF/session checks. Uses the documented working module-import invocation and unchanged Chrome harness; optional real-photo corpus was disabled process-locally. M4 still passes representative and 2000-per-side rendering, pane/order, photo pointer usability, zoom, visibility and retained-result/reset behavior.

### New M5 real React/Leaflet browser acceptance

```powershell
$env:GEMINI_WORKFLOW_SCREENSHOT_PATH = Join-Path $env:TEMP 'gmi-gemini-m5-workflow.png'
@'
await import('./tests/geminiWorkflowBrowser.test.mjs');
'@ | node --input-type=module
```

Final result: **16 passed, 0 failed, 0 skipped** (exit 0): fifteen workflow cases plus parent. The real entry, native modal, result card, LayerManager, MapInner, M3 singleton and M2 adapters execute in a synthetic local app with the same component ownership/callback path as Home. Node contract tests independently verify Home's actual wiring. The existing M4 Next/SWC loader and installed Tailwind tooling build the test app; no production test route or global test seam was added. Temporary bundle deletion checks its absolute task-specific Temp containment.

Browser coverage includes:

- Discoverable entry/no dormant card; no source, one auto-selected source and multiple eligible surveys excluding photos.
- Native POST form, stable field IDs/names/types/autocomplete, autofill-style native values without React events, initial focus, native modal semantics, Escape and restored opener.
- Unsafe credential rejection before dispatch, duplicate submit prevention, visible loading, exactly two same-origin proxy requests, successful modal closure and real map/card appearance.
- No requests for open/close, map pan, photo changes or Gemini visibility toggles.
- Refresh using the same credentials/account generation, preserved hidden-line choice, old result during loading/failure, and atomic replacement.
- Simulated 401 credential-required path/corrected retry, explicit account replacement, source draft versus confirmed source change and correct old/new provenance labels.
- Explicit disconnect clearing reference/credentials while preserving surveys/photos/WMS, and later reconnect.
- 403, timeout, generic provider failure, response size, encoding, malformed XML, display projection and authentication errors through real M3/M2 paths. Separate source geometry/CRS/area failures cause no proxy round trip.
- Close during pending retrieval cancels; late injected responses cannot recreate cleared data.
- Unchanged actual WMS form username/current-password autocomplete and independent modal setup.

All credentials are generated privately inside the test browser. The audit retains only credential-match booleans and credential-free request metadata. It verifies exact body forwarding (including password whitespace), fixed relative URL, safe headers, no credentials in M3/presentation/Zustand snapshots, localStorage/sessionStorage/cookies, logs or error text, and no credential inputs after closure. Console auditing suppresses any detected secret rather than printing it. Tests never print generated credential values. IndexedDB is not used by the implementation.

The browser uses injected `/api/gemini-wfs` responses, the empty base map, external-resource CSP restrictions, and a reserved `.invalid` WMS URL without credentials. No Gemini or WMS service was contacted. Reviewed the credential-free 1366×850 screenshot at `%TEMP%\gmi-gemini-m5-workflow.png`: compact dialog, source selection, focus ring, access explanation and card controls fit the existing UI. The screenshot is a temporary synthetic artifact, not committed data.

The final validation selections total **275 passing cases** including browser parents: **22 new M5 tests and 253 regressions**, no failures/skips. Earlier focused 17-test and 15-case browser development selections also passed; their overlapping cases are not added again. The full repository suite was not run.

### Lint, build and scope

```powershell
node node_modules/eslint/bin/eslint.js src/app/page.js src/components/Sidebar.js src/components/LayerManager.js src/lib/gemini-wfs/geminiWorkflowUi.mjs src/components/gemini-wfs/GeminiConnectionButton.js src/components/gemini-wfs/GeminiConnectionModal.js src/components/gemini-wfs/GeminiReferenceCard.js tests/geminiWorkflowUi.test.mjs tests/geminiWorkflowBrowser.test.mjs tests/helpers/geminiUiHarness.mjs tests/browser/geminiWorkflowApp.js tests/geminiReferencePresentation.test.mjs
npm run build
```

Focused ESLint for **every changed/new code/test file**: **exit 0, no errors or warnings**. Independent HEAD/current stdin lint comparisons for Home and Sidebar were also clean. No rule suppression or unrelated lint refactor was introduced.

Build: **exit 0**, Next.js 16.1.6/Turbopack compiled successfully, TypeScript checks completed and all eight static pages generated. Existing API routes, including Gemini/WMS, remain dynamic. Existing outdated Browserslist notice was not addressed with unrelated dependency changes. Build ran after final production edits. `git diff --check` passes with only Git's informational LF-to-CRLF checkout notices.

## Known UX questions and deferred scope

- No M5 implementation blocker remains. Actual password-manager saving/autofill on the deployed origin still merits user/browser acceptance; only structure and autofill-compatible value submission are automated here, as requested.
- The map entry follows existing workspace availability after survey/photo import. Before import, the existing app import screen remains unchanged. Photo-only workspaces can open Gemini and receive the concise required-survey explanation.
- Leaving both credential fields empty while configured reuses the private slot. Submitting filled values intentionally replaces it, even if browser autofill supplies the same values; M3 has no credential getter/hash comparison. Direct card refresh avoids this rotation entirely.
- Close/Escape cancels loading rather than continue a hidden request. The supplied credential slot remains available until disconnect/reset/reload, which is distinct from cancellation.
- Real authenticated service interoperability, hosted-origin password-manager UI and municipal-background cartographic acceptance were not exercised. No claims of live service success are made.
- Gemini popups/attribute inspection/object selection, topology/matching/validation, feature editing/filtering, automatic fetching, configurable buffer, endpoint profiles, COUNT/paging and persistent credentials/results remain unimplemented. No M6+ functionality was added.

**No real credentials or live Gemini WFS calls were used. The app does not persist Gemini credentials or results. No Gemini popup or attribute inspection was implemented. M6 or later functionality was not implemented.**
