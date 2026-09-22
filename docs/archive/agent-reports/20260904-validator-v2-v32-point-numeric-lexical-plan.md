# Validator 2.0 v3.2 — plan for punktbasert heltallsvalidering

**Dato:** 2026-09-04
**Arbeidsform:** source-first plan/arkitektur; ingen produksjonskode eller tester implementert
**Repository checkpoint:** `feature/validator-v2-v32-baseline` ved `6c10bca`
**Gjeldende register:** 29 aktive regler / 22 punktregler / 21 ledningsregler
**Gjeldende applicability-policy:** revisjon `2026-09-04.3`, 88 celler: 71 `APPLICABLE`, 9 `NOT_APPLICABLE`, 8 `UNKNOWN`; metadata-only

## 1. Konklusjon

Begge feltene er klare for en avgrenset, punkt-only, optional-if-present kontroll av levert heltallsformat:

- `Bredde` og `Lengde` er eksplisitt oppgitt som `Heltall` i millimeter i Vedlegg A v3.2 side 9.
- Kontrollen skal bare vurdere en levert direkte egenskap. Den skal ikke kreve feltet, avgjøre Tema-applicability, tolke polygonunntaket eller utlede lengde fra geometri.
- Eksakt GMI-leksem er tilgjengelig før parserens trim og typekonvertering. Dermed kan blant annet `1000`, `01000`, `1000.0`, `1e3` og verdier med blanktegn skilles i reelle GMI-data.
- Kildens numeriske domene er alle heltall. Kilden oppgir ingen minsteverdi, størsteverdi, positivitet eller ikke-null-krav. Negative heltall og null kan derfor ikke avvises i denne kontrollen.
- Den smaleste passende arkitekturen er to eksplisitte feltregler som deler én liten heltallsformat-evaluator. Applicability-registeret skal ikke importeres eller leses.

Den anbefalte tekniske heltallsgrammatikken er en eksakt, ikke-trimmet base-10-leksem med valgfritt ASCII-fortegn og minst ett siffer:

```text
^[+-]?[0-9]+$
```

Dette er den minimale kjørbare realiseringen av STANDARD-formatet `Heltall`, ikke en ny positivitet-, område- eller normaliseringsregel. Ledende nuller og fortegn beholdes og godtas; desimaltegn, eksponentnotasjon og blanktegn inngår ikke i en heltallsleksem. Kilden spesifiserer ikke en egen GMI-grammatikk for disse variantene, så detaljene må presenteres som evaluatorens tekniske formatkontrakt og ikke som ordrette STANDARD-påstander.

## 2. Gjennomgått autoritet

Primærkilder bevart i repoets referansemateriale:

- `REF_FILES/innmalingsinstruks/2026-v3.2/Innmålingsinstruks 2026 vedlegg-a.pdf`
  - side 1–2: Vedlegg A, versjon 3.2 august 2026, revisjon 3.2 datert 01.08.2026;
  - side 4–5: feltoversikter og punktomfang;
  - side 9: punktfeltformater;
  - side 14–15: `Kumform` og tilgrensende kodeinformasjon.
- `REF_FILES/innmalingsinstruks/2026-v3.2/Innmålingsinstruks 2026.pdf`
  - side 14: riktig kumbredde skal registreres som egenskap;
  - side 15: ikke-runde punktobjekter og ytre polygonavgrensning.

Sekundær, allerede etablert repo-evidens:

- `docs/agent-reports/20260831-validator-v2-v32-rebaseline-plan.md`;
- `docs/agent-reports/20260904-validator-v2-v32-point-representation-plan.md`;
- `docs/validation-v2/innmalingsinstruks-rule-source-map.json`;
- `docs/validation-v2/gmi-adapter-spec.json`;
- eksisterende felt-, regel-, evaluator-, parser- og Field Info-implementasjon.

De sporede PDF-ene under `src/data/` er v3.1 og er ikke brukt som v3.2-autoritet i denne planen.

## 3. Bredde — kildeevidens

| Spørsmål | Funn | Klassifikasjon |
|---|---|---|
| Eksakt kildenavn | Det direkte GMI-egenskapsnavnet er `Bredde`. Vedlegg A bruker visningsetiketten `Bredde (diameter)` i formattabellen og den kombinerte oversiktsraden `Bredde (/ Lengde)`. Parentesene er forklaring, ikke autorisasjon for aliaset `DIAMETER`. | `STANDARD` for `Bredde`; etablert adaptermapping har høy evidens. |
| Geometri | Feltet står under «Feltoversikt – punktobjekt» og «Gjelder for punktobjekt». | `STANDARD`: point-only. |
| Datatype/format | `Heltall`. | `STANDARD`. |
| Enhet | «Bredde gitt i [mm]». | `STANDARD`: millimeter. |
| Betydning | Bredde på konstruksjonen; for rund kum er dette dimensjonen. Eksempler er nominell diameter `1000, 1600, 2000 osv`, som oftest innvendig bredde. | `STANDARD`; eksemplene er ikke min/max eller uttømmende verdier. |
| Nedre/øvre grense | Ingen oppgitt. | `UNKNOWN`; skal ikke automatiseres. |
| Null | Verken tillatt eller forbudt uttrykkelig. `Heltall` alene utelukker ikke null. | Ingen kildebasert nullrestriksjon; `0` må godtas av ren formatkontroll. |
| Negative verdier | Ingen positivitet eller negativitetsforbud er oppgitt. `Heltall` alene omfatter negative heltall. | Ingen kildebasert positivitet; `-1` må godtas av ren formatkontroll. |
| Desimalverdi | Strider mot eksplisitt format `Heltall`. | `STANDARD`: desimalform er ugyldig for denne kontrollen. |
| Blanktegn | Kilden definerer ikke trimming eller omgivende blanktegn. | `UNKNOWN` i STANDARD. Prosjektets eksakte, ikke-normaliserende leksemkontrakt gjør at blanktegn ikke inngår i heltallstokenet. |
| Fortegn | Kilden definerer ikke en egen fortegnsgrammatikk og angir ikke positivitet. | `UNKNOWN` som eksplisitt syntaks; evaluatorens konservative heltallsgrammatikk godtar `+` og `-` og innfører dermed ingen positivitet. |
| Desimalkomma/-punkt | Ikke definert; begge uttrykker desimalform, ikke heltallsformat. | Avvises av `Heltall`. |
| Vitenskapelig notasjon | Ikke definert. | Avvises av den eksakte heltallsleksemen; må ikke konverteres til et heltall først. |
| Ledende nuller | Ingen kanonisk bredde eller skrivemåte er oppgitt. | Skal ikke forbys; `01000` er fortsatt en heltallsleksem. |
| Tema-omfang | Vedlegg A gir ikke en eksakt Tema→Bredde-tabell. Den semantiske innledningen beskriver en konstruksjon som samlingspunkt for vannførende ledninger, men kobler ikke dette til den fullstendige v3.2 Tema-listen. | Tema-omfang `UNKNOWN` fra STANDARD; prosjektets separate applicability-metadata må ikke framstilles som STANDARD. |

### Polygonutsagnet

Vedlegg A side 4 sier `Ja, men ikke ved polygon-avgrensning` på den kombinerte raden `Bredde (/ Lengde)`. Hovedinstruksen side 15 sier at et ikke-rundt objekt som ikke enkelt kan beskrives med dimensjon fra målt senterpunkt, i tillegg skal dokumenteres med et innmålt polygon med ytre avgrensning og høyder.

Dette utsagnet påvirker krav om tilstedeværelse og representasjonsvalg. Det endrer ikke side 9-formatet til en `Bredde` som faktisk er levert. En optional-if-present formatregel trenger derfor verken polygon, GUID-eierskap, GML, komplett leveranse eller en negativ «polygon ikke levert»-slutning. Regelen må heller ikke hevde at Bredde var forventet eller uventet.

### Binding

Eksisterende binding er allerede riktig og skal ikke endres:

- direkte `Bredde` vinner;
- bare én unik Unicode case-only variant kan bindes når direkte navn mangler;
- `DIM`, `DIMENSJON`, `Dimensjon` og `DIAMETER` skal aldri tilfredsstille punktfeltet `width`;
- ingen alias, tegnsetting, trimming eller semantisk dimensjonsmapping tilføyes.

## 4. Lengde — kildeevidens

| Spørsmål | Funn | Klassifikasjon |
|---|---|---|
| Eksakt kildenavn | `Lengde`. Oversikten grupperer feltet som `Bredde (/ Lengde)`, mens formattabellen har en egen rad `Lengde`. | `STANDARD`; etablert direkte adaptermapping har høy evidens. |
| Geometri | Feltet står i punktoversikten og i «Gjelder for punktobjekt». | `STANDARD`: point-only. |
| Datatype/format | `Heltall`. | `STANDARD`. |
| Enhet | «Lengde gitt i [mm]». | `STANDARD`: millimeter. |
| Betydning | En levert punktobjektegenskap. Hovedinstruksen bruker lengde og bredde i forklaringen av hvorfor en kvadratisk kum også trenger polygon for å angi rotasjon. | `STANDARD`; ikke en linje-/geometrilengde. |
| Nedre/øvre grense | Ingen oppgitt. | `UNKNOWN`; skal ikke automatiseres. |
| Null | Verken tillatt eller forbudt uttrykkelig. | Ingen kildebasert nullrestriksjon; `0` godtas av ren formatkontroll. |
| Negative verdier | Ingen positivitet eller negativitetsforbud er oppgitt. | Ingen kildebasert positivitet; `-1` godtas av ren formatkontroll. |
| Desimalverdi | Strider mot eksplisitt format `Heltall`. | `STANDARD`: desimalform er ugyldig. |
| Blanktegn | Ingen trimmingregel i kilden. | `UNKNOWN` i STANDARD; den eksakte prosjektkontrakten normaliserer ikke. |
| Fortegn | Ingen egen syntaks eller positivitet er oppgitt. | Samme konservative tekniske behandling som Bredde. |
| Desimalkomma/-punkt | Ikke definert og ikke heltallsformat. | Avvises. |
| Vitenskapelig notasjon | Ikke definert. | Avvises av eksakt heltallsleksem uten numerisk normalisering. |
| Ledende nuller | Ingen kanonisk skrivemåte er oppgitt. | Skal ikke forbys. |
| Tema-omfang | Ingen eksakt Tema-tabell. | `UNKNOWN` fra STANDARD. |

### Semantisk/conditional scope

Kilden gir et betinget representasjonsutsagn for den kombinerte `Bredde (/ Lengde)`-raden og beskriver lengde/bredde som utilstrekkelig for enkelte ikke-runde objekter. Den gir ikke en uttømmende shape- eller Tema-regel for når `Lengde` skal være til stede.

Dette blokkerer requiredness og semantisk applicability, men blokkerer ikke formatkontroll av en direkte `Lengde` som allerede er levert. Datatypen endres ikke med form, Tema eller polygonstatus. Regelen må aldri lese linjekoordinater, beregne geometriens lengde, kopiere `Bredde` eller bruke en line-egenskap med samme alminnelige betydning.

## 5. STANDARD, PROJECT/PRAKSIS og UNKNOWN

| Påstand/policy | Autoritet | Bruk i denne slicen |
|---|---|---|
| `Bredde` og `Lengde` er punktfelt med format heltall i mm | `STANDARD` | Ja; dette er den aktive kontrollens substans. |
| Kombinert polygonunntak | `STANDARD` | Dokumenteres, men brukes ikke i optional-if-present formatregel. |
| Ikke-rund representasjon med polygon | `STANDARD` | Dokumenteres; ingen GML-/eierskapslogikk. |
| Min/max, positivitet, `> 0`, realistisk dimensjon | `UNKNOWN` | Ingen kontroll. |
| Eksakt Tema-applicability fra instruksen | `UNKNOWN` | Ingen kontroll. |
| 88-cellers applicability-tabell | `PROJECT/DOMAIN POLICY`, med separat `PRAKSIS`-evidens der angitt | Forblir metadata-only og ukoblet. |
| Historisk fem-Tema Bredde-subsett | `PRAKSIS` | Ikke brukt. |
| `DIM`/`DIMENSJON`/`DIAMETER` som Bredde | Uavklart eller avvist legacy-mapping | Ikke brukt; må fortsatt ikke binde. |
| Eksakt, ikke-trimmet heltallsleksem med valgfritt fortegn | Teknisk `PROJECT`-realisering av STANDARD `Heltall` | Brukes som evaluator-kontrakt; presenteres ikke som ordrett kildegrammatikk. |
| Runtime JS-number uten leksem | `PROJECT` evidenspolicy | Godtas bare når verdien er et sikkert, endelig heltall; usikker tallpresisjon blir ikke et kildebasert områdeavvik. |

## 6. Eksakt sikker kontrollkontrakt

Kontrakten er lik for begge feltene og inneholder bare binding og heltallsformat:

1. Regelen kjøres bare for point-ObjectRefs.
2. Eksisterende canonical binding bestemmer om `width`/`length` finnes. Regelen foretar ingen egen nøkkeloppslag eller aliasmatching.
3. `FIELD_ABSENT`, `VALUE_MISSING`, `null` og tom verdi gir `NOT_EVALUATED`, uten finding.
4. `BINDING_AMBIGUOUS`, `UNRESOLVED_SOURCE` og `SCHEMA_UNAVAILABLE` beholder eksisterende `INDETERMINATE`-semantikk og grunnkode.
5. Når `sourceLexeme` finnes, er den autoritativ. Ingen trim, `Number(...)`, `parseInt`, `parseFloat`, kommaerstatning eller omskriving utføres. `^[+-]?[0-9]+$` gir `PASS`; øvrige leverte leksemer gir `FAIL` med en ny stabil grunnkode som uttrykker «ikke heltall», ikke «verdi ikke tillatt».
6. Når leksem er `UNAVAILABLE`:
   - en JS-string vurderes etter samme eksakte grammatikk;
   - en endelig `Number` gir `PASS` når `Number.isSafeInteger(value)` er sann;
   - `1000.0` som JS-number er identisk med `1000` og kan derfor ikke skilles; den gir `PASS`;
   - et endelig heltall utenfor safe-integer-området gir `INDETERMINATE`, ikke et oppfunnet min/max-avvik, fordi eksakt verdi ikke kan bevises uten leksem;
   - brøktall, `NaN`, `Infinity`, boolean, objekt og annen ikke-heltallsrepresentasjon gir `FAIL`.
7. Kontrollen gjør ingen numerisk beregning, enhetskonvertering eller plausibilitetskontroll. Millimeter er informasjons-/resultatmetadata, ikke en konverteringsoperasjon.

### Beslutningstabell for etterspurte former

| Levert form | Kan skilles? | Planlagt utfall | Begrunnelse |
|---|---:|---|---|
| `1000` (JS-number) | Ja som sikkert heltall, men uten leksikalsk skrivemåte | `PASS` | Eksakt heltallsverdi. |
| `"1000"` | Ja | `PASS` | Eksakt heltallsleksem. |
| `"01000"` | Ja | `PASS` | Ingen kildebasert kanonisk bredde; ledende null må ikke forbys. |
| `1000.0` (JS-number) | Nei, ikke fra `1000` | `PASS` | JavaScript bevarer ikke `.0`; å feile ville oppfinne evidens. |
| `"1000.0"` | Ja | `FAIL` | Desimalleksem strider mot `Heltall`. |
| `"1e3"` | Ja | `FAIL` | Eksponentnotasjon er ikke den eksakte heltallsleksemen og må ikke normaliseres. |
| `"+1000"` | Ja | `PASS` | Fortegn godtas; ingen positivitet eller kanonisk skrivemåte er kildefestet. |
| `" 1000 "` | Ja | `FAIL` | Eksakt leksem inneholder ikke-numeriske tegn; ingen trim er autorisert. |
| `"1000 "` | Ja | `FAIL` | Samme. |
| `"-1"` | Ja | `PASS` | Et heltall; kilden forbyr ikke negative verdier. |
| `"0"` | Ja | `PASS` | Et heltall; kilden forbyr ikke null. |
| `"1,5"` | Ja | `FAIL` | Desimalform og ikke heltall. |

`"   "` er et særtilfelle i dagens GMI-parser: parseren trimmer sin typed verdi til tom og lagrer `null`, mens originalleksemen bevares. ObjectFieldValue blir derfor `VALUE_MISSING`, og optional-if-present-regelen gir `NOT_EVALUATED`. Denne slicen skal ikke endre den etablerte presence-semantikken.

## 7. Parser- og lexical-evidence-vurdering

`src/lib/parsing/gmiParser.js` splitter `_FIELDVALUES` på semikolon, lagrer hvert uendret felt i den ikke-enumererbare `GMI_SOURCE_LEXEMES`-mappen, og trimmer/typekonverterer deretter den ordinære attributtverdien. `src/lib/validation-v2/objectFieldValue.js` henter både `sourceValue` og den tilhørende `sourceLexeme` via den valgte literal source key.

Dette gir nødvendig evidens for reelle GMI-data:

- `1000` → typed `1000`, leksem `"1000"`;
- `01000` → typed `1000`, leksem `"01000"`;
- `1000.0` → typed `1000`, leksem `"1000.0"`;
- ` 1000 ` → typed `1000`, leksem med blanktegn;
- `+1000`, `1e3`, `1,5` → typed string, eksakt leksem beholdt;
- negative heltall → typed number, eksakt fortegn beholdt.

Parseren kan dermed skille alle etterspurte kildeformer. Parserens eksisterende typekonverteringsregex skal ikke selv være valideringsautoritet; den nye evaluatoren skal lese `sourceLexeme` først. Dette følger den allerede gjennomgåtte lexical-evidence-precedensen for målemetodekodene, men bruker ikke deres endelige allowed-value-liste eller `INTEGER_CODE_STRING`-semantikk.

Begrensninger:

- Et syntetisk/runtime JS-number har ingen opprinnelig skrivemåte. `1000` og `1000.0` kan ikke skilles.
- En unsafe JS-number uten leksem kan ha mistet presisjon og må bli `INDETERMINATE`.
- Kilden definerer ikke Unicode-siffer, alternative pluss/minus-tegn eller locale-normalisering. De skal ikke normaliseres i denne slicen.

Ingen parserendring er nødvendig eller ønsket.

## 8. Applicability-separasjon

Beslutning: **A — valider levert representasjon også når Tema-cellens applicability er `UNKNOWN` eller `NOT_APPLICABLE`.**

Begrunnelse:

- Formatspørsmålet er «er den leverte direkte egenskapen et heltall?», ikke «burde egenskapen finnes på dette Temaet?».
- Suppresjon etter applicability ville gjøre den nye regelen til den første skjulte runtime-konsumenten av et hittil metadata-only prosjektregister.
- En `FAIL` betyr bare at en levert verdi ikke har STANDARD-formatet. Den betyr ikke at feltet er required eller applicable.
- En `PASS` betyr tilsvarende bare gyldig levert format. Den godkjenner ikke semantisk feltbruk.
- Ingen «unexpected field»-finding skal produseres for `NOT_APPLICABLE`.
- `Lengde` mangler dessuten en rad i den gjeldende applicability-tabellen; det skal ikke føre til Tema-inferens eller bruk av Bredde-policyen som stedfortreder.

Reglene skal derfor ikke ha `tema` som input, ikke importere `pointFieldApplicability.js`, og ikke endre Tema-resolution eller Type/Tema-kompatibilitet.

## 9. Foreslått regeldesign

### Ny, smal evaluator

Legg til én liten evaluatorvariant for optional-if-present heltallsformat, for eksempel:

```text
RuleEvaluatorKind.INTEGER_FORMAT
RuleCategory.VALUE_FORMAT
RuleReasonCode.VALUE_NOT_INTEGER
```

Dette er smalere enn en generell schema-/regexmotor. Den er berettiget fordi dagens evaluatorvarianter ikke uttrykker et uendelig formatdomene:

- `REQUIRED` tester bare presence;
- `ALLOWED_VALUE` krever en endelig liste og sammenligner i dag ikke lexical evidence;
- `REQUIRED_ALLOWED_VALUE` ville feilaktig innføre requiredness og er laget for lukkede kodeverk;
- `INTEGER_CODE_STRING` er en exact-list policy for målemetodekoder og kan ikke gjenbrukes som heltallsdomene.

Evaluatoren skal være en ren funksjon i `ruleEvaluation.js` og kalles av runnerens eksisterende dispatch. To eksplisitte regler i registeret bruker den:

| Egenskap | Foreslått verdi |
|---|---|
| `ruleId` | `innmaling.point.width.integer` |
| `canonicalFieldId` | `width` |
| `geometryScopes` | `['point']` |
| Tittel | `Bredde er et heltall når den er oppgitt` |
| Beskrivelse | `Oppgitt Bredde for punktobjekt skal være et heltall i millimeter; feltet er valgfritt i denne automatiske valideringen.` |
| Kilde | `Innmålingsinstruks Vedlegg A`, side `4, 9` |
| `ruleId` | `innmaling.point.length.integer` |
| `canonicalFieldId` | `length` |
| `geometryScopes` | `['point']` |
| Tittel | `Lengde er et heltall når den er oppgitt` |
| Beskrivelse | `Oppgitt Lengde for punktobjekt skal være et heltall i millimeter; feltet er valgfritt i denne automatiske valideringen.` |
| Kilde | `Innmålingsinstruks Vedlegg A`, side `4, 9` |

Begge beholder severity `ERROR` og provenance `STANDARD`, fordi findingens substans er brudd på det eksplisitte `Heltall`-formatet. Den tekniske grammatikken skal dokumenteres som implementasjonskontrakt, ikke som et sitat eller et ekstra STANDARD-domene.

### Resultatsemantikk

- Én RuleResult per eksplisitt regel og ett punkt-resultatrad per regel.
- Manglende felt/verdi øker `notEvaluatedCount`, ikke `failCount`.
- Gyldig levert heltall øker `passCount`.
- Ugyldig levert format gir finding med den samme point ObjectRef som kildeobjektet.
- Binding-/schema-usikkerhet beholder `INDETERMINATE`.
- Ingen finding eller ObjectRef kan eies av en ledning for disse reglene.
- Eksisterende finding-, result-, lag-, revisjons- og ObjectRef-eierskap endres ikke.
- Ikke legg originalleksem inn i nye telemetri- eller globale resultatsammendrag. Fildata kan fortsatt vise eksakt leksem gjennom sin eksisterende browser-lokale evidensbane.

## 10. Register- og resultateffekt

To separate regler er riktig form: feltene har separate canonical IDs, separate bindinger, separate Fildata-visninger og skal kunne gi uavhengige resultater.

| Mål | Nå | Delta | Etter slice |
|---|---:|---:|---:|
| Aktive regler | 29 | +2 | **31** |
| Punkt-applicable regler | 22 | +2 | **24** |
| Ledning-applicable regler | 21 | +0 | **21** |
| RuleResult-rader per valideringskjøring | 29 | +2 | **31** |
| Synlige punkt-resultatrader | 22 | +2 | **24** |
| Synlige lednings-resultatrader | 21 | +0 | **21** |

Result-row delta er dermed **+2 totalt**, begge bare i punktfanen. Applicability-metadata gir fortsatt null egne regler og null egne resultatrader.

## 11. Sannsynlige implementasjonsfiler

Produksjonsfiler som forventes endret i en Luna Medium-slice:

- `src/lib/validation-v2/contracts.js`
  - ny evaluator/category/reason contract og oppdatert RuleDefinition-dokumentasjon;
- `src/lib/validation-v2/ruleEvaluation.js`
  - ren optional integer-format evaluator med source-lexeme-first-policy;
- `src/lib/validation-v2/validationRunner.js`
  - eksplisitt dispatch for den nye evaluatoren;
- `src/lib/validation-v2/registry/rules.js`
  - to eksplisitte point-only regler og registerinvarianter;
- `src/lib/validation-v2/fieldData.js`
  - la Fildata beregne `Gyldig`, `Ugyldig` eller `Må vurderes` med samme evaluator;
- `src/data/validation-v2/field-information.json`
  - nye informasjonsposter for `width` og `length`;
- `src/lib/validation-v2/registry/fieldInformation.js`
  - aktiv metadata-invariant/audit rule IDs ved behov.

Eksisterende `registry/fields.js`, `objectFieldValue.js`, parseren, applicability-modulen, Tema-resolution, Type/Tema-logikk og UI-presentasjonsmotoren bør ikke trenge produksjonsendringer.

Sannsynlige testfiler:

- ny fokusert `tests/validationV2GmiV32PointNumericLexical.test.mjs`;
- eksisterende register-/resultat-count assertions i A7/A8/A8.1, Type/Tema-, point-code-list- og applicability-testene;
- Field Info/Fildata assertions i `tests/validationV2GmiA81FieldInfo.test.mjs` dersom de ikke holdes samlet i den nye filen.

## 12. Uavhengig testmatrise

Forventninger skal ligge som eksplisitte testdata/sett i testen og ikke genereres fra produksjonsregexen eller produksjonsregelen.

### Felles struktur, kjøres selvstendig for hvert felt

| Område | Case | Forventning |
|---|---|---|
| Direkte binding | `Bredde` / `Lengde` | Binding til henholdsvis `width` / `length`; levert gyldig verdi `PASS`. |
| Direkte vinner | Direkte navn sammen med case-variant | Direkte canonical property vinner etter eksisterende invariant; ingen verdi fra svakere kandidat overtar. |
| Unik case-only | `BREDDE` / `LENGDE` som eneste case-form | Binder med `CASE_NORMALIZED`; samme formatutfall som direkte navn. |
| Ikke-unik case-only | Flere case-varianter uten direkte canonical navn | Eksisterende ambiguity-resultat, `INDETERMINATE`; ingen vilkårlig verdi velges. |
| Bredde-aliaser | `DIM`, `DIMENSJON`, `Dimensjon`, `DIAMETER` uten `Bredde` | Må ikke binde `width`; regelen blir ikke en aliasvalidator og gir ingen format-finding på disse. |
| Lengde-near-match | `LENGTH`, `Lengde_mm`, `LENGD` | Må ikke binde `length`. |
| Manglende schemafelt | Canonical property ikke i schema | `NOT_EVALUATED`, ingen finding. |
| Manglende verdi | `undefined`, `null`, `''` | `NOT_EVALUATED`, ingen finding. |
| Bare blanktegn i ekte GMI | `"   "` | Parserens etablerte missing-semantikk: `NOT_EVALUATED`. |
| Gyldig enkel leksem | `"1000"` | `PASS`. |
| Ledende null | `"01000"` | `PASS`; må bevise at source lexeme brukes uten kanonisering. |
| Fortegn | `"+1000"`, `"-1"`, `"0"`, `"-0"` | `PASS`; ingen positivitet/non-zero-regel. |
| Desimalpunkt | `"1000.0"`, `"1.5"` | `FAIL`, `VALUE_NOT_INTEGER`. |
| Desimalkomma | `"1,5"` | `FAIL`. |
| Eksponent | `"1e3"`, `"1E3"` | `FAIL`. |
| Blanktegn rundt tall | `" 1000"`, `"1000 "`, `" 1000 "` | `FAIL`; eksakt kildeleksem skal styre selv om typed verdi er `1000`. |
| Malformet | `"1000mm"`, `"--1"`, `"+"`, `"abc"` | `FAIL`. |
| Runtime number | `1000`, `1000.0`, `-1`, `0`, `-0` uten leksem | `PASS`; JS kan ikke skille `1000.0` fra `1000`. |
| Runtime fraction/non-finite | `1.5`, `NaN`, `Infinity` uten leksem | `FAIL`. |
| Runtime unsafe integer | `Number.MAX_SAFE_INTEGER + 1` uten leksem | `INDETERMINATE`; ingen kildebasert max-feil. |
| Point/line-isolasjon | Gyldig/ugyldig likt navn bare på line | Begge nye regler har `line.evaluatedCount = 0`; ingen line finding. |
| Blandet datasett | Point med verdi og line med nærnavn/verdi | Bare point påvirker resultatet. |
| Ingen geometry-derived Lengde | Endre linekoordinater og linjeantall uten punktets `Lengde` | Lengde-regelen forblir `NOT_EVALUATED`; ingen beregnet verdi. |
| Ingen geometry-derived Lengde | Levert ugyldig `Lengde` sammen med line hvis geometrilengde er et heltall | Fortsatt `FAIL` på levert punktleksem. |
| Applicability-uavhengighet | Samme ugyldige verdi på point med Tema som er `APPLICABLE`, `NOT_APPLICABLE`, `UNKNOWN`, mangler eller konflikter | Samme formatutfall; regelen leser ikke Tema. |
| Resultateierskap | Finding fra hvert felt | Riktig ruleId, canonicalFieldId, point ObjectRef, layer og dataset revision; ingen kryssfelt-/krysslag-lekkasje. |
| Fildata | Bland gyldig, ugyldig og manglende | Eksakte leksemer i riktige buckets og riktig `Gyldig`/`Ugyldig`/`-` uten separat logikk. |

Minst én parserintegrasjonstest per leksikalsk variantgruppe må bygge ekte `_FIELDNAMES`/`_FIELDVALUES`, ellers testes bare no-lexeme fallback og ikke den avgjørende bevaringen av `1000.0`, whitespace og ledende null.

### Register-/presentasjonsregresjon

- eksakt regelunivers er 31/24/21;
- én kjøring produserer 31 RuleResults;
- punktpresentasjonen har 24 rader, ledningspresentasjonen 21;
- zero-applicable/missing-only-regler beholder nøytral/«ingen relevante evalueringer»-presentasjon og blir ikke automatisk `Oppfylt`;
- Tema- og Type/Tema-resultatene er bit-for-bit semantisk uendret;
- applicability-policyen beholder 88/71/9/8 og har ingen runtime-consumer;
- eksisterende 29 regler beholder evaluator-, ruleId-, source- og resultateierskap.

## 13. Field Info og presentasjon

Legg til én Field Info-post per canonical field, med offentlig tekst på norsk.

### `width`

- visningsnavn `Bredde`;
- appliesTo `point`;
- beskrivelse: levert punktbredde/diameter i millimeter;
- `documentationStatus: PARTIAL`, fordi formatet er komplett dokumentert, mens Tema-omfang og polygonbetinget requiredness ikke er automatisert;
- kilde Vedlegg A `4, 9` og hovedinstruks `14–15` som informativ representasjonskvalifikasjon;
- audit rule ID bare `innmaling.point.width.integer`;
- kvalifikasjoner skal si at feltet er valgfritt i denne automatiske kontrollen, at levert verdi må være heltall i mm, og at polygonunntaket ikke evalueres.

### `length`

- visningsnavn `Lengde`;
- appliesTo `point`;
- beskrivelse: levert punktobjektlengde i millimeter, aldri beregnet lednings-/geometrilengde;
- `documentationStatus: PARTIAL` av samme requiredness/applicability-grunn;
- kilde Vedlegg A `4, 9` og hovedinstruks `15` som informativ representasjonskvalifikasjon;
- audit rule ID bare `innmaling.point.length.integer`;
- samme optional-if-present- og heltallsforklaring, pluss uttrykkelig ingen geometriutledning.

`composeFieldInformation()` skal rapportere `required: false` / `requiredness: NOT_REQUIRED` for disse regelradene og ingen `allowedValues`. Det betyr «ikke required av denne aktive regelen», ikke en STANDARD-påstand om global valgfrihet. Ingen Tema-applicability skal vises som requiredness. Ingen min/max, `> 0`, polygonløsning eller alias skal presenteres.

Fildata må gjenbruke den samme heltallsevaluatoren. En separat UI-regex ville kunne avvike fra regelresultatet og er ikke akseptabel.

## 14. Eksplisitte ikke-mål

Denne slicen skal ikke:

- kreve `Bredde` eller `Lengde`;
- endre requiredness for andre punktfelt;
- lese eller håndheve point-field applicability metadata;
- rapportere et levert felt som «uventet» på `NOT_APPLICABLE` Tema;
- definere Tema- eller shape-scope for `Lengde`;
- parse companion GML eller polygon;
- knytte polygon til punkt via GUID;
- løse Bredde-polygonunntaket;
- bruke `Kumform`, `Byggemetode`, `Bredde`-presence eller målte koordinater som classifier;
- beregne `Lengde` fra point/line/polygon-geometri;
- kontrollere areal, rotasjon, forholdet mellom Bredde og Lengde eller plausibilitet;
- innføre min/max, positivitet, ikke-null, nominell dimensjonsliste eller enhetskonvertering;
- endre aliases, Tema-resolution eller Type/Tema-kompatibilitet;
- løse `Utvendig_høyde`, `Avst_BunnInnvUnderUtv`, KMR/SUMP eller hydraulisk applicability;
- endre telemetri, produksjonskonfigurasjon, database eller deployment.

## 15. Anbefalt implementasjonsslice og blockers

### Luna Medium-scope

Implementer nøyaktig:

1. én source-lexeme-first optional heltallsformat-evaluator og nødvendige smale contracts/invarianter;
2. `innmaling.point.width.integer`;
3. `innmaling.point.length.integer`;
4. Field Info/Fildata-integrasjon for de to reglene;
5. den uavhengige matrisen over, inkludert ekte parserleksemer og oppdaterte 31/24/21-counts.

Ikke importer applicability-modulen og ikke legg Tema eller geometri til evaluatorinput. Ikke utvid slicen til andre dokumenterte heltallsfelt; de kan bruke samme evaluator senere etter egne source-first beslutninger.

### Blockers

Det finnes ingen blocker for denne avgrensede optional-if-present formatkontrollen.

Følgende er blockers bare for senere arbeid og skal ikke løses her:

- requiredness: eksakt semantic point/Tema-scope og kjørbar polygonstatus;
- Bredde-polygonunntak: companion GML, komplett leveranse og autoritativt punkt↔polygon-eierskap;
- Lengde-requiredness: uttømmende shape/object scope;
- positive/min/max-regler: uttrykkelig kilde- eller godkjent domeneautoritet;
- geometry-derived sammenligning: eksplisitt kildeequation, eierskap og toleranse, dersom en slik kontroll noen gang ønskes.

## Endelig verdict

**BREDDE: READY FOR OPTIONAL-IF-PRESENT LEXICAL VALIDATION**

**LENGDE: READY FOR OPTIONAL-IF-PRESENT LEXICAL VALIDATION**

**Anbefalt Luna Medium-oppdrag:** implementer kun de to separate point-only heltallsformatreglene, den delte smale evaluatoren, Field Info/Fildata-støtte og uavhengige tester med forventet register/resultatkontrakt **31 aktive / 24 punkt / 21 ledning / +2 punkt-resultatrader**. Behold applicability metadata-only og la all requiredness, polygonlogikk og geometriutledning være urørt.
