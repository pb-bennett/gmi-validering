import { PHOTO_EXPORT_PROFILES, EXPORT_CONTEXT_FIELDS, fullCaptureTime, isXmlText, validateExportContext } from './exportContract.mjs';

const freeze = (table) => Object.freeze(Object.fromEntries(Object.entries(table).map(([key, value]) => [key, Object.freeze(value)])));

// Presentation only. Serializers read PHOTO_EXPORT_PROFILES and never this table. `compatibility` reports a past import
// in a tested setup, follows PHOTO_EXPORT_IMPORT_EVIDENCE below, and says nothing about the next package.
export const PHOTO_EXPORT_PROFILE_METADATA = freeze({
  'gemini-legacy2019': { tier: 'primary', title: 'Gemini-kompatibel Skråfoto 2019', badge: 'Anbefalt', destination: 'Til import i Gemini VA og GeoFoto.',
    compatibility: 'Importert i Gemini VA/GeoFoto i testet oppsett. Kontroller resultatet etter import.' },
  legacy2019: { tier: 'advanced', title: 'Skråfoto 2019 (standard)', badge: null, destination: 'Etter standardskjemaet, til andre mottakere. Krever opptakstid og retning.',
    compatibility: 'Ikke testet med import i Gemini VA.' },
  asbuilt52: { tier: 'advanced', title: 'Norsk Vann AsBuilt 5.2', badge: null, destination: 'AsBuilt-leveranse. Krever opptakstid og leveranseopplysninger.',
    compatibility: 'Ikke testet med import i Gemini VA.' },
});

// What blocks generation. Gemini direction is provisional (D1); Gemini time stays recommended until gate G3.
export const PHOTO_EXPORT_REQUIREMENTS = freeze({
  'gemini-legacy2019': { direction: 'required', captureTime: 'recommended', photographer: 'omitted', context: false },
  legacy2019: { direction: 'required', captureTime: 'required', photographer: 'optional', context: false },
  asbuilt52: { direction: 'optional', captureTime: 'required', photographer: 'omitted', context: true },
});

// What the applicable XSD needs on every feature, independent of what the profile blocks.
export const PHOTO_EXPORT_SCHEMA_REQUIREMENTS = freeze({
  'gemini-legacy2019': { schema: 'Skråfoto 2019', captureTime: true, direction: true, context: false },
  legacy2019: { schema: 'Skråfoto 2019', captureTime: true, direction: true, context: false },
  asbuilt52: { schema: 'AsBuilt 5.2', captureTime: true, direction: false, context: true },
});

// Updated only by real imports, never by reasoning about them. referenceOnly marks a state seen in the
// contractor file and not in app output: missing time worked there, which does not confirm it for this exporter.
export const PHOTO_EXPORT_IMPORT_EVIDENCE = freeze({
  'gemini-legacy2019': { profile: 'imported', missingCaptureTime: 'unconfirmed', missingDirection: 'untested', renamedGml: 'untested', referenceOnly: Object.freeze(['missingCaptureTime']) },
  legacy2019: { profile: 'none' },
  asbuilt52: { profile: 'none' },
});

// Errors only the export plan can produce: they need file bytes, projection or a built plan.
export const PHOTO_EXPORT_PLAN_ONLY_ERRORS = Object.freeze(['attachment-naming', 'missing-file', 'file-read-failed', 'projection-failed', 'stale-plan']);

// Without a known profile the plan reports invalid-profile and still checks capture time as for a standards profile.
const NO_PROFILE = Object.freeze({ direction: 'optional', captureTime: 'required', photographer: 'omitted', context: false });

export const normalizeExportContext = (context) => Object.fromEntries(EXPORT_CONTEXT_FIELDS.map(({ key }) => [key, String(context?.[key] ?? '').trim()]));
export const isValidExportDirection = (direction) => Number.isFinite(direction?.degrees) && direction.degrees >= 0 && direction.degrees < 360;

// The one synchronous implementation of what blocks generation. Scope is placed occurrences and the assets they
// refer to, so unplaced occurrences never block. Asset rules run once per asset, occurrence rules per occurrence.
export function evaluatePhotoExportRules({ profile, crs, context, assets, occurrences }) {
  const known = Object.hasOwn(PHOTO_EXPORT_PROFILES, profile);
  const requirement = known ? PHOTO_EXPORT_REQUIREMENTS[profile] : NO_PROFILE;
  const errors = [], warnings = [];
  const error = (code, message, occurrenceId, assetId) => errors.push({ code, message, occurrenceId, assetId });

  if (!known) error('invalid-profile', 'Velg en eksportprofil eksplisitt.');
  if (profile !== 'gemini-legacy2019' && !['EPSG:25832', 'EPSG:25833'].includes(crs)) error('invalid-crs', 'Velg EPSG:25832 eller EPSG:25833.');
  if (requirement.context) errors.push(...validateExportContext(normalizeExportContext(context)));

  const placed = occurrences.filter((row) => row.current);
  const excluded = occurrences.length - placed.length;
  if (!placed.length) error('no-placed-photos', 'Ingen forekomster har godtatt posisjon.');
  if (excluded) warnings.push({ code: 'unplaced-excluded', message: `${excluded} uplasserte forekomster er utelatt.` });

  const placedAssets = new Set(placed.map((row) => row.assetId));
  const byAsset = new Map(assets.map((asset) => [asset.assetId, asset]));
  for (const asset of byAsset.values()) {
    if (!placedAssets.has(asset.assetId)) continue;
    const { captureTime, photographer } = asset.metadata || {};
    if (requirement.captureTime === 'required' && !fullCaptureTime(captureTime)) error(captureTime ? 'capture-time-precision' : 'capture-time-required', `${asset.originalFilename}: godtatt opptakstid med sekunder kreves.`, undefined, asset.assetId);
    if (requirement.photographer === 'optional' && photographer?.value && !isXmlText(photographer.value)) error('invalid-xml-text', `${asset.originalFilename}: fotograf inneholder ugyldige XML-tegn.`, undefined, asset.assetId);
    if (profile === 'asbuilt52' && photographer?.value) warnings.push({ code: 'photographer-omitted', assetId: asset.assetId,
      message: `${asset.originalFilename}: fotograf utelates i AsBuilt 5.2 fordi godtatt brennvidde og kameratype mangler.` });
  }
  for (const row of placed) {
    const name = `${byAsset.get(row.assetId)?.originalFilename || row.assetId} (${row.occurrenceId})`;
    if (row.direction && !isValidExportDirection(row.direction)) error('invalid-direction', `${name}: ugyldig godtatt retning.`, row.occurrenceId);
    if (requirement.direction === 'required' && !row.direction) error('direction-required', `${name}: godtatt retning kreves for denne eksportprofilen.`, row.occurrenceId);
  }
  return { errors, warnings };
}
