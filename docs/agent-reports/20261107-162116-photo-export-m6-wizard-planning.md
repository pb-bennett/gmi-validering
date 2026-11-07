# FOTO export M6 — Dedicated export wizard: planning

Date: 2026-11-07, Europe/Oslo. Branch `feature/photo-workspace`, starting commit `c529073`. **Planning only: no production code or tests changed, nothing committed or pushed.** This report is the only new file.

Norwegian text in `«…»` is proposed UI copy. "Plan" means the frozen export plan built by `buildPhotoExportPlan`, which is what the UI calls the preview. "Hub" means `Fullfør opplysninger…`.

---

## Summary

**Recommendation: replace the export dialog with a two-screen wizard, `Leveranse` then `Pakke`, built on the existing wizard frame.** No exporter changes. In the normal case the user clicks `Eksporter…`, `Neste`, `Last ned ZIP`.

| Screen | Covers | Contents |
|---|---|---|
| **1. Leveranse** | Stages 1–4: format, readiness, warnings, naming | Format and label on the left, live status on the right |
| **2. Pakke** | Stage 5: preview and download | Real filenames, counts, status, download, then import guidance |

**The central design rule: settings and a built plan never appear on the same screen.** The plan is built when the user leaves screen 1, and going back discards it. This removes most preview invalidation, because no control on screen 2 can change what the plan was built from. The old dialog needs an `invalidate()` call on every control to get the same result.

**What shaped the plan** (measured or read from code, §1.4):

- **While EXIF is being read, readiness reports a false blocker.** Two photos still being read show `2 må rettes før eksport`, although nothing needs fixing. The wizard must show waiting instead.
- **A plan built during that read goes stale as soon as it finishes.** So the wizard waits for the read before building.
- **A label cannot be changed on a built plan.** Two Gemini plans differing only in label share none of their UUIDs. The label therefore has to come before the plan.
- **Building a preview is cheap.** The real 148-photo corpus (181 MB) took about 0.5 s to plan and 1.1 s to zip, in Node. The separate `Lag eksportforhåndsvisning` click can go.
- **The default profile is a wiring fix.** `photoExportConfig` already defaults to Gemini, but the dialog ignores it and starts empty.

**Where this departs from the 2026-11-04 plan** (full list in §9):

1. Two screens, not three.
2. The label comes before the plan, not after it. M5 moved naming into the plan, so the old "label edits do not rebuild" design no longer holds.
3. Gemini import tests no longer block M6, as you instructed. They become verification gate V1 (§5.4).
4. Gate G2 (direction omitted) can be retired, because every photo now gets a direction.
5. `PhotoEditCommandBar` and `photoExportFlow.mjs` need no change. The map returns to the hub, and the hub returns to the wizard.

**Not done:** I did not run the browser suites, a production build, the XSD harness or any Gemini import. Viewport sizes in §3.1 are estimates, and the Norwegian wording has not been seen on screen. **Eight decisions are for you (§8)**, each with a recommendation. None blocks starting M6a.

### How this was verified

| Method | Result |
|---|---|
| Code read | Export dialog, plan, package, XML entry point, rules, readiness, diagnostics, naming, contract, config, flow, hub and panels, command bar, tools menu, import wizard, session auto-acceptance, `page.js` handoff code |
| Reports read | 2026-11-04 planning, M2, M3, M4, M5, automatic metadata, final metadata details |
| Baseline tests | 12 export and completion domain files: **243 tests, 241 pass, 0 fail, 2 skip** |
| Throwaway probes | One script in the session scratchpad, using the real plan, readiness and package code with existing test fixtures. Called "probe" below |
| Corpus timing | Real 148 JPEGs and GML, aggregates only, three runs, in Node |

---

## 1. Current architecture and reusable components

### 1.1 Export flow today

```
Verktøy ─ Eksporter… ─ runWorkspaceTool('export') ─ requestWorkspaceAction ─ setPhotoDialog('export')
                                                                                   │
PhotoExportDialog (local: profile '', crs, label, plan, busy, message)             ▼
  photoExportReadiness(photos, config)            synchronous, read-only, ≈2 ms on the corpus
  capturePhotoExportSnapshot → buildPhotoExportPlan   async: names, UUIDs, hashes, errors, warnings
  plan.isLive()                                       compares identities with the session
  buildPhotoExportPackage(plan) → Blob → <a download = plan.naming.zipFilename>
```

**What is decided where:**

| Decision | Owner | Status |
|---|---|---|
| What blocks generation | `evaluatePhotoExportRules`, shared by readiness and plan | Keep |
| Whether the schema is met, and import evidence | `photoExportReadiness`, three levels | Keep |
| UUIDs, timestamp and filenames | Fixed once, in `buildPhotoExportPlan` | Keep |
| Whether a plan is current | `plan.isLive()` | Keep |
| Bytes | `photoExportXml`, `photoExportPackage`, `attachmentNames` | Do not touch |

### 1.2 Reusable components

| Component | Use in the wizard |
|---|---|
| `.photo-collection-dialog`, `-frame`, `-header`, `.photo-import-footer` | Dialog frame, as the hub and both other wizards use |
| `PhotoWizardSteps` | Step indicator, including back navigation |
| `PhotoSourceOption`, `.photo-import-source` | Format cards. It already supports a radio, a hint and a child slot |
| `PhotoExportStatus` | Unchanged. It already gives the warning and the three levels, and it is shared with the hub |
| `photoCompletionStatus`, `photoExportLevels`, `photoCaptureTimeSchemaWarning` | Status text, reused so hub and wizard cannot disagree |
| `groupPhotoExportDiagnostics` | `Tekniske detaljer` |
| `sanitizePhotoExportLabel`, `plan.naming` | Live filename hint, final names |
| `photoExportConfigs` in `page.js` | Holds profile, CRS, context and now label |
| `PhotoCompletionDialog`, `PhotoCompletionContextPanel` | The only place data is edited, including AsBuilt context |
| `ignoreFollowUpClick` | Double-click guard across swaps |
| `PHOTO_EXPORT_PROFILE_METADATA` | Holds card wording. It is already presentation-only |
| `PHOTO_EXPORT_IMPORT_EVIDENCE` | Drives import wording, so V1 changes data rather than UI |

**To retire:** `PhotoExportDialog.js`, `PhotoEvidenceActions.js`, `PhotoManualFillActions.js`, `photoExport.css`.

Removing them orphans no logic. `planEvidenceAdoption` and `planManualPhotoFill` are still used by the session (`photoSession.mjs:753,777`), and the hub covers what remains of those actions. `.photo-export-status` lives in `photoCompletion.css`, so deleting `photoExport.css` does not affect it.

### 1.3 The hub and map handoff

M4 built one trip: hub → map or positioning wizard → hub. `photoExportFlow` holds it, and it ends if the user goes anywhere else. All exits pass through `requestWorkspaceAction`, which owns the Save/Discard boundary. The wizard adds one level above this and changes nothing inside it.

### 1.4 Findings

| # | Finding | Evidence | Effect on the plan |
|---|---|---|---|
| W1 | The dialog ignores the Gemini default and starts with no profile. CRS and label are also local, so they are lost on close | `PhotoExportDialog.js:29-32`; `photoExportConfig.mjs:2` | Wizard reads profile, CRS and label from config |
| W2 | During an EXIF read, Gemini shows `blocked` with `direction-required`, because the default direction waits for the read. The status reads `2 må rettes før eksport` | Probe; `photoAutoMetadata.mjs:31-37` | A separate waiting state that takes priority |
| W3 | A plan built during a read goes stale when the read ends | Probe: `isLive` true, then false | Hold `Neste` until the read is finished |
| W4 | `isLive` checks every layer member, but `evidence-pending` counts placed photos only | `photoExportPlan.mjs:33`; `photoExportReadiness.mjs:105,142` | The wait must look at the whole layer, not readiness alone |
| W5 | The name is frozen in the plan. Two Gemini plans differing only by label share **0 of 5** UUIDs. Legacy XML stays identical | Probe | Label belongs before the plan |
| W6 | The same plan repackaged gives identical bytes | Probe | `Last ned på nytt` is safe, and it is the same delivery |
| W7 | Missing time has two units: 1 `bilde` in readiness, 2 features in the plan, for one repeated photo. `uniqueImages` also includes unplaced assets | Probe; `photoExportPlan.mjs:125` | Main UI uses readiness for time, and `features` and `attachments` for contents |
| W8 | The dialog omits `now`, so a capture time in 2099 is not flagged | Probe; `PhotoExportDialog.js:53` | Wizard passes `now`, as the hub does |
| W9 | The dialog has no `onClose`, which the hub added because a browser can close a dialog without `cancel` | `PhotoCompletionDialog.js:71` | Wizard copies the hub's handling |
| W10 | Old copy contradicts the evidence table: `Gemini-kompatibilitet er ikke verifisert for noen av profilene`, against `profile: 'imported'` | `PhotoExportDialog.js:57`; `photoExportPlan.mjs:111`; `photoExportRules.mjs:29` | Dialog text goes. One plan warning needs a wording change (Q7) |
| W11 | For Gemini, `direction-required` can now only occur during a read, so the normal blocked case is `no-placed-photos` | Inferred from `planAutoDirection` | Blocked is mostly a Legacy and AsBuilt state |
| W12 | `schema-gap` can only arise for Gemini capture time. Legacy and AsBuilt block on the same gap first | Probe; `photoExportRules.mjs:14-23` | The button label can name capture time safely |
| W13 | Preview cost on the corpus: plan about 0.5 s, ZIP about 1.1 s, readiness about 2.3 ms. **Node, not a browser** | Corpus timing | Build automatically on `Neste` |
| W14 | The hub's `entry` means "came back from a trip", which triggers a return note and focus | `PhotoCompletionDialog.js:36,53-57` | Wizard opens the hub with `entry: null` |
| W15 | Hub → map is itself wrapped in `requestWorkspaceAction`, so clearing the return state there would lose the way back | `page.js:260-261,338` | See §4.4 |
| W16 | `Neste` and `Last ned ZIP` share a footer position. On a small layer the plan can finish within a double-click. **Inferred, not reproduced** | M4 found the same class of bug | Use `ignoreFollowUpClick` on `Neste` |

---

## 2. Proposed wizard stages and navigation

### 2.1 Why two screens

| Option | Normal path | Verdict |
|---|---|---|
| One long page | 1 screen, 1–2 clicks | Rejected. This is today's problem. Settings and plan coexist, so invalidation returns |
| **Two screens** | **`Neste`, `Last ned ZIP`** | **Recommended.** Format and status belong together, because changing format changes status instantly |
| Three screens (2026-11-04 plan) | `Neste`, `Neste`, `Last ned ZIP` | Rejected. Screen 1 would hold one preselected radio, and most users would click past it |
| Five screens | Four or more clicks | Rejected. Most would have nothing to do |

| Functional stage | Where |
|---|---|
| 1. Profile and format | Leveranse, left column |
| 2. Readiness and corrections | Leveranse, right column, with `Fullfør opplysninger…` |
| 3. Warnings and compatibility | Leveranse, right column |
| 4. Naming and package settings | Leveranse, left column |
| 5. Preview and download | Pakke |

### 2.2 Navigation

```
Verktøy ─ Eksporter… ──► 1. LEVERANSE ──Neste (builds plan)──► 2. PAKKE ──Last ned ZIP──► Ferdig (same screen)
                            ▲   │  ▲                              │
                            │   │  └────── Tilbake (drops plan) ──┘
                            │   │ Fullfør opplysninger…
                            │   ▼
                   Tilbake til eksport
                            │
                           HUB ◄──── Tilbake til opplysninger ──── MAP or positioning wizard
                            └────── Angi / Plasser på kartet ─────►  (Save/Discard unchanged)
```

Rules:

- **Swap, never stack.** One workspace dialog is open at a time, as M4 established.
- **Every return lands on Leveranse,** with its status recalculated.
- **Two short hops back from the map.** The bar's `Tilbake til opplysninger` goes to the hub, then `Tilbake til eksport` goes to the wizard. This keeps M4's "leaving the map returns to the hub" rule, and the hub shows what was just fixed.
- **No direct wizard-to-map route.** The hub already has it, and a second one would mean a second set of exit paths.

### 2.3 Leveranse states

The state is decided in this order, and the first match wins.

| State | When | Heading | Primary | `Fullfør opplysninger…` |
|---|---|---|---|---|
| `reading` | Any layer member has a pending EXIF read | `«Leser bildedata …»` | `Neste`, disabled | Secondary |
| `blocked` | `readiness.blocking` has items | `«{n} må rettes før eksport»` | `Fullfør opplysninger…` | Is the primary. `Neste` is disabled, with the reason in the footer |
| `schema-gap` | Gemini only, capture time incomplete | `«Kan eksporteres, men følger ikke Skråfoto 2019-skjemaet»` | `«Fortsett uten opptakstid»` | Secondary |
| `recommendations` | Only non-blocking items | `«Kan eksporteres. {n} bør kontrolleres»` | `Neste` | Secondary |
| `ready` | Nothing outstanding | `«Ingen opplysninger mangler for dette målet»` | `Neste` | Secondary |

`Fullfør opplysninger…` is always available, because the user may want to correct a value that is present but wrong.

`reading` is not a new export rule. It only holds the wizard for a moment, and it updates by itself on the next session publish.

### 2.4 Pakke states

| State | Shows | Primary | Secondary |
|---|---|---|---|
| Building | `«Kontrollerer originalfiler …»` | None | `Tilbake` |
| Plan errors (`missing-file`, `file-read-failed`, `attachment-naming`, `projection-failed`, `stale-plan`) | `«{n} må rettes før eksport»`, grouped by diagnostic | None | `Tilbake` |
| Ready | Filenames, contents, status | `«Last ned ZIP»` | `Tilbake` |
| Stale | `role="alert"` message, details hidden | `«Oppdater forhåndsvisning»` | `Tilbake` |
| Packaging | `«Lager ZIP …»` | Disabled | Disabled |
| Packaging failed | Error text | `«Prøv igjen»` | `Tilbake` |
| Done | Import guidance | `«Lukk»` | `«Last ned på nytt»` |

"Done" means the browser was handed the file. The app cannot confirm the file was saved, so the text says «sendt til nedlasting», not «lastet ned».

### 2.5 Leaving and returning

| Action | Result |
|---|---|
| `Avbryt`, ✕ or Escape in the wizard | Closes. Plan discarded, settings kept for the session, focus back to `Verktøy` |
| `Fullfør opplysninger…` | Wizard unmounts, hub opens on the most urgent task |
| `Tilbake til eksport`, ✕ or Escape in a hub opened from the wizard | Back to Leveranse. One rule for every exit, as in M4 |
| Hub → map or positioning wizard | Unchanged. Comes back to the hub, which still shows `Tilbake til eksport` |
| Another tool during that trip | Trip ends and the way back to export ends with it, per M4's rule. Settings stay in config |
| Layer removed, session reset, workspace left | Return state and config cleared |

---

## 3. Recommended layouts and Norwegian wording

### 3.1 Frame and small screens

Use `.photo-collection-dialog` with a narrower variant, because this content does not need 1500 px:

```css
.photo-export-wizard { max-width: 1080px; height: min(94dvh, 760px); }
```

A fixed height avoids the dialog jumping between steps. The body is a two-column grid, `minmax(280px, 340px) minmax(0, 1fr)`, and stacks below about 900 px. Header, steps and footer never scroll. The primary button stays visible at every size.

Browser zoom shrinks the CSS viewport, so 125% zoom on a laptop is a small screen. **These sizes are estimates, allowing for browser chrome and taskbar, and M6e must confirm them.**

| Screen and scaling | Approx. CSS viewport | Expected |
|---|---|---|
| 1920×1080, zoom 125% | 1536×760 | Two columns, common states need no scrolling |
| 1920×1080 laptop at Windows 125%, zoom 100% | 1536×730 | As above |
| Same, zoom 125% | 1229×585 | Two columns, body may scroll |
| 1366×768, zoom 125% | 1093×510 | Two columns, body scrolls, about 330 px of body |
| Under about 900 px wide | | One column, status above format |

Two savings matter at 510 px. The status heading doubles as the focus target, so no separate step heading is needed, which saves about 40 px. The existing `max-height: 750px` compaction also extends to this dialog.

### 3.2 Leveranse

```
┌─ Eksporter bilder ─────────────────────────────────────────────────────── ✕ ┐
│  Torkopp PS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│  1. Leveranse     2. Pakke                                                   │
├─────────────────────────────┬────────────────────────────────────────────────┤
│  Format                     │  Kan eksporteres, men følger ikke              │
│ ┌─────────────────────────┐ │  Skråfoto 2019-skjemaet                        │
│ │(•) Gemini-kompatibel    │ │ ┌────────────────────────────────────────────┐ │
│ │    Skråfoto 2019        │ │ │ 14 bilder mangler full opptakstid.         │ │
│ │    Anbefalt             │ │ │ Eksporten kan lages, men GML-filen …       │ │
│ │ Til import i Gemini VA  │ │ └────────────────────────────────────────────┘ │
│ │ og GeoFoto.             │ │  Eksportpakke          Kan lages               │
│ │ Importert i testet      │ │  Skråfoto 2019-skjema  Oppfylles ikke: …       │
│ │ oppsett. Kontroller …   │ │  Import i Gemini VA    Ikke verifisert for …   │
│ └─────────────────────────┘ │                                                │
│  ▸ Flere formater           │  [ Fullfør opplysninger… ]                     │
│                             │  3 plasseringer mangler posisjon og blir       │
│  Etikett i filnavnet        │  ikke med.                                     │
│  (valgfritt)                │                                                │
│  [ Torkopp PS            ]  │  ▸ Slik blir leveransen (4)                    │
│  ÅÅÅÅMMDD-TTmmss-Torkopp-PS │                                                │
├─────────────────────────────┴────────────────────────────────────────────────┤
│  40 bilder i pakken          Avbryt      [ Fortsett uten opptakstid ]        │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **The heading is the answer.** A user who reads nothing else knows whether export can go ahead.
- **Unplaced photos stay in plain view.** `ready` can still leave photos out, and that changes the delivery, so it must not sit behind a disclosure.
- **CRS** appears inside the selected Legacy or AsBuilt card. Gemini shows none, because it is fixed at EPSG:5972.
- **AsBuilt context** has no form here. It shows as a blocker and `Fullfør opplysninger…` opens `Leveranseopplysninger`, so there is one form rather than two.

### 3.3 Pakke

```
├──────────────────────────────────────────────────────────────────────────────┤
│  1. Leveranse     2. Pakke                                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│  Klar til nedlasting                                                         │
│                                                                              │
│  ZIP   20261107-153500-Torkopp-PS.zip                                        │
│  GML   20261107-153500-Torkopp-PS.gml                                        │
│  Format  Gemini-kompatibel Skråfoto 2019                                     │
│                                                                              │
│  40 bilder · 40 plasseringer i GML-filen · 182 MB · 3 uten posisjon utelatt  │
│                                                                              │
│  [ warning + three status rows: same component as Leveranse ]                │
│                                                                              │
│  ▸ Innhold i pakken     ▸ Tekniske detaljer                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                  Avbryt     Tilbake     [ Last ned ZIP ]     │
```

Done state, on the same screen:

```
│  ZIP-pakken er laget og sendt til nedlasting                                 │
│  20261107-153500-Torkopp-PS.zip                                              │
│                                                                              │
│  1. Pakk ut ZIP-filen.                                                       │
│  2. Importer 20261107-153500-Torkopp-PS.gml i Gemini VA, med                 │
│     Attachments-mappen ved siden av.                                         │
│  3. Kontroller resultatet i Gemini VA.                                       │
│                                                                              │
│  Pakken følger ikke skjemaet fordi 14 bilder mangler opptakstid.             │
│  En ny pakke får nytt tidspunkt og nye ID-er og regnes som en ny leveranse.  │
│                                          Last ned på nytt     [ Lukk ]       │
```

«Klar til nedlasting» describes the file, not its quality, so it stays within the earlier rule against a bare `«klar»`. The schema line appears only when it applies. Steps 2–3 are Gemini-only. Other formats get `«Pakk ut ZIP-filen. GML-filen og Attachments-mappen må ligge ved siden av hverandre.»`

### 3.4 Format cards

Add these to `PHOTO_EXPORT_PROFILE_METADATA`. `exportContract.mjs` keeps its labels and stays unchanged.

| Profile | Title | Badge | Destination | Compatibility status |
|---|---|---|---|---|
| `gemini-legacy2019` | `«Gemini-kompatibel Skråfoto 2019»` | `«Anbefalt»` | `«Til import i Gemini VA og GeoFoto.»` | `«Importert i Gemini VA/GeoFoto i testet oppsett. Kontroller resultatet etter import.»` |
| `legacy2019` | `«Skråfoto 2019 (standard)»` | | `«Etter standardskjemaet, til andre mottakere. Krever opptakstid og retning.»` | `«Ikke testet med import i Gemini VA.»` |
| `asbuilt52` | `«Norsk Vann AsBuilt 5.2»` | | `«AsBuilt-leveranse. Krever opptakstid og leveranseopplysninger.»` | `«Ikke testet med import i Gemini VA.»` |

The Gemini status states a past event in a tested setup. It claims nothing about the next package, and the level row says so directly. `Flere formater` opens by itself if a non-Gemini format is selected, so the selection is never hidden.

### 3.5 Wording

| Purpose | Copy |
|---|---|
| Title, close name | `«Eksporter bilder»`, `«Lukk eksport»` |
| Steps | `«Leveranse»`, `«Pakke»` |
| Label field | `«Etikett i filnavnet (valgfritt)»` (from M5) |
| Filename hint | `«Filnavn: ÅÅÅÅMMDD-TTmmss-Torkopp-PS.zip og .gml. Tidspunktet settes når pakken lages.»` |
| Label with no usable characters | `«Etiketten har ingen tegn som kan brukes i filnavn. Bare tidspunktet brukes.»` |
| Reading | `«{n} bilder er ikke ferdig lest. Kontrollen oppdateres av seg selv.»` |
| `Neste` disabled, footer reason | `«Rett det som mangler for å gå videre.»` |
| No placed photos | `«Ingen bilder er plassert ennå. Bare plasserte bilder kan eksporteres.»` |
| Unplaced | `«{n} plasseringer mangler posisjon og blir ikke med.»` |
| Return note | `«Kontrollen er oppdatert.»` |
| Stale | `«Bildene er endret etter at forhåndsvisningen ble laget.»` |
| Hub return button | `«Tilbake til eksport»` |
| Hub standalone button (Q6) | `«Gå til eksport»` |

**Reused unchanged** because tests pin them and the hub shows them: the schema warning, the three level rows and `photoCompletionStatus` text.

**Terminology:**

- `«bilde»` is one original file, and `«plassering»` is one position on the map, matching the hub.
- `«forekomst»` and `«feature»` appear only in `Tekniske detaljer`.
- `«Eksperimentell»` and `«testpakke»` are dropped from the main path.
- UI never uses `«validert»`, `«godkjent»`, `«sertifisert»` or `«garantert»` (D7).
- Rename the `invalid-context` label from `Påkrevd AsBuilt-kontekst` to `«Leveranseopplysninger mangler»`, to match the hub.

### 3.6 What is visible and what is folded

| Always visible | `Slik blir leveransen` (Leveranse) | `Innhold i pakken` (Pakke) | `Tekniske detaljer` (Pakke) |
|---|---|---|---|
| Heading, schema warning, three levels, excluded count, blockers, items to check, filenames | `readiness.notes`: Z placeholder, timezone removal, omitted photographer, shared originals, object links, default directions | File tree, renamed attachments | CRS and geometry, grouped plan warnings by diagnostic code |

Items to check (`capture-time-utc`, `capture-time-implausible`, sources differ, bulk values) stay visible. They may need action, and there are few of them.

---

## 4. State management and preview invalidation

### 4.1 Where state lives

| State | Location | Lifetime | Why |
|---|---|---|---|
| `profile`, `crs`, `context`, **`label`** | `photoExportConfigs` in `page.js`, per layer | Session, reconciled on publish | Must survive the wizard unmounting. The hub shares it. M5 pointed here |
| `photoExportReturn: { layerId } \| null` | `page.js` | One trip to the hub | Survives map trips. **Separate from `photoExportFlow`** |
| `step`, plan, run number, packaging status, errors | Reducer inside the wizard | Mounted wizard only | Unmounting discards the plan, which is the behaviour wanted |
| Object URLs | Ref inside the wizard | Revoked on unmount | As today |
| Readiness, wizard model, `stale` | Derived in render | Never stored | Cannot go out of date |

**Why not extend `photoExportFlow`, as M4 suggested?** It describes one trip from the hub, and it ends on return to the hub. Export return must outlive that trip, so it is a different lifetime. Keeping it separate leaves `photoExportFlow.mjs`, its pinned keys and all of its tests untouched. The `origin` field stays `'complete'`.

### 4.2 New pure module

`src/lib/photos/photoExportWizard.mjs`, tested without a browser:

```js
photoExportDeliveryModel({ photos, readiness }) → {
  state,                                  // §2.3, 'reading' first, from the whole layer (W4)
  heading, excludedText, checks, notes,
  advance: { enabled, label, reason },
  completionPrimary,                      // true when blocked
}
photoExportWizardReducer(state, action)   // { step, run, preview: { status, plan, error }, download: { status, error } }
photoExportPackageContents(plan)          // counts, total size, renamed attachments
```

Async work starts in click handlers, not effects, so it cannot run twice under React strict mode. Each result carries the `run` it started with, and the reducer drops anything older. This is the existing token guard in a testable form.

Readiness is memoised on `photos`, `profile`, `crs`, `context` and `now`, leaving out `label`, so typing in the label field does not recompute it.

### 4.3 Invalidation

| Event | Readiness | Plan |
|---|---|---|
| Format, CRS or label changed | Recomputed if relevant | None exists on this screen |
| `Tilbake` from Pakke | Recomputed | **Discarded** |
| Close, or trip to the hub | Recomputed on return | **Discarded** by unmount |
| `Neste` | | Built with current config: new timestamp, new Gemini UUIDs |
| Session publish, nothing relevant changed | Recomputed | Still live |
| Session publish, accepted data changed | Recomputed | `stale` derived: download removed, `Oppdater forhåndsvisning` shown |
| `Oppdater forhåndsvisning` | | Built afresh, same config |
| `Last ned ZIP` | | Unchanged. `assertExportablePlan` and the checksum recheck remain the final guard |
| `Last ned på nytt` | | Same plan, same bytes, same UUIDs (W6) |
| Result arrives from an older run | | Ignored |

**Why a stale plan is not rebuilt automatically:** a rebuild silently changes the timestamp and every Gemini UUID while the user may be about to click. With the wizard modal and the EXIF wait in place, staleness should be rare, so one explicit click costs little.

### 4.4 Return state in `page.js`

```js
const [photoExportReturn, setPhotoExportReturn] = useState(null);
const openCompletionFromExport = () => requestWorkspaceAction(() => {
  setPhotoExportReturn({ layerId: workspaceLayer.id }); setPhotoCompletionEntry(null);
  setPhotoDialog('complete'); ignoreFollowUpClick();
});
const returnToExport = () => { setPhotoExportReturn(null); setPhotoDialog('export'); ignoreFollowUpClick(); };
```

Three traps:

1. **Clear only when a live trip ends (W15).** `requestWorkspaceAction` also wraps the hub → map call, when no flow exists yet. Clearing unconditionally there would lose the way back:
   ```js
   const run = keepFlow ? action : () => { if (closePhotoExportFlow()) setPhotoExportReturn(null); action(); };
   ```
2. **Clear explicitly at every other exit:** `openCompletePhotoDetails`, `runWorkspaceTool('export')`, `enterPhotoLayer`, `exitPhotoWorkspace`, `handleReset`, the failed-commit paths, and the session subscriber when the layer has gone.
3. **Dialog-to-dialog swap is new.** M4 only ever swapped a dialog for the map. The cleanup calls `dialog.close()`, and the hub also listens to the native `close` event, so a late event must not close the dialog that replaced it. I expect React to drop it after unmount, but that is **unverified**, so it gets a dedicated test in both directions.

The hub needs one change: a footer button that reads `Tilbake til eksport`, and an `onClose` that goes to `returnToExport` while `photoExportReturn` is set. Focus goes through `photoToolOpenerRef`, and `runWorkspaceTool('export', opener)` must now record its opener. The wizard's `key` is the layer ID, as the hub's is.

The hub's `Mål` select writes the same config, so a target changed there is simply what the wizard shows on return.

---

## 5. Risks, dependencies and compatibility

### 5.1 What must not change

| Area | Protection |
|---|---|
| Gemini serialization, UUIDv4 generation, attachments, references, Z placeholder, time handling | **No diff** in `photoExportXml.mjs`, `photoExportPackage.mjs`, `attachmentNames.mjs`, `exportContract.mjs`, `photoExportNaming.mjs`, or in `tests/fixtures` and the goldens |
| Plan | `photoExportPlan.mjs`: no diff, except one warning string if Q7 is approved. No IDs, order or logic |
| Export profiles | All three stay selectable and tested |
| Missing capture-time policy | `PHOTO_EXPORT_REQUIREMENTS` unchanged. Gemini `recommended`, Legacy and AsBuilt `required` |
| M5 names | Wizard reads `plan.naming` only and never composes a filename |
| Metadata acceptance | Wizard contains no `adoptSourceEvidence`, `setCaptureMetadata` or `fillMissingPhotoValues` |
| Map transaction | `PhotoEditCommandBar.js`, `photoEditSession.mjs`, `photoExportFlow.mjs`, `PhotoPositioningWizard.js`: no diff |

### 5.2 Risks

| Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|
| Browser test migration hides a lost check. 61 lines in 5 files pin the old dialog | High | Silent coverage loss | M6b separates mechanical from intentional changes. Every deleted assertion is listed in the M6c report |
| Return state lost or left behind | Medium | Wrong button, or stranded user | §4.4 traps, one browser test per exit path |
| Native `close` from the old dialog closes the new one | Low | Wizard or hub vanishes | Dedicated swap test |
| Double-click reaches `Last ned ZIP` | Medium | Unwanted download | `ignoreFollowUpClick`, tested as in M4 by aiming the second click at the real target |
| Long EXIF read holds up `Neste` | Low | Short wait | Live count and copy. Failed reads resolve as errors. Only a promise that never settles would hang |
| Different counts confuse users (W7) | Medium | Loss of trust | One rule per number, plus a domain test on a repeated photo |
| Wording reads as a guarantee | Medium | False confidence | Banned-word test, evidence table drives copy, no `Klar` for quality |
| Label field lags, because each key press re-renders `page.js` | Low | Sluggish typing | Same pattern as the hub's context panel. Check on the corpus, and commit on blur if it lags |
| Small viewports clip content | Medium | Hidden status | Scrolling body with fixed footer. M6e tests |
| Very large layers exhaust memory | Low | Failed ZIP | Unchanged: the ZIP is built in memory. Size is now shown |
| V1 rejects something | Unknown | Policy or name change | Fallbacks in §5.4 need no wizard redesign |

### 5.3 Dependencies

- **All code dependencies are in place at `c529073`:** M0–M5, automatic metadata and `PhotoExportStatus`.
- **Manual acceptance is still outstanding for M3, M4, M5 and automatic metadata.** Those reports say no person has reviewed them. M6 changes the export surface they cover, so §7.4 folds in the export-related checks.
- **The external XSD harness is outside Git and needs `lxml`.** It stays a manual gate (F18).

### 5.4 Verification gate V1: real Gemini VA import

**Wizard planning and implementation do not wait for V1. Nothing in the wizard may claim what V1 would prove.** Until it passes, `PHOTO_EXPORT_IMPORT_EVIDENCE` stays as it is, and the UI keeps saying `«Ikke verifisert for denne pakken. Må testes manuelt.»` or `«…denne pakken er ikke testet.»`

Use **unmodified packages from the finished wizard**, unzipped.

| Check | Replaces | Package | If accepted | If rejected |
|---|---|---|---|---|
| **V1a Renamed GML** | G1 | Timestamped name with a label, all times present | `renamedGml: 'imported'` | Set `gmlFilename` to `photos.gml` in `photoExportNames`, keep the ZIP name. Wizard follows `plan.naming`, so it needs no change |
| **V1b Missing time** | G3 | Mixed: some photos with time, some without | `missingCaptureTime: 'imported'`, and the level row firms up by itself | Policy decision. Setting Gemini `captureTime: 'required'` makes wizard and plan block through the existing path. Hub and warning copy would need revising |
| **V1c Default direction** | New | Includes photos with default `0°` | Note the result | Decide how defaults are exported |

For each, record Gemini VA and FME versions, photo count, diagnostics, row counts, whether attachments open, and whether position, direction and time are right in GeoFoto. Update the evidence table and its pinned test in the same change, and only from a real import. That table's comment already sets this rule.

**G2 (direction omitted) is retired.** Every photo now has a direction, so the wizard cannot produce that package. Optional in the same session: uppercase `.JPG` attachments, and whether re-importing a delivery with new UUIDs duplicates photos in GeoFoto. The second one matters because the done screen says a new package is a new delivery.

---

## 6. Proposed implementation milestones

Each is separately reviewable and leaves the suite green.

| # | Milestone | Size | Visible change | Review focus |
|---|---|---|---|---|
| M6a | Foundations | S | None | Model states, reducer races |
| M6b | Test seam | S | None | Test-only, same pass count |
| M6c | Wizard replaces dialog | L | Yes | Plan lifecycle, removed assertions |
| M6d | Round trip | M | Yes | Return state, focus, swap |
| M6e | Layout, copy and acceptance | S–M | Polish | Real screens, wording |

**M6a — Foundations.** Add `label` to config, with `label: ''` in the default. That changes one assertion on purpose (`photoCompletion.test.mjs:311`). Add card wording to `PHOTO_EXPORT_PROFILE_METADATA`. Add `photoExportWizard.mjs` and `tests/photoExportWizard.test.mjs`.
*Done when:* model covers every state × profile, and no UI or export diff.

**M6b — Test seam.** Add `tests/helpers/photoExportWizard.mjs` with `openExport`, `chooseFormat`, `setLabel`, `buildPreview`, `previewNames`, `downloadZip`, `closeExport`. Move the five browser suites onto it, **still driving the old dialog**.
*Done when:* same tests, same results, no product change. M6c's diff then shows only real behaviour changes.

**M6c — Wizard replaces dialog.** Add `PhotoExportWizard.js`, `PhotoExportDeliveryStep.js`, `PhotoExportPackageStep.js` and `photoExportWizard.css`. Mount it in `page.js`. Delete the four retired files. `Fullfør opplysninger…` opens the hub, without a return yet. Keep `data-export-zip`, `data-export-gml`, `data-export-status`, `data-export-level`, `data-export-warning` and `data-diagnostic-code`, so the seam stays small.

Intentional test changes, each to be listed in the report:

| Test | Change |
|---|---|
| `photoCompletionUi:319` | Inverted: the wizard now shows the hub's target |
| `photoLoadedGmiUi:234-235` | Inverted: Gemini is preselected |
| `photoLoadedGmiUi:141-160,195-198` | Manual fill moves to the hub |
| `photoLoadedGmiUi:240` | Old copy removed |
| `photoLoadedGmiUi:252-255` | Label is set before the plan, and `Neste` builds it |
| `photoEvidenceUi:85,114-115` | Adoption rows are gone. Replaced by hub and readiness assertions. Rule coverage stays in `photoAutoMetadata` |
| Scenarios expecting a preview with blocking errors | Now expect `Neste` disabled with blockers listed |

*Done when:* all three profiles export through the wizard, goldens and §5.1 diffs are clean, and only one export interface exists.

**M6d — Round trip.** `photoExportReturn`, §4.4, the hub's footer button, focus and double-click guards, and `Gå til eksport` if Q6 is approved. Add `tests/photoExportWizardUi.test.mjs`.
*Done when:* every row of §2.5 has a browser test, and `git diff` is empty for the command bar, flow module and positioning wizard.

**M6e — Layout, copy and acceptance.** Viewports in §3.1, the wording pass including Q7, the banned-word test, the label typing check, a corpus run and the XSD harness. Then §7.4.
*Done when:* screenshots are reviewed and the manual list is handed over. V1 remains open.

M6a and M6b can run in parallel. V1 can happen any time after M6c.

---

## 7. Regression and manual acceptance strategy

### 7.1 Gates for every milestone

| Gate | Command or check |
|---|---|
| Export domain | The 12 files of the baseline, plus new wizard tests. Baseline: 243 tests, 241 pass, 0 fail, 2 skip |
| Goldens and parity | Included above, and must pass with no fixture diff |
| Protected files | `git diff --stat` on the §5.1 list |
| Whole domain suite | Same six baseline failures by name, nothing new |
| Browser suites | `--test-concurrency=1`, production build, with `PHOTO_GML_FIXTURE` from M6c on |
| Build, ESLint, `git diff --check` | Clean |

### 7.2 New domain tests

- **State order:** `reading` beats `blocked`, and an unplaced member still reading counts (W4).
- **Every state × profile:** heading, primary label, reason.
- **Button label** names capture time only for `schema-gap`.
- **Reducer:** older results dropped, `back` discards the plan, a failed build leaves `Tilbake` available, stale detection.
- **Counts** on a repeated photo and on unplaced assets (W7).
- **`now` is passed**, so a future date is flagged (W8).
- **Label:** kept per layer, independent per layer, cleared with the layer, never in browser storage.
- **Preview/download consistency:** the downloaded name, the GML member and the `compatibility-import` text all equal `plan.naming`, for all three profiles.
- **Identity:** a new build gives new Gemini UUIDs, and repeat download gives identical bytes.
- **Wording:** no banned word in wizard copy or card wording. The scan must skip `asbuiltCodes.mjs`, where `godkjent tiltak` is schema text.
- **No writes:** wizard files do not reference metadata-writing session methods.

### 7.3 New browser tests

| Area | Scenario |
|---|---|
| Default | Gemini preselected, normal path downloads in two clicks after `Eksporter…` |
| Formats | Legacy and AsBuilt exportable, `Flere formater` open when one is selected, CRS shown only for them |
| Missing time | Gemini proceeds with the warning on both screens, Legacy blocks |
| Reading | Held during a pending read, proceeds by itself once finished |
| Round trip | Wizard → hub → back, with label and format intact |
| Map | Wizard → hub → map → Save → hub → wizard, status updated. Same with Discard, and with `Fortsett redigering` |
| Positioning | Wizard → hub → positioning wizard → hub → wizard |
| Trip ended | Another tool during a trip, then the hub shows `Lukk`, not `Tilbake til eksport` |
| Exits | ✕, Escape, repeated Escape, footer button from a hub opened from the wizard |
| Swap | Each dialog still open a moment after the swap |
| Double-click | Second click aimed at the real next control, on `Neste`, `Fullfør opplysninger…` and `Tilbake til eksport` |
| Stale | Change during Pakke removes the download, and `Oppdater forhåndsvisning` restores it |
| Plan-only error | Missing file reaches the error state |
| Keyboard | Focus on heading at each step, Tab order, return focus to `Verktøy` |
| Layout | §3.1 sizes: primary button visible, no horizontal overflow, in each state, including AsBuilt blockers |
| Corpus | 148 photos, through to a ZIP with the previewed name |

Layout tests use `Emulation.setDeviceMetricsOverride`, as `photoDialogLayout` does. Sizes are set in CSS pixels, which matches what zoom does to layout.

### 7.4 Manual acceptance

Use the 148-photo corpus and the contractor delivery of 40 photos.

1. Open `Eksporter…`. Gemini is selected, and the card makes destination and status clear without looking like a certification.
2. Contractor delivery: heading shows the schema gap, 14 photos are named, and all three levels read separately.
3. `Fortsett uten opptakstid`, then confirm both filenames match, in the current Norwegian time.
4. Download. The name matches, the GML inside matches, and `Attachments` is beside it.
5. `Fullfør opplysninger…`, fill one time, then `Tilbake til eksport`. The count falls, and format and label remain.
6. From the hub, `Angi på kartet`, change a direction, Save, back to hub, back to export.
7. The same with Discard. Nothing changes.
8. Type `  Grøft / nord  ` and confirm the hint shows `-Groeft-nord`.
9. Choose Legacy with times missing. `Neste` is disabled and the reason is clear.
10. Choose AsBuilt, reach `Leveranseopplysninger` through the hub, return, and export.
11. Repeat at 125% zoom on a laptop.
12. Read every screen for tone: is anything too technical, or too confident?
13. Keyboard-only run, ideally with a screen reader.
14. Run the external XSD harness on one wizard package with all times, and one without. Expect valid and invalid respectively.
15. **Deferred: V1 (§5.4).**

---

## 8. Open questions requiring your decision

Each has a recommendation, and M6a can start with these as defaults.

| # | Question | Recommendation | Why |
|---|---|---|---|
| Q1 | Two screens, rather than the three in the earlier plan? | **Yes** | Format and status belong together, and it saves a click |
| Q2 | With missing times, should the primary button continue? The earlier plan made `Fullfør` primary | **Yes**, `Fortsett uten opptakstid` | You made times optional. The button names the consequence, so no dialog is needed (D4) |
| Q3 | Should V1 block merging to `main`, or only claims about Gemini? | **Claims only.** Merging is fine, but no real delivery should rely on it until V1 passes | The UI stays honest either way. This is your call on release risk |
| Q4 | Remember the label per layer for the session? | **Yes** | Survives hub trips, and matches format and CRS. The timestamp keeps files apart |
| Q5 | Should filenames or a suggested label show the format? M5 left this open | **No.** Show the format on Pakke only | Your naming convention omits it. Two formats exported together differ only by time and label, so say if that matters |
| Q6 | Add `Gå til eksport` to the hub when opened on its own? | **Yes** | Small, and M3 deferred it to here |
| Q7 | Allow one wording change in `photoExportPlan.mjs`, removing `Gemini-kompatibilitet er ikke verifisert` from `experimental-mapping`? | **Yes.** Text only, no logic | It contradicts the status block. The alternative is leaving a known contradiction under `Tekniske detaljer`. No test pins it apart from one being migrated |
| Q8 | Hold `Neste` during EXIF reads for every format? The old dialog let you preview | **Yes** | Avoids a false blocker and a stale preview, at the cost of a short wait |

---

## 9. What this supersedes

| Earlier | Now |
|---|---|
| `Leveranse · Kontroll · Pakke`, then `Ferdig` (planning §7) | `Leveranse · Pakke`, with the done state on Pakke |
| Label edits do not rebuild the plan (§7.1) | Label comes before the plan, because M5 froze names into it |
| Schema gap: `Fullfør` primary, `Fortsett uten` secondary (§7.1) | `Fortsett uten opptakstid` primary, subject to Q2 |
| `Hvis du fortsetter:` list (§7.1) | Schema warning plus `Slik blir leveransen` |
| `Tilbake til eksport` in the command bar (§7.3, M4 §13) | Not needed. The map returns to the hub |
| `returnTo` or `origin: 'export'` in the flow (M4 §13) | Separate `photoExportReturn`, flow untouched |
| Plan built on Pakke with a visible name field | Plan built by `Neste`, and Pakke has no settings |
| Device-local timestamp (§9) | Europe/Oslo, as M5 implemented |
| G1 and G3 block M6 (§10) | Deferred to V1, not blocking |
| G2 direction omitted | Retired |
| AsBuilt fields in the wizard | Hub only |

**Out of scope:** exporter changes, EXIF or position policy, ZIP streaming, moving the XSD harness into the repository, and persisting anything beyond the session.

No code changes, commits or pushes were made.
