# GMI Validator

GMI Validator er et nettbasert verktøy for å lese, kontrollere og utforske innmålingsdata for vann og avløp (VA).

**Åpne verktøyet: [gmi-validator.no](https://gmi-validator.no)**

## Hva er GMI Validator?

Verktøyet er laget for kommuner, entreprenører og konsulenter som arbeider med innmålingsleveranser. Det gir en rask oversikt over innholdet i en fil før dataene eventuelt skal videre til et VA- eller GIS-system.

Behandlingen starter lokalt i nettleseren. Du trenger derfor ingen installasjon for å bruke den publiserte løsningen.

## Hva kan verktøyet gjøre?

- lese og analysere innmålingsfiler
- kontrollere felt, attributter og verdier mot definerte regler
- finne manglende eller uventede høydeverdier
- analysere fall, overdekning og terreng der funksjonen trenger høydeinformasjon
- vise data i 2D-kart og en enkel 3D-visning
- laste inn flere lag og sammenligne dem
- vise WMS-kartlag fra en konfigurerbar tjeneste
- undersøke objekter, egenskaper og valideringsresultater i egne visninger

## Støttede formater

- **GMI** er hovedformatet og har det bredeste kontrollgrunnlaget.
- **SOSI** (`.sos` og `.sosi`) støttes for innlasting, visning og et mer begrenset kontrollgrunnlag.
- **KOF** (`.kof`) støttes for innlasting, visning og et mer begrenset kontrollgrunnlag.

Støtten er ikke lik på tvers av formatene. Kontroller og visninger kan derfor variere med filformat og innhold.

## Slik bruker du løsningen

1. Åpne [gmi-validator.no](https://gmi-validator.no).
2. Velg en fil, eller slipp den i opplastingsområdet.
3. Se valideringsresultater, kart, lag og analyser.
4. Undersøk funnene mot prosjektets krav og den øvrige dokumentasjonen.

## Personvern og databehandling

- Selve innmålingsfilen behandles lokalt i nettleseren og lastes ikke opp til GMI Validators applikasjonsserver.
- Enkelte funksjoner sender avledede eller valgte koordinater til eksterne tjenester når det trengs for terrengdata, profilberegninger eller kommuneoppslag.
- Karttjenester kan motta kartområdet eller visningen som nettleseren ber om, slik at kartet kan tegnes.
- Ved vellykket innlasting samles det inn aggregerte brukstellinger, blant annet per kommune, dato og time. Statistikken lagres ikke som selve innmålingsfilen.
- GMI Validator bruker Vercel Web Analytics for overordnet besøks- og bruksstatistikk.
- Når du sender en melding gjennom Kontakt, sendes bare opplysningene du skriver inn, sammen med appversjonen som serveren legger til, via Resend til den konfigurerte mottakeren. Navn og e-post tas bare med når du oppgir dem.

Kildekoden er offentlig, slik at databehandlingen og bruken av eksterne tjenester kan etterprøves i kildekoden.

## Begrensninger og faglig ansvar

GMI Validator er et hjelpemiddel. Resultatene er ikke et offisielt vedtak om at en leveranse skal godkjennes eller avvises. Prosjektkrav, kommunens rutiner og faglig vurdering gjelder fortsatt.

## Status

Løsningen er i produksjon.

Gjeldende versjon er **v1.1.0**.

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

Prosjektet bruker Next.js og React. Kartvisningen bygger på Leaflet, 3D-visningen på Three.js, og tilstand håndteres med Zustand. Valideringsreglene ligger i JSON-filer under `src/data/rules/`.

## Konfigurasjon

Vanlig bruk av den publiserte løsningen krever ingen lokal konfigurasjon.

Serverfunksjoner kan konfigureres med miljøvariabler for Supabase-basert bruksstatistikk, lokal statistikkfallback, keepalive-beskyttelse og Kontakt-funksjonens e-postlevering. Variablene omfatter blant annet `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRACKING_KEEPALIVE_SECRET`, `TRACKING_STORAGE_PATH`, `RESEND_API_KEY`, `CONTACT_TO_EMAIL` og `CONTACT_FROM_EMAIL`.

Verdier skal settes i det lokale eller deployede miljøet og aldri legges i kildekoden eller committes til Git. Hemmelige verdier skal bare være tilgjengelige på serversiden og skal ikke legges i URL-er eller eksponeres til klientkoden.

## Tilbakemeldinger

Bruk **Kontakt** i den publiserte løsningen for spørsmål, feil og forslag.

For problemer som gjelder kildekoden eller selve prosjektet kan du også bruke [GitHub Issues](https://github.com/pb-bennett/gmi-validering/issues).

## Uavhengighet

GMI Validator er et selvstendig prosjekt og er ikke offisielt utviklet av eller på vegne av Gemini-produktets eier, Kartverket, kommuner eller andre eksterne tjenesteleverandører.

## Lisens

[MIT](LICENSE)
