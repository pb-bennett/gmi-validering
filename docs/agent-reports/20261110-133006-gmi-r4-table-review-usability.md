# R4 follow-up — Data Table layout and review usability

2026-11-10, Europe/Oslo. Repository `C:\GitHub\gmi-validering-test`, branch `feature/photo-workspace`, starting HEAD `bf9e0dd`. The initial working tree was clean. No commit or push was made.

## Implementation

Read the R3 selection, R4 inspector and R4 UX polish completion reports, and inspected column discovery, TanStack sorting, saved column order, column focus, contextual widths, sticky offsets, virtualization and review records before editing. The existing table supports column reordering, but has no manual column resizing implementation.

- Ordinary column defaults now consider complete-geometry values, field format and headings. Short codes/numbers use content width with a limited heading allowance; empty focused columns use 72 px. Normal prose retains the previous heading-based width. Long codes may grow to the existing 180 px cap. Complete-scope sizing avoids search/selection-dependent attribute widths. Sizing is memoized separately from changing review outcomes.
- Rettinger frozen widths are selection **32**, zoom **32**, Nr. **40**, and typical S_FCODE **56** px. Selection remains at its existing width and zoom retains its 20 px control. Sticky offsets share the actual zoom width; S_FCODE can grow for unusually long values. Contextual inspection field widths remain unchanged. Nr. values are left aligned; numbering, numeric sorting and identity search are unchanged.
- Review widths are selective: Status 180 px, or 320 px when manual buttons need room; Endring 104–200 px according to displayed content; findings 136 px without findings, or 224 px with findings. Cell padding, font size and 28 px row height are unchanged.
- Single-line headers use CSS ellipsis at their actual rendered width, avoiding premature character-count clipping. Status details and findings use a constrained text child; before/after values use a block with nonwrapping lexemes so the ellipsis appears correctly. Full strings remain in the DOM and titles; existing row details remain accessible through grid Enter. Ordinary attribute titles now cover short strings that can also be clipped by narrow columns.
- Review columns use the existing TanStack sort state, native header buttons, indicators and stable row model. Status ascends through actual/manual changes (same rank), unchanged, user-excluded, skipped, stale/added, then no outcome. Endring groups actual changes before other reviewed rows. Findings rank introduced FEIL, introduced SJEKK, then no new findings. Hypothetical, excluded and existing-only findings never count as introduced severity. Descending reverses reviewed groups; rows without any review outcome stay last in both directions. Equal ranks preserve source order.
- Review changes refresh TanStack's core row cache through a copied display array. This is necessary because manual inclusion changes computed accessor values without changing source objects. The browser test caught stale sort values before this fix. Source objects, identifiers, selection and ChangeSet construction are untouched.
- No separate Endres først control: the first Status click already brings changes first, and the existing button/arrow makes reversal available without another toolbar action.

No M5B/M2 engine, parser, Validator rule, store schema, layerTableRows preparation, map or FOTO logic changed. Saved column order and temporary Original/Foreslått focus remain on their existing paths.

## Verification

| Check | Result |
| --- | --- |
| Relevant Node gate | 219 tests: **210 pass, 0 fail, 9 browser-only skips** |
| New pure presentation tests | **4 pass**, included in the Node gate; actual TanStack asc/desc ordering, stable ties, severity exclusions, selective sizing |
| Final production browser gate | **28 pass, 0 fail**: new follow-up plus existing R1 geometry, R2 keyboard, R3 selection and R4 UX suites |
| Final focused all-object browser rerun | **1 pass** with 80 displayed objects and four selected |
| Production build | **Pass**, compilation, TypeScript, static generation |
| Targeted ESLint | **0 errors**, existing TanStack incompatible-library warning |
| git diff --check | **Pass**, normal LF/CRLF notice |

The new browser test checks all three review sort buttons, changing-object identity labels, unchanged proposal counts under sorting, manual inclusion updating severity sort, exclusion of hypothetical FEIL from severity ordering, actual ellipsis/clipping and full tooltips. At 1366x768 and 1280x720 it measures header/cell alignment, the 32/32/40/56 frozen widths, consecutive sticky positions after horizontal scrolling, left-aligned numbers, horizontal overflow confined to the table, no runtime exceptions, and unchanged input bytes.

Two existing source-contract tests were updated for intentional implementation changes: width helper/zoom variable, and the cache-refreshing copy of displayItems passed to TanStack. Their scope and identity assertions remain.

Browser execution required local Chrome debugging access. Sandboxed startup timed out; an early run against a server whose build was being regenerated was discarded. Final browser checks used a fresh server on port 3125 after the final build completed. The final build needed network access to download the existing Roboto font. No dependency or font configuration changed.

Logs in `%TEMP%`: `r4-table-node-final.log`, `r4-table-ui-final.log`, `r4-table-new-ui-final.log`, `r4-table-build-final.log`.

## Screenshots and acceptance

Synthetic screenshots, captured with all objects visible, manually included SP/PVC and the table horizontally scrolled; both were opened and visually inspected:

- [1280x720](assets/20261110-gmi-r4-table-review/1280x720.png)
- [1366x768](assets/20261110-gmi-r4-table-review/1366x768.png)

Manual real-file acceptance with Wilhelmsenhallen and assistive-technology testing were not performed in this follow-up. Suggested acceptance: preview SDR for Ledning 38/43 in Filtrert visning; click Status, Endring and findings in both directions; toggle manual inclusion; check Nr./selection, long explanations, horizontal scroll and edited-field focus in Original/Foreslått at laptop width. Full-repository and FOTO-wide gates were not rerun for this presentation-only change.
