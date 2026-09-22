// Test-owned source/contract oracles; never imported from the production registry.
export const BATCH1_INTEGERS = [
  ['innmaling.point.horizontal-accuracy.integer', 'horizontalAccuracy', 'Nøyaktighet', 'cm', '4, 6'],
  ['innmaling.point.vertical-accuracy.integer', 'verticalAccuracy', 'NøyaktighetHøyde', 'cm', '4, 6'],
  ['innmaling.point.max-horizontal-deviation.integer', 'maxHorizontalDeviation', 'MaksAvvikHorisontalt', 'cm', '4, 6'],
  ['innmaling.point.max-vertical-deviation.integer', 'maxVerticalDeviation', 'MaksAvvikVertikalt', 'cm', '4, 6'],
  ['innmaling.point.wall-thickness.integer', 'wallThickness', 'Tykkelse', 'mm', '5, 9'],
  ['innmaling.point.external-height.integer', 'externalHeight', 'Utvendig_høyde', 'mm', '5, 9'],
  ['innmaling.point.nobb-vavvs-number.integer', 'nobbVavvsNumber', 'NOBB-VAVVS-nr', null, '5, 10'],
  ['innmaling.point.nobb-vavvs-frame-number.integer', 'nobbVavvsFrameNumber', 'NOBB-VAVVS-nr-ramme', null, '5, 10'],
];
export const BATCH1_LISTS = [
  ['innmaling.point.owner.valid', 'owner', 'Eier', null, '4, 8–9', ['AN', 'F', 'I', 'K', 'K1', 'K2', 'L', 'P', 'P1', 'S', 'S1', 'S2', 'S3']],
  ['innmaling.point.access.valid', 'access', 'Adkomst', null, '5, 15', ['DO', 'NG', 'NT', 'ST', 'UTENST']],
];
