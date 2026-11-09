# GMI editing M4: Rettinger workspace and individual object corrections

Date: 2026-11-09. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, starting commit `b17b3ef`.
Scope: **Milestone M4** from `20261108-gmi-editing-combined-delivery-planning.md` (§6, §10). It builds on M1 (`…113731…`), M2 (`…120021…`) and M3 (`…123901…`).

Not changed:
- the M1/M2/M3 libraries (`src/lib/gmi-edit/*`, `src/lib/gmiEditSessions.mjs`);
- `GMIParser`, fixtures and manifests;
- FOTO behaviour.

Not implemented (out of scope): batch builder, Validator correction buttons (M5), column insertion (M6), hyperlink removal (M7), FOTO delivery intent (M8) and combined delivery (M9/M10).

No commit, no push.

---

## 1. Files changed

| File | Status | Purpose |
|---|---|---|
| `src/lib/gmiEditView.mjs` | new | Pure view helpers: Norwegian messages for every M1/M2/M3 code, the UI field policy, form planning (overwrite/replace needs, lexeme validation), change-list dependents, and a proposed-view memo per published status. |
| `src/components/gmi-edit/GmiEditWorkspace.js` | new | Left panel of Rettinger: header and status, *Objekter* / *Endringer* tabs, undo/redo, *Forkast alle*, download, and the guard for unsubmitted form values. |
| `src/components/gmi-edit/GmiObjectEditor.js` | new | Right-hand object inspector/editor: form → review → stage. |
| `src/components/gmi-edit/GmiChangeList.js` | new | Staged ChangeSets in order. |
| `src/components/gmi-edit/GmiExportDialog.js` | new | *Last ned revidert GMI* (Eksperimentell). |
| `src/components/gmi-edit/GmiConfirmDialog.js` | new | Shared confirmation for anything that would discard corrections. |
| `src/components/gmi-edit/useGmiEditLayer.js` | new | Subscribes to `gmiEditStatus[layerId]`; derives handle, document and change list once per published revision. |
| `src/components/gmi-edit/gmiEdit.css` | new | Styles, using the existing tokens and FOTO workspace density. |
| `src/app/page.js` | changed | Rettinger slot in `WorkspaceShell`, inspector `<aside>`, reordered and guarded `handleReset`, reset confirmation. |
| `src/components/LayerPanel.js` | changed | Rettinger entry on GMI layer cards, a corrections pill, the `invalidated` notice, and removal that checks the result and needs an explicit discard. |
| `src/components/LayerDataTable.js` | changed | *Original / Foreslått / Kun endrede* modes, changed-cell marking, and row click → Rettinger object. |
| `src/lib/store.js` | changed (+52) | View state only: `gmiEditWorkspace`, `gmiEditTableView`, `gmiEditObjectRequest` and their actions. These are cleared on `removeLayer`/`resetAll` and not persisted. |
| `src/components/DataDisplay.js` | changed | Legacy (unmounted) reset now checks the result and never forces a discard. |
| `tests/gmiEditWorkspace.test.mjs` | new | 10 node tests: helpers, M2 integration, proposed view, export bytes, store lifecycle, caller contracts. |
| `tests/gmiEditWorkspaceUi.test.mjs` | new | Browser test (12 steps) against the real app. |
| `docs/agent-reports/assets/20261109-gmi-edit-m4-rettinger/*.png` | new | Screenshots (§10). |

## 2. Interface design and navigation

- **Entry.** Every GMI survey layer card has a pencil icon button, *Rettinger: rett feltverdier*. It follows the camera-button pattern: Phosphor Regular, a tooltip, and no native title. It opens Rettinger for that layer (`openGmiEditWorkspace`). The Validator sidebar closes. FOTO and Rettinger are mutually exclusive, and FOTO wins if both are requested.
- **Layout.** The layout matches the FOTO workspace:
  - **left panel** (330 px): back arrow, *RETTINGER* kicker and layer name, a status pill (*Redigerbar / Kun visning / Klargjør… / Forkastet / Feil*), counts (*2 rettinger · 3 felt i 1 objekt*) and a download state (*Ikke lastet ned / Lastet ned*), followed by any problem message. Below that are the *Objekter* and *Endringer (n)* tabs. The footer holds undo/redo, *Forkast alle* and the teal **Last ned revidert GMI** button with an *Eksperimentell* tag;
  - **right inspector**: the object editor;
  - **map**: shared, with the selected object highlighted;
  - **bottom dock**: the Data Table, opened automatically for the layer on entry.
- **Objekter tab.** It has a Ledninger/Punkter switch, search (number, Tema, GUID), a *Bare objekter med rettinger* filter and a *Rettet* pill. It renders 200 rows at a time (*Vis flere*).
- **Back.** *Tilbake til appen* returns to the normal sidebar. It is guarded if the form has unsubmitted values. The session and its staged corrections persist after leaving.
- **Layer card when not in Rettinger.** A pill shows *N rettinger · ikke lastet ned* or *· lastet ned*. The M3 `invalidated` status appears as an inline notice (“Kildefilen til laget ble erstattet … N rettinger ble forkastet uten å være lastet ned”) with *OK*, which calls `gmiEditSessions.dispose`.

## 3. Editing and ChangeSet flow

1. **Inspect.** For the selected object, `listGmiObjectCells(document, scope, index)` lists every column. For each editable cell, `registry.cell()` (M2 `getGmiEditCell`) gives *Original* (the exact delivered lexeme) and *Foreslått*. Lexemes are shown in monospace. Leading and trailing whitespace is shown as highlighted `·`, an empty value as *tom*, and the exact string is in the tooltip. Nothing is trimmed or normalized.
2. **Read-only fields.** Every read-only field shows a lock and a reason:
   - `S_HYPERLINK` and its aliases: “styres av bildeleveransen”;
   - engine reasons: irregular object, duplicate column, no value slot;
   - UI policy: identifier-like columns (`GUID`, `ID`, `LokalId`, `OBJID`…) stay read-only, while business attributes such as `AnleggsID` stay editable.

   Geometry, coordinates, object numbers, GUID lines and the header are not attribute cells at all; a footer note says so. Absent columns cannot be created, because there is no input for them and M2 refuses `field-absent`.
3. **Edit (local form).** Typed values are a local draft, marked *Ikke lagt til* (amber row). This is visually separate from staged *Foreslått* values (teal row, *Foreslått · cs-n*, *Vis retting*). Each draft is validated live with M1 `validateGmiFieldLexeme` for the document's encoding class. `;`, line breaks, TAB, C1 controls, Windows-1252-only characters and decomposed letters get a specific Norwegian message, and review stays disabled.
4. **Explicit overwrite.** If an edited field has a populated delivered value, a checkbox appears: *Overskriv utfylte verdier fra leveransen: Material*. The checkbox sets M2 `mode: 'overwrite'`. If the field was already changed by an earlier ChangeSet, a second checkbox appears: *Erstatt tidligere rettinger i: …*, which sets `conflictPolicy: 'replace'`. *Se gjennom* stays disabled until the needed choices are made or the draft is undone. The defaults remain M2's `fill-missing`/`skip`, and no option bypasses M2 checks.
5. **Review.** `createGmiObjectCorrection(session, {scope, sourceIndex, objectId, guid, values, mode, conflictPolicy, label, createdAt})` builds the ChangeSet against the current session value but does not stage it. The `objectId`/`guid` guards come from the selected layer object. The review lists:
   - each field as *Nå → Ny verdi*;
   - *Overskriver verdi* and *Erstatter cs-n* badges;
   - anything M2 would skip, with its reason.

   The review is bound to the session `stateKey`. If anything is staged, undone or discarded meanwhile, it is voided with “Rettingene ble endret i mellomtiden”.
6. **Stage.** `gmiEditSessions.stage(handle, changeSet)` applies it. On a refusal (`stale-change-set` etc.) the user sees a message and returns to the form. Labels are generated automatically (*Material, SDR · Ledning 2*) and `createdAt` is an ISO timestamp.
7. **Return.** Returning to the object shows the current proposed values in the inputs, with the originals beside them. *Bruk original* drafts a revert, which goes through the same explicit choices.

**Unsubmitted values are never dropped silently.** Selecting another object (from the list, the Data Table or the change list) or leaving Rettinger opens *Forkaste endringer i skjemaet?*. *Avbryt* keeps the draft and the selection. While a draft exists, a `beforeunload` listener is also attached; M3's guard only covers staged edits.

## 4. Change list and history

The *Endringer* tab is `session.changeSets` from M2, with no second history implementation. Each entry shows:
- its number, label, origin (*Objektretting*), Norwegian date and time, and id;
- the objects as links, which select the object and highlight the entry;
- a table of *Felt / Original / Foreslått*, with *(var …)* when the previous value was an earlier proposal;
- *Overskrev verdi*, and *Erstattet senere* when a later set superseded the cell;
- skipped cells with their reasons, and any replaced earlier proposals.

| Action | Implementation |
|---|---|
| Undo / redo | `gmiEditSessions.undo/redo`. Selects the affected object and announces *Angret: …* / *Gjort om: …*. |
| Forkast (one) | `gmiEditSessions.discard(handle, id)`. |
| Forkast alle | Always confirmed. Then `gmiEditSessions.discardAll`. |

**Dependency warning.** `gmiChangeSetDependents` lists later active sets that may depend on the discarded one:
- they touch the same object (for example, a Material correction followed by an SDR correction on the same pipe);
- their conflict decisions referred to it;
- they carry batch eligibility (ready for M5).

If any exist, a confirmation lists them and says they are **not** removed automatically. No set is ever auto-deleted.

## 5. Data Table integration

- The mode switch **Original | Foreslått | Kun endrede** appears in the table header only for a layer whose session is open (editable or read-only), and never for exact/contextual Validator inspections. Those inspections are bound to the original dataset revision, so they always show the original. The selected mode is a filled teal segment, and a status label says *Foreslått kopi – originalen er uendret* or *Kun endrede · N felt*.
- **Original**: `layer.data`, unchanged and with no markers.
- **Foreslått**: rows from the M1-verified proposed dataset. Changed cells get a teal tint and left bar, and the tooltip shows *Original: … → Foreslått: …* in lexemes.
- **Kun endrede**: only objects with effective changes. The columns are the identity columns (S_FCODE, Tema/Type) plus the changed fields. Sorting and saved column order are not overwritten in this mode.
- **Row identity.** The table index is the parser source index (M3 verifies the document matches `layer.data` by count, id and GUID), so filtering keeps `__index`. A row click in Rettinger sends a one-shot `gmiEditObjectRequest`. It goes through the same unsubmitted-form guard.
- **Cost.** `gmiProposedViewForStatus(registry, status)` calls `registry.proposed()` and `inspect()` once per published status object (one editing revision), memoized in a WeakMap. The test shows 25 calls → one M1 computation. The original view never triggers verification, and the Validator is never run.
- Cells stay read-only. The existing search, filters, sorting, column drag, zoom, highlighting and hyperlink copy buttons are unchanged.

## 6. Download flow

*Last ned revidert GMI* opens a dialog with:
- an **Eksperimentell** warning (“ikke akseptansetestet i Gemini VA”);
- the original filename marked *(endres ikke)*;
- counts per field and the change table;
- an optional label;
- a live filename preview from `gmiExportNames`: `YYYYMMDD-HHmmss[-label].gmi`, Oslo time, always a new file.

On *Last ned*:
1. `getGmiExportReadiness` gates the button. Read-only and blocked states show their reason.
2. `buildGmiFieldExport(registry, handle, {date, label})` runs. The M3 checks apply: live handle, re-read File SHA-256, `state-changed`, integrity, and no structural difference.
3. M4 adds a check: the payload's `effectiveKey` and the store revision must equal those captured when the dialog opened. Otherwise the download is refused (*Rettingene ble endret mens filen ble laget*).
4. `saveFile(createGmiExportBlob(payload), payload.filename)` uses `application/octet-stream`.
5. `recordGmiExportDownload(registry, payload)` runs only after the download starts, for that same payload. If it is refused (`export-stale`), the dialog says so and the state stays *Ikke lastet ned*.
6. On success the dialog shows the filename, size, *identisk med originalen* when applicable, and the SHA-256 of the delivered bytes.

An unchanged export is allowed and is byte-identical to the original (tested). The original file is never written.

## 7. Unsaved-change and reset handling (M3 integration)

| Path | Before M4 | Now |
|---|---|---|
| `page.js` `handleReset` (toolbar *Nullstill og åpne ny fil*, sidebar, parse-error retry) | Cleared FOTO/page state, then `resetAll()` (result ignored) | Calls `gmiEditRemovalBlock(null)` **first**. If blocked, it returns before touching anything and opens *Nullstille og forkaste rettinger?* listing layers, corrections and changed fields. *Avbryt* changes nothing. *Forkast rettinger og nullstill* reruns the full reset with `{discardGmiEdits: true}`. |
| `LayerPanel` *Fjern lag* | `removeLayer(id)` (result ignored) | Unsaved corrections are detected when the dialog opens and shown as a warning; the button reads *Forkast rettinger og fjern*. Without that warning, `removeLayer(id)` is called; if the store refuses (`gmi-edits-pending`), the warning is shown instead of closing. `discardGmiEdits` is passed only after the warning was on screen. |
| `DataDisplay` (not mounted) | `resetAll()` | Checks the result; never forces a discard. |
| Source replaced | M3 `invalidated` status, not shown | Shown in Rettinger (*Forkastet* + message + *Åpne filen på nytt*) and on the layer card. |
| `beforeunload` | M3 guard for staged unsaved edits | Unchanged, plus a guard while an unsubmitted form exists. |

A source-contract test asserts that only `page.js` (the confirmed reset) and `LayerPanel.js` (the warned removal) pass `discardGmiEdits: true` anywhere in `src/`. It also asserts that every FOTO/page cleanup in `handleReset` comes after the GMI decision. The node store test shows that a refused `resetAll`/`removeLayer` leaves `layers`, `layerOrder`, `ui`, `gmiEditWorkspace`, `gmiEditTableView`, `gmiEditStatus`, `objectTableInspection` and the `photoSession` snapshot identical. The browser test shows a cancelled reset keeps the FOTO layer, the Rettinger selection and the corrections.

## 8. M3 guard verification

**Method.** A bounded mutation check ran in an **isolated git worktree** (`git worktree add --detach` of HEAD under `%TEMP%\gmi-m4-mutation-*`):
- the M4 files were copied in, and `node_modules` was a junction;
- the active working tree was never written;
- each mutation was applied in memory, the two targeted suites ran (`tests/gmiEditSessions.test.mjs` + `tests/gmiEditWorkspace.test.mjs`, 180 s cap, stdin closed), and the file was restored in `finally`;
- baseline: 0 failures, about 0.6 s per run, about 10 s in total;
- afterwards the junction was unlinked with `rmdir` (the real `node_modules` was verified intact), the worktree was removed with `git worktree remove --force` plus `prune`, and its absence was confirmed.

| Guard removed | Result |
|---|---|
| Unsaved predicate (`isUnsaved` → false) | killed (6 failing) |
| Store removal block (`gmiEditRemovalBlock` → null) | killed (2) |
| Cache invalidation on dispose | killed (1) |
| Open: FOTO fingerprint parity | killed (1) |
| Open: layer-shape check | killed (1) |
| Open: expected fingerprint | killed (1) |
| Resolve: stale handle (`stale-session`) | killed (1) |
| Resolve: source liveness | killed (1) |
| `markDownloaded`: same revision (`export-stale`) | killed (2) |
| Export: re-read File fingerprint | killed (1) |
| Export: `state-changed` after the source read (alone) | survived |
| Export: `state-changed` after hashing (alone) | survived |
| Both `state-changed` checks together | killed (1) |
| M4: reset returns before cleanup when blocked | killed (1) |
| M4: removal discards only after the warning | killed (1) |

The two `state-changed` checks are redundant with each other: a session change during the source read is also caught by the later check. Removing both is detected. Killing each one alone would need a hook that stages inside the SHA-256 computation, which I judged not worth adding. **Conclusion: every M3 identity and lifecycle guard has a behavioural test that fails without it.**

## 9. Test results

| Run | Result |
|---|---|
| `node --test tests/gmiEditWorkspace.test.mjs` | **10/10 pass** |
| gmi-edit suites (`tests/gmiEdit*.test.mjs`) | 88 tests: **84 pass, 0 fail, 4 skipped** (3 opt-in private corpus; the browser test without `PHOTO_UI_URL`) |
| `PHOTO_UI_URL=… node --test tests/gmiEditWorkspaceUi.test.mjs` (production build, `next start`) | **12/12 pass** |
| FOTO/GMI browser regressions with `PHOTO_UI_URL`: `photoLoadedGmiUi`, `photoImportWizardUi`, `mapTeardownUi`, `photoWorkspacePass1dUi`, `gmiPhotoAssociationsUi` | 27 tests: **25 pass, 0 fail, 2 skipped** |
| Full suite `node --test tests/*.test.mjs` | 1906 tests: **1801 pass, 7 fail, 98 skipped** |
| `npx eslint --max-warnings 0` on all new and changed files except below | Clean |
| `LayerPanel.js`, `LayerDataTable.js` | 4 errors + 1 warning, all pre-existing (hooks after an early return in `LayerPanel`; the React Compiler skip on `useReactTable`); identical before M4 |
| `npm run build` | Success |

**Baseline failures.** The 7 failures are exactly the known baseline:
- `appInfoUiContract` (1);
- `statsUiContract` (2);
- `terrainPhotoGml` optional real corpus (1);
- `validationV2WorkspaceInspector` (3).

I reran the three source-contract files in a clean HEAD worktree. Their failure output is identical before and after M4, timings aside. **No new regression.**

**One environment hiccup.** One `next build` failed while fetching Google Fonts (`next/font/google` in `layout.js`). It passed unchanged on the next run; it is unrelated to M4.

Requested coverage:

| Case | Where |
|---|---|
| Open Rettinger from a GMI layer | UI step 1 |
| Select object, inspect originals, `S_HYPERLINK` reason | UI 2; node *object editor flow* |
| Edit and stage one correction; several fields | UI 4; node |
| Explicit overwrite of populated values (and replace) | UI 4 (checkbox gates review); node (skip vs. overwrite vs. replace) |
| Prohibited/unsafe fields and lexemes | UI 3; node *field policy*, *form plan*, *prohibited…* (engine refuses even without the UI) |
| Original/Foreslått/Kun endrede | UI 6; node *Data Table proposed view* |
| Undo, redo, discard, discard all, dependency warning | UI 7; node *change list* |
| Change-list selection → correct object identity | UI 6–7 (row 3 → `line:2` *Ledning 3*; change link → `line:1`) |
| Export unchanged/modified; downloaded bytes = M3 payload | UI 8 (SHA-256 of the file in the download folder equals the payload fingerprint shown); node *download* (Blob = payload bytes; unchanged = original) |
| Independent reparse, unrelated data preserved | UI 8 and node: M0 oracle `verifyCellChanges` (only intended lines/cells), `S_HYPERLINK` unchanged, original file on disk unchanged |
| Read-only / unsupported | UI 11 (mixed EOL: *Kun visning*, no inputs, download disabled); node |
| Source invalidation during editing/export | M3 suite (*export refuses after source invalidation, on a changed File and when the session moves*; *replaced layer data … notice*); M4 adds the revision re-check in the dialog and the notice display |
| Removal/reset confirm/cancel; FOTO untouched | UI 9–10; node store test; source contracts |
| Unsaved-changes and unload | UI (`beforeunload` default-prevented with a draft, with staged-not-downloaded edits; not after download or discard) |

## 10. Screenshots

All are in `docs/agent-reports/assets/20261109-gmi-edit-m4-rettinger/`:
- `m4-rettinger-open.png`: entry, *Redigerbar*, table in Original.
- `m4-rettinger-review.png`: review of Material (overwrite badge) and SDR.
- `m4-rettinger-table-proposed.png`: *Foreslått* with marked cells; the *Rettet* pill in the list.
- `m4-rettinger-change-list.png`: two ChangeSets; the editor showing *Foreslått · cs-n*.
- `m4-rettinger-1366x768.png`, `m4-rettinger-1280x720.png`: laptop widths. There is no page overflow and the download button is visible.
- `m4-rettinger-export.png`: export dialog with *Eksperimentell*, summary and filename.
- `m4-rettinger-reset-confirm.png`, `m4-rettinger-remove-warning.png`: guarded reset and removal.
- `m4-rettinger-read-only.png`: read-only file (inspectable, nothing editable, download disabled).

## 11. Known limitations and suggested M5 follow-up

1. **First proposed state is synchronous.** On the largest real file it takes about 1.3 s (M2) and blocks the main thread. This happens once per revision, when *Foreslått*/*Kun endrede* is selected or the export dialog opens. Staging and the editor never trigger it. M5 could move it to idle time after staging, or show a progress state.
2. **Full revalidation is not exposed in M4.** M2/M3 `revalidate` exists. M5's revalidation summary should add it as an explicit button.
3. **Map clicks do not select objects in Rettinger.** Objects are selected from the list, the Data Table or the change list, and *Vis i kartet* highlights the object. Map selection needs a feature-click hook in `MapInner`.
4. **Data Table shows parsed values.** `11.0` appears as `11`; this is existing behaviour. Exact lexemes are in the cell tooltip, the editor and the change list.
5. **React Compiler opt-out.** The compiler compiled `view?.changedCells` into a non-optional memo dependency and crashed in production. The Rettinger components therefore use `'use no memo'`, as `PhotoExportWizard` does. Their derived values are memoized per published revision instead.
6. **`state-changed` guards are redundant with each other** (§8). This is fine as defense in depth.
7. **Persistence.** As planned (Q9), corrections are in-memory only. Reload is guarded; the endringsfil is M12.
8. **For M5:**
   - batch builder on `evaluateGmiBatchEligibility`, reusing `GmiConfirmDialog` and the review table;
   - *Lag retting…* from Validator findings (allow-list);
   - Validator *Original/Foreslått* toggle and revalidation deltas;
   - the dependency warning already flags `eligibility` sets;
   - a warning when importing a file whose fingerprint matches a layer with unsaved edits (M3 note 6).

## 12. Recommended manual acceptance steps

1. Load a real GMI. Click the pencil on its layer card and check *Redigerbar* and the table modes.
2. Pick a pressure pipe. Fill an empty SDR and change Material. Check that review is blocked until *Overskriv…* is ticked, review, then *Legg til retting*.
3. Leave the object with a half-typed value: expect the prompt. Try `;` and `€`: expect the messages.
4. Toggle *Foreslått* / *Kun endrede* and compare the tooltips with the editor.
5. Make a second correction on the same object. Discard the first: expect the warning, and that nothing is auto-removed. Undo and redo.
6. *Last ned revidert GMI* with a label:
   - compare the SHA-256 shown with the file on disk;
   - diff the file against the original, expecting only the intended values on those `_FIELDVALUES` lines;
   - **import it into Gemini VA (gates G1/G2)** before removing *Eksperimentell*.
7. With undownloaded corrections:
   - try *Nullstill og åpne ny fil*, *Fjern lag* and closing the tab, and cancel each;
   - check that the corrections, the FOTO layer and the selection remain.
8. Open a read-only file (for example mixed line endings) and a GMI with parser errors. They should be inspectable with reasons and have no download.
9. Repeat 1–2 on the largest real file and note how long the first *Foreslått* switch takes.

`git status`:
- modified: `src/app/page.js`, `src/components/DataDisplay.js`, `src/components/LayerDataTable.js`, `src/components/LayerPanel.js`, `src/lib/store.js`;
- new: `src/components/gmi-edit/`, `src/lib/gmiEditView.mjs`, `tests/gmiEditWorkspace.test.mjs`, `tests/gmiEditWorkspaceUi.test.mjs`, `docs/agent-reports/assets/20261109-gmi-edit-m4-rettinger/`, this report.

## 13. M4 follow-up: unsubmitted drafts — final verification

Date: 2026-11-09. Continued in the existing `feature/photo-workspace` working tree at `b17b3ef`. The separate `20261109-132759-gmi-edit-m4-draft-guard-handover.md` is preserved unchanged as the historical handover. No mutation testing was repeated, and nothing was committed or pushed.

### Findings and minimal fix

The handover's page-level protections cover global reset, opening FOTO from a map popup, and refusal of window file drops while an unsubmitted Rettinger draft exists. Leaving Rettinger already uses the workspace guard; layer removal and switching survey layers are reached through that guarded exit. The page receives only a dirty boolean and the workspace guard, never another copy of the form or editing session.

Rebuilt production and reproduced the step 5 failure. The staged-reset dialog **did appear** after confirming the draft discard. The application bug was that the guard cleared `dirtyRef` without clearing the editor's actual local form. Normally navigation unmounted the editor, hiding this omission. Cancelling the second, staged-corrections dialog kept the editor mounted with the supposedly discarded draft still visible. The stale dirty flag then caused the draft-only reset in step 6 to proceed without the expected draft dialog.

Complete step 5 error from the initial reproduction (the runner also reported step 6's consequent draft-dialog timeout):

```text
test at tests\gmiEditDraftGuardUi.test.mjs:171:15
✖ reset with a draft and staged corrections: two explicit decisions, each cancellable (96.2729ms)
  AssertionError [ERR_ASSERTION]: the confirmed draft is gone
  + actual - expected

  + [
  +   'Merknad'
  + ]
  - []

      at TestContext.<anonymous> (file:///C:/GitHub/gmi-validering-test/tests/gmiEditDraftGuardUi.test.mjs:192:16)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async TestContext.<anonymous> (file:///C:/GitHub/gmi-validering-test/tests/gmiEditDraftGuardUi.test.mjs:171:7)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: [ 'Merknad' ],
    expected: [],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```

The fix is confined to `GmiEditWorkspace.js`: confirmed draft discard publishes `onDirtyChange(false)` and increments a local form revision in the editor's React key. This resets only the editor's local form, overwrite/replace choices and review, even when a later decision leaves the workspace mounted. Selection, table, FOTO and the registry's staged corrections remain intact. No M1–M3 library or behaviour changed; the form revision contains no editing data.

The browser test now compares the entire post-cancel workspace snapshot with the snapshot taken immediately after staging, including restored field values. It also retries reset to prove the discarded draft does not prompt again, and adds a seventh scenario confirming both decisions. During test strengthening, an initial expected snapshot incorrectly assumed Merknad was empty and retained its draft-only overwrite checkbox; this assertion was corrected to compare against the actual pre-draft snapshot.

Verified sequence:

1. Draft plus staged corrections: draft confirmation appears first; cancelling preserves the complete snapshot.
2. Confirming draft discard clears the form, then opens staged-corrections confirmation. Cancelling that confirmation preserves the complete pre-draft workspace and staged values; unload remains guarded.
3. A further reset asks only about staged corrections. Cancelling preserves the workspace again.
4. Confirming both decisions allows reset only after the second confirmation.
5. Step 6 passes: a draft-only reset has one confirmation, completes normally and leaves no unload guard.

### Final verification

Production build served with `node node_modules/next/dist/bin/next start -p 3123`; browser tests used `PHOTO_UI_URL=http://localhost:3123`.

| Check | Final result |
|---|---|
| `node --test --test-concurrency=1 tests/gmiEdit*.test.mjs tests/photoLoadedGmiUi.test.mjs tests/photoImportWizardUi.test.mjs tests/mapTeardownUi.test.mjs tests/photoWorkspacePass1dUi.test.mjs tests/gmiPhotoAssociationsUi.test.mjs` | **134 tests: 129 pass, 0 fail, 5 skipped** |
| New draft-guard browser test within that run | All **7 scenarios pass** (8 tests including parent); steps 5 and 6 pass |
| Existing M4 browser test within that run | **12/12 pass**, including export, history, table modes, removal/reset and read-only behaviour |
| `node --test tests/*.test.mjs` without opt-in browser URL | **1907 tests: 1801 pass, 7 fail, 99 skipped**; exactly the known baseline failures |
| Targeted ESLint with `--max-warnings 0`: `src/app/page.js`, `src/components/DataDisplay.js`, `src/lib/store.js`, `src/lib/gmiEditView.mjs`, `src/components/gmi-edit`, and the three M4 test files | **Clean** after final edits |
| ESLint on `LayerPanel.js` and `LayerDataTable.js` | Same **4 existing conditional-hook errors + 1 existing incompatible-library warning**, independently confirmed by linting `git show HEAD:<file>` through stdin |
| `npm run build` after application fix | **Success**; browser verification used this production build |
| `git diff --check` | **Clean** |

The seven full-suite baseline failures remain `appInfoUiContract` (1), `statsUiContract` (2), optional external-corpus `terrainPhotoGml` (1), and `validationV2WorkspaceInspector` (3). No additional full-suite failures occurred.

One concurrent targeted run hit `Unavailable placement exif` during import setup in both the draft-guard and map-teardown browser tests. All requested files were rerun serially and passed. No FOTO application or shared test-helper changes were made for that setup instability.

The final working-tree inventory contains only the intended M4 source integration, new Rettinger components/helpers/tests, reports and existing screenshots. This verification follow-up changed only `GmiEditWorkspace.js`, `gmiEditDraftGuardUi.test.mjs` and this completion report. M1–M3 files, fixtures and manifests are unchanged. Test logs were kept under `%TEMP%`, outside the repository. Temporary test/browser processes and the port 3123 production server were stopped after verification.

**M4 is ready for manual browser acceptance.** The manual steps in §12 still apply, including Gemini VA import acceptance gates G1/G2 before removing the experimental label. Also exercise the two-dialog reset with a half-typed form and staged corrections, cancelling each dialog in turn.
