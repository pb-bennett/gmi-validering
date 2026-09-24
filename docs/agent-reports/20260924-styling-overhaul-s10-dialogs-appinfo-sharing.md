# S10 — dialogs, AppInfo/Contact normalisation, sharing

Date: 2026-09-24. Repository: `C:/GitHub/gmi-validering-test`. Branch: `feature/styling-overhaul-integrated`. Starting HEAD: `48c29a3` (`Refresh 3D chrome styling`). Starting `git status --porcelain` was empty. Root, branch, HEAD, and clean state were confirmed before source inspection or editing.

## Ownership and changes

The active S10 owners are `src/components/AppInfoModal.js`, `src/components/ContactForm.js`, `src/components/WmsLayerModal.js`, `src/components/ShareQrModal.js`, and the existing AppInfo geometry selectors in `src/app/globals.css`. `src/app/page.js` mounts one AppInfo instance independently of upload/workspace state and also mounts WMS and Share/QR. Its Om/Kontakt, WMS, and sharing call sites were inspected. No AppInfo CSS geometry edit was needed. The add-file frame was already owned by S3B; field detail, data/Z, standards/profile, and 3D dialogs belong to accepted earlier slices. Stats belongs to S11. No other active general dialog was assigned to S10 by the current roadmap.

Changed files: `src/components/AppInfoModal.js`, `src/components/ContactForm.js`, `src/components/WmsLayerModal.js`, `src/components/ShareQrModal.js`, and `tests/appInfoUiContract.test.mjs`. This report is the sixth changed file.

AppInfo now uses the accepted Ink hero/backdrop; Navy heading and chips; Text, Muted, and Subtle copy; Surface/Soft and Border/Strong Border structure; Brand Cyan decoration; Cyan Soft badges; Interactive light-surface actions and keyboard outlines; and the neutral selected-control recipe for the selected tab. The selected/unselected tab geometry, 2px focus outline and offsets, history disclosure's inset outline, hero, five compositions, cards, timeline, mockups, section rhythm, reading width, frame dimensions, and scroll owner remain as before. The dark source link uses Text-on-dark and Brand Cyan focus to retain contrast on its dark fill.

Retained bounded shades: the inactive `announced` release-badge branch still has its blue pair because no current caller supplies that flag; changing its visual meaning is unnecessary in S10. The Nytt statistics illustration retains its pink promotion and chart series, grid, and label shades because that depiction belongs to S11. Contact error text remains rose. White inverse text, alpha backgrounds, and restrained shadows remain local recipes. Contact's historically cyan success and planned-screenshot notice use Cyan Soft locally; this establishes no general Pass/status rule.

Contact fields now use the accepted compact-field recipe with their original padding, size, order, native elements, rows, resize, labels, help text, and disabled treatment. Labels/help, success surface, new-message action, and submit action use the final semantic roles. Field errors and form failures remain rose. WMS retains its S2 compact fields/actions and now has an Ink backdrop, explicit Border dividers, Interactive focus on removal, and a regular Phosphor `XIcon` close control with an accessible name. Share/QR uses a restrained Surface/Soft/Border frame, neutral selected controls, Interactive link/focus, and a regular Phosphor `XIcon` close control. It retains its large existing viewport-relative frame and QR clearance; AppInfo reading geometry was not propagated to it.

The existing S3A BrandWordmark and approved logo asset were not changed or duplicated. The focused S10 follow-up below now composes the canonical wordmark in the fixed AppInfo modal header and uses the approved G SVG in the existing QR embedded-image mechanism. QR modules, encoded data, size calculation, generated URL/repository content, and module colours remain unchanged.

All changes are presentational. AppInfo's page-owned instance, stacking position, dialog and tab semantics, focus trap, initial focus, Arrow/Home/End navigation, Escape, close button, opener restoration, body scroll lock, stable scrollbar, header/tab shrink, main scroll owner, and no-backdrop-close behaviour were untouched. The first-visit and release/version automatic opening policy, manual tab request, storage keys, `appInfoState.mjs`, and `appReleases.mjs` were untouched. Contact's validation, live regions, focus-first-invalid, success/new-message focus transitions, local name/email persistence, payload, limits, honeypot, endpoint, rate limiting, telemetry/privacy, API route, and mail transport were untouched. WMS URL/credentials, layer fetch/selection, validation, add/remove, storage, map handoff, backdrop close, and dimensions/scroll behaviour were untouched. Share copy and close handlers were untouched.

S11 StatsModal, StatsMap, charts/ranking/timeline, promotion, trigger styling, and data/filter semantics were not edited. The accepted trigger guard in `page.js` still suppresses Stats for bottom LayerDataTable **or** docked Validator inspector **or** lower profile analysis; fallback Validator detail remains independent. S12 cleanup was not begun.

## AppInfo / Contact S10 acceptance checkpoint

Status labels distinguish source/test verification from visual review. No browser visual state is claimed.

| Check | Status and evidence |
| --- | --- |
| AppInfo Om, Nytt, Versjonshistorikk, Fremtiden, Kontakt compositions | Source/test verified: five ordered tabs, five heroes, contents and composition contracts in `appInfoUiContract`; browser visual review pending. |
| Selected/unselected tabs and expanded history disclosure | Source/test verified: neutral selected recipe, `aria-selected`, disclosure `aria-expanded`/`aria-controls` and unchanged toggle; browser visual review pending. |
| Short/constrained and ~390px layouts | Source verified: unchanged `.app-info-dialog` media rules, reading column and scroll owner; browser visual review pending. |
| Tabs/keyboard, focus trap/restoration, Escape | Source/test verified by unchanged handlers and AppInfo UI contract; runtime keyboard review pending. |
| Auto-open versus manual-open | Test verified by `appInfoState`, release, and AppInfo UI contracts; browser review pending. |
| Scrolling/body lock | Source/test verified by unchanged body overflow effect, shrink classes, main overflow, and stable gutter; browser review pending. |
| Contact idle and invalid | Source/test verified: fields, required/optional markers, error IDs, `aria-invalid`, focus-first-invalid and policy tests; browser visual review pending. |
| Contact submitting | Source verified: `aria-busy`, disabled fields/button and `Sender …`; browser visual review pending. |
| Contact success | Source/test verified: success live region, focus transition and new-message action; fake delivery test passed; browser visual review pending. |
| Contact rate-limited | Source/test verified: mapped response message and rate-limit/handler tests; browser visual review pending. |
| Contact unavailable | Source/test verified: mapped response message and fake unavailable delivery test; browser visual review pending. |
| Contact generic/network failure | Source/test verified: mapped failure messages and mocked sender/handler tests; browser visual review pending. |

## Verification and pending review

- `git diff --check`: passed.
- `node --test tests/appInfoUiContract.test.mjs tests/appInfoState.test.mjs tests/appReleases.test.mjs tests/contactHandler.test.mjs tests/contactRequestPolicy.test.mjs tests/contactRateLimit.test.mjs tests/sendContactEmail.test.mjs tests/wmsProxyPolicy.test.mjs tests/statsUiContract.test.mjs tests/mapPaneToolbar.test.mjs tests/validationV2WorkspaceInspector.test.mjs`: 98/98 passed. Contact handler/sender tests inject fake delivery/fetch and example.test addresses; no real email was sent. No existing Share/QR component test was found. Only four styling-specific AppInfo assertions were updated; behavioural assertions were not weakened.
- `npm.cmd run build`: passed, including production compile and page generation. The existing stale Browserslist-data advisory appeared; dependencies were not changed.
- Browser review: pending. The browser runtime attempt failed before navigation with `codex/sandbox-state-meta: missing field sandboxPolicy`. A local Next dev process was already occupying port 3000 and its lock; a second dev instance was not started. No desktop, short-window, mobile, form-state, WMS, QR scan, focus-restoration, or cross-mode visual acceptance is claimed.

Deferred concerns: browser visual and keyboard review of all checkpoint states; WMS advanced/fetch/error/removal states; Share copy/QR scan and constrained-height layout; Om/Kontakt from upload, normal, and Validator modes. Nytt's statistics promotion depiction remains for S11. No QR encoding, focus architecture, storage, API, or Stats change was needed.

Final `git status --short`:

```text
 M src/components/AppInfoModal.js
 M src/components/ContactForm.js
 M src/components/ShareQrModal.js
 M src/components/WmsLayerModal.js
 M tests/appInfoUiContract.test.mjs
?? docs/agent-reports/20260924-styling-overhaul-s10-dialogs-appinfo-sharing.md
```

## Focused visual-review follow-up: canonical identity in AppInfo and QR

The follow-up began from the same `48c29a3` HEAD and exactly the six intentional dirty paths listed below; no S10 work was restored, reset, or discarded. The existing five-tab AppInfo architecture, modal header, dark hero, reading column, scroll owner, focus/keyboard/close handling, and copy remain intact. Contact, WMS, Stats, state and release files were not edited by this follow-up.

**AppInfo identity.** The visual-review correction moved the one existing `BrandWordmark` from the scrolling Om body into the fixed modal header. It replaces the standalone 32px Info icon and plain visible product-title treatment. The identity is shared across all five tabs; Om once again flows directly from its dark hero to “Hva er dette?”. The later sizing refinement uses the contained `appInfo` variant described below. The existing component preserves its original alignment, spacing, and SVG aspect ratio. The version badge stays beside the wordmark, and the AppInfo description is now inline to its right on desktop. A screen-reader-only `h2` preserves the dialog's `aria-labelledby` target without another visible product title. The header stays `shrink-0` above the tab strip, and `main` remains the body scroll owner. No new logo implementation, asset, modal behavior, or body copy was introduced.

**QR centre.** Both App URL and GitHub QR views use the approved `/brand/gmi-validator-logo.svg`, the same canonical G asset used by `BrandWordmark`, in `QRCodeSVG`'s existing `imageSettings`. The former tab-specific embedded illustrations were removed. The image remains centered and square at `Math.round(size * 0.13)` on each side: 39px at the 300px minimum QR and up to 73px at the 560px maximum. `excavate: true` clears QR modules beneath the full image rectangle to white; the SVG's own transparent perimeter supplies clearance between the G artwork and surrounding modules. `level="H"`, `includeMargin`, QR size calculation, module colours, and `value={currentValue}` were preserved. The App URL and repository URL selection, link, tabs, and copy handler are unchanged. The encoded QR content is unchanged. No new or derived brand asset was created.

**Verification.** `git diff --check` passed. `node --test tests/appInfoUiContract.test.mjs tests/appInfoState.test.mjs tests/appReleases.test.mjs` passed 20/20. The repository has no existing Share/QR test or local scan decoder. `npm.cmd run build` passed, including production compile and static page generation; it printed the pre-existing stale Browserslist-data advisory. Browser review of the new AppInfo header remains pending because the in-app browser connection failed at setup with `codex/sandbox-state-meta: missing field sandboxPolicy`; the user has visually accepted the QR centre treatment. QR scan verification is pending; no scan success is claimed. No real Contact email or production external action occurred. No commit or push occurred.

**Placement correction.** The QR centre G was visually accepted and `ShareQrModal.js` was left unchanged by this correction. The AppInfo source contract now checks that its only `BrandWordmark` is in the fixed header and absent from Om content. `git diff --check` passed, and the targeted AppInfo/state/release tests passed 20/20. The first build attempt failed while fetching Roboto from Google Fonts; an immediate retry passed production compilation and page generation. No commit or push occurred.

**Header sizing and layout refinement.** Normal Om paragraph copy uses Tailwind `text-base`, defined as `1rem` (16px). The existing `BrandWordmark` now has a contained `appInfo` variant using one uniform factor of **4/3** from the accepted large S3A composition, so its subtitle meets the 16px body-text minimum. The resulting exact sizes are logo **256/3px (85⅓px)**; title **40px / 48px line-height**; subtitle **16px / 20px line-height**. Each is its large canonical value multiplied by 4/3; the existing large and compact variants are unchanged. The SVG aspect ratio, title/subtitle alignment, and relative spacing remain the canonical component's own.

The fixed header now places the wordmark and its adjacent version badge to the left of the muted 14px AppInfo description with a 32px desktop gap (`lg:gap-8`). Below the `lg` breakpoint, the description falls below the identity with a 12px vertical gap. At mobile widths, top padding places the identity below the unchanged absolute close button and removes the desktop right-side close-button reservation. The title and subtitle can wrap at very narrow widths without reducing font sizes or causing horizontal overflow. Header, tab, and body scroll ownership and modal width rules are unchanged. Om contains no duplicate wordmark. The accepted QR centre G, size, excavation, encoded values, and sharing behavior remain untouched in this refinement.

**Sizing refinement verification.** `git diff --check` passed; `node --test tests/appInfoUiContract.test.mjs tests/appInfoState.test.mjs tests/appReleases.test.mjs` passed 20/20. The first build attempt failed while fetching Roboto from Google Fonts; the immediate retry passed production compilation and static page generation. The final narrow-width wrap adjustment was included in the last rerun recorded at delivery. Browser review of this new header composition remains pending because the in-app browser connection was unavailable in this session. No commit or push occurred.

**Subtitle alignment correction.** The upload composition inherits `text-center` from its onboarding container, while the AppInfo header does not. The enlarged `appInfo` variant selected the large subtitle typography without inheriting that centering, leaving “INNMÅLINGSKONTROLL” off-centre beneath the title. The shared `BrandWordmark` now applies the same `text-center` rule to its text block for `appInfo` only. This derives alignment from the canonical upload mechanism; it adds no pixel offset and does not change the logo, title, subtitle sizes, spacing, header composition, or SVG. The upload `large` and default sidebar variants retain their existing classes and rendering paths. QR remains unchanged. `git diff --check` passed and the targeted AppInfo/state/release tests passed 20/20. The first build attempt failed fetching Roboto from Google Fonts; the immediate retry passed production compilation and page generation. No commit or push occurred.
