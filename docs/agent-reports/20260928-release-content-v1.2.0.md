# GMI Validator 1.2.0 release-content pass

Date: 2026-09-28. Branch: `feature/styling-overhaul-integrated`. Starting HEAD: `dfa0c15` (`Audit release content and versioning`). This pass prepares content and metadata; it does not publish the release.

## Version decision

- Previous app release: `1.1.0`.
- New app release: `1.2.0`, a substantial feature release centered on integrated Validator V2 and the updated workspace, without presenting the whole app as a rewrite.
- `releasedOn: null` remains in the new catalog entry. The date must be set to the actual production publication date.
- `announce: true` makes 1.2.0 the latest announced release. The existing decision logic continues to show **Om** to a first-time visitor and **Nytt** once to a returning visitor who has not acknowledged 1.2.0. The state key, acknowledgement behavior, manual tabs, focus handling, and keyboard navigation were not changed.

## User-facing release themes

1. **Validator V2 for GMI.** FEIL and SJEKK are presented with field and rule detail, plus source and value guidance where available. SJEKK supports review of uncertainty instead of treating every missing or uncertain value as a hard failure. V2 covers selected source-backed GMI checks; it does not claim complete GMI requirement coverage or V2 validation of SOSI/KOF.
2. **Inspect affected objects.** Validator findings can open their exact objects in the diagnostic data table, with the inspected field and useful object context. This includes the post-S12 table refinement without exposing column implementation details as release headlines.
3. **One workspace.** Updated sidebar, map controls, layer and data inspection, height checks, profile analysis, Standards, and 3D presentation work together. The post-S12 map selector and constrained-height profile refinements are included in this broader story.
4. **Supporting presentation.** Stats, sharing/QR, WMS, and AppInfo received improvements or integration. The copy does not claim that all these tools first appeared in 1.2.0.

## AppInfo changes

### Om

Kept the existing structure and voice. Clarified that Validator V2 currently covers selected, source-backed GMI rules; SOSI/KOF remain narrower and are outside V2. Added FEIL/SJEKK, field/rule guidance, and direct object inspection to the capability list. Retained the human-review warning, 2D/3D, data table, and profile capabilities. Updated Stats wording to include coarse-area/unknown fallback and Testmodus. Narrowed Analytics and Contact wording to supported behavior, avoiding a fixed Resend retention duration or an unverified production-configuration assertion.

### Nytt

Replaced the leading 1.1.0 AppInfo and 1.0.0 Stats promotions with two 1.2.0 cards: **Validator V2 for GMI** and **Et oppdatert arbeidsområde**. Both select the 1.2.0 catalog entry. Their compact diagrams are explicitly labeled *Illustrasjon* and do not present themselves as screenshots. Removed the stale illustrative `v1.1.0` label and the older Stats “Ny” illustration.

### Versjonshistorikk

Added the newest-first 1.2.0 entry with a concise title, summary, and four user-facing change themes. It is now the current history entry through `APP_RELEASES[0]`. The existing 1.1.0, 1.0.2, 1.0.1, and 1.0.0 records remain unchanged.

### Fremtiden

Removed the obsolete Validator V2 beta card and its speculative 1.2.0 version number. Kept only the already documented screenshot-attachment idea, framed as a possibility without a date or version promise.

### Kontakt

Changed the surrounding notice to say screenshots cannot currently be attached. The live Contact form, payload, route, and email adapter were not changed.

## README

Updated public capabilities and the short workflow for GMI V2, FEIL/SJEKK, diagnostic object inspection, layer/data table, map/WMS, height and profile tools, Standards, 3D, Stats, and sharing/QR. Clarified that SOSI/KOF have narrower checks and are not part of Validator V2. Replaced the stale architecture statement: active GMI V2 registry/evaluator live under `src/lib/validation-v2/`; `src/data/rules/` is the older JSON rule path. Status now states **v1.2.0 is prepared on this branch**, while the existing public service is available; it does not claim 1.2.0 is live. Kept environment details in development documentation.

## Development/privacy cross-check

`docs/development.md` now distinguishes the active V2 path from legacy JSON rules and has a concise prepublication version/config/hosted-smoke checklist. Existing Supabase/Stats fallback, CARTO key, Contact/Resend, WMS, and Testmodus guidance remains. `docs/privacy.md` needed only one narrow Contact qualification: Resend delivery requires configuration. Om, README, and privacy documentation now consistently describe local raw-file handling, aggregate Stats with municipality-area fallback, coordinate requests, map/WMS providers, analytics, and Contact without claiming verified production environment settings.

## Stats badge decision

The floating Stats trigger has no **Ny** badge; Stats is an established feature. Its existing shared trigger keeps the larger presentation on the upload screen and uses a compact workspace variant after files load, with reduced padding, icon, and gap. The workspace trigger sits 30px above the bottom edge, correcting its crowding of the Leaflet attribution. The first-load attention animation was removed; ordinary hover and keyboard focus remain. Visibility, modal behavior, cyan border, and dark cyan body are unchanged. The mouse-leave border returns to brand cyan.

## Version metadata synchronized

`src/data/appReleases.mjs` is the runtime owner: `CURRENT_APP_RELEASE`, `CURRENT_APP_VERSION`, and `LATEST_ANNOUNCED_RELEASE` resolve to 1.2.0. `package.json` and only the two root project version values in `package-lock.json` are 1.2.0; dependency versions were not changed. README Status and release-parity tests match. Protocol and GMI instruction version numbers were not touched.

## Tests

Focused command: `node --test tests/appReleases.test.mjs tests/appInfoUiContract.test.mjs tests/appInfoState.test.mjs tests/statsUiContract.test.mjs tests/sendContactEmail.test.mjs tests/contactHandler.test.mjs` — **40 passed, 0 failed**. This covers release order/parity/content, automatic first-visit and returning-user announcement semantics, acknowledgement storage, five-tab and focus/keyboard contracts, Stats trigger visibility/cue/badge decision, and Contact form/adapter version sourcing. Contact runtime tests were inspected and passed without changes. `git diff --check` passed; Git emitted line-ending conversion warnings, including for the pre-existing runtime JSON modification.

## Build

`npm.cmd run build` was attempted twice. Both attempts failed when Next.js/Turbopack could not fetch **Roboto from Google Fonts** (`next/font`). No project compilation error was reported before this external-resource failure. The build is **not verified successful** for this pass. Font architecture was not changed.

## Files changed

- Release/version: `src/data/appReleases.mjs`, `package.json`, `package-lock.json`.
- User-facing UI: `src/components/AppInfoModal.js`, `src/app/page.js`, `src/app/globals.css`.
- Documentation: `README.md`, `docs/development.md`, `docs/privacy.md`, this report.
- Tests: `tests/appReleases.test.mjs`, `tests/appInfoUiContract.test.mjs`, `tests/appInfoState.test.mjs`, `tests/statsUiContract.test.mjs`.

The pre-existing modification to `data/usage/aggregates.json` is local runtime data and was not edited, restored, staged, or cleaned in this pass. No logo, favicon, wordmark, or QR logo asset was changed.

## Pending before production

- Final canonical logo refinement, handled separately.
- Actual production release date for `releasedOn`.
- Vercel hosted smoke test of upload, GMI V2 and diagnostic table, workspace/map/3D/profile, AppInfo announcement, Contact, Stats, WMS, and sharing/QR.
- Environment/config parity check for Supabase and fallback, CARTO key and attribution, Resend, WMS access, analytics, and privacy wording.
- Final pre-production audit after the above, including a successful production build once Roboto can be fetched.

## Final repository state

No commit, push, deployment, branch switch, reset, restore, stash, or clean was performed. The working tree contains the release-content edits above and the pre-existing local modification to `data/usage/aggregates.json`.
