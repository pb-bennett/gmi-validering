# FOTO filename timestamp acceptance correction S1 (A1)

18 November 2026, Europe/Oslo. Branch `feature/photo-workspace`, HEAD `1ee9ae5`. The worktree was clean at the start.

## Outcome

- `src/lib/photos/photoFilenameCaptureTime.mjs` recognizes `ymd-hm-compact-seq`. The two-digit sequence follows a compact `HHmm` after `_` or `-`. The timestamp retains minute precision and an unknown timezone. The provenance token ends at `HHmm`.
- The counter guard evaluates distinct compact-minute values per date. It downgrades a maximal consecutive run of at least three values that starts at `0010` or lower, including any other item on that date with a matching basename template. The template masks only the clock digits. Downgrades retain date-only values, date-only tokens and `downgraded: 'sequence-counter'`. Other minute readings retain their time.
- `tests/helpers/photoContractorFilenameFixtures.mjs` supplies the 12 exact filenames and expected timestamps to `tests/photoFilenameCaptureTime.test.mjs` and `tests/photoCaptureSuggestions.test.mjs`. Planner and session tests exercise one batch and 12 individual inputs. Session tests use synthetic JPEG bytes and explicit approval. They verify the `Filnavn` source and exact values.
- Existing tests still cover default-off approval, EXIF and GML precedence, stale reviews, original file identity and byte preservation. The app change is confined to filename parsing and suggestion planning.

## Interpretation of the brief

The brief’s two-digit suffix expression also matched the first segment of `_01_02`. The implementation rejects chained numeric suffix segments for the sequence pattern, as §2 A1 requires. The baseline separately mistook `1433_01_02` for a date with year 1433 and rejected the entire filename. The parser now ignores a separated date candidate with an unsupported year when its year starts at the already recognized compact clock. Supported-year candidates still undergo calendar validation and conflict checks. `20261014_1433_01_02.jpg` therefore produces plain `ymd-hm-compact` at 14:33. The existing counter test remains unchanged, including the outlier with a matching template.

## Contractor filename fixtures

| Original filename | Expected local capture time |
|---|---|
| `0710261.1_20261007_1500_01.jpg` | `2026-10-07T15:00` |
| `0710261.2_20261007_1501_01.jpg` | `2026-10-07T15:01` |
| `0710261.3_20261007_1629_01.jpg` | `2026-10-07T16:29` |
| `0710261.4_20261007_1630_01.jpg` | `2026-10-07T16:30` |
| `0710261.5_20261007_1631_01.jpg` | `2026-10-07T16:31` |
| `0710261.6_20261007_1632_01.jpg` | `2026-10-07T16:32` |
| `OV1.1_20261007_0946_01.jpg` | `2026-10-07T09:46` |
| `VL1.5_20261007_0941_01.jpg` | `2026-10-07T09:41` |
| `VL1.6_20261007_0942_01.jpg` | `2026-10-07T09:42` |
| `OV1.4_20261006_1305_01.jpg` | `2026-10-06T13:05` |
| `VL1.3_20261006_1310_01.jpg` | `2026-10-06T13:10` |
| `VL1.4_20261006_1311_01.jpg` | `2026-10-06T13:11` |

## Verification

**Baseline.** Before the edit, `node --test tests/photoFilenameCaptureTime.test.mjs tests/photoCaptureSuggestions.test.mjs tests/photoImportWizardState.test.mjs` passed 30/30. A separate replay loaded the parser directly from `1ee9ae5` with the supplied names. All 12 individual imports matched, while batching gave 3 complete and 9 date-only suggestions. The same baseline parser rejected `_1433_01_02` as described above.

**Passed.** The three focused Node suites passed 35/35 after S1. `npx.cmd --no-install eslint` passed for the parser and all three changed test modules. `git diff --check` passed. The final `npm.cmd run build` passed with network access. `node --test --test-concurrency=1 tests/photoImportWizardUi.test.mjs` passed both existing cases against that fresh build on `127.0.0.1:63619`. The synthetic counts remained three date-and-time suggestions and one date-only suggestion. The review screenshots at 1280×720 and 1366×768 showed the suggestion panel and footer within the viewport. The test server was stopped and its port was released.

**Failed attempts.** PowerShell blocked `npm.ps1` under its execution policy. Subsequent commands used `npm.cmd`. Two final-build attempts failed while fetching Roboto from Google Fonts. Both cases in the first browser attempt timed out at Chrome DevTools `Runtime.enable` before reaching the application. The build and browser suite passed when retried outside the sandbox. No focused baseline test failures or new application regressions were observed.

**Skipped.** The requested suites reported zero skips on the successful runs. The full suite and real-file acceptance were outside this automated verification.

## Manual acceptance remaining

Re-import the complete 76-photo contractor delivery with its real files and metadata. Expect 48 existing date-and-time suggestions plus the former false date-only rows, subject to the original evidence and eligibility checks. Review the remaining date-only and missing rows against the corpus and confirm that actual counters still fall back to dates. Verify `OV1.1_20261007_0946_01.jpg` reads `07.10.2026 09:46` alone and in the full batch, then explicitly approve the complete suggestions and inspect the recorded `Filnavn` provenance. The full-corpus counts and the cause of the nine originally missing suggestions remain unverified. A counter run starting above `0010` can still be offered as a time and remains subject to user approval.

## Git

HEAD remains `1ee9ae5` on `feature/photo-workspace`, one commit ahead of `origin/feature/photo-workspace`. The worktree contains three modified files and two untracked files, all named above or this report. No staging, commit, push or deployment took place.
