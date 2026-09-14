# Validator V2 value-distribution table

## Presentation

The former `Parserverdi` was the parser/extracted value (`sourceValue`), while `Levert verdi` came from the source lexeme (`sourceLexeme`). They are often identical, but can differ after parsing—for example, GMI lexeme `001` can be interpreted as number `1`.

The normal table now uses `Levert verdi | Betydning | Antall | Andel | Resultat` when source meanings are available; otherwise it omits `Betydning` unless a missing/invalid row needs an explanation. Results display only `Feil`, `Sjekk`, or `Pass`, without repeating counts. Missing values display `Mangler` with `—`; unresolved values display `Uavklart`. Supplied Feil values display `Ugyldig verdi`. Status rows use subtle red/orange treatment for Feil/Sjekk and neutral white for Pass.

Meanings come from the existing v3.2 authoritative tables, selected by field and geometry; no descriptions were copied into a second registry. Type shows its source meaning only, not its Tema mapping. Where a source row has a longer description, it remains available in a collapsed “Mer beskrivelse” disclosure. Parser transformations appear only in a per-row collapsed “Tolket verdi” disclosure when they differ from the delivered value.

Representative presentation-model review: Innvendig/utvendig (`ID`, 83 Pass and 387 missing Feil), Byggemetode (`UK` / `Ukjent` / Sjekk), Type, Material, Rørform, invalid `XYZ`, and code-only SDR. Mixed missing Type outcomes remain separate Feil/Sjekk rows. Headline/status-count behavior is unchanged.

## Verification

- Focused presentation/UI tests: **20 passed**.
- Full Validator V2 suite: **235 passed, 0 failed**.
- `npm run build`: **passed**.
- `git diff --check`: **passed** (existing LF/CRLF normalization warnings only).
- Interactive browser visual review was unavailable because the browser bridge rejected startup for missing sandbox metadata; component-level and source-backed presentation tests were used instead.

No validation policy or outcomes were changed. No commit was created.
