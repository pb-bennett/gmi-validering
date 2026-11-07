# FOTO export M6a — Foundations

Date: 2026-11-07, Europe/Oslo. Branch `feature/photo-workspace`, starting commit `c529073`. **Nothing was committed or pushed.** Implements §6 M6a of `20261107-162116-photo-export-m6-wizard-planning.md`, with Q1–Q8 as approved.

Norwegian text in `«…»` is UI copy.

---

## 1. Summary

**The wizard's pure model and reducer now exist, with tests, and nothing in the app uses them yet.** There is no UI change, no navigation change and no export change. `src/app`, `src/components`, the serializer, plan, package, readiness, naming, flow and test fixtures all have an empty diff.

**No regressions.** The six failures in the non-browser suite are the same six that fail on a pristine `c529073` (§5).

**Four things to review:**

1. **One heading differs from §2.3 of the plan,** because the plan contradicts itself (§3, D1).
2. **I added four small things that §4.2 did not list** (§3, D2).
3. **Stale now outranks a finished download.** The plan did not set an order for the Pakke states, so this is my decision (§3, D3).
4. **M6c must hide `PhotoExportStatus` while reading,** or the false blocker comes back through the level rows (§6).

---

## 2. Changed files

| File | Change |
|---|---|
| `src/lib/photos/photoExportWizard.mjs` | **New.** Delivery model, reducer, Pakke state, package contents |
| `tests/photoExportWizard.test.mjs` | **New.** 49 tests |
| `src/lib/photos/photoExportConfig.mjs` | `label: ''` in the default config |
| `src/lib/photos/export/photoExportRules.mjs` | `title`, `badge`, `destination`, `compatibility` in `PHOTO_EXPORT_PROFILE_METADATA`, using the §3.4 wording. Requirements, evidence and rule logic are unchanged |
| `tests/photoCompletion.test.mjs` | The one planned assertion change, at line 311: `label: ''` in the expected config |

### What the module exports

| Export | Purpose |
|---|---|
| `photoExportDeliveryReadiness(photos, config, now)` | Readiness for the wizard. Always passes `now` (W8) and leaves `label` out |
| `photoExportDeliveryModel({ photos, readiness })` | `state`, `heading`, `excludedText`, `blockers`, `checks`, `notes`, `advance`, `completionPrimary` |
| `PHOTO_EXPORT_WIZARD_START`, `photoExportWizardReducer` | `{ step, run, preview, download }` |
| `photoExportPackageState(state)` | The §2.4 state, derived on each render |
| `photoExportPackageContents(plan)` | `images`, `placements`, `excluded`, `sharedAttachments`, `totalBytes`, `renamed` |

### State precedence, as implemented

**Leveranse:** `reading`, `blocked`, `schema-gap`, `recommendations`, `ready`. The first match wins. `reading` looks at every layer member (W4) and counts originals, so two placements of one photo read as `1 bilde`.

**Pakke:** `building`, `build-failed`, `plan-errors`, `packaging`, `stale`, `packaging-failed`, `done`, `ready`.

### Reducer safeguards

- A build starts with `run: state.run + 1`. A repeated start with the same run changes nothing.
- A build result counts only for the current run, and only while building, so the first result of a run wins.
- `back` discards the plan and moves `run` on, so a late result from before it is dropped.
- While a ZIP is being made, `back`, a rebuild and a second download are all refused.
- A download needs a ready plan with no errors, from the current run.
- The reducer never calls `plan.isLive()`, so it stays pure. `stale` is derived and never stored.

---

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Headings come from `photoCompletionStatus`.** So `recommendations` reads `«Kan eksporteres, men {n} kan forbedres»`, not §2.3's `«Kan eksporteres. {n} bør kontrolleres»` | §1.2 and §3.5 say this text is reused unchanged so hub and wizard cannot disagree, and §2.3 proposes a new line. Two sections and the stated reason outweigh one. **To use the §2.3 wording, change it in the model and decide whether the hub follows.** |
| D2 | **Additions to §4.2:** `photoExportDeliveryReadiness`, `photoExportPackageState`, `blockers` in the model, `PHOTO_EXPORT_WIZARD_START` | W8 and stale detection could not be tested in the domain without the first two. `blockers` keeps the rule "no blockers while reading" in tested code rather than in JSX |
| D3 | **`stale` outranks `done` and `packaging-failed`** | `Last ned på nytt` and `Prøv igjen` would both be refused by `assertExportablePlan`. The cost is that the import guidance disappears if data changes after a download, which should be rare in a modal wizard |
| D4 | **`plan-errors` outranks `stale`** | Follows §2.4, which lists `stale-plan` under plan errors. Both states remove the download, and `Tilbake` then `Neste` rebuilds |
| D5 | **`build-failed` is a new state,** with `Tilbake` only | `capturePhotoExportSnapshot` can throw if the layer has gone. §2.4 has no row for this, and §7.2 requires `Tilbake` to stay available |
| D6 | **While reading, `blockers`, `checks` and `notes` are empty** | They are derived from unfinished data. `excludedText` stays, as it is true at that moment |
| D7 | **`evidence-pending` needs no filter** | It only arises for a placed photo being read, and that is always `reading` |
| D8 | **The `Fortsett uten opptakstid` label also checks that the gap is capture time** | W12 says nothing else can reach `schema-gap` today, but the label would be false if a rule changed. One condition, and tested |
| D9 | **`photoExportReadiness.mjs` was left alone,** so its one-line pending check is repeated in the wizard | Keeps this milestone free of export diffs. The same expression already appears in several photo modules |
| D10 | **The label is stored as typed** | Only the plan sanitises it. This matches `naming.label` from M5, and the field can show it again |

**Q3 and V1:** `PHOTO_EXPORT_IMPORT_EVIDENCE` is unchanged. The Gemini card states a past import in a tested setup, and a test ties that text to the evidence table. A test also pins `missingCaptureTime: 'unconfirmed'` and `renamedGml: 'untested'`, so **production readiness stays unverified until real Gemini VA acceptance.** Q7's wording change belongs to M6e and is not done.

---

## 4. Tests added

All 49 pass. They cover the §7.2 list as follows.

| §7.2 item | Coverage |
|---|---|
| State order, W4 | Synthetic layers, plus a real session with a held EXIF read: `reading` while readiness says `blocked`, released by itself, and a plan built during the read goes stale (W2, W3) |
| Every state × profile | 15 table rows: 5 layers × 3 profiles, each with state, heading, label, enabled and reason |
| Button label | Only Gemini `schema-gap`, and not for a gap in another field |
| Reducer | Older results, repeats, `back`, failed build, packaging lock, download rules, no mutation |
| Stale detection | Read live, not stored, and its order against every download state |
| Counts (W7) | Repeated photo and left-out photo, on real plans |
| `now` (W8) | A 2099 date is flagged, including when the caller gives no time |
| Label | Per layer, independent, cleared with the layer, reaches the name through the plan, not in browser storage |
| Identity | A new build shares 0 UUIDs with the last, and a repeat download gives identical bytes |
| Wording | Banned words absent from the module source, the cards and every model output |
| No writes | Module has no metadata-writing methods, no `photoSession`, no filename composition |
| Preview/download consistency | **Already covered by `photoExportNaming.test.mjs` for all three profiles,** so not repeated. One GML-member check is added. The name given to the browser download is UI, so it moves to M6c |

The wording scan covers only the wizard module and the cards, so it does not need to skip `asbuiltCodes.mjs`. M6c must extend it to the new components.

**Mutation checks:** 19 deliberate faults, each reverted afterwards, and **all 19 failed at least one test.** They covered reading scope and order, leaked blockers, a dropped `now`, the button label, every run and status guard, the packaging lock, plan errors, Pakke state order, `uniqueImages`, a missing default label and an overclaiming card.

---

## 5. Verification

| Check | Result |
|---|---|
| `tests/photoExportWizard.test.mjs` | **49 of 49** |
| Export and completion gate, 16 files including goldens, parity, package, serializers and Gemini compatibility | 301: **296 pass, 0 fail, 5 skip** |
| Non-browser suite, 142 files | 1,589: 1,574 pass, **6 fail (baseline)**, 9 skip |
| ESLint on the five changed files, run directly | 0 errors, 0 warnings |
| `git diff --check`, including the new files | Clean |
| Protected paths (§5.1), plus `src/app`, `src/components`, `tests/fixtures`, readiness | Empty diff |

The non-browser list was selected by excluding `*Ui` and `*Browser` files and files using the browser harnesses, so its file set is not exactly the one in the M5 report.

### Baseline failures, reported separately and not touched

| File | Failing tests |
|---|---|
| `validationV2WorkspaceInspector.test.mjs` | 3 (lines 7, 34, 103) |
| `statsUiContract.test.mjs` | 2 (lines 8, 129) |
| `appInfoUiContract.test.mjs` | 1 (line 90) |

I ran these three files on a pristine `git archive` of `c529073`: 22 tests, 16 pass, and the same 6 fail at the same locations. I did not run the whole suite on the pristine copy.

**`npm run lint` does not work, independently of this change.** It fails with `Invalid project directory provided, no such directory: …\lint`, because `next lint` is not available in the installed Next version. ESLint was therefore run directly, as in M5.

### Not run

Browser suites, production build, XSD harness and Gemini import. No UI or export code changed, and none of these is an M6a gate in your brief, but §7.1 lists browser suites and a build for every milestone, so they should run with M6b.

---

## 6. Remaining work and notes for later milestones

**Next:** M6b (test seam), then M6c–M6e. V1 stays open.

**For M6c:**

1. **Hide `PhotoExportStatus` while `state === 'reading'`.** It reads readiness directly, so its level row would still show `Kan ikke lages ennå: 2 må rettes`, which is W2 again. The model empties its own lists but cannot reach that component.
2. **Check for unmount before the download click.** The reducer drops late results, but dispatch cannot stop the handler. After `await buildPhotoExportPackage`, the handler must confirm the wizard is still open before clicking the `<a>`, as the old dialog's token did.
3. **Start a build with `run: state.run + 1`,** and dispatch that same run with the result.
4. **Size is originals only.** `totalBytes` leaves out the GML and ZIP overhead, so the wording should not present it as the exact ZIP size.
5. **Extend the banned-word and no-writes tests** to the new components.

**For M6e, found while testing:**

1. **Some notes have no singular form.** `singularCopy` handles only `bilder` and `plasseringer`, so one photo gives `«1 punkter får Z=0 …»`, `«1 originalbilder deles …»` and `«1 godtatte fotografverdier …»`. These now reach the main path through `Slik blir leveransen`. I left this alone and did not pin the wrong text in a test.
2. **`{n}` in the `recommendations` heading counts kinds of item, not photos.** Ten implausible dates give `1 kan forbedres`. This is existing hub behaviour, so it is worth a look when reading the screens.
3. **The `invalid-context` label rename (§3.5) is not done.** M6a's scope did not include it, and it belongs with the wording pass.
4. **Q7's warning change is not done,** as planned.

**Not a defect:** the hub's target stays `Gemini VA`, while the card title is `Gemini-kompatibel Skråfoto 2019`. `PHOTO_COMPLETION_TARGETS` has its own labels, and §3.4 only added card wording.

No commits or pushes were made. Stopping here for review.
