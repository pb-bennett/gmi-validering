import { getGeminiField } from './parseGeminiGml.mjs';

// Keep references to lossless records. Ambiguous identities resolve to nothing,
// including a collision across sides; never silently choose the first/last one.
export function createGeminiSourceLookup(result) {
  const records = new Map();
  for (const side of [result?.lines, result?.points]) {
    for (const record of side?.source.records || []) {
      if (typeof record.key !== 'string' || record.key.length === 0) continue;
      records.set(record.key, records.has(record.key) ? null : record);
    }
  }
  return (sourceKey, typeName) => {
    const record = records.get(sourceKey);
    return record?.typeName === typeName ? record : null;
  };
}

// M2 states are authoritative. Raw strings preserve IDs, years, codes and
// supplied precision. Whitespace-only text is visually empty, but stays in M2.
export function geminiFieldText(record, ...names) {
  for (const name of names) {
    const field = getGeminiField(record, name);
    if (field.state !== 'text') continue;
    const value = field.rawText;
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

const common = [
  ['År', 'YEAR'], ['Status', 'STATUS_TITLE', 'STATUS'],
  ['Eier', 'OWNER_TITLE', 'OWNER'], ['Ansvarlig', 'RESPONSIBLE_TITLE', 'RESPONSIBLE'],
];
const lineFields = [
  ['Type', 'FCODE_TITLE', 'FCODE'], ['Nettype', 'NETTYPE_TITLE', 'NETTYPE'],
  ['Dimensjon', 'DIM'], ['Materiale', 'MATERIAL_TITLE', 'MATERIAL'],
  ...common, ['Lengde', 'LENGTH'], ['Gemini-ID', 'LSID'],
];
const pointFields = [
  ['Type', 'FCODE_TITLE', 'FCODE'], ['Punkttype', 'TYPE_TITLE', 'TYPE'],
  ['Funksjon', 'CUST_FUNC_TITLE', 'CUST_FUNC'], ['Utførelse', 'BUILDSTYLE_TITLE', 'BUILDSTYLE'],
  ['Stasjon', 'STATION'], ['Bredde', 'OBJWIDTH'], ['Lengde', 'OBJLENGTH'],
  ['Kote lokk', 'COVER_Z'], ...common, ['Gemini-ID', 'PSID'],
];

export function getGeminiPopupRows(record) {
  const fields = record.typeName === 'gemini:VA_LINE' ? lineFields : pointFields;
  const rows = fields.flatMap(([label, ...names]) => {
    const value = geminiFieldText(record, ...names);
    return value === null ? [] : [{ label, value }];
  });
  const geometry = record.geometry;
  if (record.typeName === 'gemini:VA_MPNT' && geometry.type === 'Point' &&
      geometry.dimension === 3 && Number.isFinite(geometry.coordinates[2])) {
    const z = geometry.coordinates[2];
    const row = { label: 'Geometrikote', value: Object.is(z, -0) ? '-0' : String(z) };
    const coverIndex = rows.findIndex(({ label }) => label === 'Kote lokk');
    rows.splice(coverIndex < 0 ? 0 : coverIndex + 1, 0, row);
  }
  return rows;
}

// Like the survey helper, use DOM textContent without a second React root.
// No survey model, delegated action classes, links or provider markup.
export function createGeminiPopupContent(record) {
  const content = document.createElement('section');
  content.className = 'gmi-gemini-popup-content';
  const title = record.typeName === 'gemini:VA_LINE' ? 'Eksisterende ledning' : 'Eksisterende punkt';
  content.setAttribute('aria-label', title);
  const heading = document.createElement('h2');
  heading.textContent = title;
  content.appendChild(heading);
  const source = document.createElement('p');
  source.textContent = 'Gemini WFS · eksisterende anlegg';
  content.appendChild(source);
  const list = document.createElement('dl');
  for (const { label, value } of getGeminiPopupRows(record)) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    if (label === 'Geometrikote') description.title = 'Bokstavelig kildeverdi, ikke verifisert høyde.';
    list.appendChild(term);
    list.appendChild(description);
  }
  content.appendChild(list);
  return content;
}
