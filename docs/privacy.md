# Personvern og databehandling

Dette er teknisk åpenhetsdokumentasjon for GMI Validator, ikke en juridisk personvernerklæring.

## Overordnet prinsipp

GMI Validator er laget med lokal behandling som utgangspunkt. Når du velger en innmålingsfil, leses, tolkes, valideres og vises den i nettleseren. Applikasjonen er samtidig laget for å begrense hvilke opplysninger som sendes ut av nettleseren.

## Innmålingsfilen

Rå GMI-, SOSI- eller KOF-fil lastes ikke opp i sin helhet til GMI Validators applikasjonsserver. Nettleseren sender heller ikke automatisk filinnhold, filnavn, objekter eller valideringsresultater som én samlet opplasting.

Dette betyr ikke at ingen data fra filen kan forlate nettleseren. Enkelte funksjoner bruker utvalgte eller avledede koordinater for oppslag, som beskrevet nedenfor.

## Eksterne tjenester

Følgende typer forespørsler kan gå til eksterne tjenester:

- Terreng- og profilfunksjoner sender koordinatprøver fra analyserte linjer for å hente høydeinformasjon. Ved punktvis visning kan tilsvarende punktkoordinater brukes.
- Etter en vellykket innlasting kan et representativt, avledet koordinat sendes til applikasjonens server. Serveren bruker dette til kommuneoppslag hos Kartverket/Geonorge. Selve koordinatet brukes til oppslaget og lagres ikke i bruksstatistikkens aggregater.
- Kartvisningen sender kartutsnitt, fliskoordinater eller WMS-område til valgt kart- eller WMS-leverandør. Dette er nødvendig for å hente kartbildet som vises.

Disse forespørslene er avgrensede funksjonsdata, ikke en opplasting av rå innmålingsfilen. Kart- og tjenesteleverandører kan i tillegg motta vanlig forespørselsmetadata som følger av nettleser- og HTTP-kommunikasjon.

## Bruksstatistikk

Ved vellykket innlasting utenfor Testmodus kan applikasjonen sende en fast hendelse for aggregert brukstelling. Serveren grupperer tellingen i tids- og områdenøkler, blant annet UTC-dato, time og kommune når kommune kan bestemmes. Hvis kommune ikke kan bestemmes, brukes et grovere område eller en ukjent kategori.

Statistikkmodellen bruker aggregerte tellinger og faste hendelsestyper. Den inneholder ikke rå filinnhold, rå koordinatlister, objekter eller valideringsmeldinger. Filnavn, rå koordinater og objektdata inngår ikke i tracking-payloaden som lagres som statistikk.

Testmodus undertrykker denne sporingen. Det samme gjelder testmodus aktivert via applikasjonens støttede testmekanisme. Tellingen er best-effort og skal ikke påvirke filbehandlingen.

Statistikken kan lagres i Supabase når serveren er konfigurert for det, eller i prosjektets lokale statistikkfallback. Statistikksiden leser aggregerte rader; den får ikke tilgang til rå innmålingsfiler.

## Vercel

Applikasjonen kjører på Vercels hosting- og runtime-infrastruktur og bruker Vercel Web Analytics for overordnet besøks- og bruksstatistikk. Applikasjonen sender ikke egne rå fildata eller egendefinerte filattributter til Vercel Analytics.

Som ved annen drift av en nettjeneste kan Vercels infrastruktur ha vanlig plattform- og forespørselsmetadata i logger. GMI Validator kontrollerer ikke Vercels interne logging, lagring eller tilgangsstyring.

## Kontakt

Kontaktskjemaet lar deg velge kategori og skrive en melding. Navn og e-post er valgfrie; e-post brukes som Reply-To når den er oppgitt og godkjent som gyldig adresse.

Meldingen sendes fra serveren via Resend til den konfigurerte postkassen. Serveren legger til appversjonen den selv kjenner. Kontaktmeldingen og kategorien lagres ikke i den lokale kontaktprofilen. Navn og e-post kan huskes lokalt i nettleseren for å gjøre neste henvendelse enklere.

En kontaktmelding får ikke automatisk vedlagt innmålingsfil, koordinater, valideringstilstand, filnavn eller annen vilkårlig applikasjonstilstand.

## Lokal lagring

Nettleseren kan lagre brukerpreferanser og begrenset grensesnittstatus, slik at innstillinger og visse visningsvalg kan huskes mellom besøk. Kontaktfunksjonen kan i tillegg lagre navn og e-post lokalt når de skrives inn.

Rå innmålingsfiler og serverhemmeligheter skal ikke lagres som del av denne lokale profilen. Lokal lagring er knyttet til den aktuelle nettleseren og kan fjernes gjennom nettleserens innstillinger.

## Sikkerhetsgrenser

- Hemmelige nøkler og serverkonfigurasjon brukes kun på serversiden.
- API-feil som vises offentlig er med vilje generelle og avslører ikke rå unntak eller detaljer fra eksterne tjenester.
- Rå svar fra kart- og oppslagstjenester returneres ikke direkte til brukeren som interne feildetaljer.
- Kartinformasjon fra innlastede objekter bygges som DOM-innhold med tekstverdier, slik at filattributter ikke behandles som HTML.

Ingen teknisk dokumentasjon kan garantere at en nettleser, leverandør eller driftsplattform aldri sender metadata. Beskrivelsen over gjelder applikasjonens tilsiktede dataflyt.

## Åpen kildekode

Kildekoden er offentlig og kan inspiseres for å etterprøve databehandlingen og bruken av eksterne tjenester: [GMI Validator på GitHub](https://github.com/pb-bennett/gmi-validering).
