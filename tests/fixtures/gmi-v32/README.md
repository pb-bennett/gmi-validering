# Synthetic GMI v3.2 fixtures

Committed `.gmi` files use ISO-8859-1 (Latin-1) bytes and LF newlines. SHA-256
hashes in `manifest.json` are calculated from raw bytes. Do not save fixtures
through a UTF-8 editor or normalize line endings; tests decode bytes with the
same decoder used by upload. Astral Unicode boundaries remain in-memory tests.

Every file in this directory is fabricated. The suite contains no operational delivery, identifier, person, address, attachment path, coordinate, or free text. Its deliberately simple coordinates and text are synthetic. Use the files for manual uploads or headless parser/schema/validator tests without access to the local reference corpus.

The manifest is the future v3.2 oracle. Its `scenarioOracle` records expected `Pass`, `Sjekk`, `Feil`, or explicitly `UNRESOLVED` manual outcomes. It is intentionally not asserted against the current partial Validator 2.0 implementation. Object references use parser source indexes such as `point:0` and never add product identity semantics.

| Fixture | Purpose |
|---|---|
| point-clean-modern | Clean S_FCODE-only modern point delivery. |
| point-boundaries | Common code, numeric, missing and Unicode text boundaries. |
| point-text-placeholders | All approved placeholder spellings and retired Synbarhet. |
| point-applicability-tema | Tema resolution, Type, LOK/STR/KRN/UNKNOWN applicability and hyperlink rules. |
| installation-history | Dynamic year/date boundaries and multi-object Stedfestingsårsak plausibility. |
| line-clean-modern | Clean pressure and gravity line controls. |
| line-dimensions-shapes | Dimension, shape, vertical dimension, network/material and Tykkelse cases. |
| line-hydraulic | SDR, Ringstivhet and Trykklasse combinations including GRP, GUP and suction. |
| comprehensive-bad | Parseable deliberate stress case with documented independent faults. |
| parser-* | Parser-only malformed or truncated-input cases. |

For manual testing, upload any fixture marked `manualUpload: true` in `manifest.json`. Parser-error fixtures are for error handling only. SHA-256 hashes are fixture identity data for a later upload-recognition task; this suite does not change telemetry or application behavior.

When changing a fixture, update its SHA-256, parser counts, headers, scenarios, oracle references, and the integrity test. Keep data invented and neutral. Do not add an operational file or derive a synthetic value from one.

Two policy items remain intentionally unresolved: the complete confidently-gravity Tema inventory for Ringstivhet, and line `Tykkelse` integer-versus-decimal policy. The manifest marks the decimal scenario `UNRESOLVED`.
