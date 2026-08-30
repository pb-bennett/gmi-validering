# Utvikling

## Prosjektoversikt

GMI Validator er en Next.js-/React-applikasjon for å lese, validere og utforske innmålingsdata for VA. Den støtter primært GMI, samt SOSI og KOF.

De viktigste funksjonsområdene er filinnlesing og parsing, regelbasert validering, høyde- og profilrelaterte analyser, 2D-kart, 3D-visning, laghåndtering, WMS-overlegg og aggregert bruksstatistikk.

## Lokal oppstart

Forutsetninger: Node.js 20.9.0 eller nyere og npm.

```bash
npm install
npm run dev
```

Åpne deretter `http://localhost:3000`.

## Testing og bygg

Kjør testene med:

```bash
node --test "tests/*.test.mjs"
```

Bygg produksjonsversjonen med:

```bash
npm run build
```

## Relevant prosjektstruktur

- `src/app/` – App Router, layout og API-ruter
- `src/components/` – brukergrensesnitt, kart, analyser og 3D-visning
- `src/lib/` – parsing, validering, analyser, tilstand, tracking og kontaktflyt
- `src/data/rules/` – JSON-regler og domenespesifikk valideringslogikk
- `tests/` – automatiske Node-tester
- `src/features/user-tracking/` – SQL/skjema og dokumentasjon for statistikkfunksjonen

## Konfigurasjon

Miljøvariabler beskriver formål, ikke verdier:

- `SUPABASE_URL` – Supabase-prosjektets serveradresse for aggregert bruksstatistikk
- `SUPABASE_SERVICE_ROLE_KEY` – serverhemmelig nøkkel for serverens Supabase-tilgang
- `TRACKING_KEEPALIVE_SECRET` – serverhemmelig beskyttelse for tracking-keepalive
- `TRACKING_STORAGE_PATH` – alternativ lagringssti for lokal statistikkfallback
- `RESEND_API_KEY` – serverhemmelig API-nøkkel for kontaktlevering via Resend
- `CONTACT_TO_EMAIL` – konfigurert mottaker for kontaktmeldinger
- `CONTACT_FROM_EMAIL` – konfigurert avsenderadresse for kontaktmeldinger

Nøkler og andre hemmeligheter skal bare finnes i servermiljøet. De skal ikke legges i kildekoden, sendes til klienten eller plasseres i URL-er eller query-parametere. Verdier som bevisst er offentlige, må holdes adskilt fra serverhemmeligheter.

## Bruksstatistikk

Etter en vellykket innlasting utenfor Testmodus gjør klienten en best-effort-forespørsel til `POST /api/track`. Den aktive kontrakten bruker den faste hendelsen `upload_success` og kan inneholde ett avledet datasettkoordinat for kommuneoppslag.

Serveren validerer forespørselen, gjør høyst ett kommuneoppslag for koordinatet og øker en aggregert teller per UTC-dato, time, område og hendelse. Område kan være kommune, fylke, land eller ukjent, avhengig av tilgjengelige opplysninger. Supabase brukes når `SUPABASE_URL` og `SUPABASE_SERVICE_ROLE_KEY` er konfigurert; ellers brukes JSON-fallbacken under `data/usage/`, med `TRACKING_STORAGE_PATH` som alternativ.

Tracking skal bare bruke faste, begrensede kategorier og aggregerte/bucketede verdier. Rå filinnhold, rå koordinatlister, filnavn og objekter skal ikke lagres. Kildekoden har rikere klassifisering av format, størrelser, objekter, koordinater og parseradvarsler, men denne kategoriserte telemetry-flyten er ikke koblet til den aktive `/api/track`-payloaden.

Testmodus, inkludert støttet testmodus fra URL, stopper tracking etter vellykket innlasting. Tracking skal ikke blokkere parsing eller visning.

## Kontakt

`POST /api/contact` validerer kategori, melding og valgfrie navn-/e-postfelter på serversiden. Ruten har også honeypot og ratebegrensning på et overordnet nivå, samt begrensninger på forespørselsformat og størrelse.

Godkjente meldinger leveres server-side til Resend. API-nøkkelen og mottaker-/avsenderkonfigurasjonen er server-only. Offentlige svar er standardiserte og avslører ikke interne feil.

## Kart og eksterne tjenester

2D-kartet bruker Leaflet/React-Leaflet, og 3D-visningen bruker React Three Fiber/Three.js. Terrenganalyser henter høydeinformasjon fra eksterne høydedata-tjenester basert på koordinatprøver.

WMS-overlegg hentes gjennom en serverrute som fungerer som en begrenset proxy for tillatte WMS-forespørsler. Proxyen validerer mål, WMS-parametere, respons-type og størrelsesgrenser før videreformidling. Kart- og WMS-kall inneholder kartområde eller visningsparametere som trengs for å tegne laget; de er ikke filopplastinger.

## Sikkerhetsprinsipper

- Rå innmålingsfiler leses og behandles i nettleseren.
- Utgående data begrenses til nødvendige, avledede koordinater, kartområder og faste statistikkfelter.
- Hemmelige nøkler brukes bare på serversiden.
- Offentlige API-feil er saniterte og skal ikke lekke rå provider-svar eller serverdetaljer.
- Popup-innhold fra filattributter bygges med DOM-noder og tekstverdier.
- Ikke interpoler fil- eller brukerdata i HTML. Unngå farlig HTML-interpolasjon og behold DOM-sikker behandling i nye popup- og visningsstier.

## Release og utrulling

`main` er produksjonsgrenen, og produksjonsutrulling skjer på Vercel. Feature-grener skal testes med relevante tester og produksjonsbygg før de merges.
