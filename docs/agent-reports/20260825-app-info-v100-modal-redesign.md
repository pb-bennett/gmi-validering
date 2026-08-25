# GMI Validator v1.0.0 App Information Correction

Date: 2026-08-25
Branch: `feature/app-info-version-changelog`
Repository: `C:\GitHub\gmi-validering`

## Scope

This is a correction and redesign of the uncommitted application-information,
version, and changelog implementation described in the two 2026-08-24 reports.
Those reports remain historical records and were not rewritten.

The application release model is now:

- `GMI Validator v1.0.0` is the current, announced release.
- `v1.0.0` is the first and only formal release-history entry.
- No earlier `0.x` history is recorded or implied.
- `v1.1.0 — Validator 2.0 Beta` is reserved conceptually only and is not in the
  runtime catalogue.
- Application versioning remains separate from Validator 1.0/2.0 wording and
  from any Git SHA or build identifier.

`package.json`, the root package-lock metadata, and `CURRENT_APP_VERSION` now
all resolve to `1.0.0`.

## Verified Statistics Claims

The `v1.0.0` release notes were written after inspecting the shipped
`src/components/StatsModal.js` implementation. The claims are limited to these
verified features:

- Headline metrics show `summary.totalUploads` and `summary.uniqueKommuner`
  as registered uploads and municipalities with registered activity
  (`StatsModal.js`, the header metric block).
- The time-series view supports daily, weekly, and monthly resolution, and
  count or cumulative values (`RESOLUTIONS`, `VALUE_MODES`, and the chart
  controls).
- The chart supports total and per-municipality modes, with a municipality
  selector, search, select-all/clear-all controls, and optional unresolved
  uploads (`StatsModal.js`, municipality selector and chart controls).
- The municipality view combines a map and ranked distribution using the same
  selected statistics response (`StatsModal.js`, the `Kommuner` section).

No unsupported chart types, metrics, analytical interactions, or Validator 2.0
features were added to the release notes.

## Modal Redesign

`AppInfoModal` now uses a stable shell:

- Desktop height is `min(78dvh, 48rem)` with a substantial minimum height and a
  viewport-safe fallback for short laptop screens.
- Mobile uses nearly the full available viewport without forcing the desktop
  minimum height.
- The header and tab navigation are shrink-resistant shell regions.
- The dialog shell clips overflow; only the `main` tab-panel region owns
  vertical scrolling.
- The tab row remains visible while content scrolls and can scroll horizontally
  on narrow screens.

The visual treatment now uses a restrained slate/blue/cyan treatment consistent
with the application: a branded dark header panel, version badge, stronger
section hierarchy, Phosphor UI icons, selective highlight cards, subtle
separators, and clearer focus states. It deliberately avoids adding animation,
large marketing gradients, or a card around every paragraph.

## Tab Content

### Om

The tab is branded `GMI Validator` and now follows a readable five-section flow:
`Hva er dette?`, `Hvorfor finnes det?`, `Hva er dette ikke?`, `Nysgjerrig eller
bekymret?`, and `Hvem er du?`. The sections use concise placeholders covering
purpose, practical background, decision-support boundaries, project independence,
conservative transparency, and the source-code action.

The copy is intentionally not final product or legal prose. The personal section
contains `[Personlig tekst legges inn her.]` for the user to replace. No absolute
outbound-data/privacy claims were added.

### Nytt

The tab derives its content from `LATEST_ANNOUNCED_RELEASE`, displays the
`v1.0.0` current/new badges and `Ny statistikkvisning` theme, and renders the
four verified statistics highlights above. Secondary content mentions the app
information, formal history, and future launch messages. It does not claim
that Validator 2.0 exists in this release.

### Versjonshistorikk

The history is a newest-first timeline/accordion driven directly by
`APP_RELEASES`. It currently contains exactly one entry, `v1.0.0`, with its
date, current-version marker, summary, and structured change notes. Manual
expansion does not affect announcement acknowledgement state.

### Kontakt

The tab remains an intentional placeholder titled `Tilbakemeldinger`. It
explains that feedback and error-report functionality will come later. The
GitHub source action belongs on `Om`, not `Kontakt`. There is no form, email
address, Resend integration, or new backend/network functionality.

## Announcement Compatibility

`src/lib/appInfoState.mjs` was kept stable because its migration and detection
strategy already matches the required behavior:

- a new browser opens `Om` and claims the current announced `v1.0.0`;
- a pre-feature browser identified only by the existing
  `gmi-validator-storage` key opens `Nytt` for `v1.0.0` once;
- an acknowledged announcement does not repeat;
- a later announced release is handled generically and once;
- an unannounced patch does not force a popup;
- manual opening does not write acknowledgement state;
- malformed or unavailable storage is handled best-effort without throwing.

The dedicated `gmi-validering:app-info:v1` schema remains unchanged and stores
only the existing acknowledgement fields.

## Tests and Checks

- Focused app-info/version tests: **18 passed**
- Full Node suite: **133 passed**
- Relevant statistics UI contracts: included in the full suite and passed
- Focused ESLint on modified JavaScript/ES module/test files: the new app-info
  files pass; one pre-existing error remains at `src/app/page.js:146` for the
  unrelated `statisticsCueActive` state update inside an effect
- `npm.cmd run build`: **passed**
- `git diff --check`: **passed**; Git reported only LF-to-CRLF normalization
  warnings

The build emitted the repository's existing outdated `caniuse-lite` notice.
The repository `npm` lint script was not used because it invokes the outdated
`next lint` command under the current Next.js version; focused ESLint was used
instead.

Manual browser checks for focus traversal, focus restoration, backdrop behavior,
and narrow-screen scrolling remain useful but were not run in this environment.

## Files Changed

- `package.json`
- `package-lock.json`
- `src/app/globals.css`
- `src/app/page.js`
- `src/components/AppInfoModal.js`
- `src/data/appReleases.mjs`
- `src/lib/appInfoState.mjs`
- `tests/appInfoState.test.mjs`
- `tests/appInfoUiContract.test.mjs`
- `tests/appReleases.test.mjs`
- `docs/agent-reports/20260825-app-info-v100-modal-redesign.md`

`src/app/page.js` and `src/lib/appInfoState.mjs` retain their existing
integration/state architecture. No statistics implementation, parser, upload
state, telemetry, API, Resend, account, database, or Validator 2.0 work was
changed.

No commit, push, merge, tag, deployment, or release operation was performed.

## Subsequent Structural Correction

The roadmap content was moved from the bottom of `Om` into a dedicated
`Fremtiden` tab between `Versjonshistorikk` and `Kontakt`. The existing roadmap
wording and shared hero treatment were retained. Released-version data and the
separation between released `v1.0.1`/`v1.0.0` and planned `v1.1.0` remain
unchanged.

## Phosphor and Om Follow-up

- Replaced the unused `lucide-react` dependency with locked
  `@phosphor-icons/react@2.1.10` through npm.
- AppInfo uses verified `InfoIcon`, `GithubLogoIcon`, `ArrowSquareOutIcon`,
  `XIcon`, and rotating `CaretDownIcon` components with regular weight.
- The app-info trigger in `page.js` uses the same Phosphor `InfoIcon`; unrelated
  application icons were not migrated.
- The GitHub action is in `Nysgjerrig eller bekymret?` on `Om`, with visible
  text, safe new-tab attributes, and decorative hidden icons.
- Modal icon-only controls have explicit button labels, and icons paired with
  visible text are marked `aria-hidden`.
