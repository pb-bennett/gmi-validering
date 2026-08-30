# Application Version, Information Modal, and Changelog Plan

Date: 2026-08-24
Repository: `C:\GitHub\gmi-validering`
Planning baseline: `main` at `0de1d4d` (`Merge Profile Analysis crash hotfix`)

## 1. Recommendation

Implement this as a small, client-side application feature with three bounded
parts:

1. A static release catalog in the repository is the canonical source for the
   displayed application version and all user-facing release notes.
2. A small pure state helper decides whether to auto-open `Om`, auto-open
   `Nytt`, or remain closed, and reads/writes one dedicated localStorage record.
3. One presentational modal plus one persistent trigger are integrated into the
   existing `Home` page. The feature does not belong in the Zustand application
   store because it is independent of uploaded data and validation state.

The current production application becomes the single historical baseline
`v1.0.0`, dated 2026-08-24. The information/changelog feature should ship as
`v1.1.0` if its scope remains as described. Its actual release date must be
filled in on the day it is released. Do not invent releases before `v1.0.0`.

This is application-level versioning only. Existing validator labels, including
any future `Validator 2.0 (beta)` wording, must not be renamed or used to derive
the application version.

## 2. Repository observations

- `src/app/page.js` is the single client-side application shell. Its start
  screen is the centered `GMI Validering` heading, subtitle, error message, and
  `FileUpload` card at lines 433-486.
- The application already uses Tailwind utilities and a restrained blue,
  white, gray, rounded-card visual language. Existing floating controls use
  white or strong-color buttons with borders, shadows, and compact labels.
- Modal implementations are bespoke. `StatsModal.js` provides the most useful
  current patterns for a fixed backdrop, bounded viewport sizing, internal
  scrolling, backdrop close, and Escape handling. Existing modals do not form a
  complete accessible dialog primitive, so the new modal should implement the
  missing dialog semantics and focus behavior locally rather than introduce a
  new design system or broad modal refactor.
- `package.json` and the root package-lock entry still contain the scaffold
  version `0.1.0`; there is no formal user-facing application-version constant
  today.
- `src/lib/store.js` persists settings, UI state, and `lastActive` under
  `gmi-validator-storage`. It deliberately excludes uploaded file data. The
  `Home` page updates `lastActive` immediately after mount.
- The existing test suite uses Node's built-in test runner. Pure `.mjs` helpers
  and focused source-contract tests are the established low-cost pattern; there
  is no browser/component test harness in the repository.
- `main` and `origin/main` are aligned and the worktree was clean at the start
  of this planning pass. The latest commit is the production hotfix merge noted
  above. There is no existing semantic-version tag series to preserve.

## 3. Version model and release policy

Keep three identities explicit:

| Identity | Example | Source and use |
| --- | --- | --- |
| Application version | `GMI Validering v1.1.0` | Canonical release catalog; displayed in the trigger/modal and used for release history |
| Validator version | `Validator 1.0`, `Validator 2.0 (beta)` | Validation-engine/product wording only; unchanged by this feature |
| Build identity | full deployed commit SHA or build ID | Optional diagnostic value supplied by the build/deployment environment; never determines SemVer or popup behavior |

Use ordinary SemVer for the application:

- `PATCH`: production fixes with no new user-facing capability, for example
  `1.1.1`. Every production patch gets a catalog entry, but normally has
  `announce: false`.
- `MINOR`: backward-compatible user-facing functionality, such as this modal
  and changelog (`1.1.0`). A minor release may set `announce: true` when it is
  noteworthy.
- `MAJOR`: a substantial incompatible or application-level product change.
  Validator engine numbering does not cause an application major bump.

The `announce` flag is an editorial decision, not something inferred from the
SemVer component. This permits an important patch to be announced and a minor
internal change not to be announced if needed.

For the first catalog:

| Version | Date | Suggested title | Announcement |
| --- | --- | --- | --- |
| `1.1.0` | actual release date | `Informasjon og versjonshistorikk` | `true` |
| `1.0.0` | `2026-08-24` | `Første formelle versjon` | `false` |

The `1.0.0` notes should say only that this is the formal production baseline
and that it includes the Profile Analysis stability fix. They should not try to
reconstruct the repository's earlier feature timeline. If Git tags are adopted,
an annotated `v1.0.0` tag for `0de1d4d` would be a separate, explicitly approved
release-management action; it is not required to implement this UI and is not
part of this pass.

## 4. Central release data

Add `src/data/appReleases.mjs` as the canonical product-facing catalog. Use a
plain frozen array, newest first, and derive all secondary values from it:

```js
export const APP_RELEASES = [
  {
    version: '1.1.0',
    releasedOn: 'YYYY-MM-DD',
    title: 'Informasjon og versjonshistorikk',
    summary: 'Det er nå enklere å finne informasjon om appen og hva som er nytt.',
    changes: [
      'Se hva GMI Validering er laget for.',
      'Les siste nytt og bla i tidligere versjoner.',
    ],
    announce: true,
  },
  {
    version: '1.0.0',
    releasedOn: '2026-08-24',
    title: 'Første formelle versjon',
    summary: 'Første formelt versjonerte produksjonsutgave av GMI Validering.',
    changes: [
      'Etablerer dagens produksjonsløsning som versjon 1.0.0.',
      'Inneholder stabilitetsrettelsen for Profilanalyse.',
    ],
    announce: false,
  },
];

export const CURRENT_APP_RELEASE = APP_RELEASES[0];
export const CURRENT_APP_VERSION = CURRENT_APP_RELEASE.version;
export const LATEST_ANNOUNCED_RELEASE =
  APP_RELEASES.find((release) => release.announce) ?? null;
```

The text above is proposed user-facing copy, not a developer changelog. Review
the wording with the product owner during implementation. Store dates as ISO
`YYYY-MM-DD` values and format them for display with Norwegian locale rules,
for example `24. august 2026`. Use the unprefixed version (`1.1.0`) in data and
add `v` only when rendering it.

Do not add a separate hard-coded `currentVersion` field: the first validated
catalog entry is current. The catalog test should require unique valid SemVer
values, valid dates, non-empty titles/summaries/change arrays, strict newest-
first SemVer order, and exactly the intended baseline. A release version is the
stable ID; an additional database ID is unnecessary.

An optional future `buildId` property can be allowed on an entry without a
migration, but it must remain diagnostic metadata. Prefer obtaining the exact
runtime build identity from a trusted deployment environment when that work is
undertaken, because a redeploy can change the build while leaving the app
version unchanged. Popup state must never compare build IDs.

During the `v1.1.0` implementation, change the root `package.json` version and
the matching root package-lock values from `0.1.0` to `1.1.0`. The UI must still
import only `CURRENT_APP_VERSION` from the release catalog. An automated test
must assert that `package.json`, the root lockfile package, and
`CURRENT_APP_VERSION` agree. This makes drift a failing source-level guard while
keeping the catalog as the single UI source of truth.

## 5. Popup and localStorage model

Use a dedicated key, separate from Zustand and unrelated feature cues:

```text
gmi-validering:app-info:v1
```

Value:

```json
{
  "schema": 1,
  "introSeen": true,
  "lastSeenAnnouncement": "1.1.0"
}
```

Do not store timestamps, selected tabs, viewed historical entries, file names,
uploaded-file metadata, validator state, or build IDs. `lastSeenAnnouncement`
may be `null` before any announced release has been acknowledged.

Add a pure helper at `src/lib/appInfoState.mjs` that accepts a Storage-like
object and release metadata. It should own parsing, validation, decision-making,
and best-effort persistence so the component contains no release policy.

### Decision table

| Situation | Automatic result | State written when claimed |
| --- | --- | --- |
| No valid info state and no pre-existing-app signal | Open `Om` | `introSeen: true`; also set `lastSeenAnnouncement` to the current latest announcement so the same release does not force a second popup next visit |
| No valid info state, pre-existing-app signal present, latest announced release exists | Open `Nytt` for that release | `introSeen: true`, `lastSeenAnnouncement: <latest>` |
| Valid state with `introSeen: false` | Open `Om` | Set introduction and current latest announcement as seen |
| Valid state, intro seen, latest announced version differs from `lastSeenAnnouncement` | Open `Nytt` for the latest announced release | Update only `lastSeenAnnouncement` |
| Valid state, intro seen, announcement already seen | Stay closed | No write |
| Current release is a non-announced patch | Compare against the latest entry whose `announce` is true; do not open merely because current app version changed | No write unless another rule applies |
| Manual open, tab change, or opening an old history entry | Open requested view | No release-state write |

Claim/write the state as the automatic modal is opened, rather than waiting for
a close event. This makes “once” deterministic if the page reloads while the
modal is open. Guard the mount effect with an in-memory ref so React development
effect replay cannot claim or open twice.

### First release after feature introduction

The new info key does not exist for either a genuinely new `v1.1.0` visitor or
a returning `v1.0.0` visitor. To meet the different required defaults without
accounts, tracking, or a server, use only the existence of the already deployed
`gmi-validator-storage` key as a one-time bootstrap signal:

- key already existed before the info decision: returning user, show `Nytt`;
- key did not exist: new user, show `Om`.

The check must happen in the first `Home` effect, before the existing
`updateLastActive()` heartbeat can create/update the Zustand key. Keep this
ordering visible and covered by a focused source-contract test. Read only key
existence; do not parse, copy, or place any of its settings/UI values into the
info state.

This bootstrap is necessarily best-effort: a returning user who cleared site
storage, or whose Zustand key was removed after a quota failure, is
indistinguishable from a new user and will safely receive `Om`. After the first
successful write, only the dedicated info record is used.

### Failure behavior

- Missing or malformed JSON, a wrong schema, wrong field types, or an invalid
  version string is treated as absent state. Never throw during rendering.
- Wrap both property access and Storage methods in `try/catch`; browsers can
  expose `localStorage` while denying access.
- If reading or writing fails, make the best in-memory decision and allow the
  modal to work for that page load. Cross-visit “once” behavior cannot be
  guaranteed when the browser refuses persistence; repeated `Om` is the safest
  fallback.
- A write replaces malformed state with the current valid schema when possible.
- Do not remove or migrate the Zustand storage key. It is only a first-rollout
  presence signal.

## 6. UI and interaction design

### Persistent entry point

Render a compact, always-available outlined control from `Home`, outside the
`parsingStatus !== 'done'` branch so it remains usable after a file is loaded.
Place it fixed at the lower left, balancing the existing lower-right
`Statistikk` control and avoiding the loaded-state controls at the upper right.
Suggested visible label:

```text
Om appen · v1.1.0
```

Include a simple information icon with `aria-hidden="true"`; use the full
button label as its accessible name. On narrow screens retain `Om appen` and
the version if space permits, with a minimum 44 px touch target. Use existing
blue/white border, rounded corner, shadow, font, and hover/focus conventions.
Do not add another animated “Ny” cue; announcements are handled by the modal.

### Modal

Suggested heading: `Om GMI Validering`. Use a medium modal rather than the
near-full-screen statistics layout: approximately `min(52rem, calc(100vw -
2rem))`, with `max-height: min(85dvh, 48rem)`. Keep the header and section
navigation fixed within the panel and scroll only the active content.

Use four Norwegian tabs:

1. `Om`
2. `Nytt`
3. `Versjonshistorikk`
4. `Kontakt`

`Versjonshistorikk` is clearer and less technical than using
`Endringslogg` as the primary label. “Endringer” can still label the note list
inside a release.

- **Om:** brief product purpose based on the README: upload, inspect, validate,
  and visualize GMI/SOSI/KOF data for quality control before use in VA systems;
  developed to make review quicker and more consistent for municipalities,
  contractors, and other VA practitioners. Keep this content as normal JSX in
  the modal so it is easy to expand later. Show `GMI Validering v1.1.0` in a
  quiet metadata row.
- **Nytt:** show `LATEST_ANNOUNCED_RELEASE`, including version, formatted date,
  title, summary, and concise bullets. A non-announced current patch must not
  replace the latest announced content. Provide a link/button to
  `Versjonshistorikk`, not an external URL.
- **Versjonshistorikk:** show every catalog entry newest first as compact
  one-open-at-a-time expandable rows. The closed row shows version, date, title,
  summary, and a `Gjeldende versjon` badge where applicable; expansion reveals
  `changes`. An accordion is smaller and more responsive than maintaining a
  desktop-only list/detail pane, and avoids a long wall of fully expanded
  notes. Manual expansion never affects announcement state.
- **Kontakt:** display only a neutral placeholder such as `Mulighet for å sende
  tilbakemeldinger kommer snart. Ingen opplysninger sendes fra denne siden nå.`
  Do not render a form, email field, submit button, mail provider, or disabled
  control that implies data can already be sent.

On mobile, let the tab row scroll horizontally (or wrap cleanly), make the modal
nearly full width with `max-height: 90dvh`, keep the close button visible, and
make the active content the only vertical scroll container. Release rows should
be a single column with the date beneath the version/title when necessary.

### Accessibility

- Modal container: `role="dialog"`, `aria-modal="true"`, and
  `aria-labelledby` pointing to the visible heading.
- Tabs: `role="tablist"`, `role="tab"`, `aria-selected`, roving `tabIndex`,
  associated `role="tabpanel"`, and Left/Right/Home/End keyboard movement.
- Escape closes the modal. Backdrop click may close it, but clicks inside must
  not bubble to the backdrop.
- Move focus into the selected tab or heading on open, trap Tab/Shift+Tab inside
  while open, and restore focus to the element that opened it on close. This
  applies to both automatic and manual opens; if there was no opener, restore
  to the persistent trigger.
- Close button must have `aria-label="Lukk"`; decorative SVGs are hidden from
  assistive technology. Accordion controls use `aria-expanded` and
  `aria-controls`.
- Preserve visible focus rings, adequate contrast, logical heading order, and
  touch-sized controls. No auto-animation is needed.

## 7. Proposed files

### New

- `src/data/appReleases.mjs` — canonical catalog and derived current/latest-
  announced exports.
- `src/lib/appInfoState.mjs` — storage schema validation, first-rollout
  bootstrap, automatic-open decision, and best-effort claim/write functions.
- `src/components/AppInfoModal.js` — presentational tabs, release accordion,
  placeholder contact content, and dialog/focus behavior.
- `tests/appReleases.test.mjs` — catalog validity, order, baseline, and
  package/catalog consistency guard.
- `tests/appInfoState.test.mjs` — pure popup-state/storage cases.
- `tests/appInfoUiContract.test.mjs` — focused integration/source contract for
  the persistent trigger, manual open/reopen wiring, labels, and accessibility
  attributes, matching current repository testing practice.

### Modified during implementation

- `src/app/page.js` — import the catalog/helper/modal, own open/tab state, run
  the info decision before the heartbeat effect, render the persistent trigger
  outside upload/loaded branches, and render the modal. Avoid adding this
  concern to the global Zustand store.
- `package.json` — set application package version to `1.1.0`.
- `package-lock.json` — update only the root package version mirrors generated
  by the package manager; no dependency changes.
- `src/app/globals.css` — only if a few reusable responsive/focus rules are
  clearer than long utility strings. Prefer component-local Tailwind utilities
  and avoid unrelated styling changes.

Do not modify `src/lib/store.js`, validator/parser modules, API routes,
telemetry, statistics, or Validator 2.0 work. A separate `AppInfoTrigger`
component is not warranted unless `page.js` integration becomes materially
noisy.

## 8. Privacy and security boundaries

This feature must add:

- no `fetch`, beacon, analytics event, or other network request;
- no server/API route;
- no Resend or other mail dependency;
- no secrets or environment requirement;
- no accounts, CMS, or database;
- no file, filename, coordinate, validator result, or upload metadata in its
  storage record.

The static catalog is bundled with the application. The only new persistence is
the two non-sensitive acknowledgement fields in localStorage. Existing
application analytics/tracking behavior is outside this feature and must not be
expanded or otherwise changed here.

Release notes are repository-controlled text rendered as React content. Do not
introduce HTML strings or `dangerouslySetInnerHTML`; this avoids an unnecessary
content-injection surface if the catalog is expanded later.

## 9. Focused automated test plan

Use `node:test` and `node:assert/strict` with a small in-memory Storage fake.
No new testing dependency is needed.

| Required behavior | Automated coverage |
| --- | --- |
| First-time user -> `Om` | Missing info state plus absent legacy key returns `{ open: true, tab: 'about' }`; claim stores intro plus current announcement acknowledgement |
| Existing user -> no repeat | Valid state with matching latest announcement returns closed and performs no write |
| Existing user on first v1.1 rollout | Missing info state plus pre-existing `gmi-validator-storage` returns `Nytt`, proving the bootstrap path |
| New announced release -> `Nytt` once | Change latest announced metadata from `1.1.0` to `1.2.0`; first decision opens/claims `Nytt`, second decision remains closed |
| Non-announced patch -> no forced popup | Make current release `1.1.1` with `announce: false` while latest announced remains seen `1.1.0`; expect closed |
| Manual reopening | UI contract verifies the always-rendered trigger invokes the manual `Om` open path independently of auto state, can set open after close, and is outside the parsing-state branches; add a short browser smoke check during implementation |
| History ordering/content | Catalog test verifies strict descending SemVer order, required fields, valid ISO dates, unique versions, `1.1.0` then `1.0.0`, and no invented pre-`1.0.0` entries |
| Malformed/missing storage | Cover invalid JSON, arrays, wrong schema/types, invalid version, throwing `getItem`, throwing `setItem`, and null Storage; all fail without an exception and produce the documented safe fallback |
| App-version consistency | Assert `CURRENT_APP_VERSION === APP_RELEASES[0].version === package.json.version === package-lock root versions` |
| Announcement derivation | Assert `LATEST_ANNOUNCED_RELEASE` is the first newest-to-oldest entry with `announce: true`, not necessarily the current release |
| Privacy boundary | Source contract asserts the feature files contain no `fetch`, form submission, API/mail integration, `dangerouslySetInnerHTML`, or references to upload/file state |
| Accessibility contract | Source contract checks dialog/tab/tabpanel semantics, accessible close label, Escape handling, focus restoration/trap wiring, and accordion `aria-expanded` |

Also run:

1. `node --test tests/appReleases.test.mjs tests/appInfoState.test.mjs tests/appInfoUiContract.test.mjs`
2. `node --test "tests/*.test.mjs"`
3. focused ESLint on new/modified source and test files using `npx eslint ...`
4. `npm.cmd run build`
5. `git diff --check`

The repository's current `npm run lint` script invokes removed `next lint`
behavior under Next.js 16, so use focused ESLint plus the full existing tests
and production build unless that unrelated script is fixed separately.

Manual browser verification remains useful for focus traversal, focus return,
small-screen scrolling, backdrop behavior, and ensuring the lower-left trigger
does not overlap map controls. It supplements rather than replaces the focused
automated tests.

## 10. Implementation sequence

1. Add the release catalog with `v1.1.0` and the sole historical baseline
   `v1.0.0`; enter the actual `v1.1.0` release date and approved Norwegian copy.
2. Add catalog validation/consistency tests, then align `package.json` and the
   root lockfile versions to `1.1.0`. Do not create or rewrite historical
   releases.
3. Implement and fully unit-test the pure popup/localStorage helper, including
   the first-rollout legacy-key bootstrap and storage-failure behavior.
4. Build `AppInfoModal` with the four sections, compact release accordion,
   responsive sizing, and complete keyboard/focus semantics.
5. Integrate the modal and always-visible lower-left trigger in `page.js`.
   Ensure the automatic decision effect is ordered before the existing
   heartbeat's first `updateLastActive()` call.
6. Add the focused UI/source-contract test and perform keyboard/mobile browser
   smoke checks.
7. Run the focused tests, complete suite, focused ESLint, production build, and
   diff checks. Confirm the diff contains no Validator 2.0, API, tracking,
   database, feedback-backend, account, or dependency changes.
8. Hand the reviewed implementation off for the project's normal release
   process. Any commit, tag, merge, push, or deployment remains a separate
   authorized action.

## 11. Acceptance checklist

- The initial screen and loaded application both expose `Om appen · vX.Y.Z`.
- A truly new browser opens `Om` once; a returning pre-feature browser opens
  `Nytt` once for `v1.1.0`.
- An announced later release opens `Nytt` once; an unannounced patch does not.
- Manual opening and all historical notes remain available indefinitely.
- `v1.0.0` is the oldest and only baseline; no artificial history exists.
- Application, validator, and build identities are labeled and handled
  independently.
- Release state is local-only, minimal, corruptible without crashing, and free
  of uploaded-file information.
- The contact area is placeholder text only.
- Displayed version, catalog current version, package version, and lockfile
  mirror cannot drift without a failing test.

## 12. Git status for this planning pass

Before writing this report:

```text
## main...origin/main
```

The worktree was clean and `main` matched `origin/main`. This pass intentionally
adds only `docs/agent-reports/20260824-app-version-info-changelog-plan.md`; no
application code, tests, package metadata, dependencies, commits, tags, pushes,
merges, or deployments were changed.
