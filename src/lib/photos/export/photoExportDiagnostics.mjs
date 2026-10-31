const labels = {
  'capture-time-required': 'Mangler godtatt opptakstid',
  'capture-time-precision': 'Utilstrekkelig opptakstidspresisjon',
  'direction-required': 'Mangler godtatt retning',
  'invalid-context': 'Påkrevd AsBuilt-kontekst',
  'projection-failed': 'Projeksjonsfeil',
  'missing-file': 'Originalfil mangler',
  'file-read-failed': 'Originalfil kan ikke leses',
  'photographer-omitted': 'Fotograf utelatt',
};

export function groupPhotoExportDiagnostics(diagnostics) {
  const groups = new Map();
  for (const item of diagnostics) {
    if (!groups.has(item.code)) groups.set(item.code, { code: item.code, label: labels[item.code] || item.code, items: [] });
    groups.get(item.code).items.push(item);
  }
  return [...groups.values()].map((group) => ({ ...group, count: group.items.length }));
}
