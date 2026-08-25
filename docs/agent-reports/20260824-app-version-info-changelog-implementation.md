# Application Version, Information Modal, and Release History

Date: 2026-08-24
Branch: `feature/app-info-version-changelog`
Implementation baseline: `docs/agent-reports/20260824-app-version-info-changelog-plan.md`

## Files changed

- `package.json`
- `package-lock.json`
- `src/data/appReleases.mjs`
- `src/lib/appInfoState.mjs`
- `src/components/AppInfoModal.js`
- `src/app/page.js`
- `tests/appReleases.test.mjs`
- `tests/appInfoState.test.mjs`
- `tests/appInfoUiContract.test.mjs`
- `docs/agent-reports/20260824-app-version-info-changelog-implementation.md`

The approved planning report remains included and was not modified.

## Architecture implemented

- Application version `1.1.0` is derived from the newest entry in the frozen
  `APP_RELEASES` catalog. The catalog contains only the `1.1.0` feature release
  and the `1.0.0` formal production baseline.
- `package.json` and the root `package-lock.json` versions are `1.1.0`; no
  dependencies changed.
- `appInfoState.mjs` owns validation, parsing, automatic popup decisions, and
  best-effort persistence for `gmi-validering:app-info:v1`.
- The existing `gmi-validator-storage` key is checked only for existence during
  first rollout and is not parsed, copied, or modified.
- Modal open, selected tab, and expanded history entry state remain local to the
  page/modal. No Zustand state was added.

## Popup behavior

- A new browser opens `Om` and acknowledges the current announcement.
- A browser with the pre-feature Zustand key opens `Nytt` once for the latest
  announced release and acknowledges it.
- A later announced release opens `Nytt` once.
- An unannounced patch does not force a popup when the latest announcement is
  already acknowledged.
- Manual opening never changes acknowledgement state.
- Malformed state, unavailable storage, throwing storage property access, and
  read/write failures are handled without throwing; persistence is best effort.
- The first-rollout decision effect is declared before the existing
  `updateLastActive()` heartbeat effect.

## UI and accessibility

`AppInfoModal` provides the persistent lower-left `Om appen · v1.1.0` trigger,
four Norwegian tabs (`Om`, `Nytt`, `Versjonshistorikk`, `Kontakt`), the latest
announced release view, and a one-open-at-a-time release history accordion.
The contact tab is placeholder text only.

The modal implements dialog semantics, an accessible close button, Escape and
backdrop close, inside-click isolation, initial focus, focus trapping, focus
restoration, roving tab focus, Left/Right/Home/End tab navigation, tab panels,
and accordion `aria-expanded`/`aria-controls` semantics. The panel is bounded
and vertically scrollable with compact responsive release rows.

## Tests and checks

- `node --test tests/appReleases.test.mjs tests/appInfoState.test.mjs tests/appInfoUiContract.test.mjs`: **12 passed**
- `node --test "tests/*.test.mjs"`: **126 passed**
- `npm.cmd run build`: **passed**
- `git diff --check`: **passed**; Git emitted only LF-to-CRLF normalization warnings
- `npx eslint src/data/appReleases.mjs src/lib/appInfoState.mjs src/components/AppInfoModal.js src/app/page.js tests/appReleases.test.mjs tests/appInfoState.test.mjs tests/appInfoUiContract.test.mjs`: **one existing error** in `page.js` for the unrelated `statisticsCueActive` effect; no errors in the new feature files or feature-specific lines

The build reported the existing outdated `caniuse-lite` notice. No network,
analytics, API, feedback backend, account, database, parser, statistics, or
Validator 2.0 changes were added.

## Manual smoke checklist

- Fresh browser/storage: confirm `Om` opens automatically.
- Close and reload: confirm the automatic popup does not repeat.
- Simulated returning pre-feature user: seed `gmi-validator-storage` only and confirm `Nytt` opens once.
- Reopen manually from the persistent trigger.
- Switch among `Om`, `Nytt`, `Versjonshistorikk`, and `Kontakt`.
- Expand a previous release and confirm only one entry expands at a time.
- Press Escape and confirm close.
- Click the backdrop and confirm close; click inside and confirm it stays open.
- Use Tab and Shift+Tab to confirm focus remains trapped.
- Confirm focus returns to the manual opener, or the persistent trigger after automatic opening.
- Check the nearly full-width small-screen layout and scrolling behavior.
- Load a file and confirm the persistent trigger remains available.

The manual browser checklist was prepared but not executed in this environment.

No commit, push, merge, tag, or deployment was performed.
