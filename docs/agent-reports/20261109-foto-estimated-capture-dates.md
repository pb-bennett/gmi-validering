# FOTO estimated capture dates — completion report

Date: 2026-11-09

## Delivered scope

Focused enhancement to **Fullfør opplysninger → Opptakstid**. No GMI field editing, combined-delivery implementation, commits, or pushes.

The completion section now offers a prominent **Bruk foreslått dato på N bilder** action. Its date picker and summary show the date and number of missing originals before application. Users can change the date, including choosing a date entirely outside the suggested range. The action works without selecting rows, requesting a clock time, or opening a confirmation dialog. It always addresses all currently missing capture dates in the current FOTO layer, including unplaced photos, while preserving every already accepted date or timestamp.

The existing individual metadata dialog has an **Anslått dato** option. It opens existing estimates with a date-only picker. Precise timestamp, seconds, timezone, source selection and removal controls remain available through their existing routes.

## Implementation and decisions

- Reused the asset-owned `captureMetadata`, `planManualPhotoFill`, session write/publication methods, completion model, readiness rules, export snapshot invalidation and existing GML serializers. Shared original files still receive one metadata value across their placements.
- Estimates use `provenance: { kind: 'manual', estimated: true }`, with `mode: 'bulk'` for the layer action. Their canonical value is normalized to the selected calendar date at exactly `12:00:00`, without an invented timezone.
- Known range anchors come from valid accepted capture dates in the current layer. Previously estimated values and automatic values with conflicting source evidence are excluded. Explicit manual precise values are treated as accepted corrections. Duplicate placements do not create additional originals.
- A single reliable known date supplies both endpoints. This supports the three-photo scenario with one dated photo and two missing dates. If no reliable anchor exists, the picker starts empty and manual entry remains available.
- The midpoint uses integer calendar-day arithmetic on a UTC axis, without converting recorded clocks or applying the host timezone. An odd number of days rounds toward the earlier date. Month, year, leap-day, DST and years below 0100 are covered by tests.
- **Angre anslått dato** reverses the most recent bulk application during the open completion dialog. It survives task switching and preserves subsequent individual date adjustments and changes to other metadata. Removed assets are skipped. Undo tokens belong to their session generation and can be consumed only once. Original per-photo removal/replacement remains available after closing and reopening the dialog.
- Metadata containers preserve unchanged accepted-field identities while remaining frozen. This lets undo distinguish subsequent date corrections from unrelated photographer/source changes. New accepted values and provenance remain deeply immutable.
- The overview has a separate **Anslått** count. Completion rows, individual editing, inspector and map popup visibly identify estimates. Readiness and export diagnostics explain that noon is a technical default rather than measured capture time. Missing-time warnings disappear immediately after filling and return after undo.
- Existing JPEG/EXIF bytes are never written. Tests compare original JPEG bytes and packaged attachments before and after applying estimates.
- The existing Gemini serializer exports the canonical noon value correctly. A package warning explains that the current GML export does not carry the application's `Anslått` provenance marker.

## Changed files

| File | Change |
| --- | --- |
| `src/lib/photos/photoEstimatedDates.mjs` | New pure calendar midpoint, estimated-noon normalization, reliable range and missing-count helpers; shared help text. |
| `src/lib/photos/photoSession.mjs` | Extend existing individual/bulk metadata writes with estimated provenance; guarded bulk reversal; preserve unchanged field identities. |
| `src/lib/photos/photoCompletion.mjs` | Whole-layer estimate model, estimated origin/count, technical-noon row notes and recommendation selection. |
| `src/lib/photos/photoPresentation.mjs` | Estimated status, source label and date presentation. |
| `src/components/photos/PhotoCompletionTimePanel.js` | Inline proposed/manual date action, live affected count and undo action. |
| `src/components/photos/PhotoCompletionDialog.js` | Keep the latest undo token across completion task switches. |
| `src/components/photos/PhotoCaptureTimeField.js` | Optional date-only rendering using the existing field component. |
| `src/components/photos/PhotoCaptureMetadataDialog.js` | Individual estimated-date option and canonical noon writes, while retaining precise timestamp editing. |
| `src/components/photos/PhotoWorkspaceInspector.js` | Mark estimated dates and explain technical noon. |
| `src/components/photos/PhotoMapPopup.js` | Mark estimated dates in map inspection. |
| `src/components/photos/photoCompletion.css` | Existing surface/spacing tokens, teal accents and responsive inline estimate panel. Calendar and undo icons use Phosphor Regular. |
| `src/lib/photos/export/photoExportReadiness.mjs` | Immediate estimated-date recommendation; avoid duplicating estimates under the ordinary bulk-time recommendation. |
| `src/lib/photos/export/photoExportDiagnostics.mjs` | Estimated-date diagnostic label. |
| `src/lib/photos/export/photoExportPlan.mjs` | Export warning explaining technical noon and the GML provenance limitation. |
| `tests/photoEstimatedDates.test.mjs` | 16 targeted calendar, session, preservation, undo, readiness, GML/ZIP and original-byte tests. |
| `tests/photoCompletionUi.test.mjs` | Three added real-browser acceptance cases covering bulk/manual/individual/undo/export, narrow layout and manual fallback without known dates. |
| This report and adjacent screenshots | Persistent implementation and acceptance evidence. |

## Verification

Final source passed the production build and targeted ESLint check.

```powershell
npm run build

$photoTests = @(rg --files tests -g 'photo*.test.mjs' |
  Where-Object { $_ -notmatch 'Ui.test.mjs$' })
node --test $photoTests

$env:PHOTO_UI_URL = 'http://127.0.0.1:3100'
node --test tests/photoCompletionUi.test.mjs
```

- Broad FOTO regression: **730 tests; 723 passed, 7 skipped, 0 failed**.
- Full completion browser suite against the production server: **13 tests; 12 passed, 1 skipped, 0 failed**.
- New pure/session/export suite: **16 tests**, included in the broad regression above.
- ESLint: all changed JavaScript/MJS source files and both changed/new test files passed.
- `git diff --check`: passed.

The seven broad-suite skips are existing opt-in private-corpus checks, an unavailable external contractor comparator and a browser layout check without its URL. The completion browser suite's skip is its private-corpus case (`PHOTO_GML_FIXTURE` not configured). No unrelated test failures were observed. Existing warnings remain about stale Browserslist data and Node reparsing modules because package type is not declared; neither blocked validation.

## Browser acceptance checks

Tests use the repository's Chrome/CDP harness, actual local JPEG fixtures, the real EXIF/GML import routes, native controls and an actual downloaded ZIP. The final production build was served locally for these checks.

- Verified the proposal, affected count and primary action at 1680×900; no row selection is needed. Selecting only one missing row still fills both missing originals. No confirmation dialog appears.
- Verified immediate **Anslått 2**, completed Opptakstid indicator and removal of the missing-time schema warning. Known source clocks are preserved.
- Verified undo after switching to Retning and back, changed manual group dates, individual estimated-date editing without time controls, and preservation of the individual correction when undoing its earlier bulk application.
- Verified the final downloaded Gemini GML contains the selected individual and group dates at exactly `12:00:00`, alongside the unchanged precise source time.
- Verified 600×700 layout without horizontal overflow, and individual selection between estimated-date and precise timestamp controls. Existing constrained-screen completion tests also pass.
- Verified a layer with no known dates starts with an empty date input, supports a manual date for every unplaced photo and reverses to the original missing state.
- Visually inspected screenshots for spacing, labels, legibility, teal styling, panel clipping and the existing nested individual editor.

Screenshots:

- [Before application](assets/20261109-foto-estimated-capture-dates/12-estimated-before.png)
- [Applied, with readiness and estimated marking](assets/20261109-foto-estimated-capture-dates/13-estimated-applied.png)
- [Individual date-only adjustment](assets/20261109-foto-estimated-capture-dates/14-estimated-individual.png)
- [Narrow layout](assets/20261109-foto-estimated-capture-dates/15-estimated-narrow.png)

## Limits and review notes

- Gemini VA and Gemini Portal were not available for a new external import acceptance run. Portable Gemini GML conventions and the actual ZIP/GML output were tested locally; this report does not claim a new successful Gemini import.
- The estimated provenance is application-session metadata. The existing GML mapping exports the assigned date/time but does not round-trip the `Anslått` marker. Reimporting that GML alone cannot distinguish its estimates from measured source timestamps. The export warning makes this explicit.
- Bulk undo follows the latest-action convention within the open completion dialog. Closing the dialog discards that UI shortcut; the existing per-photo replacement/removal controls still allow reversal.
- Reliable range anchors are accepted non-estimated dates, with automatic source conflicts excluded. The tool does not infer whether an unmarked historical manual entry was actually an estimate.

Changes are left uncommitted for manual review.
