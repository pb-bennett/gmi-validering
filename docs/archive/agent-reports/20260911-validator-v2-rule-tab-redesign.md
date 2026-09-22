# Validator V2 Regel-tab redesign

## Files changed

- `src/components/validation-v2/ValidationV2FieldInfoModal.js`
- `src/lib/validation-v2/registry/fieldInformation.js`
- `src/lib/validation-v2/index.js`
- `tests/validationV2RulePresentation.test.mjs`

## Implementation

Added `composeFieldRulePresentation()` as a reusable presentation model over the existing field-information, rule, value-list, source, and applicability registries. The modal now renders that model in this order when information exists: Kort forklart, Hvordan vurderes feltet?, Når er feltet aktuelt?, Gyldige verdier/koder, Kilde, and collapsed Tekniske detaljer.

Technical identifiers, geometry labels, format, requirement metadata, and source-column metadata are secondary. Empty or undocumented metadata is omitted. Identical code/label pairs render once in a compact grid. Status guidance retains the existing Feil/Sjekk/Pass semantics, including Byggemetode `UK` as Sjekk.

## Review

- Byggemetode: plain-language summary, conditional Tema list, Feil/Sjekk/Pass guidance, compact code grid, source, and collapsed technical details.
- Adkomst: retains the accepted “desired for kummer / should be checked” concept.
- S_HYPERLINK: uses user-facing “bilder” wording.
- Datafangstdato: retains current format and date guidance.
- Type: retains Tema compatibility guidance and pair information.
- SDR: retains Tema/Material dependency guidance.
- Saksnummer: no empty applicability section.

## Verification

- Focused presentation and field-information tests: passed, 10/10.
- Full Validator V2 suite: passed, 215/215.
- `npm run build`: passed.
- `git diff --check`: passed; only existing line-ending warnings were reported.

No validation policy, result semantics, diagnostic gallery, production configuration, or deployment behavior was changed. No commit was created.
