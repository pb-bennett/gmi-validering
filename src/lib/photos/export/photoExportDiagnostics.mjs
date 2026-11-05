// Codes are stable: tests and data-diagnostic-code depend on them. Only the wording here may change.
const labels = {
  'invalid-profile': 'Eksportprofil mangler',
  'invalid-crs': 'Ugyldig koordinatsystem',
  'invalid-context': 'Påkrevd AsBuilt-kontekst',
  'no-placed-photos': 'Ingen plasserte bilder',
  'capture-time-required': 'Mangler godtatt opptakstid',
  'capture-time-precision': 'Utilstrekkelig opptakstidspresisjon',
  'direction-required': 'Mangler godtatt retning',
  'invalid-direction': 'Ugyldig godtatt retning',
  'invalid-xml-text': 'Ugyldige tegn i fotograf',
  'attachment-naming': 'Vedleggsnavn kan ikke lages',
  'projection-failed': 'Projeksjonsfeil',
  'missing-file': 'Originalfil mangler',
  'file-read-failed': 'Originalfil kan ikke leses',
  'stale-plan': 'Fotolaget er endret',
  'unplaced-excluded': 'Uplasserte bilder utelatt',
  'photographer-omitted': 'Fotograf utelatt',
  'associations-omitted': 'Objektkoblinger utelatt',
  'shared-attachments': 'Delte originalbilder',
  'experimental-mapping': 'Eksperimentell mapping',
  'direction-assumption': 'Antakelse om retning',
  'path-convention': 'Vedleggssti',
  'experimental-2d': '2D-geometri uten Z',
  'compatibility-z': 'Z-plassholder',
  'compatibility-time': 'Opptakstid i Gemini-filen',
  'compatibility-metadata': 'Bildeinformasjon utelatt',
  'compatibility-import': 'Importveiledning',
  'capture-time-utc': 'Opptakstid i UTC',
  'capture-time-implausible': 'Usannsynlig dato',
  'capture-time-bulk': 'Samme manuelle opptakstid',
  'capture-time-in-source': 'Opptakstid finnes i kilde',
  'direction-all-zero': 'Mange retninger mot nord',
  'direction-bulk': 'Samme manuelle retning',
  'evidence-pending': 'Bildedata leses',
};

export const photoExportDiagnosticLabel = (code) => labels[code] || code;

export function groupPhotoExportDiagnostics(diagnostics) {
  const groups = new Map();
  for (const item of diagnostics) {
    if (!groups.has(item.code)) groups.set(item.code, { code: item.code, label: photoExportDiagnosticLabel(item.code), items: [] });
    groups.get(item.code).items.push(item);
  }
  return [...groups.values()].map((group) => ({ ...group, count: group.items.length }));
}
