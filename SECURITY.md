# Sikkerhet

GMI Validator er et lite, ikke-kommersielt prosjekt. Sikkerhetssårbarheter bør ikke publiseres som vanlige GitHub Issues.

Bruk GitHubs private rapportering av sårbarheter dersom funksjonen er aktivert og tilgjengelig for prosjektet. Hvis privat rapportering ikke er tilgjengelig, bruk **Kontakt** på [gmi-validator.no](https://gmi-validator.no) og merk meldingen tydelig som en sikkerhetssak.

Ikke send ekte passord, API-nøkler, andre tilgangsopplysninger, sensitive kundedata eller rå innmålingsfiler i en rapport med mindre det er uttrykkelig nødvendig og avtalt på forhånd.

En nyttig rapport inneholder gjerne:

- berørt versjon
- trinn for å gjenskape problemet
- forventet og faktisk oppførsel
- mulig sikkerhetskonsekvens

Vær særlig oppmerksom på:

- parsing av ubetrodde innmålingsfiler
- databehandling i nettleseren/klienten
- API-ruter
- mulig eksponering av autentisering eller hemmeligheter
- eksterne tjenester og proxyoppførsel

Prosjektet lover ingen belønning eller behandlingstid (SLA), men tar relevante sikkerhetsrapporter imot og vurderer dem så snart det er praktisk mulig.

Kildekode og prosjektinformasjon finnes i [GitHub-repositoriet](https://github.com/pb-bennett/gmi-validering).
