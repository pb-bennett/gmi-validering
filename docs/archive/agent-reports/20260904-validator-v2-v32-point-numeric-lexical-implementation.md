# Validator 2.0 v3.2 – implementasjon av punktbasert heltallsformat

**Dato:** 2026-09-04
**Startcheckpoint:** `feature/validator-v2-v32-baseline` ved `6c10bca`
**Autoritativ plan:** `docs/agent-reports/20260904-validator-v2-v32-point-numeric-lexical-plan.md`
**Arbeidsform:** én direkte Luna Medium-implementasjon; ingen delegering, commit, push, merge eller deploy

## Resultat

Slicen legger til nøyaktig to aktive, point-only og optional-if-present regler:

- `innmaling.point.width.integer` for `width` / `Bredde`;
- `innmaling.point.length.integer` for `length` / `Lengde`.

Begge bruker `RuleEvaluatorKind.INTEGER_FORMAT`, `RuleCategory.VALUE_FORMAT`, severity `ERROR` og provenance `STANDARD`. Ugyldig levert representasjon gir `RuleReasonCode.VALUE_NOT_INTEGER`. Manglende felt eller verdi gir `NOT_EVALUATED` uten finding.

Registeret er etter slicen nøyaktig:

- 31 aktive regler;
- 24 punkt-applicable regler og punkt-resultatrader;
- 21 lednings-applicable regler og lednings-resultatrader;
- 31 `RuleResult`-rader per kjøring, altså nøyaktig +2.

## Delt evaluator-kontrakt

`src/lib/validation-v2/ruleEvaluation.js` har én smal `evaluateIntegerFormat()` som brukes av både produksjonsrunneren og Fildata. Den tekniske PROJECT-realiseringen av STANDARD-formatet `Heltall` er:

```text
^[+-]?[0-9]+$
```

Regexen beskrives ikke som ordrett STANDARD-syntaks.

Når `sourceLexeme` finnes, er den autoritativ og vurderes uten trimming, tallkonvertering, parsing, skilletegnnormalisering, fortegnsnormalisering eller kanonisering av ledende nuller.

Aksepterte leksemer:

- `1000`, `01000`, `+1000`, `-1`, `0`, `-0`.

Avviste leksemer:

- `1000.0`, `1.5`, `1,5`, `1e3`, `1E3`;
- ` 1000`, `1000 `, ` 1000 `;
- `1000mm`, `--1`, `+`, `abc`.

Reell GMI-verdi som bare består av blanktegn følger uendret parser-/presence-kontrakt: typed verdi blir `null`, og regelen blir `NOT_EVALUATED`.

Når `sourceLexeme` er `UNAVAILABLE`:

- string vurderes mot samme eksakte grammatikk;
- endelig safe integer som JS-number gir `PASS`;
- runtime `1000.0` gir `PASS`, fordi JavaScript ikke kan skille den fra `1000`;
- endelig brøktall, `NaN`, `Infinity`, `-Infinity`, boolean, objekt og andre ustøttede representasjoner gir `FAIL` / `VALUE_NOT_INTEGER`;
- endelig heltall utenfor safe-integer-området gir `INDETERMINATE` / `NUMERIC_PRECISION_UNAVAILABLE`, ikke et oppfunnet områdeavvik.

Eksisterende `BINDING_AMBIGUOUS`, `UNRESOLVED_SOURCE` og `SCHEMA_UNAVAILABLE` beholdes uendret.

## Binding, applicability og geometri

Evaluatoren bruker bare eksisterende canonical binding og `ObjectFieldValue`. Det er ikke lagt til eget feltoppslag eller alias.

- Direkte `Bredde`/`Lengde`, foretrukket direkte kandidat og unik case-only-binding følger eksisterende invariant.
- `DIM`, `DIMENSJON`, `Dimensjon` og `DIAMETER` binder ikke `width`.
- `LENGTH`, `Lengde_mm` og `LENGD` binder ikke `length`.
- Ingen verdi hentes fra linjer eller annen geometri.
- `Lengde` beregnes aldri fra punkt-, linje- eller polygongeometri, koordinater, feature length eller andre felt.

`pointFieldApplicability.js` er ikke importert eller lest av de nye reglene. Tema er ikke evaluatorinput. Samme leverte representasjon får samme formatutfall for `APPLICABLE`, `NOT_APPLICABLE`, `UNKNOWN`, manglende Tema og konfliktfylt Tema.

Applicability-policyen er uendret metadata-only revisjon `2026-09-04.3`:

- 88 celler;
- 71 `APPLICABLE`;
- 9 `NOT_APPLICABLE`;
- 8 `UNKNOWN`;
- null aktive applicability-regler og null applicability-resultatrader.

## Field Info og Fildata

`width` og `length` har nye Field Info-poster med `appliesTo: point`, `documentationStatus: PARTIAL`, `documentedFormat: Heltall`, enhet `mm`, tom `valueInfo` og bare den korresponderende nye audit-rule-ID-en.

Teksten skiller uttrykkelig automatisk optional-if-present-validering fra global STANDARD-requiredness. Bredde-posten forklarer polygonavgrensningen og at aliaser som `DIAMETER` ikke godtas. Lengde-posten forklarer at verdien er en levert punktobjektegenskap og aldri geometriutledet. `composeFieldInformation()` viser derfor `required: false`, `requiredness: NOT_REQUIRED` og ingen `allowedValues` for disse aktive reglene.

Fildata kaller den samme `evaluateIntegerFormat()` som produksjonsrunneren og viser:

- `Gyldig` for `PASS`;
- `Ugyldig` for `FAIL`;
- `Må vurderes` for `INDETERMINATE`;
- `-` for `NOT_EVALUATED`.

Ingen source lexeme er lagt til i telemetri eller globale resultatsammendrag.

## Filer endret

Produksjon:

- `src/lib/validation-v2/contracts.js`;
- `src/lib/validation-v2/ruleEvaluation.js`;
- `src/lib/validation-v2/validationRunner.js`;
- `src/lib/validation-v2/registry/rules.js`;
- `src/lib/validation-v2/fieldData.js`;
- `src/data/validation-v2/field-information.json`;
- `src/lib/validation-v2/registry/fieldInformation.js`.

Tester:

- ny `tests/validationV2GmiV32PointNumericLexical.test.mjs`;
- count/inventory-regresjoner i A7, A8, A8.1 Field Info, A8.1 result workflow, Type/Tema, punktkodelister og applicability-testene.

Dokumentasjon:

- den autoritative planrapporten er bevart uendret og inkludert som untracked fil;
- denne nye implementasjonsrapporten er lagt til.

Parseren, `objectFieldValue.js`, canonical fields, applicability-registeret, Tema-resolution, Type/Tema-kompatibilitet, telemetry og UI-presentasjonsrammeverket er ikke endret.

## Eksplisitte ikke-mål

Ingen requiredness, positivitet, non-zero, min/max, nominell størrelsesliste, enhetskonvertering, plausibilitet, Tema-scope, unexpected-field-finding, polygon/GML/GUID-eierskap, leveransekompletthet, geometri-klassifisering eller geometriutledet `Lengde` er implementert.

## Verifikasjon

- Fokusert ny test: `node --test tests/validationV2GmiV32PointNumericLexical.test.mjs` – **18/18 passerte**.
- Relevante Validator-/Field Info-/Fildata-/applicability-tester – grønne etter legitime 31/24/21-oppdateringer.
- Første full-suite-kjøring fant én gammel A7-liste som manglet de to nye punktregel-ID-ene: **312/313 passerte**. Listen ble korrigert, og den målrettede A7-testfilen passerte **8/8**.
- Endelig full suite: `node --test tests/*.test.mjs` – **313/313 passerte**, 0 feil, 0 skipped/cancelled.
- Build: `npm run build` – **passerte**; kun eksisterende varsel om ni måneder gamle Browserslist-data.
- `git diff --check` – **passerte**; kun forventede Git-varsler om framtidig LF→CRLF-konvertering ble skrevet.
- Endelig status og diff ble inspisert; bare slicens produksjonsfiler, målrettede tester og de to rapportene er endret/utracked.

Det er ikke gjort commit, push, merge, deploy, produksjonskonfigurasjonsendring eller databaseendring.

## Remediering etter Sol-review

Sol identifiserte ett low-severity gap i testkontrakten: de to nye reason-code-verdiene var forventet via produksjonskonstanter. Fokusertesten låser nå uavhengig de bokstavelige forventningene `VALUE_NOT_INTEGER` og `NUMERIC_PRECISION_UNAVAILABLE`.

Ingen produksjonskode, produksjonsreason-code, evaluatorsemantikk, regeldefinisjon, register-/resultatcount eller annen runtime-adferd ble endret i denne remedieringen.
