# Validator table presentation — Slice 5

## Model

Slice 4 introduced a runtime-only, immutable exact `ObjectRef` scope. Slice 5
keeps that generic capability and adds a contextual exact session with two
immutable sets: the complete evaluated **field scope** and the exact diagnostic
**Utvalg** focus subset. `Utvalg` is never reconstructed from a status, value,
or diagnostic sentence. The session starts in the focus view; `Alle` switches
only the visible rows to the complete evaluated field scope.

`Alle` is built from structured outcomes for the selected canonical field's
owners, not from the layer or a display-value filter. NOT_EVALUATED/suppressed
outcomes are excluded. Grouped fields, including Type, deduplicate by
`ObjectRef.key` and aggregate `Feil > Sjekk > Pass`, preserving existing
validation semantics and reconciling the field-level population.

The generic runtime session validates atomically: one current layer, revision,
and geometry; valid deduplicated refs; focus membership in scope; and one
FAIL/CHECK/PASS result for every field-scope ref. Invalid, incomplete, mixed,
or stale sessions fail closed. Closing the table, removing its layer, and
replacement data clear the runtime state.

## Table presentation

The Validator adapter supplies authoritative canonical binding columns. The
table forces Tema and the inspected field into the ephemeral scoped model even
when sparse or all missing, adds a virtual runtime-only `Resultat` column, and
orders data as `Tema | current field | Resultat | remaining attributes`.
Tema inspection avoids duplication. Resultat renders text (`Feil`, `Sjekk`, or
`Pass`), while the current field gets only a restrained status tint.

The compact accessible segmented control exposes `Utvalg N` and `Alle M` with
`aria-pressed`; it is omitted when both sets are equal. Sorting is local to the
contextual session and operates on the currently active view. Whole-layer
preferences are untouched.

Both Tema and the current field use cumulative, measured table column widths:
the action gutter is left 0, Tema follows it, and the current field follows
Tema. Resultat scrolls normally. Pinned cells are opaque, separated, and retain
readable hover/status treatment. Switching the Validator inspector to another
field does not alter the independent table session; a new diagnostic action
atomically replaces it.

## Privacy and compatibility

Refs, indices, active view, Resultat metadata, contextual columns, and
callbacks remain top-level runtime state and are absent from persisted store
serialization, source attributes, exports, URLs, and telemetry. Generic Slice
4 exact inspections still work with no false Alle control. Whole-layer table
tabs, saved ordering, map filters, and normal map interactions remain
independent. No map overlay was added; that is Slice 6.

## Files changed

- `src/lib/objectTableInspection.js`
- `src/lib/validation-v2/tableInspection.js`
- `src/lib/store.js`
- `src/components/LayerDataTable.js`
- `src/components/validation-v2/ValidationV2Workspace.js`
- `tests/objectTableInspection.test.mjs`

## Verification

- Focused exact/contextual scope tests: pass (6).
- Full Validator suite: `node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs` — pass (252).
- Workspace coverage is included in that suite; no separate LayerDataTable test file exists in this repository.
- `npm run build` — pass.
- `git diff --check` — pass (only existing CRLF conversion warnings).
- Browser/manual verification: attempted through the in-app browser, but its connection was rejected because sandbox metadata (`sandboxPolicy`) was unavailable. No browser assertion was made.

Validation rules, outcomes, counts, and diagnostic semantics were not changed.
Remaining Slice 6 work is the separate non-interactive map inspection overlay
and its associated controls.

## Corrective pass — Validator close and contextual widths

Closing Validator mode now calls a dedicated store action before it exits. The
action closes and clears only runtime inspections with the Validator-owned
`validation-v2-*` source identity; it leaves generic exact inspections and
ordinary whole-layer tables alone. Closing or switching a field inspector still
does not affect the independent table session.

Pinned Validator columns now calculate their widths from the immutable complete
field scope, not the active Utvalg rows. Normal values such as `FORAKLOSS` and
Tema codes remain fully readable, and widths stay stable through
Utvalg/Alle switches. The field width has a generous bounded maximum (320px;
Tema 160px); pathological values retain their existing full-value tooltip.
Cumulative sticky offsets continue to derive from the resulting measured
column widths.

Additional focused regression coverage verifies the Validator ownership close
contract, complete-scope width selection, normal code readability, bounded
pathological values, and cumulative offsets.

Corrective verification: focused object-table/workspace tests pass (19), the
full Validator suite passes (252), `npm run build` passes, and `git diff
--check` passes (with only pre-existing CRLF conversion warnings).

## Corrective pass — all-missing contextual fields

The centralized field-width helper now distinguishes complete scopes with no
real supplied values. Such an investigated field uses a compact 104px sticky
width rather than its long header text; the contextual header may wrap to two
lines and exposes its full name in a title. The decision still uses the
complete immutable field scope, so it is stable across Utvalg/Alle and an Alle
value still expands a focus subset that happens to be entirely missing.

Only the investigated contextual field renders a missing source value as
`Mangler`. This is a cell presentation argument, not a source mutation;
ordinary whole-layer cells retain their existing `-` rendering. Tema and
Resultat sizing/behavior are unchanged, and sticky offsets continue to use the
actual compact or populated field width.

## Corrective pass — ordinary contextual column density

Remaining contextual attributes now use a separate immutable-scope,
content-first width helper. Short/numeric values begin at a compact 64px and
genuinely longer values expand up to a bounded 220px; long field names no
longer determine their width. Ordinary contextual headers may wrap to two
lines and expose their full text through a title. Tema, the investigated field,
and Resultat retain their accepted sizing behavior; normal whole-layer sizing
continues to use its existing helper and preferences. The table has no existing
column drag-resize mechanism to preserve; scoped widths remain runtime-only.
