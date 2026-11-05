# FOTO export overhaul — planning

Date: 2026-11-04, Europe/Oslo. Branch `feature/photo-workspace`, HEAD `66fcaa7` (*Refine photo workspace and layer controls*), clean worktree at start. **Planning and audit only: no production code or tests changed, nothing committed or pushed.** This report is the only new file.

Status: **finalized after review, 2026-11-04.** Decisions are recorded in §12, and §15 has the decision log.

Norwegian text in `«…»` is proposed UI copy. Everything else is English.

This report supersedes the export parts of `20261103-1300-…-planning.md` (§20–22, §33 pass 2). §13 lists exactly what changes.

---

## 1. Summary

**The most important finding is a functional defect, not only a confusing UI.** On the real 148-JPEG corpus, all 148 images have valid EXIF capture times. But as soon as the matching GML is attached, every photo is classed as a source conflict. The cause is that EXIF carries subseconds and GML does not, even though the two agree to the second on all 148. Bulk adoption then offers 0 photos from either source, and the inspector reports `Kildene oppgir ulike opptakstider` on all 148. The Gemini profile does not block on this, so the package exports with **zero** `fotograferingstidspunkt` elements. The only signals are terse counts (`148 uten full opptakstid`) and a collapsed diagnostic labelled with a raw code. Nothing says the times exist and could be used. This explains why the user could not find imported EXIF times (§3).

Recommendations:

1. **Fix evidence correctness first.** Use one shared comparison for capture times (§8.3). It is small, needs no serializer change, and removes the main blocker.
2. **Build one rule implementation.** `photoExportRules.mjs` is called by both the plan and a new readiness module, so the completion tool and wizard cannot drift from what the plan blocks (§8).
3. **Ship `Fullfør opplysninger…` before the wizard.** It is useful alone and the wizard depends on it (§5, §10).
4. **Make Gemini VA the prominent default.** Move `legacy2019` and `asbuilt52` under `Flere formater`, with all schemas, mappings and tests kept (§4).
5. **Treat the Gemini output as frozen.** Protect it with an ID-normalized golden test before touching the plan. The only intended package change is the filename. It needs one more real Gemini import, and there is a safe fallback (§9).
6. **Report three separate guarantees.** Export can be generated, the output satisfies the schema, and the output has been shown to import into Gemini VA. These are different, and today's Gemini profile can produce a file that passes the first and fails the second (§4).

**First implementation assignment: M0 + M1** (§10). Six decisions are settled. Three real Gemini imports are still needed, and the capture-time policy depends on one of them (§12).

### How this was verified

| Method | Result |
|---|---|
| Read current code | Export plan, XML, package, contract, naming, diagnostics; session; evidence, adoption, manual fill; EXIF, GML; dialogs, inspector, tools menu, `page.js` |
| Read reports | All three named reports, plus the Gemini compatibility, GUID, contract audit, readiness and metadata reports |
| Focused tests | 10 files: **146 tests, 145 pass, 0 fail, 1 skip**. `REF_FILES` is absent on this machine, so the skip is consistent with the optional contractor comparator |
| Real JPEG run | Throwaway scripts in the session scratchpad, read-only, printing aggregates only. Real exifr, `photoSession`, `parseTerrainPhotoGml`, plan and serializer, on the private 148-JPEG corpus and its GML |
| Synthetic EXIF probes | Actual exifr on `gpsJpeg` fixtures with messy tag shapes |
| XSD check | Fresh synthetic output from the current serializer, validated with lxml 6.1.3 against the official Legacy XSD and its dependencies from the existing local cache (no network). Covers Gemini and Legacy; AsBuilt results come from earlier reports |

Not run: browser suites, production build, any Gemini import. The contractor reference was unavailable, so facts about it come from earlier reports.

---

## 2. Verified current architecture and behaviour

### Data flow

```
File ─ readExifGps (exifr) ─► asset.metadataEvidence / asset.directionEvidence / spatial candidates
GML/GMI ─ attachSource ─────► asset.metadataEvidence (GML time) + spatial candidates
                                  │  explicit user action only
      adoptSourceEvidence · setCaptureMetadata · fillMissingPhotoValues · applyPhotoEdits
                                  ▼
accepted: asset.captureMetadata.{captureTime,photographer} · occurrence.direction.current · occurrence.spatial.current
                                  ▼
capturePhotoExportSnapshot (sync) → buildPhotoExportPlan (async: hashes originals, allocates IDs, frozen)
                                  ▼
serializePhotoExport → buildPhotoExportPackage (ZIP, stored, fixed mtime, checksum recheck)
```

Ownership: capture time and photographer belong to the **asset**. Direction and position belong to the **occurrence**. Evidence is never accepted automatically, and this is pinned by tests.

### Current export UI

`PhotoExportDialog.js` is one long modal. It holds the profile select with no default, profile prose, AsBuilt fields, the whole of `PhotoEvidenceActions` and `PhotoManualFillActions`, then a manual `Lag eksportforhåndsvisning` and `Last ned testpakke`. Readiness only appears after the plan runs, and the plan hashes every original. Every adoption clears the preview, so the user must rebuild it.

`Fullfør opplysninger…` is a no-op (`openCompletePhotoDetails`, `page.js:297`). Unlike the other tools it is **not** routed through `requestWorkspaceAction` (`page.js:303`), so this must be fixed when it is wired up.

### Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| F1 | Same-second EXIF and GML times count as conflicts, so bulk adoption is impossible | Corpus: 148/148 `conflicting`; `photoEvidenceAdoption.mjs:10-13` | **High** |
| F2 | Gemini export silently omits unadopted times | Corpus: 0 errors, 0 time elements, with 148 usable EXIF times | **High** |
| F3 | The omission is barely visible: one count in a dense preview line, plus a collapsed `compatibility-time` diagnostic shown as a raw code. Neither says usable evidence exists | `PhotoExportDialog.js:77`; `photoExportDiagnostics.mjs:1-10` | High |
| F4 | Two different definitions of "conflict" | `.000` vs no fraction: adoption `eligible`, inspector conflict `true` (`photoPresentation.mjs:56`) | Medium |
| F5 | Inspector chip says `Uten opptakstid` while usable evidence exists; evidence sits in a collapsed disclosure | `PhotoWorkspaceInspector.js:132,194` | Medium |
| F6 | Export counts include unplaced photos; plan errors do not | `PhotoEvidenceActions.js:23` vs plan | Medium |
| F7 | GML direction is parsed but never becomes evidence | `raw.direction` is unused; corpus: 0 photos with direction evidence | Medium |
| F8 | Stale copy claims Gemini is unverified | Dialog, success text, `experimental-mapping`, `compatibility-import`, button `Last ned testpakke` | Medium |
| F9 | `direction-required` says `Legacy krever…` under Gemini | `photoExportPlan.mjs:98` | Low |
| F10 | Many diagnostic codes have no human label | All `compatibility-*`, `invalid-direction`, `invalid-xml-text`, others | Low |
| F11 | Bulk capture time is still a raw ISO text field | `PhotoManualFillActions.js:41` | Low |
| F12 | Choosing `Annen verdi` prefills `:00` for minute-precision values, so saving unchanged invents seconds | Round trip `14:33` → `14:33:00` `second` | Low |
| F13 | One malformed extra tag discards a good clock | Offset `"  :  "` gives `value: null`, by test (`photoCaptureMetadata.test.mjs:138`) | Low |
| F14 | `Z` values lose their marker in Gemini, and the warning wrongly calls the result local time | `geminiFeature`; `compatibility-time` text | Medium |
| F15 | Plans do not go stale when late EXIF arrives, and export never reports EXIF still being read | `isLive` ignores evidence | Low |
| F16 | Import preview formats time through a separate `Date` trick | `PhotoImportPreview.js:57` | Low |
| F17 | Gemini output without full capture times fails the XSD, yet the plan reports 0 errors and nothing tells the user | Fresh XSD check (§4); `photoExportPlan.mjs:81` skips the time rule for Gemini | **High** |
| F18 | No XSD validation exists in the repository. The harness sits in `%TEMP%`, and `assertGeminiConventions` passes with time absent | `grep` of `tests/`; `geminiPhotoConventions.mjs` | Medium |

---

## 3. Capture-time and EXIF verification

### What each stage establishes

| Stage | Code | Tests | Real JPEG run |
|---|---|---|---|
| EXIF parse | `exifGps.mjs` reads `DateTimeOriginal`, `SubSecTimeOriginal`, `OffsetTimeOriginal`, `Artist` | Real exifr on synthetic JPEG/PNG (`photoCaptureMetadata`, `photoEvidenceAdoption`) | **148/148** usable. All have subseconds, **0** have offsets, 0 Artist, 0 direction |
| Browser path | `chunked: true` with a `File` | Browser suites use synthetic PNGs | 148/148 usable via exifr's chunked Blob path, using a `FileReader` shim in Node, not a real browser |
| Source evidence | `exifCaptureEvidence`, `gmlCaptureEvidence` | Covered | 148/148 assets hold `exif+gml` evidence after attaching the GML |
| Accepted metadata | Explicit actions only | Covered, including "no acceptance on arrival" | EXIF only: 148 adopted. **With GML: 0 adopted (F1)** |
| Readiness | `planEvidenceAdoption` counts + plan errors | Covered for manual and adopted values | Legacy: 148 × `capture-time-required` before adoption. Gemini: 0 errors |
| Exported GML | `fullCaptureTime` + `geminiFeature` | Only **manual** values reach asserted XML | EXIF only, after adoption: 148 elements, all `YYYY-MM-DDThh:mm:ss`, all matching the EXIF clock |

**Test gap.** No automated test asserts an EXIF-derived timestamp in serialized XML. `exportFixture` stubs EXIF and sets time through `setCaptureMetadata`. `photoLoadedGmiUi` clicks EXIF adoption, but its XML assertions check the manual `2026-09-17T10:30:02` value. The chain works on real data, but no permanent test protects it (M0).

### Why the user could not see EXIF times

All of these apply together:

1. **Evidence is not accepted.** That is the intended design, but nothing in the export UI makes it clear.
2. **The export UI shows counts, never values.** No imported time is visible anywhere in the dialog.
3. **With a GML attached (F1)**, the EXIF row reads `0 kan brukes … 148 i konflikt` and the button is disabled at `(0)`.
4. **The workspace agrees with that picture.** The chip says `Uten opptakstid`, the `Mangler opptakstid` filter counts accepted values only, and capture-time sorts treat everything as unknown.
5. **Gemini proceeds anyway (F2, F3).**

So parsing is sound. The failure is in adoption and presentation.

### Still needing verification with real JPEGs

| Item | Why it matters |
|---|---|
| Full browser run on the corpus: import, GML, adopt, download | The real path above ran in Node, not in the UI |
| Photos with `OffsetTimeOriginal` (modern phones) | Corpus has none; offsets are proven on synthetic files only |
| Photos with `GPSImgDirection` | Corpus has none. The contractor reference had 11 of 40 |
| Placeholder offset and subsecond tags from real cameras | exifr trims whitespace and drops blanks, so these mostly pass. `"  :  "` hits F13, which D5 resolves |
| How Gemini/GeoFoto displays exported times | Local or UTC interpretation has not been inspected |

### Date, time and timezone handling

`PhotoCaptureTimeField` and `photoCaptureTimeInput.mjs` already give native date, `time step=1` and a timezone select defaulting to `«Ukjent tidssone»`. **Reuse them; do not rebuild them.** Changes needed:

- Add `requireSeconds` for bulk use, since `fillMissingPhotoValues` rejects anything less. Replace `PhotoManualFillActions`' ISO text field (F11).
- Make the help text profile-aware, e.g. `«Bare dato eksporteres ikke til Gemini VA.»`, replacing the hard-coded Legacy/AsBuilt line.
- Fix F12: when the source has minute precision, keep the prefill but require a change to the time field, and show `«Kilden har ikke sekunder. Oppgi sekunder.»`
- Bulk confirmation: `«Samme tidspunkt brukes på {n} bilder.»`

Timezone rules, unchanged in substance:

- Never infer an offset from date, season, locale or host clock. Never use GPS time to derive one.
- An offset comes only from evidence, an accepted value or an explicit choice.
- Canonical values keep what was accepted. Gemini strips the suffix only at serialization.
- Do not convert `Z` to Norwegian time. Show a recommendation instead (F14):
  `«{n} bilder har tid i UTC. Gemini VA får klokkeslettet uten tidssone, altså UTC og ikke lokal tid.»`

---

## 4. Export profiles

### Audit

| | `gemini-legacy2019` | `legacy2019` | `asbuilt52` |
|---|---|---|---|
| Purpose | Import into Gemini VA/GeoFoto | Standards-shaped Skråfoto 2019 | Norsk Vann AsBuilt 5.2 |
| Import evidence | **Imported from an unmodified app package (user report; §9)** | Never imported | Never imported |
| XSD | Valid only when every feature has time with seconds (§4 matrix) | Valid whenever export is allowed | Valid whenever export is allowed (earlier reports) |
| CRS | Fixed EPSG:5972, XYZ, Z=0 placeholder | 25832/25833, XY | 25832/25833, XY |
| IDs | UUIDv4, new per plan | UUIDv5, stable | UUIDv5, stable, `guid` |
| Effort for users | Low | Medium | High: 7 fields never derived from photos |

### Actual requirements (from code)

| Rule | Code | Owner | Gemini | Legacy | AsBuilt |
|---|---|---|---|---|---|
| At least one placed occurrence | `no-placed-photos` | Layer | Block | Block | Block |
| Unplaced occurrence | `unplaced-excluded` | Occurrence | Excluded | Excluded | Excluded |
| Direction known | `direction-required` | Occurrence | **Block (conservative)** | Block | Optional, omitted |
| Direction valid | `invalid-direction` | Occurrence | Block | Block | Block |
| Capture time with seconds | `capture-time-required`, `capture-time-precision` | Asset | **Recommended**, omitted if absent; schema still requires it | Block | Block |
| Photographer | | Asset | Not exported | Optional, exported | Not exported, warned |
| Photographer XML-safe | `invalid-xml-text` | Asset | n/a | Block | n/a |
| AsBuilt context, 7 fields | `invalid-context` | Delivery | n/a | n/a | Block |
| Supported CRS | `invalid-crs` | Config | Fixed | Block | Block |
| Original readable, hashable | `missing-file`, `file-read-failed` | Asset | Block | Block | Block |
| Attachment naming | `attachment-naming` | Asset | Block | Block | Block |
| Projection | `projection-failed` | Occurrence | Block | Block | Block |
| Plan freshness | `stale-plan` | Plan | Block | Block | Block |

The Gemini profile treats two schema-required fields differently. Direction blocks and time does not. That follows the evidence available when the profile was built: all 40 reference features had direction, and only 26 had time. Blocking on direction is a provisional policy, **not a proven importer requirement** (D1).

### Three separate guarantees

| Level | Question | Decided by | Reliability |
|---|---|---|---|
| **1. Generation** | Can the app produce a package? | Plan errors. Readiness gives the sync subset; files and projection are confirmed at `Pakke` | Exact |
| **2. Schema** | Does the output satisfy the official XSD? | Rules derived from the XSD. The app does not run an XSD validator; the external harness confirms the rule table | Rule-derived, so never called "validated" in UI |
| **3. Import** | Has this kind of output been shown to import into Gemini VA? | A recorded evidence table, updated only by real imports (§9) | Historical evidence, never a prediction for one package |

Current output, measured on fresh synthetic output:

| Output state | 1. Generation | 2. Schema | 3. Import evidence |
|---|---|---|---|
| Gemini, every feature has time with seconds | Yes | **Valid** | Profile imported. Whether the accepted package had times is not recorded |
| Gemini, with offset, fraction or `Z` | Yes | **Valid** after stripping, but `Z` leaves a UTC clock with no marker | As above; offset handling not inspected in Gemini |
| Gemini, time missing | Yes | **Invalid**: `Expected is ( fotograferingstidspunkt )` | Contractor reference only: 14 of 40 lacked time. **Not established for app output** |
| Gemini, date-only or minute time | Yes, time omitted | **Invalid**, same error | As missing |
| Gemini, direction removed (test shape only) | No, blocked | **Invalid**: `Expected is ( retningsvektor )` | Untested (G2) |
| Legacy, full time and direction | Yes | **Valid** | Never imported |
| Legacy, time missing | No, blocked | Not produced | n/a |

The levels do not imply each other, and this project already has evidence in both directions:

- **Levels 1 and 2 do not imply 3.** Early UUIDv5 packages reached `Translation Successful` but produced no usable Foto rows. The XSD does not distinguish UUID versions.
- **Level 3 does not imply 2.** The contractor delivery worked with 14 schema errors from missing time.

Rules for the design:

- `capture-time` stays `recommended` for Gemini. **This update does not change the requirement or the export contract.**
- Level 2 is reported as its own result, so missing time can no longer pass as simply "ready".
- For Legacy and AsBuilt, the plan blocks what the schema needs, so level 1 implies level 2 for the fields covered.
- UI must never use `«validert»`, `«godkjent»`, `«sertifisert»` or `«garantert»` for any level.
- Copy for level 3 comes from the evidence table, so it changes with evidence rather than by rewording.

### Strategy

Only Gemini is practically necessary today. Keep all three working:

- **`Gemini VA`** is preselected and prominent, with `«Anbefalt»`.
- **`Flere formater`** is a collapsed disclosure containing `«Skråfoto 2019 (standard)»` and `«Norsk Vann AsBuilt 5.2»`, each marked `«Ikke testet med import i Gemini.»`
- Add `tier: 'primary' | 'advanced'` to `PHOTO_EXPORT_PROFILES`, and an evidence table `PHOTO_EXPORT_IMPORT_EVIDENCE` (§8.2). UI reads these; serializers ignore them.

**Do not delete** schema mappings, `asbuiltCodes.mjs`, serializers, UUIDv5 logic, byte baselines or tests. They stay under test so the work is ready for Gemini VA's expected wider GML support in 2027.

Wording: drop `(eksperimentell)` from the primary label but make no certification claim:
`«Vellykket importert i Gemini VA/GeoFoto i testet oppsett. Kontroller resultatet etter import.»`

---

## 5. Proposed user experience

Two entry points share one set of rules:

```
Verktøy ─ Fullfør opplysninger… ──► completion tool ──► (optional) Gå til eksport
Verktøy ─ Eksporter… ─► Leveranse ─► Kontroll ─► Pakke ─► Ferdig
                                       │  ▲
              Fullfør opplysninger… ───┘  │ returns, rechecks
              Juster på kartet ──► Edit mode ──┘
```

Principles:

- The wizard **reports**; the completion tool **edits**; Edit mode **handles space**. No editing logic is duplicated.
- Readiness is a pure selector over canonical state, so rechecking is automatic.
- Evidence comes first, then manual entry. Nothing is accepted without an explicit action.
- Show values, not only counts.
- Generation, schema and import are reported separately (§4).
- Nothing suggests entering `0°` to get past a check (D1).

---

## 6. `Fullfør opplysninger…`

### Shape

A hub dialog, not a linear wizard, because tasks are independent. It reuses the `photo-collection-dialog` frame. Left: task list with counts. Right: the active task. Header chip: `«Mål: Gemini VA · Bytt»`. Opened standalone, the target defaults to the layer's last choice, otherwise Gemini.

| Task | Shown when | Badge |
|---|---|---|
| `«Opptakstid»` | Always | `«Påkrevd»` or `«Anbefalt»` per profile. For Gemini, add `«Kreves av skjemaet, men stopper ikke eksporten.»` |
| `«Retning»` | Always | Per profile |
| `«Plassering»` | Unplaced photos exist | `«Blir ikke med»` |
| `«Leveranseopplysninger»` | AsBuilt target | `«Påkrevd»` |
| `«Fotograf»` | Legacy: normal. Otherwise under `«Andre opplysninger»` | `«Valgfritt»`, or `«Tas ikke med i denne leveransen»` |

Scope follows the plan: placed occurrences and their assets (fixes F6). Finished items collapse into `«Ferdig ({n})»` and stay reviewable with their source shown.

### Panel pattern

Every panel runs in this order: **evidence → conflicts → questionable → manual → map.**

**Opptakstid**, per-asset state from `classifyCaptureTime`:

| State | Display | Action |
|---|---|---|
| `adoptable` | Actual values, with a sample row and `«EXIF og GML stemmer overens»` where true | `«Bruk EXIF-tid for {n} bilder»` → `adoptSourceEvidence` |
| `conflict` | Each row shows both values | `«Velg verdi…»` → `PhotoCaptureMetadataDialog` |
| `partial` (accepted or evidence without seconds) | `«Har tid uten sekunder»` | Manual, replacing with `«Erstatter godtatt verdi»` |
| `unusable` | Raw value | Manual |
| `pending` | `«Leser bildedata …»` | Wait; updates live |
| `none` | `«Ingen kildeverdi»` | Manual via `PhotoCaptureTimeField` |
| `accepted` | Value and source | Editable in `Ferdig` |

**Retning**:

1. `«Bruk EXIF-retning for {n} plasseringer»`, with the existing shared-original caution when `repeatedApplications > 0`.
2. `«Bruk GML-retning for {n} plasseringer»` for non-zero GML values.
3. GML `0°`, kept apart and never in the action above: `«Godta GML-retning 0° for {n} plasseringer»`, with `«0° kan bety at retningen mangler i kildesystemet. Godta bare hvis bildene er tatt mot nord.»` (D2, §8.4).
4. `«Angi på kartet»` as the primary route for the remainder (§7.3).
5. `«Samme retning for alle valgte»`, de-emphasized, with an empty field and no default. Entering `0` shows `«0° betyr nord, ikke ukjent retning.»`
6. Magnetic or unknown reference: listed, never adopted.

No copy tells users to enter `0°`, and no field prefills it (D1). A photo with truly unknown direction currently has no export route under the blocking rule. That is a known cost of the provisional policy, and G2 decides whether it can be relaxed.

**Fotograf**: EXIF Artist adoption, then a bulk text field with values already used in the layer as suggestions.

**Plassering**: `«Plasser på kartet»` (Edit mode) and `«Koble og posisjoner bilder…»` (existing wizard).

**Leveranseopplysninger**: the seven existing AsBuilt fields. Values go in the per-layer export configuration, not on photos. `EXIF capture time` must never prefill `Datafangstdato`.

### Questionable values

Non-blocking recommendations, computed in readiness:

| Code | Trigger | Copy |
|---|---|---|
| `capture-time-utc` | Gemini + accepted `Z` | See §3 |
| `capture-time-implausible` | Before 2000, or after now | `«{n} bilder har en usannsynlig dato.»` |
| `capture-time-bulk` | Accepted through bulk fill | `«{n} bilder har samme manuelt angitte tid.»` |
| `direction-all-zero` | At least 5 placed and at least half exactly `0°` | `«{n} bilder peker nøyaktig mot nord. Kontroller at dette stemmer.»` |
| `direction-bulk` | Accepted through bulk fill | `«{n} plasseringer har samme manuelt angitte retning.»` |
| `evidence-pending` | EXIF still reading | `«Leser fortsatt bildedata for {n} bilder.»` |

### Reuse

Keep: `PhotoCaptureMetadataDialog` (nested native dialog, owned by the tool), `PhotoCaptureTimeField`, `planEvidenceAdoption`, `planManualPhotoFill`, `adoptSourceEvidence`, `fillMissingPhotoValues`, `setCaptureMetadata`, `requestWorkspaceAction`, `enterPhotoEditMode`, `openPhotoSources`, workspace filters, the toast.

Retire after M6: `PhotoEvidenceActions.js`, `PhotoManualFillActions.js`. Their logic stays in the pure modules. Selection-scoped completion, lost in Pass 1, returns through row checkboxes.

---

## 7. Export wizard

Reuses the wizard frame, `PhotoWizardSteps`, the footer pattern and `PhotoSourceOption` cards. Title `«Eksporter bilder»`. Steps `«Leveranse · Kontroll · Pakke»`, followed by a done panel.

### 7.1 Steps

**1. Leveranse.** Gemini card preselected, `Flere formater` collapsed. CRS select appears only for advanced profiles. A live line under the selected card gives the immediate result: `«148 kan eksporteres»` or `«3 må rettes»`. It never says `«klar»` alone. Footer: `«Neste»`.

**2. Kontroll.** Pure readiness, no hashing, so it is immediate.

| Result | Heading | Primary | Secondary |
|---|---|---|---|
| Blocking | `«{n} må rettes før eksport»` | `«Fullfør opplysninger…»` | `«Neste»` disabled, with the reason as text |
| Schema gap | `«Kan eksporteres, men følger ikke skjemaet»` | `«Fullfør opplysninger…»` | `«Fortsett uten»` |
| Recommendations only | `«Klar, men {n} kan forbedres»` | `«Fullfør opplysninger…»` | `«Fortsett uten»` |
| Clean | `«Klar for eksport»` | `«Neste»` | |

Below the heading, a status block `«Slik står leveransen»` always shows the three levels on separate rows:

| Row | Possible text |
|---|---|
| `«Eksport»` | `«Kan lages»` · `«Kan ikke lages ennå»` |
| `«Skjema»` | `«Følger Skråfoto 2019-skjemaet»` · `«Følger ikke Skråfoto 2019-skjemaet: {n} bilder mangler opptakstid»` |
| `«Gemini VA»` | `«Profilen er importert i Gemini VA/GeoFoto i testet oppsett.»` · `«Uten opptakstid: ikke bekreftet importert fra denne appen.»` · `«Ikke testet med import i Gemini.»` |

Then one fixed line: `«Kontroller alltid resultatet i Gemini etter import.»` The wording in the `«Skjema»` row uses the profile's schema name, e.g. `«AsBuilt 5.2-skjemaet»`.

Groups: `«Må rettes»`, `«Anbefalt»`, `«Blir ikke med»`, and collapsed `«Slik blir leveransen»` (Z placeholder, no timezone, no photographer, omitted object links, shared originals).

When evidence is available, say so plainly: `«148 bilder mangler opptakstid, men tiden finnes i EXIF.»` This directly fixes F2.

**`Fortsett uten` (D4).** One click, no confirmation dialog. The consequences sit directly above the button under `«Hvis du fortsetter:»`, listing only what applies:

| Situation | Text |
|---|---|
| Time missing | `«{n} bilder får ikke opptakstid i GML-filen, og filen følger ikke skjemaet.»` |
| Time without seconds | `«{n} bilder har tid uten sekunder. Tiden utelates, og filen følger ikke skjemaet.»` |
| Time in UTC | `«{n} bilder får UTC-klokkeslett uten tidssone.»` |
| Many `0°` | `«{n} bilder beholder retning 0°, som kan bety at retningen mangler.»` |
| EXIF still reading | `«Bildedata for {n} bilder er ikke ferdig lest.»` |

**3. Pakke.** The plan builds automatically on entry: `«Kontrollerer originalfiler …»`. Plan-only failures (files, projection, naming) appear here with a route back. Content: the same status block, optional `«Navn på leveransen (valgfritt)»`, the final name, a file tree, counts, total size, and renamed attachments only if any. Label edits do **not** rebuild the plan, so IDs stay stable. Primary: `«Last ned ZIP»`.

**Ferdig.** `«ZIP-pakken er lastet ned.»` then `«Pakk ut filen. Importer {navn}.gml i Gemini VA med Attachments-mappen ved siden av. Kontroller resultatet i Gemini.»` With a schema gap, add `«Pakken følger ikke skjemaet fordi {n} bilder mangler opptakstid.»` Buttons: `«Last ned på nytt»`, `«Lukk»`.

### 7.2 Handoff to the completion tool

Swap rather than stack. The wizard unmounts, the tool mounts with `returnTo: 'export'`, and `«Tilbake til eksport»` remounts the wizard at Kontroll. Native dialog focus and Escape stay simple, and `photoDialog` remains single-valued. The nested per-photo dialog is the only stacked modal.

New `page.js` state:

- `photoExportConfig`: `Map(layerId → { profile, crs, context, label })`, transient, cleared on `clear()` and layer deletion. It holds choices through dialog changes.
- `photoExportFlow`: `{ layerId, step } | null`, set only during a handoff.

Any built plan is discarded on return, and the existing token and `isLive` guards stay.

### 7.3 Handoff to Edit mode

For `«Angi på kartet»` or `«Plasser på kartet»`:

1. Save `photoExportFlow` and the current filter. Close the dialog.
2. Set the filter (`missingDirection` or placement `unplaced`), select the first match, enter Edit mode through `requestWorkspaceAction(enterPhotoEditMode)`.
3. The command bar gains `«Mangler retning: {n}»`, `«Neste»` and `«Tilbake til eksport»`.
4. Return goes through `requestWorkspaceAction`, so the existing Save/Discard boundary applies. Then the filter is restored and the dialog reopens at the right place.

Invariants: staged values stay invisible to readiness and export. The bar's count uses effective photos; readiness uses canonical ones. They agree once saved, and return cannot bypass that boundary. No changes to undo/redo, gestures or Escape order.

`Koble og posisjoner bilder…` follows the same pattern through its `onClose`.

---

## 8. Metadata and readiness design

### 8.1 Layers

```
photoExportRules.mjs        requirements table + sync rule evaluation (codes, messages)
   ▲ called by                                  ▲ called by
photoExportPlan.mjs                     photoExportReadiness.mjs
(adds async-only checks: hash,          (adds evidence hints, recommendations,
 naming, projection, stale)              task groups for UI)
                                               ▲
                                  completion tool + export wizard
```

**This replaces the earlier "no diff in `photoExportPlan.mjs`" gate.** A parity test alone leaves two implementations, which is what the brief wants to avoid. The refactor is confined to about six validation statements. IDs, coordinates, serialization and package code stay untouched, and M0 golden tests protect the bytes. If the refactor proves risky, the fallback is readiness plus parity tests only.

### 8.2 API

```js
// photoExportRules.mjs
PHOTO_EXPORT_REQUIREMENTS = {
  'gemini-legacy2019': { direction: 'required', captureTime: 'recommended', photographer: 'omitted',  context: false },
  legacy2019:          { direction: 'required', captureTime: 'required',    photographer: 'optional', context: false },
  asbuilt52:           { direction: 'optional', captureTime: 'required',    photographer: 'omitted',  context: true  },
};
// What the applicable XSD needs on every feature. Independent of what the profile blocks.
PHOTO_EXPORT_SCHEMA_REQUIREMENTS = {
  'gemini-legacy2019': { schema: 'Skråfoto 2019', captureTime: true,  direction: true  },
  legacy2019:          { schema: 'Skråfoto 2019', captureTime: true,  direction: true  },
  asbuilt52:           { schema: 'AsBuilt 5.2',   captureTime: true,  direction: false },
};
// Updated only by real imports. Drives level 3 copy.
PHOTO_EXPORT_IMPORT_EVIDENCE = {
  'gemini-legacy2019': { profile: 'imported', missingCaptureTime: 'unconfirmed', missingDirection: 'untested', renamedGml: 'untested' },
  legacy2019:          { profile: 'none' },
  asbuilt52:           { profile: 'none' },
};
evaluatePhotoExportRules({ profile, crs, context, assets, occurrences }) → { errors, warnings }

// photoExportReadiness.mjs
photoExportReadiness(photos, { profile, crs, context, now }) → {
  status: 'blocked' | 'schema-gap' | 'recommendations' | 'ready',
  levels: {
    generation: 'possible' | 'blocked',       // sync subset; files and projection confirmed at Pakke
    schema: { met: boolean, gaps: [{ field, count }] },
    importEvidence: { profile, deviations: [{ field, state }] },
  },
  counts: { placed, excluded, readyOccurrences, ... },
  blocking: [...], recommendations: [...], excluded: [...], notes: [...],
  tasks: { captureTime, direction, photographer, placement, context },
}
classifyCaptureTime(photo, requirement) → one state from §6
```

Rules:

- Scope matches the plan: placed occurrences and their assets.
- Ownership: asset rules count once per asset, occurrence rules per occurrence.
- Blocking is identical to the plan for the same canonical state, apart from async-only checks.
- Readiness is synchronous and never reads file bytes.
- `now` is injected, so results are deterministic.
- Readiness never writes.

Message fixes in the same step: profile-neutral `direction-required` (F9), full diagnostic labels (F3, F10). Codes stay stable because tests and `data-diagnostic-code` use them.

### 8.3 Capture-time agreement (fixes F1, F4)

One exported function in `photoCaptureMetadata.mjs`, used by both `evidenceEligibility` and `photoMetadataConflict`:

`captureTimesAgree(a, b)` is true when:

- the wall clocks match to the lower precision of the two (subseconds ignored), **and**
- the offsets are equal, or at least one is unknown.

Every pair must agree, because "unknown" is not transitive: `+01:00` and `+02:00` can both match an unknown value without matching each other.

Examples:

| A | B | Result |
|---|---|---|
| `14:33:02.012` | `14:33:02` | Agree (corpus case) |
| `14:33:02+02:00` | `14:33:02` | Agree: the offset adds information |
| `14:33:02` | same date, date-only | Agree: less precise, not contradictory |
| `12:33:02Z` | `14:33:02+02:00` | **Conflict**: same instant, but Gemini output would differ |
| `14:33:02` | `14:33:03` | Conflict: no tolerance |

"No source wins by ranking" still holds. The requested source's exact value is accepted, and agreeing evidence is recorded in provenance as today. On the corpus, the EXIF value after stripping equals the GML value to the second.

### 8.4 GML direction evidence (F7)

Add `gmlDirectionEvidence(source, entry)`:

- Unit `1` and reference `1` with a value in range → `usable`.
- Anything else → `unsupported-reference` or `invalid`. No conversion.
- `drainMetadata` currently **replaces** `directionEvidence`. It must keep non-EXIF items, as it already does for metadata evidence, or GML evidence is lost when EXIF arrives late.

**Handling of GML `0°` (D2).** In the corpus GML, **148/148 directions are exactly 0**, and none of those JPEGs has EXIF direction. The contractor reference has 29/40 zero and 11 fractional, and exactly 11 of its images have EXIF direction (earlier report; the overlap was not checked). That suggests `0` often means "not recorded", but it is not proof, and a zero can be genuine north. So:

- Keep `0°` as source evidence, with its raw value. It is not discarded or marked invalid.
- Mark it `status: 'usable-zero'`. Default bulk adoption skips it and counts it separately (`zeroNeedsReview`).
- Explicit acceptance goes through `adoptSourceEvidence(…, 'direction', 'gml', ids, { includeZero: true })`, with the warning in §6.
- **It must not take part in conflict detection against other sources.** `evidenceEligibility` compares all usable evidence, so a GML `0°` would otherwise block a real EXIF direction as a false conflict, repeating F1.
- This applies to GML only. EXIF `0°` with reference `T` stays ordinary usable evidence.

### 8.5 Smaller evidence items

- F13 (D5): when `DateTimeOriginal` is valid but `SubSecTimeOriginal` or `OffsetTimeOriginal` is malformed, keep the clock. A bad offset means timezone unknown; a bad subsecond means second precision. The full raw tags stay in `raw`, and an `issues` list names what was ignored. Nothing is invented. An invalid `DateTimeOriginal` still gives `value: null`.
- F16: replace the import preview's formatter with `formatPhotoCaptureTime`.
- F5: chip becomes `«Opptakstid i kilde»` when evidence exists but none is accepted. The filter stays accepted-based, because that is what export uses.

---

## 9. Compatibility constraints

### Must not change for `gemini-legacy2019`

| Area | Frozen behaviour |
|---|---|
| IDs | `crypto.randomUUID()` during plan construction only. Separate collection, feature and Point IDs. `gml:id` = `id` + UUID. `lokalId` = feature UUID. Never regenerated in XML or ZIP. Not stored in session |
| Header | `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>`; root attribute order `xmlns:gml, gml:id, xmlns:app, xmlns:xlink, xmlns:xsi, xsi:schemaLocation` |
| Namespace | 20190101 |
| Bounds | First child, 3D `Envelope`, EPSG::5972, six decimals |
| Geometry | No `srsName` on Point or pos. `srsDimension="3"` on both. Six decimals. `Z = 0.000000`, a placeholder that is never measured height. Horizontal through EPSG:25832 |
| Feature order | `gml:name`, point, `fotolink`, `retningsvektor/Retning` (value, unit, reference; `1`/`1`), identification with empty `<app:navnerom/>`, optional time |
| Attachments | `gml:name` = attachment filename. XML `Attachments\name`, ZIP `Attachments/name`. `planAttachmentNames` unchanged |
| Time | No offset, no fraction, omitted without seconds |
| Image info | `fotoinformasjon` omitted |
| Package | GML at ZIP root, no wrapper folder. Stored entries. Fixed `mtime`. Original bytes with checksum recheck. Liveness guards |

Legacy and AsBuilt keep UUIDv5, identifiers and exact bytes (existing SHA-256 baselines).

Not all of these are proven causal. Only UUIDv4 is a confirmed blocker. The rest stay frozen because the accepted package had them, and this project does not need to find out which are optional.

### Compatibility evidence (D6)

History:

1. An app-generated four-photo package reached Gemini's FME conversion with `Translation Successful`, but produced no usable Foto rows. All four features were rejected with `lokalId is not a valid guid`. Their IDs were UUIDv5.
2. A controlled package with UUIDv4 identifiers resolved the failure. All four records appeared and were registered in GeoFoto.
3. The production app's **unmodified** `gemini-legacy2019` package was subsequently imported successfully into Gemini VA/GeoFoto (user report).

| Status | What |
|---|---|
| **Demonstrated** | UUIDv5 `lokalId` rejected and UUIDv4 accepted in the tested path. The full route: package, FME conversion, Foto mapping, Gemini VA import, GeoFoto, from an unmodified app package |
| **Reference only** (contractor file, not app output) | Missing time on 14 of 40 features worked. Unicode attachment names. Non-zero and zero Z values |
| **Not established** | Gemini VA and FME versions. Scope of repeated or shared-original testing. Whether the accepted package contained capture times. Package size limits |
| **Untested assumptions** | Missing direction. A GML filename other than `photos.gml`. Which frozen conventions are truly needed. How Gemini interprets times without a timezone. Uppercase `.JPG`: names keep their case and the reference had only lowercase, while part of the private corpus uses uppercase. Re-delivery: every plan issues new UUIDs, so re-importing the same photos may duplicate them in GeoFoto |

None of this is certification. UI and documentation may say the profile has been imported in a tested setup, and no more.

### File naming (`photoExportNaming.mjs`, new, pure)

```
{stamp}[-{label}][-{profile-suffix}]
20261104-182300.zip
20261104-182300-Prosjekt-A.zip
  ├─ 20261104-182300-Prosjekt-A.gml
  └─ Attachments/…                     (unchanged)
```

- `stamp`: `YYYYMMDD-HHMMSS`, device local clock, injected `now`. Seconds avoid same-minute collisions.
- The stamp is fixed **when the plan is built**, so preview and download match, and the same name always means the same content and IDs. A rebuild gives a new stamp and new IDs.
- It is a delivery label, never capture data. ZIP `mtime` stays fixed.
- Profile suffix: none for Gemini. `skrafoto2019-25832` and `asbuilt52-25832` otherwise.
- ZIP and GML share the same basename.

`sanitizeExportLabel`: NFC; `æ→ae`, `ø→o`, `å→a` (and capitals); strip diacritics; spaces to `-`; keep `[A-Za-z0-9_-]`; collapse repeats; trim; maximum 48 characters; empty means no label. The preview shows the result, so changes are visible. Example hint: `«Æ, Ø og Å gjøres om i filnavnet.»`

Why ASCII (D3): Unicode in **attachments** has import evidence, from the contractor file. Unicode in the **GML filename** has none, and a conservative rule costs little. This applies only to the ZIP and GML names. Attachment names, including Norwegian letters, and their paths stay exactly as `planAttachmentNames` produces them.

Code change: `buildPhotoExportPackage(plan, { gmlFilename = 'photos.gml' } = {})`, validated against a strict pattern. The default keeps existing tests valid. `compatibility-import` must stop naming `photos.gml`; the wizard states the real name.

**Risk and fallback.** The app's accepted package used `photos.gml`. The contractor's GML filename is not recorded in earlier reports, and the corpus GML uses a dated project name, so a different name is likely fine but unproven for this exporter. Gate G1 settles it. If it fails, keep the timestamped ZIP and leave `photos.gml` inside. That is a one-line change.

---

## 10. Implementation milestones

Size is relative. "Strong" means the work needs careful reasoning about invariants and should get the strongest available model and close review. "Standard" is straightforward.

| # | Milestone | Size | Reasoning |
|---|---|---|---|
| M0 | Safety net | S | Standard, but review carefully |
| M1 | Evidence correctness | S–M | **Strong** |
| M2 | Rules and readiness | M | **Strong** |
| M3 | Completion tool | L | Standard, after design review |
| M4 | Edit-mode and dialog handoff | M | **Strong** |
| M5 | Naming and package | S | Standard code, **real Gemini test** |
| M6 | Export wizard and retirement | M–L | Standard, with strong review of plan lifecycle |
| M7 | Copy, acceptance, docs | S | Standard |

### First assignment: M0 + M1

**Recommended first implementation assignment.** It protects the accepted output, then fixes the defect that loses capture times on real data. It needs no Gemini import, makes no UI redesign, and changes no export contract.

Includes:

- Golden and parity tests protecting the accepted Gemini output.
- Permanent EXIF-to-export regression coverage.
- The shared capture-time agreement fix.
- Verification against the 148-photo corpus.
- The evidence and presentation corrections listed under M1.

Done when:

- M0 tests pass **before** any production change, and stay unchanged after M1.
- Corpus with GML attached: 0 false conflicts, 148 adoptable, and after adoption 148 Gemini time elements matching EXIF to the second.
- `git diff` shows no change to `photoExportPlan.mjs`, `photoExportXml.mjs`, `photoExportPackage.mjs`, `attachmentNames.mjs` or `exportContract.mjs`. The plan refactor belongs to M2.
- The external XSD harness gives the §4 results.

**M0 — Safety net (tests only).** Gemini golden XML with IDs normalized. Permanent JPEG EXIF → adopt → XML test. Snapshot of plan errors per scenario, which M2 later turns into the parity matrix. Turn the scratchpad corpus checks into an opt-in test using `PHOTO_GML_FIXTURE`.

**M1 — Evidence correctness.** `captureTimesAgree`, applied to adoption and inspector. GML direction evidence with `0°` safeguards, including the `drainMetadata` fix. F5, F12, F13 (D5), F16. **This is worth shipping on its own**, since it fixes the real corpus. The explicit `0°` action has no UI until M3, so GML `0°` stays unadopted until then.

Test impact: the conflict fixtures in `photoEvidenceAdoption.test.mjs:106` and `photoManualFill.test.mjs:173` use different dates, so they stay true conflicts. `photoCaptureMetadata.test.mjs:138` **must change on purpose** for D5: malformed offset and subsecond now keep the clock, while the invalid-date case still gives `null`.

### Later milestones

**M2 — Rules and readiness.** Extract `photoExportRules.mjs` and call it from the plan. Add `photoExportReadiness.mjs` with the three levels, profile metadata, evidence table and diagnostic labels. Gate: M0 golden tests unchanged.

**M3 — Completion tool.** Wire the placeholder through `requestWorkspaceAction`. Hub, panels, classification, bulk field, nested per-photo dialog, `photoExportConfig`. The old export dialog stays working in parallel.

**M4 — Handoff.** `photoExportFlow`, filter save and restore, command-bar context, return through the boundary. Positioning wizard return.

**M5 — Naming.** `photoExportNaming.mjs`, `gmlFilename` option. Ends with gate G1, before the wizard depends on it.

**M6 — Wizard.** `PhotoExportWizard.js` replaces `PhotoExportDialog.js`, with the three-level status block. Remove `PhotoEvidenceActions`, `PhotoManualFillActions`, `photoExport.css`. Migrate `photoLoadedGmiUi` export scenarios.

**M7 — Close-out.** Remaining copy (F8). Final browser run on the corpus. Update compatibility report and evidence table.

The completion tool (M3) comes before the wizard (M6). M5 can run alongside M3 or M4. M1 does not depend on M0's corpus test, only on the golden tests.

### Real Gemini import gates

Separate from the milestones, because only a person with Gemini VA access can run them. One session can cover all three. Test packages for G2 and G3 come from a test helper outside Git. **No product change is needed to produce them.**

| Gate | Package | Needed by | If accepted | If rejected |
|---|---|---|---|---|
| **G1 Renamed GML** | Timestamped ZIP with `{stamp}-{label}.gml` | **Blocks M6** | Keep naming; set `renamedGml` | Keep the ZIP name, leave `photos.gml` inside |
| **G2 Direction omitted** | Direction removed on some features, otherwise normal | Before M6 if possible. Does not block | Reconsider direction as `«Anbefalt»` (a new decision). The output would be schema-invalid, so it would join time as a level 2 gap | Direction stays blocking; the provisional label is dropped |
| **G3 Time omitted, app output** | Mixed: some features with time, some without | **Before M6**, since the wizard's copy depends on it | Time stays `recommended`; level 3 copy changes to confirmed | Capture-time policy needs a new decision, likely blocking. This would change the export contract |

Record for each: Gemini VA and FME versions, photo count, diagnostics, row counts, and whether attachments open.

### Highest-risk changes

| Risk | Mitigation |
|---|---|
| Plan refactor alters output or blocking | M0 goldens first; parity matrix; touch validation lines only; fallback is no plan change |
| Looser agreement hides a real conflict | Same second required, no tolerance; differing known offsets remain conflicts; pairwise test |
| GML `0°` adopted as truth | Excluded from default bulk action; explicit wording; `direction-all-zero` |
| GML `0°` blocks a real EXIF direction | Excluded from conflict detection; dedicated test |
| Users enter `0°` to pass the check | No prefill or suggestion; warning on entry; G2 |
| Schema gap read as a guarantee | Three-level status block; banned-word check; copy from the evidence table |
| Renaming the GML breaks import | G1; one-line fallback |
| Dialog and Edit handoff loses staged data or state | All returns through `requestWorkspaceAction`; swap rather than stack; browser tests per exit path |
| `drainMetadata` overwrites GML direction evidence | Dedicated late-EXIF test |
| Large layers | Readiness never hashes; show total size. ZIP is built in memory, unchanged. Size guidance is a later option |

---

## 11. Testing and acceptance

### Parity and regression

| Test | Asserts |
|---|---|
| Gemini golden | Whole document byte-equal after normalizing UUIDs; repeated, fractional, missing-time and Unicode cases |
| Legacy/AsBuilt baselines | Existing SHA-256 tests, unchanged |
| Conventions helper | `assertGeminiConventions` on every wizard-produced package |
| **Readiness/plan parity matrix** | Profile × time (none, date, minute, second, fraction, offset, `Z`) × direction (none, 0, fractional, invalid) × placed/unplaced × repeated × photographer (none, valid, XML-invalid) × context. Same set of `{code, assetId, occurrenceId}` |
| Rule ownership | Asset rule counted once with repeated occurrences; occurrence rule per occurrence |
| Plan purity | Readiness and naming never write; never call `randomUUID`; never read file bytes |
| ID stability | Label change keeps XML identical; repeat download identical; new plan gives new IDs and stamp |
| Package | Entry list `[gml, ...attachments]`; default `photos.gml`; XML and attachment bytes independent of name |
| **Level matrix** | `levels.schema` matches the §4 table for every time and direction state, with the plan still returning 0 errors for Gemini missing time. Capture-time contract unchanged |

### New domain tests

- `captureTimesAgree` table, including the non-transitive case.
- Eligibility and inspector conflict never disagree.
- JPEG EXIF → adoption → XML for all three profiles.
- Gemini strips offset and fraction but keeps the wall clock; `Z` raises `capture-time-utc`.
- GML direction unit/reference handling; late EXIF keeps GML evidence.
- GML `0°`: retained as evidence; skipped by default bulk adoption; adopted only with `includeZero`; does not conflict with a real EXIF direction. EXIF `0°` with reference `T` is unaffected.
- D5: malformed offset keeps the clock with timezone unknown; malformed subsecond keeps second precision; raw tags retained; invalid date stays `null`.
- `classifyCaptureTime` for every state.
- Sanitizer: `æøå`, spaces, path separators, `..`, reserved characters, emoji, empty, overlong. Local-clock stamp independent of `TZ`.
- Questionable-value thresholds at their boundaries.

### Browser tests

- Completion tool: all tasks, selection-scoped apply, nested dialog, keyboard and focus.
- Wizard: each readiness state; three-level block; `Fortsett uten` with its consequences and no dialog; blocked `Neste` reason; label; download.
- Round trips: wizard → tool → back rechecks; wizard → Edit → Save → back; Discard; unsaved boundary; Escape never loses data.
- Layer deletion and `clear()` during a flow.
- 1366×768, 1280×720, narrow; no horizontal overflow.

Migrate `photoLoadedGmiUi.test.mjs` export scenarios (`Lag eksportforhåndsvisning`, `Last ned testpakke`, `photos-${profile}-${crs}.zip`, `Gemini-kompatibilitet er ikke verifisert`). These are intentional; keep all safety assertions.

Also run the external XSD harness as earlier reports did: all-times-present Gemini valid, missing-time invalid as expected, standards baselines valid. It lives outside Git (F18) and needs `lxml`, so it is a manual gate rather than an automated one.

### Acceptance criteria

1. On the corpus with GML attached, one explicit action adopts times for all 148, and the Gemini GML has 148 elements matching EXIF to the second.
2. Before adoption, Kontroll states that the times exist in EXIF and shows sample values.
3. Readiness and plan agree across the whole matrix.
4. A golden diff shows no Gemini XML change, apart from any intended later decision.
5. Legacy and AsBuilt bytes are unchanged, and both remain selectable.
6. Default flow: Verktøy → Eksporter → Leveranse → Kontroll → Pakke → download, with Gemini preselected.
7. The wizard contains no metadata-writing code. Check by grep for `adoptSourceEvidence`, `setCaptureMetadata`, `fillMissingPhotoValues`.
8. No timezone is produced without evidence, an accepted value or an explicit choice.
9. Returning from the tool or Edit mode rechecks with no manual step.
10. **Real Gemini VA import of an untouched wizard package, with a timestamped GML name and a label, reaches GeoFoto with correct count, attachments, position, direction and time (G1).**
11. With missing time, Kontroll shows `«Kan lages»` and `«Følger ikke…»` on separate rows, and no UI text implies that a schema gap or a generated package is safe to import.
12. No UI text uses `«validert»`, `«godkjent»`, `«sertifisert»` or `«garantert»`, and none suggests entering `0°`.

---

## 12. Decisions and validation status

### Settled decisions

| # | Decision | Effect |
|---|---|---|
| **D1** | Direction stays blocking for Gemini, **provisionally**, because the accepted output contains direction. Never encourage `0°` to satisfy readiness | §4, §6. Reviewed after G2 |
| **D2** | GML `0°` stays as source evidence, excluded from default bulk adoption, with explicit acceptance and a warning. Zero is not assumed invalid | §6, §8.4 |
| **D3** | ASCII-safe ZIP and GML names, transliterating `æ`, `ø`, `å`, with the timestamp and optional label convention. Attachment names and paths unchanged | §9 |
| **D4** | `«Fortsett uten»` is allowed for non-blocking recommendations, explaining what is omitted or degraded. No confirmation dialog | §7.1 |
| **D5** | A valid capture time survives a malformed offset or subsecond tag. That information becomes unknown, raw evidence stays, nothing is invented | §8.5 |
| **D6** | Compatibility evidence is documented as history, separating demonstrated from untested. No certification claim | §9 |
| **D7** | Generation, schema and import are reported as three separate levels. The capture-time requirement and export contract are not changed by this plan | §4, §7.1, §8.2 |

### Experiments awaiting validation

| Gate | Question | Blocks | Depends on it |
|---|---|---|---|
| **G1** | Does Gemini accept a GML not named `photos.gml`? | M6 | Final naming, or the fallback |
| **G2** | Does Gemini accept features without direction? | Nothing | Whether D1 is reopened |
| **G3** | Does Gemini accept app output with some times missing? | M6 | Whether time stays `recommended`, and level 3 copy |

Optional, when convenient: re-import the same delivery to see whether GeoFoto duplicates photos given new UUIDs. If it does, that needs a design of its own.

### Policy decisions still depending on a real import

- **Capture time for Gemini.** It stays `recommended` until G3. Contractor evidence supports tolerance, but it is not app output. If G3 fails, making time blocking would be a contract change and needs a separate decision.
- **Direction for Gemini.** It stays required until G2. Accepted omission would reopen the question, not settle it, because the output would also fail the schema.

### Unresolved

- **Did the accepted unmodified package contain capture times?** It is not recorded, and F1 and F2 mean it may have had few or none. If you can check that package, level 3 wording can be firmer, and G3 may need only the mixed case.
- **Gemini VA and FME versions, and shared-original scope.** Unknown, per D6. Record them at the next import session.

---

## 13. What this supersedes

| Earlier plan | Now |
|---|---|
| `Klargjør for eksport…` hub | `Fullfør opplysninger…`, standalone and independent of export |
| Separate `Eksporter` dialog after it | Staged wizard with handoff and automatic recheck |
| Three equal profile cards, explicit choice | Gemini default, others under `Flere formater` |
| `photoExportPlan.mjs` must have no diff | Validation-only refactor; gate is byte and parity tests |
| Package filename unchanged | Timestamp naming; `gmlFilename` option |
| GML direction deferred | Evidence, with `0°` safeguards |
| Readiness duplicates plan predicates | One shared rule module |
| `Klar for eksport` as the single readiness signal | Three separate levels |

## 14. Out of scope

EXIF-position comparison, reverse geocoding, automated EXIF correction, object relations in GML, canonical Z, persistence, ZIP streaming, merging the import and positioning wizards, any deletion of schema implementations, and any change to the capture-time requirement before G3. Moving the XSD harness into the repository (F18) is a possible follow-up, not part of this plan.

## 15. Decision log

| Date | Entry |
|---|---|
| 2026-11-04 | First version of this report, with six open decisions |
| 2026-11-04 | Review: D1–D6 settled as recorded in §12 |
| 2026-11-04 | D7 added: three readiness levels. Fresh XSD check confirmed that Gemini output without full capture times is schema-invalid while the plan reports no errors. Contract unchanged |
| 2026-11-04 | Gates G1 and G2 kept separate from milestones. G3 added, because no report records whether accepted app output lacked capture times |
| 2026-11-04 | GML `0°` excluded from conflict detection, so D2 cannot cause a false conflict with EXIF direction |
| 2026-11-04 | M0 + M1 set as the first implementation assignment |

No code changes, commit or push were made.
