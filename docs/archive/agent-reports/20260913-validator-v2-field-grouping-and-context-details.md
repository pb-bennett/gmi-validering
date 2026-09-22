# Validator V2 field grouping and contextual details

## 1. Why Adkomst produced two `Mangler` rows

The 470-point source file `REF_FILES/GMI/FK/VA_SOMBYGGET_07112025_BRUK DENNE.gmi` contains no delivered Adkomst values. The completed structured outcomes divide those missing values by policy context: 64 objects have resolved Tema `KUM`, `coverageApplicability: EXPECTED`, `requirement: EXPECTED`, and outcome `CHECK`; the remaining 406 have `coverageApplicability: NOT_APPLICABLE` and outcome `PASS`. The old field-data presentation split one delivered-value bucket by status but discarded the context that caused the split.

## 2. Qualifier and tooltip design

The field-data scan now retains a bounded projection of existing diagnostic facts: explanatory context field/value pairs, applicability, and requirement. It does not retain raw context objects or technical identifiers in the presentation model. A qualifier is shown only when one delivered value has materially distinct outcome groups. Applicable groups use compact labels such as `Tema KUM` or combined explanatory dimensions; non-applicable groups use `Ikke aktuelt`. The fuller consequence is rendered in a tooltip/popover beside the qualifier. There is no additional table column.

## 3. Accessibility behavior

The information control is a real button with a status-derived aria-label and `aria-describedby` while its `role="tooltip"` explanation is open. It opens on mouse hover, keyboard focus, and click/tap. Click keeps it open for touch use; Escape closes the clicked state. Status text remains visible in the Resultat column, so the distinction does not depend on color.

## 4. Final Adkomst representation

The verified real-file distribution is:

| Levert verdi | Qualifier | Antall | Andel | Resultat |
| --- | --- | ---: | ---: | --- |
| Mangler | Tema KUM | 64 | 13.6 % | Sjekk |
| Mangler | Ikke aktuelt | 406 | 86.4 % | Pass |

The first explanation says Adkomst is desired in this context and the missing value therefore gives Sjekk. The second says Adkomst is not applicable to those objects and the missing value therefore gives neither Feil nor Sjekk.

## 5. Why Type compatibility appeared separately

Both `innmaling.point.type.valid` and `innmaling.point.type-tema.compatible` already declare canonical field `type`. The sidebar presentation was nevertheless built one row per rule result and preferred the compatibility owner's `resultLabel`, `Type passer til Tema`. This exposed an internal relationship owner as if it were a source field.

## 6. Field-grouping architecture

The presentation layer now groups rule results by canonical field within the selected geometry. Each field presentation retains its independent owner rules and rule results. It selects a field-data-enabled owner as the primary owner for source distribution and Regel composition. The user-facing name comes from canonical field information. Search, filtering, ordering, expansion identity, and modal identity operate on the grouped field presentation.

## 7. Type owners grouped

The single Type field contains these owners internally:

- `innmaling.point.type.valid`
- `innmaling.point.type-tema.compatible`

The compatibility owner remains independent in validation results. It no longer creates a sidebar row.

## 8. Object-count deduplication semantics

Field counts are derived from completed owner outcomes keyed by ObjectRef identity. Every object receives its worst direct field status across associated owners: Feil before Sjekk before Pass. An object is counted once. Dependency-review outcomes are treated as Sjekk for the sidebar field status; ordinary non-evaluated outcomes do not create a count. Focused coverage proves an object that passes Type validity and fails Type/Tema compatibility counts once as Feil.

## 9. Final Type Resultat composition

Opening Type builds one field-centric Resultat model from both owners. Type validity diagnostics and Type/Tema compatibility diagnostics are sorted Feil first, then Sjekk, followed by unresolved/dependency information. Compatibility keeps the structured pair evidence and existing explanation/guidance. Type's Detaljer distribution remains tied to the Type source column; no relationship distribution is manufactured. Type Regel remains the existing single source-backed `Kode | Betydning | Gjelder for tema` table.

## 10. Other helper or relationship owners

The only other repeated canonical fields are Tema, InnvendigUtvendig, and Tykkelse. Their owners are separated by point/line geometry, so each selected geometry still has one owner for the canonical field. No additional same-geometry fake field was found, and no broader refactor was needed.

## 11. Focused tests

Focused presentation, results-workflow, and Type/Tema compatibility tests passed: 33 tests, 0 failures. Added coverage includes contextual qualifiers, real Adkomst-shaped 64/406 grouping, non-applicable Pass explanation, simple-table suppression, safe contextual dimensions, accessible hover/focus/click behavior, one Type sidebar field, retained owner membership, worst-status aggregation, object deduplication, both Resultat diagnostic families, and compatibility pair evidence. Existing tests continue to cover Mangler, Ugyldig verdi, Betydning, Tolket verdi, the unified Type Regel table, and unchanged relationship outcomes.

## 12. Full suite

`node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs` passed: 240 tests, 0 failures.

## 13. Build

`npm run build` passed with a successful Next.js production build. The existing browserslist age notice remains informational.

## 14. Diff check

`git diff --check` passed.

## 15. Validation policy

No validation policy, rule registry semantics, Regel source content, or owner outcomes were changed. Changes are limited to field-data context projection and user-facing presentation grouping/composition. The research gallery was not touched.

## Manual review note

The real 470-point result model and all requested UI states were verified through focused model/component tests and the production build. Interactive browser review could not be completed because the in-app browser runtime failed to initialize without its required sandbox metadata.
