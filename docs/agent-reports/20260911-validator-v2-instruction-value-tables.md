# Validator V2 instruction value tables

## Status

**Complete for the coded/value tables identified in v3.2 Vedlegg A.** There are 25 reproduced table instances covering 21 fields. This includes separate point/line tables and the distinct “Mest aktuelle koder” subsets for both measurement fields.

## Authoritative source and inventory

Transcription and page checks used only the controlled source `REF_FILES/innmalingsinstruks/2026-v3.2/Innmålingsinstruks 2026 vedlegg-a.pdf` (2026, v3.2). The main instruction was not used for table content; no v3.1 PDF was used.

The v3.2 coded-table inventory is:

| Field / instance | Source pages | Source table and columns |
|---|---:|---|
| Høydereferanse | 6 | Kodeverk / Høydereferanse — Kode, kort beskrivelse, lang beskrivelse |
| Målemetode | 7; 23–25 | Mest aktuelle koder (p.7) and all codes — Kode, kort beskrivelse, lang beskrivelse |
| MålemetodeHøyde | 7; 25–27 | Mest aktuelle koder (p.7) and all codes — Kode, kort beskrivelse, lang beskrivelse |
| Stedfestingsforhold | 7–8 | Kodeverk — Kode, kort beskrivelse, lang beskrivelse |
| Stedfestingsårsak | 8 | Kodeverk — Kode, kort beskrivelse, lang beskrivelse |
| Synbarhet | 8 | Kodeverk — Kode, beskrivelse |
| Eier | 8–9 | Kodeverk — Kode, beskrivelse |
| Vertikalnivå | 9 | Kodeverk — Kode, beskrivelse |
| Tema, punkt | 10–12 | Kodeverk / Tema — Kode, beskrivelse |
| Type | 12–14 | Kodeverk / Type — Kode, beskrivelse, gjelder for tema |
| Kumform | 14 | Kodeverk / Kumform — Kode, beskrivelse |
| InnvendigUtvendig, punkt | 14 | Kodeverk — Kode, kort og lang beskrivelse |
| Byggemetode | 15 | Kodeverk / Byggemetode — Kode, beskrivelse |
| Adkomst | 15 | Kodeverk / Adkomst — Kode, beskrivelse |
| Kjegle | 15 | Kodeverk / Kjegle — Kode, beskrivelse |
| Tema, ledning | 16–19 | Kodeverk / Tema — Kode, beskrivelse |
| Nett_type | 19 | Kodeverk / Nett_type — Kode, kort og lang beskrivelse |
| Material | 19–21 | Kodeverk / Material — Kode, beskrivelse |
| InnvendigUtvendig, ledning | 21 | Kodeverk — Kode, kort og lang beskrivelse |
| Rørform | 21 | Kodeverk / Rørform — Kode, beskrivelse |
| SDR | 21–22 | Kodeverk / SDR — code only in source |
| Trykklasse | 22 | Kodeverk / Trykklasse — Kode, beskrivelse |
| Ringstivhet | 22 | Kodeverk / Ringstivhet — code only in source |

The instruction describes S_HYPERLINK’s format on pp.9/16 but provides no coded-value table for it.

## Completed groups

The five remaining groups are now reproduced: Målemetode, MålemetodeHøyde, Stedfestingsforhold, Tema (separate Punkt and Ledning tables), and Synbarhet. Målemetode has 69 rows plus the separate 4-row p.7 subset; MålemetodeHøyde has 35 rows plus the separate 3-row p.7 subset. Stedfestingsforhold retains both descriptions in separate columns. Tema has 81 point rows and 108 line rows in source order. Synbarhet has all four p.8 rows.

The two p.7 measurement subsets are not merged into the later complete tables. Their extra long-description paragraphs (including the RTK Fix qualification and CPOS notes) are retained as distinct subset rows. Source document/version, page, section/table, columns, and row order are present in the structured data.

## Source versus validator

| Group | Code-set/order comparison |
|---|---|
| Målemetode | All 69 source codes match the active registry, in order. |
| MålemetodeHøyde | All 35 source codes match the active registry, in order. |
| Stedfestingsforhold | All 10 source codes match the active registry, in order. |
| Tema Punkt | All 81 source codes match the active point registry, in order. |
| Tema Ledning | All 108 source codes match the active line registry, in order. |
| Synbarhet | **Discrepancy:** source has codes 0–3; the current retired visibility rule has no accepted values (`allowedValues: []`). The UI identifies these as “Koder i instruksen” and flags the mismatch instead of presenting them as validator-approved. |

The active registries hold value codes, not authoritative source descriptions, so description-to-registry comparisons do not apply. No policy/status adjustment was made for the Synbarhet discrepancy; it remains for review.

## Files updated for this completion

- `src/data/validation-v2/authoritative-value-tables.js`
- `src/lib/validation-v2/registry/fieldInformation.js`
- `src/components/validation-v2/ValidationV2FieldInfoModal.js`
- `tests/validationV2RulePresentation.test.mjs`
- this report

## Verification

- Focused source-table presentation tests: **11 passed**.
- Full Validator V2 suite (`node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs`): **221 passed, 0 failed**.
- Build (`npm run build`): **passed**.
- `git diff --check`: **passed** (Git emitted existing LF-to-CRLF working-copy warnings).

Source wording and ordering were transcribed from the v3.2 appendix rather than paraphrased. No validation policy or status behavior was changed. No Resultat behavior was changed. No commit was created.
