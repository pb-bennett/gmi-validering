const release = (entry) =>
  Object.freeze({
    ...entry,
    news: Object.freeze(entry.news || []),
    highlights: Object.freeze(
      (entry.highlights || []).map((highlight) => Object.freeze(highlight)),
    ),
    changes: Object.freeze(entry.changes),
  });

export const APP_RELEASES = Object.freeze([
  release({
    version: '1.1.0',
    releasedOn: null,
    type: 'minor',
    title: 'Informasjon, nyheter og versjonshistorikk',
    summary:
      'GMI Validator har fått en ny informasjonsside med mer om hva verktøyet er, hvorfor det finnes og hvem det er laget for.',
    highlights: [],
    changes: [
      'Ny Om-side',
      'Nyheter og versjonshistorikk direkte i appen',
      'Oversikt over planlagt videre utvikling',
      'Bedre informasjon om personvern og databehandling',
      'Offentlig kildekode lettere tilgjengelig',
    ],
    news: [
      'GMI Validator har fått en ny informasjonsside med mer om hva verktøyet er, hvorfor det finnes og hvem det er laget for.',
      'Her finner du også nyheter, versjonshistorikk, planer for videre utvikling og informasjon om hvordan data behandles.',
    ],
    announce: true,
  }),
  release({
    version: '1.0.2',
    releasedOn: '2026-08-24',
    type: 'patch',
    title: 'Profilanalyse, stabilitetsretting',
    summary:
      'Rettet en feil som i enkelte tilfeller kunne føre til at Profilanalyse krasjet under bruk.',
    highlights: [],
    changes: [
      'Rettet en feil som i enkelte tilfeller kunne føre til at Profilanalyse krasjet under bruk.',
    ],
    announce: false,
  }),
  release({
    version: '1.0.1',
    releasedOn: '2026-08-19',
    type: 'patch',
    title: 'SOSI, stabilitetsretting',
    summary:
      'Rettet en feil som kunne føre til at SOSI-data ble vist feil etter innlasting.',
    highlights: [],
    changes: [
      'Rettet en feil som kunne føre til at SOSI-data ble vist feil etter innlasting.',
    ],
    announce: false,
  }),
  release({
    version: '1.0.0',
    releasedOn: null,
    title: 'Ny statistikkvisning',
    summary:
      'En tydeligere oversikt over registrerte opplastinger og aktivitet i statistikkvisningen.',
    highlights: [
      {
        title: 'Nøkkeltall på ett sted',
        description:
          'Se antall registrerte filopplastinger og antall kommuner med registrert aktivitet.',
      },
      {
        title: 'Utvikling over tid',
        description:
          'Følg registrerte opplastinger per dag, uke eller måned, som antall eller kumulativ utvikling.',
      },
      {
        title: 'Sammenlign utvalg',
        description:
          'Bytt mellom totaloversikt og visning per kommune, og velg hvilke kommuner som skal inngå.',
      },
      {
        title: 'Kart og fordeling',
        description:
          'Se kommuneaktivitet på kart og i en rangert fordeling basert på samme utvalg.',
      },
    ],
    changes: [
      'Ny statistikkvisning med nøkkeltall, tidsutvikling, kommuneutvalg, kart og fordeling.',
      'Om GMI Validator, formell versjonshistorikk og lanseringsmeldinger er samlet i appen.',
    ],
    announce: false,
  }),
]);

export const CURRENT_APP_RELEASE = APP_RELEASES[0];
export const CURRENT_APP_VERSION = CURRENT_APP_RELEASE.version;
export const LATEST_ANNOUNCED_RELEASE =
  APP_RELEASES.find((entry) => entry.announce) ?? null;
