# GMI editing M3: editing-session lifecycle and field-only GMI export service

Date: 2026-11-09. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, starting commit `307820e`.
Scope: **Milestone M3 only** (planning report `20261108-gmi-editing-combined-delivery-planning.md` §5.7–5.9, §8.4, §10), building on M1 (`20261109-113731-…`) and M2 (`20261109-120021-…`).

Not changed:
- the M1/M2 editing algorithms;
- `GMIParser`, fixtures and manifests;
- any UI component (no Rettinger workspace, no modal, no buttons);
- FOTO behaviour;
- any real GMI file.

No commit, no push.

---

## 1. Files changed

| File | Status | Purpose |
|---|---|---|
| `src/lib/gmi-edit/editSessions.mjs` | new | `createGmiEditSessions`: a dependency-injected registry with one session per survey layer. It covers handles, identity checks, lifecycle, unsaved-changes state and M2 views. It contains no editing logic. |
| `src/lib/gmi-edit/exportGmi.mjs` | new | Field-only export service: `buildGmiFieldExport`, readiness, naming, byte/Blob access, download recording. |
| `src/lib/gmi-edit/index.mjs` | changed | Exports the M3 API. |
| `src/lib/gmiEditSessions.mjs` | new | App binding: the `gmiEditSessions` singleton over `loadedGmiSources`, publishing to Zustand, store reconciliation, the `beforeunload` guard and the removal-block helper. |
| `src/lib/photos/loadedGmiSource.mjs` | changed (+12 lines) | `readBytes(ticket)`. |
| `src/lib/store.js` | changed (+27/−4) | `gmiEditStatus` slice, guarded `removeLayer` and `resetAll`, `bindGmiEditSessionStore`. |
| `tests/gmiEditSessions.test.mjs` | new | 18 M3 tests: 14 against the registry, 4 against the actual store. |
| `tests/gmiEditProduction.test.mjs` | changed | The module-boundary test now covers the M3 files. `exportGmi.mjs` may import only the import-free `photos/export/photoExportNaming.mjs`, and the test asserts that this module stays import-free. |

**Placement.** The registry lives in `gmi-edit/` as a pure module. Its sources and layer access are injected, so the `gmi-edit` boundary stays free of photo and UI code. The singleton and the store wiring sit one level up, in `src/lib/gmiEditSessions.mjs`, which follows the `loadedGmiSource.mjs` / `geminiSession.mjs` pattern.

## 2. Registry and source-byte ownership

```
 FileUpload ──File──► loadedGmiSources (outside Zustand; binding {layerId, inputId, filename}, live = same layer + same data object)
                          │ begin(layerId) → ticket
                          │ readBytes(ticket) → fresh Uint8Array of the registered File (no caching, never written to)
                          │ read(ticket)      → existing FOTO evidence + SHA-256 (shared, cached per File)
                          ▼
 gmiEditSessions entry ── document = M1 loadGmiSourceDocument(bytes)   (private copy, sha256 fingerprint)
                       ── session  = M2 createGmiEditSession(document, {layerId})  (immutable value, replaced per transition)
                          │ onChange(layerId, frozen status)
                          ▼
 Zustand state.gmiEditStatus[layerId]   (counts/flags only; not persisted)
```

- **Bytes come only from the imported File.** They are never reconstructed from `layer.data`, the parser or a serializer. `readBytes` returns a new buffer on each call. The registry zero-fills its transient copy once M1 has taken its own private copy.
- **Three identity checks at open:**
  - the bytes read again must have the same SHA-256 as the `loadedGmiSources.read` fingerprint FOTO uses (`source-fingerprint-mismatch`);
  - the document must match `layer.data` in point/line counts and in per-object id and GUID (`layer-data-mismatch`);
  - liveness is re-checked after every await (`source-stale`).
- **No write-back.** The source registry is never given modified bytes. `layer.data` and its object identities are never touched (tested by identity and by a deep snapshot including the source lexemes).
- **Nothing large in Zustand or storage.** No bytes, documents, parser results or proposed datasets go there. `partialize` is unchanged (settings, ui, lastActive), and a test asserts it does not mention `gmiEdit`, `layers` or bytes.

## 3. Public API

```js
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { createGmiObjectCorrection, buildGmiFieldExport, getGmiExportReadiness,
         createGmiExportBlob, recordGmiExportDownload } from '@/lib/gmi-edit/index.mjs';

gmiEditSessions.describe(layerId);          // {state: unsupported|unavailable|unloaded|loading|editable|read-only|error|invalidated, …}
const { ok, handle, code } = await gmiEditSessions.open(layerId /*, { fingerprint, inputId } */);

const { session } = gmiEditSessions.getSession(handle);             // M2 value to build against
const cs = createGmiObjectCorrection(session, { scope: 'line', sourceIndex: 1, values: { SDR: '11.0' }, mode: 'overwrite', label: 'SDR 11.0' });
gmiEditSessions.stage(handle, cs.changeSet);                       // → {ok, session, staged, status}
gmiEditSessions.undo(handle); gmiEditSessions.redo(handle);
gmiEditSessions.discard(handle, 'cs-1'); gmiEditSessions.discardAll(handle);

gmiEditSessions.inspect(handle);       // {status, summary, changeSets, cells:{changed, reverted}}
gmiEditSessions.cell(handle, target);  // original vs proposed + history (M2 getGmiEditCell)
gmiEditSessions.proposed(handle);      // verified M2 proposed state (cached)
gmiEditSessions.diff(handle);          // diffGmiDatasets(original, proposed)
gmiEditSessions.eligibility(handle, { canonicalFieldId: 'sdr' });
gmiEditSessions.revalidate(handle, { referenceDate });   // explicit only

getGmiExportReadiness(gmiEditSessions, handle);           // {ready, blocking[], notes[], counts}
const payload = await buildGmiFieldExport(gmiEditSessions, handle, { date: new Date(), label: 'SDR' });
if (payload.ok) { saveFile(createGmiExportBlob(payload), payload.filename); recordGmiExportDownload(gmiEditSessions, payload); }

useStore.getState().removeLayer(id);                          // {ok:false, code:'gmi-edits-pending', layers} while unsaved
useStore.getState().removeLayer(id, { discardGmiEdits: true }); // explicit
useStore.getState().resetAll({ discardGmiEdits: true });
```

Every M2 view delegates to the M2 function on the current session value and passes the registry's cache, so no M2 logic is duplicated. Failures are frozen `{ok:false, code, …}` objects, and the codes are machine-readable.

## 4. Source identity and stale-session safeguards

| Situation | Result |
|---|---|
| Handle copy, forged handle, or `{...handleA, layerId:'B'}` | `invalid-handle` (handles are issued objects tracked in a WeakMap) |
| Handle of a disposed session | `session-disposed` |
| Old handle after the layer's session was reopened | `stale-session` |
| `open(layerId, {fingerprint \| inputId})` that does not match | `fingerprint-mismatch` / `source-identity-mismatch` (never re-bound) |
| Layer removed, or its data object replaced | `source-stale`. The entry is disposed. If the layer still exists, it gets an `invalidated` notice with `discardedChangeSets`/`discardedUnsaved`. |
| Layer removed while bytes are being read | `source-stale`; no entry remains |
| Document's private bytes mutated | `source-bytes-mutated`, entry disposed |
| Unreadable File (e.g. NotReadableError) | `loaded-gmi-unreadable`, state `error` (a later `open` retries) |
| File differs between reads | `source-fingerprint-mismatch` (at open or at export) |
| Registered File is not the parsed one | `layer-data-mismatch` |
| GMI layer without a retained source (parser errors) | `unavailable` / `source-unavailable` |
| Non-GMI or unknown layer | `unsupported` / `unsupported-layer` |
| Read-only document (M1 reasons) | `read-only` state; export refused with `document-read-only` |

**Identical files and reimports.** Identical bytes loaded as two layers get separate entries, sessions, `inputId`s and documents, so their cache keys are separate too. They share only the fingerprint value. Reimporting the same file creates a new layer, a new `inputId` and an empty session. Nothing ever attaches by filename or bytes. A ChangeSet built in A's session is refused by B (`document-mismatch`, from M2).

## 5. Layer removal and reset

- **Explicit paths.** `removeLayer(id, options)` and `resetAll(options)` first call `gmiEditRemovalBlock`. While an affected session has unsaved changes, they return `{ok:false, code:'gmi-edits-pending', layers:[{layerId, filename, changeSetCount, changedCells}]}` and change nothing: no layer, FOTO or Gemini state is touched. With `{discardGmiEdits: true}` they proceed. Both now return `{ok:true}` on success. The existing callers ignore the return value, which is harmless because no UI can create edits yet.
- **Implicit paths** (any `state.layers` change). The subscription calls `gmiEditSessions.reconcile()`, which disposes every entry whose source is no longer live. `resetAll` also calls `gmiEditSessions.clear()`.
- **Disposal** calls `cache.invalidate(document)` (M2 cache invalidation; tested via `size` and `stats().invalidations`). It also deletes the Zustand status entry. A removed layer therefore leaves no session, no cached proposal and no exportable state: `buildGmiFieldExport` returns `session-disposed`.
- **Status updates** use `setState({gmiEditStatus})` only, and are skipped when nothing changed. They never replace `layers` (tested by identity), so the FOTO (`loadedGmiSources`) and Gemini subscriptions, which key on `state.layers`, are not triggered.

**M4 must wire this up.** `LayerPanel` "Fjern", `page.js` `handleReset` and `DataDisplay` call `removeLayer`/`resetAll` without checking the result. M4 must confirm with the user first (using `gmiEditSessions.unsavedLayers()`), then pass `{discardGmiEdits: true}`. It must also call `resetAll` before clearing page-level FOTO state in `handleReset`, or check before doing so.

## 6. Unsaved-changes policy

- **`unsaved`** means the session's effective proposed copy differs from the original delivery (`changedCells > 0`), **and** that exact effective state (`effectiveKey`) has not been recorded as downloaded.
- **These do not count as unsaved:**
  - an open session with no edits;
  - staged sets whose cells were all reverted;
  - a pure redo stack;
  - a state equal to the last downloaded one (for example, after an undo back to it).
- **"Downloaded"** is set only by `recordGmiExportDownload(registry, payload)`, which the UI calls after it starts the browser download. Building an export does not count. If the session has moved on, the call is refused (`export-stale`). The browser cannot confirm the save, so this marks a handed-out revision, not a stored file. New edits make the session unsaved again.
- **`beforeunload`.** `createGmiEditUnloadGuard` attaches the listener only while `hasUnsavedChanges()` is true, and re-syncs on every registry change. Pages without edits keep normal unload and bfcache behaviour. The listener calls `preventDefault()` and sets `returnValue = ''`.
- **Removal and reset** block on the same predicate (§5).

## 7. GMI download naming and byte preservation

- **Filename:** `YYYYMMDD-HHmmss[-label].gmi` (planning Q8). It reuses `formatPhotoExportTimestamp`/`sanitizePhotoExportLabel`, so it shares the FOTO ZIP/GML convention: Europe/Oslo wall-clock time, and an ASCII label with æøå → ae/oe/aa. The original filename and SHA-256 are carried in `payload.source`.
- **MIME type:** `application/octet-stream`, so nothing re-encodes the bytes on the way to disk.
- **Payload contents.** `{filename, basename, label, createdAt, mimeType, size, fingerprint (sha256 of output), identical, effectiveKey, source:{layerId, sessionId, inputId, filename, fingerprint, size, encodingClass}, summary:{changeSetCount, changeSets[{id,label,origin,mode,createdAt,applied,skipped}], changedCells, changedObjects, byField, changes[{scope, sourceIndex, objectId, guid, field, original, proposed}]}}`. The bytes are private: `getGmiExportBytes` and `createGmiExportBlob` return copies.
- **Export checks:**
  1. the handle is live;
  2. the document is editable;
  3. the M2 proposed state is `ok` (M1-verified);
  4. the File is re-read and its SHA-256 equals the session fingerprint;
  5. after awaiting, the session value and source are unchanged (`state-changed`);
  6. the integrity tokens of the source and output documents are intact;
  7. with no edits, the bytes equal the original bytes and the fingerprint equals the source fingerprint;
  8. the diff has no structural changes, and its change count equals the edit count;
  9. the session and source are re-checked after the output hash.
  Any failure returns a code and no bytes.
- **Tests:**
  - **No-op:** the output is byte-identical to the original, with the same fingerprint.
  - **Modified** (SDR fill plus a Latin-1 `Merknad`):
    - the independent M0 oracle `verifyCellChanges` passes (line containment and full reparse);
    - `å` is written as the single byte 0xE5;
    - GUIDs and coordinates are equal to the original;
    - the header prefix is byte-identical;
    - the length delta is exact;
    - output is deterministic.
  - **Unchanged afterwards:** the original layer data, the source bytes and the re-read File.

## 8. Test and regression results

| Run | Result |
|---|---|
| `node --test tests/gmiEditSessions.test.mjs` | **18/18 pass** |
| gmi-edit suites (`gmiEditSessions`, `gmiEditProduction`, `gmiEditChangeSets`, `gmiEditCorpus`) | 77 tests: **74 pass, 0 fail, 3 skipped** (opt-in private corpus, env not set) |
| Full suite `node --test tests/*.test.mjs` (includes every GMI/FOTO/Validator suite) | 1895 tests: **1791 pass, 7 fail, 97 skipped**. The 7 failures are exactly the known baseline: `appInfoUiContract` (1), `statsUiContract` (2), `terrainPhotoGml` optional real corpus (1), `validationV2WorkspaceInspector` (3). **No new failures.** |
| `npx eslint --max-warnings 0` on `src/lib/gmi-edit/`, `src/lib/gmiEditSessions.mjs`, `src/lib/photos/loadedGmiSource.mjs`, both changed/new gmi-edit tests | Clean |
| `npm run build` | Success |

Private corpus: not run in M3. The M3 code adds no parsing or patching path; the M1/M2 corpus results still apply, and nothing reads real files.

Requested coverage, test by test:
- open/reuse and concurrent open;
- ticket and fingerprint binding (including FOTO parity);
- missing, unreadable, mismatched and stale bytes;
- defensive copies (`readBytes`, `originalBytes`, export bytes, Blob);
- two layers independent; identical files as two layers;
- stage, undo, redo and discard with status publishing;
- staging does no proposed computation or revalidation (`cache.stats().computations === 0`);
- removal, reset and `clear` cleanup, and cache invalidation;
- unsaved-changes semantics and the unload guard;
- no-op and modified export;
- integrity of the original layer and the source;
- naming and summary;
- export refusal after invalidation, on a changed File and on a concurrent stage;
- store blocking and discard; reimport; replaced data with its notice.

### Mutation check: incomplete

I planned a temporary mutation run that would disable 8 guards one at a time, rerun the M3 tests and restore each file:
- the export fingerprint compare;
- the removal block;
- `state-changed`;
- the layer-shape check;
- the downloaded key;
- cache invalidation on dispose;
- the open fingerprint compare;
- uncached `readBytes`.

**It never ran.** The shell command began with a stray `cat > "$TMPDIR/mut.py"` that had no input, so it blocked on stdin before the script was written or started. After about 12 minutes I terminated it and its waiter process.

I then checked that the tree was clean of mutations:
- no `python` or `node --test` child process had existed;
- every target guard line is present in its intended form;
- no mutation text is present in any file;
- the tracked diffs are exactly the intended M3 changes;
- the stray empty `/tmp/mut.py` was deleted.

The 18 M3 tests were then rerun and passed. As instructed, the mutation run was not repeated. Each of these guards does have a direct behavioural assertion in the suite, but I have not shown that those assertions fail when the guard is removed.

## 9. Performance and memory

- **Open:** one `readBytes`, plus the shared FOTO fingerprint read (cached per File), plus one M1 document load. That is about 0.8–0.9 s on the largest real file (1.7 MB; M1 measurement). Concurrent opens share one load.
- **Memory:** each opened layer holds one private byte copy and its index/parser (M1). Proposed results are held in the shared M2 LRU (4 per document). Disposal releases the entry and its cache entries. Registry sessions are separate from `layer.data`, so an opened layer's parsed data is held twice: the upload parse and the document parse. That is the cost of not trusting the upload parser, whose header can be CRS-modified.
- **Export:** one cached proposed state, one re-read and SHA-256 of the source, one SHA-256 of the output, and one diff (about 80 ms on the largest file per M2).
- **Revalidation** runs only through the explicit `revalidate` call, never on stage.

## 10. Remaining prerequisites for M4

1. Wire `removeLayer`/`resetAll` callers to `unsavedLayers()`, confirm with the user, then pass `{discardGmiEdits: true}`. Reorder `page.js` `handleReset` so a blocked reset does not first clear FOTO page state.
2. Subscribe to `state.gmiEditStatus[layerId]`. Hold the current proposed result per `status.revision`, not per render.
3. Show `invalidated` notices (source replaced: changes discarded).
4. Call `recordGmiExportDownload` after `saveFile` (reuse `PhotoExportWizard`'s `saveFile` pattern). Label the export *eksperimentell* until the Gemini gates G1/G2 pass.
5. Pass `createdAt` timestamps when building ChangeSets (M2 note).
6. Optional: warn when an imported file's fingerprint equals a layer that has unsaved edits. Both identifiers are already in the status.

## 11. Manual and browser checks once the Rettinger UI exists

- The `beforeunload` prompt appears with unsaved edits and not without them. Closing a tab after a recorded download does not prompt.
- The downloaded `.gmi` is byte-identical to `getGmiExportBytes` (no browser re-encoding), and it imports in Gemini VA (G1/G2).
- Layer removal and reset with edits show the confirmation, and cancelling keeps the session.
- A File modified on disk after import results in `loaded-gmi-unreadable` or `source-fingerprint-mismatch` in Chrome, Edge and Firefox.
- The filename is in Oslo time on a non-Oslo machine.

## 12. Recommendation

**M3 is ready to accept, with one caveat: the mutation check is incomplete (§8).**
- An imported GMI layer opens one identity-bound session over its real imported bytes.
- Corrections are staged, undone, redone and discarded through M2 unchanged.
- The status reaching Zustand is lightweight.
- Removal and reset block or dispose deterministically and invalidate the cache.
- The export service produces a verified `.gmi`: byte-identical with no edits, and with only the approved spans changed otherwise.
- The original layer data, source bytes and File are unchanged.
- There are no regressions beyond the known baseline.

Before M4 builds on the identity and lifecycle guards, a short targeted mutation pass would be worthwhile.

`git status`:
- modified: `src/lib/gmi-edit/index.mjs`, `src/lib/photos/loadedGmiSource.mjs`, `src/lib/store.js`, `tests/gmiEditProduction.test.mjs`;
- new: `src/lib/gmi-edit/editSessions.mjs`, `src/lib/gmi-edit/exportGmi.mjs`, `src/lib/gmiEditSessions.mjs`, `tests/gmiEditSessions.test.mjs`, this report.
