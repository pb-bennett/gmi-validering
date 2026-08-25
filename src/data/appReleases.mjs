const release = (entry) =>
  Object.freeze({
    ...entry,
    highlights: Object.freeze(
      (entry.highlights || []).map((highlight) => Object.freeze(highlight)),
    ),
    changes: Object.freeze(entry.changes),
  });

export const APP_RELEASES = Object.freeze([
  release({
    version: '1.0.1',
    releasedOn: '2026-08-24',
    type: 'patch',
    title: 'Profilanalyse – stabilitetsretting',
    summary:
      'Rettet en feil som i enkelte tilfeller kunne føre til at Profilanalyse krasjet under bruk.',
    highlights: [],
    changes: [
      'Rettet en feil som i enkelte tilfeller kunne føre til at Profilanalyse krasjet under bruk.',
    ],
    announce: false,
  }),
  release({
    version: '1.0.0',
    releasedOn: '2026-08-25',
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
    announce: true,
  }),
]);

export const CURRENT_APP_RELEASE = APP_RELEASES[0];
export const CURRENT_APP_VERSION = CURRENT_APP_RELEASE.version;
export const LATEST_ANNOUNCED_RELEASE =
  APP_RELEASES.find((entry) => entry.announce) ?? null;
