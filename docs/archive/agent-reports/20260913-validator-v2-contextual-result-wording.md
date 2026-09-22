# Validator V2 contextual Resultat wording

## Findings and change

In the first 470-point real-corpus result, the 165 `innmaling.point.type.valid` Feil outcomes were all `REQUIRED_VALUE_MISSING`, with `requirement: REQUIRED` and resolved Tema `DIV`. The runner retained Tema in the diagnostic context and listed it as an explanation dimension, but omitted Type from its diagnostic-only conditional-applicability facts. The shared mapper therefore kept these findings as generic `REQUIRED_MISSING`.

The runner now marks Type and the contextual hydraulic fields as conditionally explained and safely projects bounded source values such as validated Material into diagnostic facts. The reusable Resultat context formatter groups alternate values of one dimension (`KUM` eller `SAN`) and includes only explicitly allowed dimensions. Required contextual wording now says the field is required for the affected objects. Unresolved context continues through the dependency note path.

The resulting Type Feil wording is:

> 165 objekter med Tema `DIV` mangler Type. Feltet er påkrevd for disse objektene.

The Sjekk groups remain KUM 64, SAN 16, and SLU 3 with their existing expected/check wording. Representative diagnostics reviewed: Type, Byggemetode, Kjegle, Avst_BunnInnvUnderUtv, SDR (Tema + Material), and unconditional Målemetode. Missing Tema remains dependency wording. Object references and unrelated context are not included.

## Verification

- Focused diagnostic tests: **27 passed**.
- Full Validator V2 tests: **227 passed, 0 failed**.
- Real local corpus regression: **17 cases**; Stage 3 remains **192 variants — 65 Feil, 63 Sjekk, 64 Pass**. Type required-missing presentation includes Tema DIV.
- `npm run build`: **passed**.
- `git diff --check`: **passed** (existing LF/CRLF normalization warnings only).

No evaluator outcomes, status counts, validation rules, Resultat semantics, or policy were changed. No commit was created.
