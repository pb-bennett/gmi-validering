# Validator 2.0 v3.2 point-field Batch 2 implementation

Date: 2026-09-06

## Scope completed

Implemented exactly these four new point-only, optional-if-present supplied-value rules:

| Rule ID | Canonical field | Source property | Contract |
|---|---|---|---|
| `innmaling.point.bottom-distance.decimal` | `innerBottomToOuterUndersideDistance` | `Avst_BunnInnvUnderUtv` | Plain signed decimal, `[+-]?[0-9]+(?:[.,][0-9]+)?`, metres |
| `innmaling.point.installation-year.format` | `installationYear` | `Anleggsår` | Exactly four ASCII digits, `YYYY` |
| `innmaling.point.capture-date.format` | `captureDate` | `Datafangstdato` | Exactly `DD.MM.YYYY` |
| `innmaling.point.note.max-length` | `note` | `Merknad` | At most 255 Unicode code points |

No parser, applicability consumer, line rule, requiredness rule, range rule, positivity rule, unit conversion, or geometry derivation was added.

## Evaluator and reason-code contracts

Four narrow evaluator kinds were added under `VALUE_FORMAT`:

- `DECIMAL_FORMAT`: source lexeme first; accepts signed integer/plain decimal strings with either dot or comma. Nonnumeric values fail with `VALUE_NOT_DECIMAL`. Numeric-looking but source-unspecified notation such as exponent notation, `.5`, `1.`, grouping, or padded numeric text is `INDETERMINATE / DECIMAL_NOTATION_UNRESOLVED`. A finite runtime number without a lexeme is `INDETERMINATE / LEXICAL_FORMAT_UNAVAILABLE`; nonfinite or unsupported values fail.
- `YEAR_FORMAT`: source lexeme first; accepts exactly four ASCII digits, including `0000`, without a year range. A safe four-digit runtime integer without a lexeme is the documented fallback; other width-unknown numeric cases are `INDETERMINATE / LEXICAL_FORMAT_UNAVAILABLE`. Supplied lexical failures use `YEAR_FORMAT_INVALID`.
- `DATE_FORMAT`: source lexeme/string only; accepts the exact whole-string `DD.MM.YYYY` shape. It deliberately does not check calendar validity, chronology, time, timezone, or `Date.parse`. Non-text values without lexical evidence are `INDETERMINATE / LEXICAL_FORMAT_UNAVAILABLE`; malformed text uses `DATE_FORMAT_INVALID`.
- `TEXT_MAX_LENGTH`: source lexeme first, otherwise a supplied string; counts Unicode code points including whitespace, without trimming or normalization. Values over 255 fail with `TEXT_LENGTH_EXCEEDED`; non-string runtime values without lexical text are `INDETERMINATE / LEXICAL_FORMAT_UNAVAILABLE`.

All four preserve existing missing and structural evidence semantics: absent/missing is `NOT_EVALUATED`; `BINDING_AMBIGUOUS`, `UNRESOLVED_SOURCE`, and `SCHEMA_UNAVAILABLE` remain `INDETERMINATE` with their established reason codes.

## Field Info and Fildata

Field Info now documents the four active rules, source datatype/format, units, point-only automation, optional-if-present semantics, and the unresolved applicability scope for `Avst_BunnInnvUnderUtv`. Year and date entries distinguish format validation from requiredness; date metadata explicitly records the format-only calendar boundary. Merknad records the technical Unicode code-point interpretation of the 255-character limit.

Fildata dispatches the same production evaluators and evidence path as the runner and reports the established `Gyldig`, `Ugyldig`, `Må vurderes`, and `-` states. Completed-result ownership/reuse remains enforced.

## Verification and counts

- Active rules: **45**
- Point-applicable rules/result rows: **38**
- Line-applicable rules/result rows: **21**
- RuleResults per run: **45**
- Applicability: revision **2026-09-04.3**, **88** cells: **71 APPLICABLE**, **9 NOT_APPLICABLE**, **8 UNKNOWN**, **0** active applicability rules/results/consumers
- Full suite: `node --test tests/*.test.mjs` — **350/350 passed**
- Build: `npm run build` — passed
- `git diff --check` — passed; only existing LF/CRLF conversion warnings were emitted

## Tests

Added independent Batch 2 fixture/test coverage for literal rule IDs, source properties, pages, units, grammar/length limits, parser-preserved lexemes, signs, comma/dot decimal behavior, unresolved decimal notation, year/date widths and separators, calendar-shaped date examples, note whitespace and astral/combining Unicode boundaries, missing values, duplicate lexical ambiguity, point-only isolation, structural uncertainty, Fildata state reuse, final counts, and metadata-only applicability.

Updated existing registry, presentation, result-workflow, Batch 1, numeric, code-list, and applicability count oracles from 41/34/21 to 45/38/21 where appropriate. Canonical field count remains unchanged.

## Source decisions and remaining boundaries

The roadmap's conservative Batch 2 technical conventions were applied. The source confirms datatype/format and the Merknad limit but does not settle decimal separator preference, decimal precision, historical year plausibility, calendar validity, or the broader conditional requiredness of `Avst_BunnInnvUnderUtv`. Those remain deliberately outside this batch; no genuine implementation blocker was encountered.

No commit, push, merge, deploy, production configuration change, or database change was made.

## Remediation after independent Sol review

The three review findings were remediated without redesigning Batch 2 or adding
rules.

1. **Whitespace-only Merknad evidence:** the shared object-value result keeps
   its established `VALUE_MISSING` state and existing `sourceLexeme` result
   shape, so numeric/code-list missing semantics and their Fildata evidence do
   not change. `TEXT_MAX_LENGTH` alone inspects preserved candidate lexical
   evidence when the parser has mapped non-empty whitespace text to `null`.
   Therefore 255 spaces pass and 256 spaces fail with
   `TEXT_LENGTH_EXCEEDED`; absent and genuinely empty values remain
   `NOT_EVALUATED`, and structural uncertainty remains indeterminate.

2. **Decimal recognizer:** the broad character allow-list was replaced with
   bounded recognizers for coherent exponent, omitted-leading/trailing-digit,
   grouping, and padded numeric forms. Plain `[+-]?[0-9]+(?:[.,][0-9]+)?`
   remains the only automatic pass grammar. Coherent but source-unspecified
   alternatives remain `INDETERMINATE / DECIMAL_NOTATION_UNRESOLVED`, while
   malformed fragments such as `e`, `.`, `1--2`, `1ee2`, and `1..2` now fail
   with `VALUE_NOT_DECIMAL`. Runtime finite numbers without lexical evidence
   remain `LEXICAL_FORMAT_UNAVAILABLE` indeterminate.

3. **Test reachability and parser-path coverage:** the accidental early return
   was removed. Boundary assertions now execute for ordinary and
   whitespace-only Merknad values, including Fildata. Real-parser duplicate
   accepted-key cases were added for all four Batch 2 fields, covering
   equivalent lexical evidence and conflicting lexical evidence producing
   `BINDING_AMBIGUOUS`.

The parser itself was not changed. Year semantics remain exact four-ASCII-digit
format validation with `0000` accepted and no plausibility range. Date semantics
remain exact `DD.MM.YYYY` lexical validation without calendar, time, or timezone
handling. Counts and metadata-only applicability remain 45 active / 38 point /
21 line / 45 results, with applicability revision `2026-09-04.3` and
71/9/8 states across 88 cells.

Remediation verification: the focused Batch 2 suite passed **7/7**; the
directly affected regression suites passed **124/124**; the complete repository
suite passed **350/350**. The production build was not rerun because the
remediation is narrow evaluator/evidence logic and does not materially change
the build surface. `git diff --check` passed.

## Final remediation: whitespace-only duplicate Merknad evidence

The initial whitespace remediation correctly fixed single-key Merknad values,
including 255 spaces passing and 256 spaces failing. A second narrow correction
was required because selecting the first recovered whitespace lexeme made a
multi-key result dependent on source-key order.

The `TEXT_MAX_LENGTH` recovery helper now inspects all accepted candidate
lexemes when the ordinary extracted value is `VALUE_MISSING`, keeps only
genuinely supplied non-empty lexical evidence, and compares those strings
exactly without trimming or normalization. Equal whitespace-only duplicates
therefore remain valid and are length-checked. Differing whitespace-only
lexemes return the established `INDETERMINATE / BINDING_AMBIGUOUS` result.
With no recovered supplied text, the existing `NOT_EVALUATED` behavior remains.

Real-parser regression coverage now verifies equivalent 255/255 whitespace
duplicates, conflicting 255/256 duplicates, both source-key orders, and Fildata
`Må vurderes` for the conflicting case. Existing single-key 255/256 assertions
remain intact. No parser, global `VALUE_MISSING` semantics, numeric/code-list
behavior, decimal/year/date evaluator, Field Info, applicability, or Tema logic
was changed.

Final-remediation verification: Batch 2 focused tests passed **7/7** and the
directly affected Batch 1/numeric binding regressions passed **48/48**. Counts
remain **45 active / 38 point / 21 line / 45 RuleResults**; applicability remains
revision `2026-09-04.3`, **88 cells / 71 APPLICABLE / 9 NOT_APPLICABLE /
8 UNKNOWN / 0 active consumers or results**.
