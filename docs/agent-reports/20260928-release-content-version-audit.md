# Release content and version audit — 2026-09-28

Scope: read-only audit of `feature/styling-overhaul-integrated` at `b138e32` (`Document post-S12 refinements`). The branch contains release candidates; this report does not assert that they are deployed. The pre-existing local modification to `data/usage/aggregates.json` is runtime data and was not inspected or changed.

## Current release/version model

| Owner | Current value and role | Consumers / consequence |
| --- | --- | --- |
| `src/data/appReleases.mjs` | First `APP_RELEASES` entry is `1.1.0`; `CURRENT_APP_RELEASE = APP_RELEASES[0]`; `CURRENT_APP_VERSION = CURRENT_APP_RELEASE.version`. This is the runtime source of truth. `LATEST_ANNOUNCED_RELEASE` is the first entry with `announce: true`, currently the same `1.1.0` entry. | AppInfo hero/header and history current badge, upload `Om appen · v…`, product header version accessibility text, contact email body, and the first visit/new announcement decision. Release order and `announce` govern behavior. |
| `src/components/AppInfoModal.js` | `NEWS_HIGHLIGHTS` separately selects `1.1.0` and `1.0.0` by literal version; the old AppInfo illustration literally shows `v1.1.0`. `Fremtiden` literally proposes `v1.2.0` for Validator 2.0 beta. | `Nytt` is **not** generated from `APP_RELEASES.news` or `.highlights`; its two cards and mockups are manually curated. History uses `APP_RELEASES.map` and `.changes`. The `announced`/`Ny` branch of `ReleaseMeta` has no active caller. The roadmap number is a proposal, not the current version. |
| `README.md` | Literal `v1.1.0` in Status. | Public documentation, manually synchronized. |
| `package.json`, `package-lock.json` | Root project version `1.1.0` in manifest and lockfile top level / root package. Package name is `nextjs`. | npm/package metadata; no runtime import of package version was found. It is **not** the visible version's producer, but `tests/appReleases.test.mjs` enforces equality with the catalog. Dependency versions elsewhere in the lockfile are unrelated. |
| Tests | `tests/appReleases.test.mjs` fixes `1.1.0`, the four-entry order, release copy/flags, lack of `1.2.0`, and package parity. `tests/appInfoUiContract.test.mjs` fixes the 1.1.0 highlight, mockup, future 1.2.0/beta text, five tabs and much Om/Kontakt copy. `tests/appInfoState.test.mjs` uses 1.1.0/1.2.0 announcement fixtures. | Updating the release requires deliberate contract updates; `tests/sendContactEmail.test.mjs` uses the imported version dynamically and `tests/contactHandler.test.mjs` checks that import. |

Other version-like strings are separate contracts: Validator's `3.2` instruction/policy source, WMS `1.1.1` / `1.3.0` protocol settings, and the `app-info:v1` storage key do not identify the app release. No active changelog file or separate release config was found; the catalog is the in-app history. The App Router metadata in `src/app/layout.js` supplies title/description, without an app version.

The automatic AppInfo path in `src/app/page.js` passes `LATEST_ANNOUNCED_RELEASE` to `decideAutomaticAppInfo` in `src/lib/appInfoState.mjs`. A new visitor sees Om; a returning visitor with a new announced release sees Nytt. A version bump alone does not announce it if `announce` stays false. The current catalog has dates for `1.0.2` (2026-08-24) and `1.0.1` (2026-08-19), but `releasedOn: null` for `1.1.0` and `1.0.0`; a new release date should reflect actual publication, not branch completion.

**Answer on manual edits:** yes. The catalog entry, package manifest, two root lockfile values, README status, manually selected Nytt cards/illustrations, future version promise, and copy-sensitive tests must be reconciled. The visible runtime number itself changes through the catalog, but other displayed numbers can then disagree.

## AppInfo audit

Owner: `src/components/AppInfoModal.js`, with release records in `src/data/appReleases.mjs`. The five tab names and modal structure remain valid; this audit concerns content and release meaning.

### Om

- **Purpose and sections:** product introduction; “Hva er dette?”, capability list, “Hvorfor finnes det?”, “Hva er dette ikke?”, author/audience sections, and “Nysgjerrig eller bekymret?” covering local processing, external services, statistics, Contact, and source code.
- **Accurate:** multiple files/layers, 2D/3D, data table, profile analysis, local raw-file processing, limited SOSI/KOF support, independent project, and human review of findings. The source/privacy documentation supports the qualified external-data explanation.
- **Stale or incomplete:** “full støtte” for GMI can read as complete rule coverage; active Validator V2 is GMI-only with selected, source-backed checks and nuanced FEIL/SJEKK outcomes. “Validere datafeltene mot kravene i innmålingsinstruksen” needs that scope. The list omits V2's field/result detail, rule source and value guidance, exact diagnostic object inspection, and the overhauled workflow. Privacy copy states statistics only as municipality/date/hour, while unresolved records may use coarser area/unknown; it also still says final Resend configuration confirmation happens “før produksjonssetting”, an operational placeholder to resolve against actual deployment state. The broader privacy text should be checked alongside `docs/privacy.md`, not changed in isolation.
- **Placement:** enduring capabilities and limits belong here; the fact that V2 and the UI are *new* belongs in Nytt and the new history entry. Avoid presenting implementation internals as product promises.

### Nytt

- **Purpose and cards:** two hand-picked feature cards, “Informasjon, nyheter og versjonshistorikk” (`1.1.0`) and “Ny statistikkvisning” (`1.0.0`), each with an illustrative mockup. They accurately describe their historical releases.
- **Stale or missing:** neither card represents this branch's new Validator V2/UI release. The AppInfo illustration still displays `v1.1.0`; the Stats illustration carries a “Ny” label for older work. `APP_RELEASES.news` and `.highlights` are populated but unused here, so editing catalog text alone will not update Nytt. Existing mockups are illustrations, not screenshots of the current workspace.
- **Placement:** lead with a small number of current user themes: GMI validation findings and exact object inspection; refreshed workspace/map/data/profile/3D; supporting Stats, sharing and contact. Move older AppInfo/Stats promotion to history or retain only as clearly historical; do not turn every styling commit into a card. Keep the selected version, illustration labels, and announcement flag coherent.

### Versjonshistorikk

- **Purpose and cards:** newest-first expandable timeline from `APP_RELEASES`, with version/date (when present), current badge, title, summary and `.changes`. The existing `1.1.0`, `1.0.2`, `1.0.1`, `1.0.0` entries describe past AppInfo, profile crash, SOSI display fix and Stats work respectively.
- **Stale or missing:** the branch has no entry for its V2/UI release, so `1.1.0` is still marked current. `1.1.0` and `1.0.0` have no dates. Historical facts should be preserved where accurate; review the `1.0.0` Stats wording only if its provenance proves it misleading. Add one meaningful release record for this production release after the version/date decision, not a list of internal implementation commits.
- **Placement:** permanent release summary and concise feature themes belong here. Detailed current highlights belong in Nytt; plans stay in Fremtiden only when genuinely unshipped.

### Fremtiden

- **Purpose and cards:** “Bedre tilbakemeldinger” with planned Contact screenshot attachment; “Validator 2.0 (beta)” with a hard `v1.2.0` badge and statement that V2 is the next major step.
- **State:** Contact attachment is absent from the current `ContactForm` and remains a possible plan, though “kommer i en senere versjon” in Kontakt is a commitment worth confirming before publication. Validator V2, clearer findings, result detail and field information are already integrated on this branch (`FieldValidationSidebar` mounts `ValidationV2Workspace`); its future card is obsolete. The beta label should reflect the chosen release positioning, if used at all, rather than imply V2 is unshipped. The `v1.2.0` roadmap badge prejudges the app-version decision.
- **Placement:** remove the V2 future card and cover it in Nytt/history. Keep only confirmed user-facing plans without dates/version promises. Deferred inspector group overlays, map markers/zoom, table facets/search/multiselect, raster-to-vector migration and other engineering backlog in reports are not automatically production roadmap commitments.

### Kontakt

- **Purpose and sections:** invitation to report errors/ideas, planned screenshot notice, and live `ContactForm` (category, message, optional name/email, validation/submission/success states). The current invitation matches the app.
- **Stale or missing:** screenshot attachment is still absent, so the notice is factually true, but repeated in Fremtiden and phrased as a release promise. It does not mention new V2-specific feedback, which is optional; users can already report issues generally. Delivery depends on configured Resend sender/recipient/API key; Om/privacy claims need production config review.
- **Placement:** one concise attachment status in Kontakt may help users; any confirmed future commitment belongs in Fremtiden. No separate release note is needed for merely restyling the existing form.

## README audit

`README.md` is a public entry point with a short developer appendix. It has **no embedded screenshots or screenshot links**; there is nothing to replace. Its current basic format list (`.gmi`, `.sos/.sosi`, `.kof`) matches the file input and parser paths. The picker also accepts `.txt` for detection; document that only if intentionally supported as a public format. The warning that non-GMI support is narrower is correct, but the active V2 workspace explicitly says Validator supports only GMI, so “begrenset kontrollgrunnlag” for SOSI/KOF should be made precise and checked against their active fallback behavior. Avoid implying V2 validates all formats or all GMI fields.

The capability list broadly describes 2D/3D, WMS, height checks and profile analysis, but underdescribes the shipped GMI V2 results/field/rule tabs, FEIL/SJEKK review, exact diagnostic object table, map selection and refreshed multi-layer workflow. “En enkel 3D-visning” undersells the current 3D interface; it need not promise an advanced GIS scene. The usage steps jump from upload directly to results and do not orient a first-time reader to Validator, inspecting affected objects, height/profile tools, Standards, WMS, Stats, or sharing/QR. A concise public workflow would cover these without describing component internals. `Testmodus` is developer/diagnostic tooling, so a short link to development docs is enough rather than a prominent public feature claim. The public version literal in Status needs the eventual decision.

The architecture sentence “Valideringsreglene ligger i JSON-filer under `src/data/rules/`” describes the legacy rule path, not active GMI V2: `FieldValidationSidebar` mounts `ValidationV2Workspace`, whose runner/registry are under `src/lib/validation-v2/`. The legacy JSON files still exist. Update the statement or move architecture detail to `docs/development.md`; do not erase the legacy distinction. The Next.js/React/Leaflet/Three.js/Zustand list is broadly accurate. There are no obvious obsolete clone/install/dev/build commands or false Node/browser minimums in the inspected source; published use needs a modern browser with local file access and storage, while local dev is currently stated as Node 20.9+/npm and localhost:3000. Treat those as setup assumptions, not proof of every browser's compatibility.

The README's privacy outline and `docs/privacy.md` broadly match the local raw-file path. For release wording, verify that per-area fallback statistics, Kartverket requests, WMS proxy/provider requests, Vercel Analytics, and Contact are summarized consistently. README currently names Supabase, local fallback, keepalive and Resend variables but omits `NEXT_PUBLIC_CARTO_BASEMAP_KEY`, which the current Stats map needs for CARTO tiles; without it markers remain but the basemap displays a configuration message. `docs/development.md` and `.env.example` already document this key. Supabase is required for **populated remote Stats**, not for running the app at all; a local JSON fallback exists and may be empty. Contact needs `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` for delivery. WMS uses a user-provided URL and the constrained server proxy, not a README environment variable. Keep secret names, setup and Vercel environment parity in development docs; public README should link there and state only operationally meaningful caveats. The README's `Status` claim “Løsningen er i produksjon” describes the existing site, not this unreleased branch.

`docs/development.md` remains the proper home for setup, tests, env names, Stats/Supabase/CARTO, Contact and WMS. It needs the V2/legacy rule-location distinction and a release config checklist when content work is authorized. Its current CARTO, fallback, Testmodus and WMS descriptions are substantially aligned with source. `docs/privacy.md` should be included in the final cross-check for Om/README consistency; no clear V2-specific rewrite is identified. Historical design/agent reports are evidence and should not be promoted to public README content.

## User-facing shipped changes since current release

Baseline: the current `1.1.0` catalog entry was last changed in `d1853fc` on 2026-08-26. There are 89 commits in `d1853fc..b138e32` on this branch, including post-1.1 polish, V2 development, integration and UI work. These are *implemented on the branch*, not a claim of production deployment. Representative history: `d545c5d` (V2 field validation), `ca5e995` (workspace/map toolbar), `659c256` (object inspection), `65516b9` (integration), `bec1e9d`/`8a7a7ed` (list/detail), `50ca7e7` (table), `93d407f` (UI convergence), and `13dc935`–`edf7cae` (post-S12 refinements). The agent reports listed below corroborate scope and constraints.

| User-facing theme for future notes | Evidence and accurate scope |
| --- | --- |
| GMI Validator V2 | Active GMI-only source-backed rules and field guidance; per-field findings, coverage, FEIL/SJEKK and contextual diagnostics; list filters/sort and result/rule detail, with a docked inspector or fallback modal. V2 does not imply full GMI or SOSI/KOF rule parity. The non-`NYTT` missing-field change makes selected absent construction fields SJEKK for review while explicit `NYTT` remains strict; avoid exposing raw field-policy implementation in headline copy. |
| Inspect the affected data | LayerDataTable is a virtualized multi-layer object view; Validator diagnostics can open exact affected objects in a scoped table. The recent table refinement removes a redundant Resultat column, puts the inspected field and context columns in useful order, and fixes blank field-name handling. These are a useful inspection story, not separate release cards for every column change. |
| Explore in one workspace | New product identity/onboarding and consistent UI; refreshed layer manager, sidebars, map chrome and controls. The map/3D selector now sits top-centre. Data explorer, height validation, profile analysis and Standards presentation are aligned with that workspace. Profile analysis now fits normal 1080p/constrained-height displays more comfortably; chart/tooltip/legend behavior was refined. 3D controls and information panels received the same UI treatment. |
| Supporting tools | AppInfo/Contact, Share/QR and WMS dialogs have refreshed presentation. Stats modal/trigger are aligned with the UI; CARTO basemap access needs its public key and attribution, with markers remaining visible without tiles. The Stats trigger is suppressed while object table, docked inspector or profile analysis is open; the recent cyan-border change is visual detail, not a release headline. Existing Stats/AppInfo functionality should not be misrepresented as newly introduced in this release. |

Keep internal palette, icon, z-index, border and column-order commits out of the public note unless they explain a visible improvement. Likewise keep the documented non-NYTT field list, test counts and provider setup in specialist/developer documentation, with only a user-relevant accuracy statement in release copy.

## Versioning options

From visible `1.1.0`, a **patch (`1.1.1`)** would understate the integrated V2 workflow and broad UI change. **Minor (`1.2.0`)** fits a large additive product release without evidence of a deliberately incompatible public contract; it is a candidate, not a decision, and the existing Fremtiden badge must not be treated as authority. **Major (`2.0.0`)** is also a reasonable candidate if the team intentionally positions the app as a new major generation or identifies a breaking user workflow/contract. “Validator 2.0” names a subsystem and does not by itself require app version 2.0.0. Decide release positioning, beta wording and date together before editing any metadata.

## Release-content update plan

### Must

| File / owner and surface | Reason | Change kind |
| --- | --- | --- |
| `src/data/appReleases.mjs` — catalog/current/announcement | Add chosen release as newest entry with accurate title, summary, themes, announcement intent and publication date when known; keep history truthful. The first entry drives the visible version and auto-open decision. | Metadata + behavior-linked |
| `src/components/AppInfoModal.js` — Nytt cards/mockups, history and Fremtiden | Replace current promotion with the new release themes, reconcile hardcoded 1.1.0 illustration/selection, remove already-shipped V2 roadmap card and its speculative 1.2.0 badge. Keep historic entries represented accurately. | Wording + metadata + behavior-linked selection |
| `src/components/AppInfoModal.js` — Om scope/privacy and Kontakt future notice | Qualify GMI/V2 coverage, reflect actual Stats area handling, resolve “final confirmation before production” placeholder, and check duplicate screenshot promise against actual plan/config. | Wording; privacy claims are behavior-linked |
| `package.json`, root version fields in `package-lock.json`, `README.md` Status | Keep npm metadata/test parity and public version in sync with the selected catalog value. | Metadata + wording |
| `tests/appReleases.test.mjs`, `tests/appInfoUiContract.test.mjs`, and affected `tests/appInfoState.test.mjs` fixtures | Existing exact literals/copy and announcement contract will fail or misstate intended behavior after release changes. Update deliberately without weakening navigation/announcement guarantees. | Test contract + behavior-linked |
| `README.md` — capabilities, format/validation scope and architecture | Explain active GMI V2 and inspection workflow accurately; remove the implication that JSON legacy rules own current GMI validation. | Wording |

### Should

| File / owner and surface | Reason | Change kind |
| --- | --- | --- |
| `README.md` — concise usage and docs links | Orient users to Validator findings/object inspection, height/profile/Standards, 3D, WMS, Stats and Share/QR without internal detail. Note public service/config limits where they affect a user. | Wording |
| `docs/development.md` — architecture and release configuration | Distinguish V2 registry from legacy JSON and document final Vercel/Supabase/CARTO/Resend parity and smoke path. README should point here for env details. | Wording + operational metadata |
| `docs/privacy.md` and AppInfo Om/README privacy text | Cross-check Stats area fallback, external requests and Contact/Resend retention statements against deployed configuration before publishing claims. | Wording, behavior-linked verification |
| `src/app/page.js` — upload subtitle and Stats `Ny` badge | Subtitle says GMI only while picker accepts SOSI/KOF; the long-standing Stats badge can mislead during a new release. Review intended emphasis and cue timing. | Wording + behavior-linked badge policy |
| `src/components/AppInfoModal.js` — old Nytt mockup and `ReleaseMeta` unused `announced` branch | Ensure illustration/version labels remain explicitly historical or are retired; decide whether “Ny” is tied to the new announcement. | Wording + metadata |

### Can defer

| File / owner and surface | Reason | Change kind |
| --- | --- | --- |
| `src/components/AppInfoModal.js` — author story and evergreen descriptions | Mostly accurate; only edit after priority scope/privacy and release copy is settled. | Wording |
| `README.md` — detailed local dev commands/technology list | Commands appear current; keep README compact and move deep implementation details to development docs when convenient. | Wording |
| `package.json` — generic package name `nextjs` | Internal metadata polish; unrelated to the displayed app version. | Metadata |
| Historical agent/design reports and deferred feature backlog | Evidence, not live user-facing roadmap; no mass rewrite for this release. | Documentation only |

## Tests/contracts affected

- `tests/appReleases.test.mjs`: exact versions/order/count/current value, first record type/date/title/news/changes/announce, `LATEST_ANNOUNCED_RELEASE`, absence of `1.2.0`, and package/lockfile equality. This is the principal release metadata gate.
- `tests/appInfoUiContract.test.mjs`: exact five tabs, Om feature/privacy sentences, Nytt two-card structure and 1.1.0/1.0.0 selections/mockups, hardcoded illustration, history catalog, V2 future card/1.2.0 promise, Contact planned notice, header/version sourcing and modal behavior. Update content assertions where copy changes; preserve keyboard/focus/navigation contracts.
- `tests/appInfoState.test.mjs`: `1.1.0` acknowledgement and `1.2.0` next-announcement scenarios are fixtures for storage/announcement behavior; distinguish intentionally historical examples from a test that should track the new announced release. `src/lib/appInfoState.mjs` stores the last seen announced version, so announcement choices have user-visible effects.
- `tests/sendContactEmail.test.mjs` dynamically expects `CURRENT_APP_VERSION`; `tests/contactHandler.test.mjs` checks the adapter's use of it. They need review if sourcing or formatting changes, though a catalog-only bump should flow through. UI contracts for Stats/onboarding/map may need review if related badges or entry copy change.
- No tests were found that read `README.md`, `docs/development.md`, `docs/privacy.md` or `.env.example` directly. No tests or build were run for this audit.

## Pending production items

- Final canonical logo refinement is pending separately at home. Keep SVG logo, `BrandWordmark`, colours/spacing and QR mark untouched in this content pass; this is a noted task, not a release blocker beyond that pending work.
- Hosted Vercel smoke test of upload, GMI V2/diagnostic table, map/3D/profile at 1080p, AppInfo announcement/Contact, Stats, WMS and Share/QR on the actual deployment.
- Environment parity and production config review: Supabase and fallback behavior, CARTO public basemap key/attribution, Resend sender/recipient/key, WMS proxy/provider access, analytics and privacy wording. Do not publish unverified operational claims.
- Final pre-production audit after version/copy choice, logo completion and hosted smoke results.

## Files inspected

Runtime/content: `src/data/appReleases.mjs`; `src/components/AppInfoModal.js`, `ProductHeader.js`, `BrandWordmark.js`, `FileUpload.js`, `FieldValidationSidebar.js`, `LayerDataTable.js`, `MapPaneToolbar.js`, `ShareQrModal.js`, `StandardsInfoModal.js`, `StatsModal.js`, `WmsLayerModal.js`, `AuthenticatedWmsLayer.js`; `src/components/validation-v2/ValidationV2Workspace.js`; `src/components/stats/StatsMap.js`; `src/app/page.js`, `layout.js`, `api/stats/route.js`, `api/contact/route.js`; `src/lib/appInfoState.mjs`, `contact/sendContactEmail.mjs`, `validation-v2/index.js`, `validation-v2/validationRunner.js`, `testModeActivation.mjs`; `src/data/rules/` (legacy path presence). Version searches also covered active `src/` and `tests/` to distinguish app, protocol and instruction numbers.

Public/developer material: `README.md`, `docs/development.md`, `docs/privacy.md`, `.env.example`, `package.json`, root records in `package-lock.json`, and `src/app/layout.js` metadata. No README screenshot asset or active standalone changelog was found.

Tests: `tests/appReleases.test.mjs`, `appInfoUiContract.test.mjs`, `appInfoState.test.mjs`, `sendContactEmail.test.mjs`, `contactHandler.test.mjs`; searches of other active tests for version and document readers.

Git/report evidence: `git log` from `d1853fc` to `b138e32`; `docs/agent-reports/20260922-production-validator-v2-integration.md`, `20260923-styling-overhaul-s5a-validator-list.md`, `20260923-styling-overhaul-s5b-validator-detail.md`, `20260923-styling-overhaul-s6-layer-data-table.md`, `20260923-styling-overhaul-s8a-data-height-validation.md`, `20260923-styling-overhaul-s8b-profile-standards.md`, `20260924-styling-overhaul-s10-dialogs-appinfo-sharing.md`, `20260924-styling-overhaul-s11-stats.md`, `20260924-styling-overhaul-s12-final-convergence.md`, and `20260928-post-s12-validator-ui-refinements.md` (including its linked non-`NYTT` policy/audit reports). The integration and S12 reports separate implemented behavior from styling, and the post-S12 report records the later diagnostic/map/Stats/profile refinements.

## Final repository state

Only this requested audit report was created. No source, tests, other docs, logo assets, version metadata or runtime data were changed. `git diff --check` exited 0 (Git emitted only an LF-to-CRLF warning for the pre-existing modified runtime JSON). `git status --short` showed ` M data/usage/aggregates.json` and `?? docs/agent-reports/20260928-release-content-version-audit.md`. No tests/build, commit or push were run.
