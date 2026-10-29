// Shared, deliberately narrow WFS 2 / GML 3.2 value adapter.
export const GEMINI_SOURCE_CRS = 'EPSG:25832';
export const GEMINI_CONNECTION_ID = 'faerder-va-basis';
// Confirmed by the user from the VA_LINE / VA_MPNT service XSD.
export const GEMINI_FEATURE_NAMESPACE = 'http://www.powel.com/gemini';
export const GEMINI_GML_LIMITS = Object.freeze({
  bytes: 3 * 1024 * 1024, features: 2000, coordinates: 100000,
  nodes: 300000, depth: 16, fieldsPerFeature: 128,
});
const WFS = 'http://www.opengis.net/wfs/2.0';
const GML = 'http://www.opengis.net/gml/3.2';
const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const XLINK = 'http://www.w3.org/1999/xlink';
const OWS = new Set(['http://www.opengis.net/ows', 'http://www.opengis.net/ows/1.1', 'http://www.opengis.net/ows/2.0']);
const TYPES = new Map([['VA_LINE', 'LineString'], ['VA_MPNT', 'Point']]);
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const MESSAGES = Object.freeze({
  'invalid-xml': 'Malformed WFS XML',
  'unsafe-xml': 'XML declarations or processing instructions are not supported',
  'xml-parser-unavailable': 'An XML parser is required',
  'unsupported-profile': 'Unsupported WFS feature collection or member structure',
  'service-exception': 'The WFS service returned an exception',
  'unsupported-geometry': 'Unsupported Gemini geometry or coordinate encoding',
  'invalid-coordinates': 'Invalid Gemini coordinates',
  'ambiguous-dimension': 'An explicit line coordinate dimension is required',
  'invalid-dimension': 'Invalid or contradictory coordinate dimension',
  'missing-crs': 'Source CRS is not declared',
  'unsupported-crs': 'Unsupported source CRS',
  'conflicting-crs': 'Contradictory source CRS declarations',
  'invalid-feature-id': 'A nonempty GML feature ID is required',
  'duplicate-feature-id': 'Duplicate GML feature ID',
  'invalid-attributes': 'Unsupported or contradictory scalar attributes',
  'parser-limit': 'WFS XML exceeds a parser safety limit',
  'invalid-display-projection': 'Source geometry could not be projected for display',
});

export class GeminiGmlError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'invalid-xml';
    super(MESSAGES[safeCode]);
    this.name = 'GeminiGmlError';
    this.code = safeCode;
  }
}
const fail = (code) => { throw new GeminiGmlError(code); };
const is = (node, namespace, name) => node?.namespaceURI === namespace && node.localName === name;
// DOM Level 2 traversal works in native browser DOMs and the Node XML adapter.
const children = (node) => Array.from(node.childNodes).filter((child) => child.nodeType === 1);
const freeze = Object.freeze;
const absentField = freeze({ state: 'absent', rawText: null, xmlAttributes: freeze([]) });

function elementChildren(node) {
  for (const child of node.childNodes) {
    if ([3, 4].includes(child.nodeType) && child.textContent.trim()) fail('unsupported-profile');
  }
  return children(node);
}

function xmlAttributes(node) {
  return freeze(Array.from(node.attributes).filter((attribute) => attribute.namespaceURI !== XMLNS)
    .map((attribute) => freeze({
      namespace: attribute.namespaceURI, name: attribute.localName, value: attribute.value,
    })));
}

function checkComplexity(document) {
  // Iterative traversal: hostile nesting cannot overflow a JS recursion stack.
  let node = document, depth = 0, count = 0;
  while (node) {
    count += 1 + (node.attributes?.length || 0);
    if (count > GEMINI_GML_LIMITS.nodes || depth > GEMINI_GML_LIMITS.depth) fail('parser-limit');
    if (node.nodeType === 7 || node.nodeType === 10) fail('unsafe-xml');
    if (node.firstChild) { node = node.firstChild; depth += 1; continue; }
    while (node && !node.nextSibling) { node = node.parentNode; depth -= 1; }
    if (node) node = node.nextSibling;
  }
}

export function normalizeGeminiCrs(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(?:EPSG:|urn:ogc:def:crs:EPSG::|https?:\/\/www\.opengis\.net\/def\/crs\/EPSG\/0\/)(\d+)$/i);
  return match ? `EPSG:${Number(match[1])}` : null;
}

function declarations(nodes, attribute) {
  return nodes.filter((node) => node.hasAttribute(attribute)).map((node) => freeze({
    location: node.localName, value: node.getAttribute(attribute),
  }));
}

function resolveCrs(values, required = true) {
  if (!values.length) {
    if (required) fail('missing-crs');
    return;
  }
  const codes = values.map((item) => normalizeGeminiCrs(item.value));
  if (codes.some((code) => !code)) fail('unsupported-crs');
  if (new Set(codes).size !== 1) fail('conflicting-crs');
  if (codes[0] !== GEMINI_SOURCE_CRS) fail('unsupported-crs');
}

function resolveDimension(values) {
  const dimensions = values.map((item) => item.value.trim());
  if (dimensions.some((value) => !['2', '3'].includes(value)) || new Set(dimensions).size > 1) {
    fail('invalid-dimension');
  }
  return dimensions.length ? Number(dimensions[0]) : null;
}

function ordinates(text) {
  const values = text.trim() ? text.trim().split(/\s+/) : [];
  if (!values.length || values.some((value) => !NUMBER.test(value) || !Number.isFinite(Number(value)))) {
    fail('invalid-coordinates');
  }
  return values;
}

function envelope(parent) {
  const bounds = children(parent).filter((node) => is(node, GML, 'boundedBy'));
  if (bounds.length > 1) fail('unsupported-profile');
  if (!bounds.length) return null;
  const contents = elementChildren(bounds[0]);
  if (contents.length !== 1 || !is(contents[0], GML, 'Envelope')) fail('unsupported-profile');
  const box = contents[0];
  const corners = elementChildren(box);
  if (corners.length !== 2 || !is(corners[0], GML, 'lowerCorner') || !is(corners[1], GML, 'upperCorner') ||
    corners.some((node) => children(node).length)) fail('unsupported-profile');
  const values = corners.map((node) => ordinates(node.textContent));
  const dimension = resolveDimension(declarations([box, ...corners], 'srsDimension')) || values[0].length;
  if (![2, 3].includes(dimension) || values.some((value) => value.length !== dimension)) fail('invalid-dimension');
  return freeze({
    crsDeclarations: freeze(declarations([box, ...corners], 'srsName')),
    dimension, xmlAttributes: xmlAttributes(box),
    cornerText: freeze(corners.map((node) => node.textContent)),
  });
}

function scalarField(node) {
  if (children(node).length) fail('invalid-attributes');
  const nil = node.getAttributeNS(XSI, 'nil');
  if (nil !== null && !['true', '1', 'false', '0'].includes(nil.trim())) fail('invalid-attributes');
  const isNil = nil !== null && ['true', '1'].includes(nil.trim());
  const rawText = node.textContent;
  if (isNil && rawText.trim()) fail('invalid-attributes');
  return freeze({
    state: isNil ? 'nil' : rawText === '' ? 'empty' : 'text',
    rawText, xmlAttributes: xmlAttributes(node),
  });
}

function sourceGeometry(container, root, envelopes, expectedType, budget) {
  const contents = elementChildren(container);
  if (contents.length !== 1 || !is(contents[0], GML, expectedType)) fail('unsupported-geometry');
  const geometry = contents[0];
  const positions = elementChildren(geometry);
  const encoding = expectedType === 'Point' ? 'pos' : 'posList';
  if (positions.length !== 1 || !is(positions[0], GML, encoding) || children(positions[0]).length) {
    fail('unsupported-geometry');
  }
  const position = positions[0];
  const ancestors = [];
  for (let node = position; node?.nodeType === 1; node = node.parentNode) {
    ancestors.unshift(node);
    if (node === root) break;
  }
  if (ancestors.some((node) => node.hasAttributeNS(XLINK, 'href') || node.hasAttributeNS(XSI, 'nil'))) {
    fail('unsupported-geometry');
  }
  const crsDeclarations = [...declarations(ancestors, 'srsName'),
    ...envelopes.flatMap((box) => box?.crsDeclarations || [])];
  resolveCrs(crsDeclarations);
  const dimensionDeclarations = declarations(ancestors, 'srsDimension');
  let dimension = resolveDimension(dimensionDeclarations);
  const tokens = ordinates(position.textContent);
  if (dimension === null) {
    if (expectedType === 'LineString') fail('ambiguous-dimension');
    dimension = tokens.length; // A single pos has unambiguous XY or XYZ arity.
  }
  if (![2, 3].includes(dimension)) fail('invalid-dimension');
  if (tokens.length % dimension || (expectedType === 'Point' && tokens.length !== dimension) ||
    (expectedType === 'LineString' && tokens.length / dimension < 2)) fail('invalid-coordinates');
  const tupleCount = tokens.length / dimension;
  if (position.hasAttribute('count')) {
    const count = position.getAttribute('count');
    if (encoding !== 'posList' || !/^[1-9]\d*$/.test(count) || Number(count) !== tupleCount) fail('invalid-coordinates');
  }
  budget.coordinates += tupleCount;
  if (budget.coordinates > GEMINI_GML_LIMITS.coordinates) fail('parser-limit');
  const coordinates = [];
  for (let index = 0; index < tokens.length; index += dimension) {
    coordinates.push(freeze(tokens.slice(index, index + dimension).map(Number)));
  }
  return freeze({
    type: expectedType, dimension,
    coordinates: expectedType === 'Point' ? coordinates[0] : freeze(coordinates),
    encoding, coordinateText: position.textContent,
    crsDeclarations: freeze(crsDeclarations), dimensionDeclarations: freeze(dimensionDeclarations),
    xmlAttributes: xmlAttributes(geometry), coordinateAttributes: xmlAttributes(position),
  });
}

function featureRecord(feature, root, featureNamespace, collectionEnvelope, ids, budget) {
  if (feature.namespaceURI !== featureNamespace || !TYPES.has(feature.localName)) fail('unsupported-profile');
  const gmlId = feature.getAttributeNS(GML, 'id');
  if (!gmlId || /\s/.test(gmlId)) fail('invalid-feature-id');
  if (ids.has(gmlId)) fail('duplicate-feature-id');
  ids.add(gmlId);
  const fields = elementChildren(feature);
  if (fields.length > GEMINI_GML_LIMITS.fieldsPerFeature) fail('parser-limit');
  const featureEnvelope = envelope(feature);
  const geometryFields = fields.filter((node) => is(node, featureNamespace, 'GEOMETRY'));
  if (geometryFields.length !== 1) fail('unsupported-geometry');
  const entries = [];
  const names = new Set();
  for (const field of fields) {
    if (is(field, GML, 'boundedBy') || field === geometryFields[0]) continue;
    if (field.namespaceURI !== featureNamespace || names.has(field.localName)) fail('invalid-attributes');
    names.add(field.localName);
    entries.push([field.localName, scalarField(field)]);
  }
  const attributes = freeze(Object.fromEntries(entries));
  const idField = feature.localName === 'VA_LINE' ? 'LSID' : 'PSID';
  const idAttribute = Object.hasOwn(attributes, idField) ? attributes[idField] : absentField;
  return freeze({
    key: JSON.stringify([GEMINI_CONNECTION_ID, featureNamespace, feature.localName, gmlId]),
    gmlId, typeName: `gemini:${feature.localName}`, featureNamespace, sourceCrs: GEMINI_SOURCE_CRS,
    idField, objectId: ['absent', 'nil'].includes(idAttribute.state) ? null : idAttribute.rawText,
    attributes, xmlAttributes: xmlAttributes(feature), envelope: featureEnvelope,
    geometry: sourceGeometry(geometryFields[0], root, [collectionEnvelope, featureEnvelope], TYPES.get(feature.localName), budget),
  });
}

export function getGeminiField(record, name) {
  return Object.hasOwn(record.attributes, name) ? record.attributes[name] : absentField;
}

export function getGeminiNumericValue(record, name) {
  const field = getGeminiField(record, name);
  if (field.state !== 'text' || !NUMBER.test(field.rawText.trim())) return null;
  const value = Number(field.rawText);
  return Number.isFinite(value) ? value : null;
}

/** Match the confirmed XSD namespace, never a prefix or schemaLocation URL. */
export function parseGeminiGml(xml, { parseXml } = {}) {
  const featureNamespace = GEMINI_FEATURE_NAMESPACE;
  if (typeof xml !== 'string') fail('invalid-xml');
  if (new TextEncoder().encode(xml).byteLength > GEMINI_GML_LIMITS.bytes) fail('parser-limit');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail('unsafe-xml');
  if (!parseXml && typeof globalThis.DOMParser !== 'function') fail('xml-parser-unavailable');
  let document;
  try {
    document = (parseXml || ((value) => new globalThis.DOMParser().parseFromString(value, 'application/xml')))(xml);
  } catch {
    fail('invalid-xml');
  }
  if (!document?.documentElement || document.getElementsByTagNameNS('*', 'parsererror').length) fail('invalid-xml');
  checkComplexity(document);
  const root = document.documentElement;
  if (OWS.has(root.namespaceURI) && root.localName === 'ExceptionReport') fail('service-exception');
  if (!is(root, WFS, 'FeatureCollection') || (root.hasAttribute('version') && root.getAttribute('version') !== '2.0.0')) {
    fail('unsupported-profile');
  }
  const rootChildren = elementChildren(root);
  const collectionEnvelope = envelope(root);
  resolveCrs([...declarations([root], 'srsName'), ...(collectionEnvelope?.crsDeclarations || [])], false);
  resolveDimension(declarations([root], 'srsDimension'));
  const arrays = rootChildren.filter((node) => is(node, GML, 'featureMembers'));
  let featureElements;
  if (arrays.length) {
    // Observed Gemini serialization: one sole GML 3.2 array of direct features.
    // Do not admit mixed/repeated wrappers, links, nil or unobserved attributes.
    if (rootChildren.length !== 1 || Array.from(arrays[0].attributes).some((attribute) => attribute.namespaceURI !== XMLNS)) {
      fail('unsupported-profile');
    }
    featureElements = elementChildren(arrays[0]);
    if (featureElements.length > GEMINI_GML_LIMITS.features) fail('parser-limit');
  } else {
    if (rootChildren.some((node) => !(is(node, WFS, 'member') || is(node, GML, 'boundedBy')))) fail('unsupported-profile');
    const members = rootChildren.filter((node) => is(node, WFS, 'member'));
    if (members.length > GEMINI_GML_LIMITS.features) fail('parser-limit');
    featureElements = members.map((member) => {
      const contents = elementChildren(member);
      if (contents.length !== 1 || member.hasAttributeNS(XLINK, 'href')) fail('unsupported-profile');
      return contents[0];
    });
  }
  const ids = new Set(), budget = { coordinates: 0 };
  const records = featureElements.map((feature) => {
    if (OWS.has(feature.namespaceURI) && feature.localName === 'ExceptionReport') fail('service-exception');
    return featureRecord(feature, root, featureNamespace, collectionEnvelope, ids, budget);
  });
  return freeze({
    connectionId: GEMINI_CONNECTION_ID, featureNamespace, sourceCrs: GEMINI_SOURCE_CRS,
    records: freeze(records), envelope: collectionEnvelope, xmlAttributes: xmlAttributes(root),
    counts: freeze({ members: featureElements.length, records: records.length,
      lines: records.filter((record) => record.geometry.type === 'LineString').length,
      points: records.filter((record) => record.geometry.type === 'Point').length,
      coordinates: budget.coordinates }),
  });
}
