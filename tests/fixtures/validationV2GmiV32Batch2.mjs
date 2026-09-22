// Test-owned Batch 2 contracts; these literals intentionally do not come from production metadata.
export const BATCH2_RULES = [
  ['innmaling.point.bottom-distance.decimal', 'innerBottomToOuterUndersideDistance', 'Avst_BunnInnvUnderUtv', 'm', '5, 9'],
  ['innmaling.point.installation-year.format', 'installationYear', 'Anleggsår', null, '4, 6'],
  ['innmaling.point.capture-date.format', 'captureDate', 'Datafangstdato', null, '4, 6'],
  ['innmaling.point.note.max-length', 'note', 'Merknad', null, '4, 6'],
];

export const BATCH2_LIMITS = Object.freeze({ decimalGrammar: /^[+-]?[0-9]+(?:[.,][0-9]+)?$/, year: /^[0-9]{4}$/, date: /^[0-9]{2}\.[0-9]{2}\.[0-9]{4}$/, noteCodePoints: 255 });
