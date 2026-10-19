# GMI Validator

GMI Validator er et nettbasert verktøy for å lese, kontrollere og utforske innmålingsdata for vann og avløp (VA).

**Åpne verktøyet: [gmi-validator.no](https://gmi-validator.no)**

## Hva er GMI Validator?

Verktøyet er laget for kommuner, entreprenører og konsulenter som arbeider med innmålingsleveranser. Det gir en rask oversikt over innholdet i en fil før dataene eventuelt skal videre til et VA- eller GIS-system.

Behandlingen starter lokalt i nettleseren. Du trenger derfor ingen installasjon for å bruke den publiserte løsningen.

## Hva kan verktøyet gjøre?

- lese og analysere innmålingsfiler
- bruke Validator V2 på GMI med FEIL/SJEKK, felt- og regeldetaljer og kilde- og verdiveiledning der den finnes
- åpne objektene som et valideringsfunn gjelder, direkte i en diagnostisk datatabell
- finne manglende eller uventede høydeverdier
- analysere fall, overdekning og terreng der funksjonen trenger høydeinformasjon
- vise data i 2D-kart og 3D
- laste inn flere lag og sammenligne dem
- vise WMS-kartlag fra en konfigurerbar tjeneste
- undersøke lag, objekter og egenskaper i datatabellen
- bruke Standards, se aggregert Stats og dele visningen med lenke eller QR-kode

## Støttede formater

- **GMI** er hovedformatet. Validator V2 kontrollerer utvalgte, kildebaserte GMI-regler; det dekker ikke alle krav i innmålingsinstruksen.
- **SOSI** (`.sos` og `.sosi`) støttes for innlasting, visning og mer begrensede kontroller, men inngår ikke i Validator V2.
- **KOF** (`.kof`) støttes for innlasting, visning og mer begrensede kontroller, men inngår ikke i Validator V2.

Støtten er ikke lik på tvers av formatene. Kontroller og visninger kan derfor variere med filformat og innhold.

## Slik bruker du løsningen

1. Åpne [gmi-validator.no](https://gmi-validator.no).
2. Velg en fil, eller slipp den i opplastingsområdet.
3. Gå gjennom FEIL og SJEKK i Validator, og åpne berørte objekter for å se felt og kontekst.
4. Utforsk lag og data i kartet eller tabellen; bruk høydekontroll, profil, Standards, 3D eller WMS etter behov.
5. Vurder funnene mot prosjektets krav og øvrig dokumentasjon. Stats og deling med lenke/QR er tilgjengelig fra arbeidsområdet.

## Personvern og databehandling

Se [detaljert dokumentasjon om personvern og databehandling](docs/privacy.md).

- Selve innmålingsfilen behandles lokalt i nettleseren og lastes ikke opp til GMI Validators applikasjonsserver.
- Enkelte funksjoner sender avledede eller valgte koordinater til eksterne tjenester når det trengs for terrengdata, profilberegninger eller kommuneoppslag.
- Karttjenester kan motta kartområdet eller visningen som nettleseren ber om, slik at kartet kan tegnes.
- Ved vellykket innlasting utenfor Testmodus kan en aggregert brukstelling registreres per dato, time og kommune, eller et grovere/ukjent område når kommune ikke kan bestemmes. Statistikken lagres ikke som selve innmålingsfilen.
- GMI Validator bruker Vercel Web Analytics for overordnet besøks- og bruksstatistikk.
- Når du sender en melding gjennom Kontakt, sendes opplysningene du skriver inn, sammen med appversjon og nødvendig servergenerert leveringsmetadata, via Resend til den konfigurerte mottakeren. Navn og e-post tas bare med når du oppgir dem.

Kildekoden er offentlig, slik at databehandlingen og bruken av eksterne tjenester kan etterprøves i kildekoden.

## Begrensninger og faglig ansvar

GMI Validator er et hjelpemiddel. Resultatene er ikke et offisielt vedtak om at en leveranse skal godkjennes eller avvises. Prosjektkrav, kommunens rutiner og faglig vurdering gjelder fortsatt.

## Status

GMI Validator **v1.2.0** er gjeldende produksjonsversjon.

Prosjektet er lite, selvstendig og ikke-kommersielt.

## Lokal utvikling

### Forutsetninger

- Node.js **20.9.0 eller nyere**
- npm

### Starte lokalt

```bash
git clone https://github.com/pb-bennett/gmi-validering.git
cd gmi-validering
npm install
npm run dev
```

Åpne deretter [http://localhost:3000](http://localhost:3000).

Bygg produksjonsversjonen med:

```bash
npm run build
```

Kjør testene med:

```bash
node --test "tests/*.test.mjs"
```

### Teknologi

Prosjektet bruker Next.js og React. Kartvisningen bygger på Leaflet, 3D-visningen på Three.js, og tilstand håndteres med Zustand. Aktiv GMI Validator V2 har regelregister og evaluator under `src/lib/validation-v2/`; eldre JSON-regler finnes under `src/data/rules/`.

## Konfigurasjon

Se [utviklerdokumentasjonen](docs/development.md) for prosjektstruktur, testing og konfigurasjon.

Vanlig bruk av den publiserte løsningen krever ingen lokal konfigurasjon.

Serverfunksjoner kan konfigureres med miljøvariabler for Supabase-basert bruksstatistikk, lokal statistikkfallback, keepalive-beskyttelse og Kontakt-funksjonens e-postlevering. Stats-kartets CARTO-bakgrunn krever også en offentlig basemapnøkkel. Se utviklerdokumentasjonen for variabler og miljøoppsett.

Verdier skal settes i det lokale eller deployede miljøet og aldri legges i kildekoden eller committes til Git. Hemmelige verdier skal bare være tilgjengelige på serversiden og skal ikke legges i URL-er eller eksponeres til klientkoden.

## Tilbakemeldinger

Se [sikkerhetsdokumentasjonen](SECURITY.md) for rapportering av sårbarheter.

Bruk **Kontakt** i den publiserte løsningen for spørsmål, feil og forslag.

For problemer som gjelder kildekoden eller selve prosjektet kan du også bruke [GitHub Issues](https://github.com/pb-bennett/gmi-validering/issues).

## Uavhengighet

GMI Validator er et selvstendig prosjekt og er ikke offisielt utviklet av eller på vegne av Gemini-produktets eier, Kartverket, kommuner eller andre eksterne tjenesteleverandører.

## Lisens

[MIT](LICENSE)
