// Browser field names shared with GMI. Source groups remain intact in attributes.
const lineMappings = [
  ['Eier', ['EGS_LEDNING', 'geodataeier'], 'code'],
  ['S_FCODE', ['EGS_LEDNING', 'L_TEMA'], 'code'],
  ['Material', ['EGS_LEDNING', 'MATERIAL'], 'code'],
  ['Dimensjon', ['EGS_LEDNING', 'DIMENSJON'], 'number'],
  ['InnvendigUtvendig', ['EGS_LEDNING', 'INNVUTV_DIM'], 'code'],
  ['Rørform', ['EGS_LEDNING', 'FORM'], 'code'],
  ['Nett_type', ['EGS_LEDNING', 'NETTYPE'], 'code'],
  ['Anleggsår', ['EGS_LEDNING', 'ANLEGGSÅR'], 'number'],
  ['Tykkelse', ['EGS_LEDNING', 'TYKK'], 'number'],
  ['Ringstivhet', ['EGS_LEDNING', 'RINGSTIVH'], 'code'],
  ['Trykklasse', ['EGS_LEDNING', 'TRYKKLAS'], 'code'],
  ['Vertikalnivå', ['EGS_LEDNING', 'VERT_NIVÅ'], 'code'],
];

const pointMappings = [
  ['Eier', ['EGS_PUNKT', 'geodataeier'], 'code'],
  ['S_FCODE', ['EGS_PUNKT', 'P_TEMA'], 'code'],
  ['Type', ['EGS_PUNKT', 'TYPE'], 'code'],
  ['Bredde', ['EGS_PUNKT', 'KUMBREDDE'], 'number'],
  ['Kumform', ['EGS_PUNKT', 'KUMFORM'], 'code'],
  ['InnvendigUtvendig', ['EGS_PUNKT', 'INNVUTV_DIM'], 'code'],
  ['Anleggsår', ['EGS_PUNKT', 'ANLEGGSÅR'], 'number'],
  ['Byggemetode', ['EGS_PUNKT', 'BYGGEMET'], 'code'],
  ['Tykkelse', ['EGS_PUNKT', 'TYKK'], 'number'],
  ['Kjegle', ['EGS_PUNKT', 'KJEGLE'], 'code'],
  ['Adkomst', ['EGS_PUNKT', 'ADKOMST'], 'code'],
  ['AnleggsID', ['EGS_PUNKT', 'PUNKTIDANL'], 'code'],
  ['Vertikalnivå', ['EGS_PUNKT', 'VERT_NIVÅ'], 'code'],
];

const nonPhysicalPointNames = new Set(['VADriftsdata', 'VASymbol', 'VAPåskrift']);

const sharedMappings = [
  ['Høydereferanse', ['HØYDEREFERANSE'], 'code'],
  ['Stedfestingsforhold', ['STEDF_FORH'], 'code'],
  ['Stedfestingsårsak', ['STEDF_ÅRSA'], 'code'],
  ['Datafangstdato', ['datafangstdato'], 'dateToIso'],
  ['Målemetode', ['kvalitet', 'målemetode'], 'finiteNumberOrNull'],
  ['Nøyaktighet', ['kvalitet', 'nøyaktighet'], 'finiteNumberOrNull'],
  ['Synbarhet', ['kvalitet', 'synbarhet'], 'finiteNumberOrNull'],
  ['MålemetodeHøyde', ['kvalitet', 'målemetodeHøyde'], 'finiteNumberOrNull'],
  ['NøyaktighetHøyde', ['kvalitet', 'nøyaktighetHøyde'], 'finiteNumberOrNull'],
];

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function sourceValue(properties, path) {
  let value = properties;
  for (const key of path) {
    if (value === null || typeof value !== 'object' || !own(value, key)) {
      return { present: false };
    }
    value = value[key];
  }
  return { present: true, value };
}

function normalize(value, kind) {
  if (kind === 'finiteNumberOrNull') {
    return { valid: true, value: typeof value === 'number' && Number.isFinite(value) ? value : null };
  }
  if (kind === 'dateToIso') {
    if (!(value instanceof Date)) return { valid: false };
    return { valid: true, value: Number.isFinite(value.getTime()) ? value.toISOString() : null };
  }
  if (kind === 'number') {
    if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) {
      return { valid: false };
    }
    const number = Number(value);
    return Number.isFinite(number) ? { valid: true, value: number } : { valid: false };
  }
  // Codes have no membership check or display-label translation.
  return typeof value === 'string' && value !== ''
    ? { valid: true, value }
    : { valid: false };
}

function fill(attributes, properties, mappings) {
  for (const [target, path, kind] of mappings) {
    const current = attributes[target];
    if (current !== undefined && current !== null && current !== '') continue;
    const source = sourceValue(properties, path);
    if (!source.present) continue;
    const mapped = normalize(source.value, kind);
    if (mapped.valid) attributes[target] = mapped.value;
  }
}

export function mapSosiCanonicalAttributes({ geometryType, properties = {}, inferredFcode } = {}) {
  const attributes = { ...properties };
  if (geometryType === 'LineString' || geometryType === 'Polygon') {
    fill(attributes, properties, lineMappings);
  }
  if (geometryType === 'Point') {
    fill(attributes, properties, pointMappings);
  }
  if (geometryType === 'LineString' || geometryType === 'Polygon' || geometryType === 'Point') {
    fill(attributes, properties, sharedMappings);
  }
  // Annotation and operations records need a real theme path to acquire S_FCODE.
  if (attributes.S_FCODE === undefined || attributes.S_FCODE === null || attributes.S_FCODE === '') {
    if (inferredFcode && !(geometryType === 'Point' && nonPhysicalPointNames.has(properties.objekttypenavn))) {
      attributes.S_FCODE = String(inferredFcode);
    }
  }
  attributes.SOURCE_FORMAT = 'SOSI';

  const sourceGuid = sourceValue(properties, ['GUID']);
  const guid = sourceGuid.present && sourceGuid.value !== null &&
    ['string', 'number', 'boolean', 'bigint'].includes(typeof sourceGuid.value)
    ? sourceGuid.value
    : null;
  return { attributes, guid };
}
