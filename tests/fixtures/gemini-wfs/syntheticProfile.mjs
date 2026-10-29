// Synthetic values only. Namespace URI was confirmed from the service XSD by
// the user; no real municipal features or extracts are included.
export const namespace = 'http://www.powel.com/gemini';
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function collection(members = [], { prefix = 'gemini', wfs = 'wfs', gml = 'gml',
  ns = namespace, attributes = '', before = '' } = {}) {
  return `<${wfs}:FeatureCollection xmlns:${wfs}="http://www.opengis.net/wfs/2.0"
    xmlns:${gml}="http://www.opengis.net/gml/3.2" xmlns:${prefix}="${escape(ns)}"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink"
    numberMatched="unknown" numberReturned="0" ${attributes}>${before}${members.map((value) =>
      `<${wfs}:member>${value}</${wfs}:member>`).join('')}</${wfs}:FeatureCollection>`;
}

export function field(name, value = '', { prefix = 'gemini', attributes = '' } = {}) {
  return `<${prefix}:${name} ${attributes}>${escape(value)}</${prefix}:${name}>`;
}

// Synthetic reproduction of the sole GML 3.2 featureMembers array observed in
// M7. The member objects/values below remain invented, never a service extract.
export function featureArrayCollection(members = [], options = {}) {
  const gml = options.gml || 'gml';
  return collection([], { ...options, before: `<${gml}:featureMembers>${members.join('')}</${gml}:featureMembers>` });
}

export function feature({ type = 'VA_MPNT', id = `${type}.001`, prefix = 'gemini', gml = 'gml',
  xyz = '581932.579311 6566001.891835 0', dimension = '3', crs = 'EPSG:25832',
  geometry, fields, attributes = '', positionAttributes = '', before = '' } = {}) {
  const line = type === 'VA_LINE';
  const source = geometry ?? `<${gml}:${line ? 'LineString' : 'Point'} ${crs === null ? '' : `srsName="${escape(crs)}"`}
    ${dimension === null ? '' : `srsDimension="${escape(dimension)}"`}>
    <${gml}:${line ? 'posList' : 'pos'} ${positionAttributes}>${xyz}</${gml}:${line ? 'posList' : 'pos'}>
    </${gml}:${line ? 'LineString' : 'Point'}>`;
  return `<${prefix}:${type} ${gml}:id="${escape(id)}" ${attributes}>${before}${fields ??
    field(line ? 'LSID' : 'PSID', '001', { prefix })}<${prefix}:GEOMETRY>${source}</${prefix}:GEOMETRY></${prefix}:${type}>`;
}

export const partialZLine = feature({ type: 'VA_LINE', xyz:
  '579000 6559000 12.5 579300 6559200 0 579600 6559500 0 579900 6559800 13.25 580200 6560000 14',
  fields: field('LSID', '0001') + field('DIM', '160.00') + field('FCODE', '001') +
    field('FCODE_TITLE', 'Vannledning – østre grøft') + field('YEAR', '1980') +
    field('FunctionResult1', '  inert source text  ') });

export const independentPoint = feature({ fields: field('PSID', '0002') + field('COVER_Z', '17.75') +
  field('TYPE_TITLE', 'Kum ÆØÅ') + field('STATUS', '0') });

export const populatedXml = collection([partialZLine, independentPoint]);
