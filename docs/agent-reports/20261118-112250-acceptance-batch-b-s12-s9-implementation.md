# GMI Validator acceptance corrections, Batch B

18 November 2026, Europe/Oslo. Implemented S12 followed by S9 on `feature/photo-workspace` at `cd89c56`, with a clean working tree at the start. Scope follows the [acceptance plan](20261118-085516-real-data-acceptance-corrections-planning.md) and Batch B clarifications.

## S12 — Gemini VA acceptance wording (B6, D7)

The wording records the user-confirmed import of a real, corrected delivery into the live Gemini VA database on 16 November 2026. It refers to the tested setup and asks users to check the result after import. A ready GMI review displays the fact as a neutral note when there is no ordinal diagnostic. When the default `renumber` policy is used to remove links, the same fact appears under **Informasjon** and in the separate report. The `preserve` policy retains the warning for link removal with unchanged numbering.

Rettinger's download control and the accepted Skråfoto profile label omit the experimental tag. Mapping and direction assumptions, XSD qualification, and untested profile warnings remain in place. The ordinal diagnostic affects review and report wording. The patch algorithm, GMI and GML serialization, source identity, and verification gates retain their existing paths.

Application files — `src/components/delivery/DeliveryWizard.js`, `src/components/gmi-edit/GmiEditWorkspace.js`, `src/components/gmi-edit/gmiEdit.css`, `src/lib/delivery/deliveryWizard.mjs`, `src/lib/gmi-edit/hyperlinkRemoval.mjs` and `src/lib/photos/export/exportContract.mjs`.

Regression files — `tests/deliveryExclusion.test.mjs`, `tests/deliveryWizard.test.mjs`, `tests/gmiEditHyperlinkRemoval.test.mjs`, `tests/deliveryWizardUi.test.mjs`, `tests/gmiEditValidationUi.test.mjs` and `tests/gmiEditWorkspaceUi.test.mjs`.

## S9 — Filename editor and package footer (C4, C5, D8)

The editor uses a hidden text mirror to size the editable description and keep it adjacent to the generated affixes. The input occupies the mirror's grid cell without contributing an intrinsic width. The surrounding field provides one border and one teal focus ring. The affixes use muted text and the approved soft surface mix. For descriptions wider than the available field, the native input scrolls horizontally and the generated affixes remain visible.

The right-aligned count includes the full primary filename and its extension. Up to 60 characters uses muted text, 61–80 uses the shared golden-yellow warning token, and above 80 uses the shared red error-text token. Both advisories use an icon and an accessible threshold description. Empty, reserved and over-byte-limit names keep their blocking message and `aria-invalid`. Filename composition, source suggestions, timestamp and revision toggles, and the filesystem byte limit use the existing naming functions.

On **Pakke / Last ned**, **Last ned rapport** sits on the left of the fixed footer. **Avbryt** or **Lukk**, **Tilbake**, and the primary download group stay on the right. The package body retains the note about the separate report. The existing busy and stale conditions disable the report and the handler checks the live plan again. The footer uses local wizard markup and 40 px buttons at both laptop widths.

Application files — `src/components/delivery/DeliveryWizard.js`, `src/components/delivery/deliveryWizard.css`, `src/components/photos/PhotoExportDeliveryStep.js` and `src/lib/photos/export/photoExportNaming.mjs`.

Regression files — `tests/deliveryWizardUi.test.mjs` and `tests/photoExportNaming.test.mjs`.

## Verification

| Gate | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Clean HEAD combined Node baseline | 137 | 0 | 1 |
| Clean HEAD production Chrome baseline | 46 | 0 | 0 |
| S12 focused Node | 117 | 0 | 1 |
| S9 focused and final combined Node | 138 | 0 | 1 |
| Final production Chrome | 46 | 0 | 0 |

- The combined Node command was `node --test --test-concurrency=1 tests/deliveryExclusion.test.mjs tests/gmiEditHyperlinkRemoval.test.mjs tests/deliveryWizard.test.mjs tests/photoExportNaming.test.mjs tests/photoExportWizard.test.mjs tests/deliveryPlan.test.mjs`. The S12 focused run omitted `photoExportNaming`. The private-corpus hyperlink-removal case was skipped because its opt-in input was absent.
- Fresh `npm.cmd run build` passed for clean HEAD and the final application. The baseline and final Chrome commands used `node --test --test-concurrency=1 tests/deliveryWizardUi.test.mjs tests/gmiEditWorkspaceUi.test.mjs tests/gmiEditValidationUi.test.mjs tests/photoLoadedGmiUi.test.mjs` with `PHOTO_UI_URL` set to `next start` on free localhost ports 55663 and 49368. The temporary runner stopped its own servers.
- Chrome verified generated affix alignment and input width, one focus ring, computed counter colours at 60/61/80/81, a live keystroke update, both toggles, **Bruk forslag**, and empty, reserved and too-long blockers. It also verified both laptop layouts, the expanded tree and visible thumbnail, the report button's hit target at both sizes, a keyboard-initiated TXT download, and the disabled state during packaging and after invalidation.
- The GMI-first and FOTO-first combined workflows passed. Other checks covered verified source rebinding, separate report contents, exact GMI and attachment bytes, GML conventions, byte-identical no-op GMI re-export, stale-plan rejection, and draft and download guards.
- Affected-file `npx.cmd --no-install eslint` and `git diff --check` passed. Git printed checkout line-ending normalization notices for three LF files.

### Deviations and limitations

- The initial restricted build could not fetch Roboto. The first restricted Chrome run timed out at `Runtime.enable` for all six top-level cases. Both gates passed with the required access for the existing font fetch and local Chrome debugging connection.
- The first combined browser run exposed extra intrinsic input width and a second theme focus outline. The final implementation overlays the input on the mirror and uses the wrapper's ring. The first keyboard report probe omitted the text required by Chrome's synthetic Enter event. The updated probe downloaded and read the TXT report. The corrected fresh build passed the full serial rerun.
- Browser evidence uses synthetic fixtures in local Chrome. It covers the two requested laptop viewports and includes a 390×844 package layout check.

### Screenshot evidence

| State | 1280×720 | 1366×768 |
| --- | --- | --- |
| Focused filename editor with both generated affixes and the live counter | [Screenshot](assets/20261118-112250-acceptance-batch-b/batch-b-filename-1280x720.png) | [Screenshot](assets/20261118-112250-acceptance-batch-b/batch-b-filename-1366x768.png) |
| Combined package with expanded attachments, thumbnails enabled, and the fixed footer | [Screenshot](assets/20261118-112250-acceptance-batch-b/batch-b-package-1280x720.png) | [Screenshot](assets/20261118-112250-acceptance-batch-b/batch-b-package-1366x768.png) |

### Remaining manual acceptance

Manual real-data acceptance for this batch remains deferred. When resumed, use a representative corrected survey delivery to check the generated names and the separate report with real filenames and attachments. Confirm the staged correction values and retained, transferred and excluded photo links after importing through the tested Gemini VA setup. The November 16 evidence is specific to its tested delivery and setup. The `preserve` ordinal policy and the profiles explicitly marked untested still have no Gemini VA acceptance evidence.

## Git

`git status -sb` reports `feature/photo-workspace` three commits ahead of `origin/feature/photo-workspace`. HEAD remains `cd89c56`. The application and regression changes above are unstaged. This report and its four screenshot files are untracked. No staging, commits, pushes, deployment or subagent work took place.
