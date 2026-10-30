import { parseGeminiGml as defaultParseGeminiGml, getGeminiField, getGeminiNumericValue, GEMINI_GML_LIMITS } from '../../src/lib/gemini-wfs/parseGeminiGml.mjs';
import { buildGeminiMapFeatures } from '../../src/lib/gemini-wfs/geminiMapFeatures.mjs';
import { collection, feature, field, featureArrayCollection, populatedXml, partialZLine, independentPoint, namespace } from '../fixtures/gemini-wfs/syntheticProfile.mjs';

export function createGeminiGmlChecks(parseGeminiGml = defaultParseGeminiGml) {
const assert = (condition, message = 'Gemini parser assertion failed') => { if (!condition) throw new Error(message); };
const equal = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected), 'Structured source/display values differ');
function error(xml, code) {
  let caught;
  try { parseGeminiGml(xml); } catch (value) { caught = value; }
  assert(caught?.name === 'GeminiGmlError' && caught.code === code, `Expected safe ${code}, received ${caught?.code || 'no structured error'}`);
  return caught;
}
const record = (options) => parseGeminiGml(collection([feature(options)])).records[0];
const line = (options = {}) => feature({ type: 'VA_LINE', xyz: '579300 6559200 0 579600 6559500 0', ...options });
const box = (crs = 'EPSG:25832') => `<gml:boundedBy><gml:Envelope srsName="${crs}" srsDimension="2"><gml:lowerCorner>579300 6559200</gml:lowerCorner><gml:upperCorner>579900 6559800</gml:upperCorner></gml:Envelope></gml:boundedBy>`;

return [
  ['valid XML declarations match the native DOM contract while actual processing instructions stay unsafe', () => {
    for (const declaration of ['<?xml version="1.0"?>', '<?xml version="1.0" encoding="UTF-8"?>',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>']) {
      equal(parseGeminiGml(declaration + populatedXml), parseGeminiGml(populatedXml));
    }
    error('<?xml version="1.0"?><?xml-stylesheet href="https://blocked.invalid/style"?>' + populatedXml, 'unsafe-xml');
    for (const invalid of ['<?xml invalid?>', '<?xml version="1.0"?><?xml version="1.0"?>',
      '<!--before--><?xml version="1.0"?>']) error(invalid + populatedXml, 'invalid-xml');
  }],
  ['observed sole GML featureMembers array preserves the original profile source/display contract', () => {
    const xml = featureArrayCollection([partialZLine, independentPoint]);
    const parsed = parseGeminiGml(xml), original = parseGeminiGml(populatedXml);
    equal(parsed, original);
    equal(buildGeminiMapFeatures(parsed), buildGeminiMapFeatures(original));
    assert(Object.isFrozen(parsed.records) && parsed.records.every(Object.isFrozen));
    assert(xml === featureArrayCollection([partialZLine, independentPoint]));
  }],
  ['featureMembers array supports empty data and namespace prefix changes', () => {
    assert(parseGeminiGml(featureArrayCollection()).counts.records === 0);
    const changed = featureArrayCollection([feature({ prefix: 'va', gml: 'geo' })], { prefix: 'va', gml: 'geo', wfs: 'f' });
    equal(parseGeminiGml(changed), parseGeminiGml(featureArrayCollection([feature()])));
  }],
  ['featureMembers rejects mixed, repeated, nested and wrong-namespace wrappers', () => {
    const array = featureArrayCollection([feature()]);
    for (const xml of [
      array.replace('</wfs:FeatureCollection>', '<wfs:member/></wfs:FeatureCollection>'),
      array.replace('</wfs:FeatureCollection>', '<gml:featureMembers/></wfs:FeatureCollection>'),
      array.replace('</wfs:FeatureCollection>', box() + '</wfs:FeatureCollection>'),
      array.replaceAll('gml:featureMembers', 'gemini:featureMembers'),
      array.replaceAll('gml:featureMembers', 'gml:featureMember'),
      featureArrayCollection([collection([feature()])]),
      featureArrayCollection([`<wfs:member>${feature()}</wfs:member>`]),
    ]) error(xml, 'unsupported-profile');
  }],
  ['featureMembers rejects wrapper attributes, links, nil and structural text', () => {
    for (const attributes of ['xlink:href="https://blocked.invalid/features"', 'xsi:nil="true"', 'xsi:nil="false"',
      'id="unobserved"', 'xml:base="https://blocked.invalid/"', 'srsDimension="3"']) {
      error(featureArrayCollection([feature()]).replace('<gml:featureMembers>', `<gml:featureMembers ${attributes}>`), 'unsupported-profile');
    }
    for (const text of ['unexpected', '<![CDATA[unexpected]]>']) {
      error(featureArrayCollection([feature()]).replace('<gml:featureMembers>', '<gml:featureMembers>' + text), 'unsupported-profile');
    }
  }],
  ['featureMembers retains strict feature namespace/type, ID, geometry and exception checks', () => {
    error(featureArrayCollection([feature()], { ns: 'urn:unexpected' }), 'unsupported-profile');
    error(featureArrayCollection([feature({ type: 'OTHER' })]), 'unsupported-profile');
    error(featureArrayCollection([feature(), feature()]), 'duplicate-feature-id');
    error(featureArrayCollection([feature({ id: '' })]), 'invalid-feature-id');
    error(featureArrayCollection([feature({ geometry: '<gml:Polygon/>' })]), 'unsupported-geometry');
    error(featureArrayCollection(['<o:ExceptionReport xmlns:o="http://www.opengis.net/ows/1.1"/>']), 'service-exception');
    error(featureArrayCollection([feature({ fields: '<gemini:UNKNOWN><gemini:nested/></gemini:UNKNOWN>' })]), 'invalid-attributes');
  }],
  ['featureMembers obeys the same exact feature cap without truncating', () => {
    const values = Array.from({ length: GEMINI_GML_LIMITS.features }, (_, index) => feature({ id: `synthetic.${index}` }));
    assert(parseGeminiGml(featureArrayCollection(values)).counts.records === GEMINI_GML_LIMITS.features);
    error(featureArrayCollection([...values, feature({ id: 'synthetic.excess' })]), 'parser-limit');
  }],
  ['empty collection ignores numberReturned and accepts numberMatched unknown', () => {
    const result = parseGeminiGml(collection());
    equal(result.counts, { members: 0, records: 0, lines: 0, points: 0, coordinates: 0 });
    equal(buildGeminiMapFeatures(result), { type: 'FeatureCollection', features: [] });
  }],
  ['populated collection counts actual members with numberReturned zero', () => {
    const result = parseGeminiGml(populatedXml);
    equal(result.counts, { members: 2, records: 2, lines: 1, points: 1, coordinates: 6 });
    assert(result.featureNamespace === namespace && result.sourceCrs === 'EPSG:25832');
    assert(result.xmlAttributes.some((item) => item.name === 'numberReturned' && item.value === '0'));
  }],
  ['WFS/GML/Gemini prefixes can all change with identical source identity', () => {
    const changed = collection([feature({ prefix: 'va', gml: 'geo' })], { prefix: 'va', gml: 'geo', wfs: 'f' });
    const first = parseGeminiGml(collection([feature()])).records[0];
    const second = parseGeminiGml(changed).records[0];
    equal(first, second);
  }],
  ['default feature namespace is namespace-aware too', () => {
    const value = feature().replaceAll('gemini:', '').replace('<VA_MPNT', `<VA_MPNT xmlns="${namespace}"`);
    const result = parseGeminiGml(collection([value]));
    assert(result.records[0].typeName === 'gemini:VA_MPNT');
  }],
  ['wrong feature namespace, unknown feature type and wrong WFS/GML versions are rejected', () => {
    error(collection([feature()], { ns: 'urn:untrusted:feature' }), 'unsupported-profile');
    error(collection([feature({ type: 'OTHER' })]), 'unsupported-profile');
    error(collection().replace('wfs/2.0', 'wfs'), 'unsupported-profile');
    error(collection([feature()]).replaceAll('http://www.opengis.net/gml/3.2', 'http://www.opengis.net/gml'), 'invalid-feature-id');
    error(collection([], { attributes: 'version="1.1.0"' }), 'unsupported-profile');
  }],
  ['native DOMParser catches malformed XML, undeclared prefixes and XML syntax errors', () => {
    for (const value of ['<broken>', '<x:root/>', '<root><x></root>', '<root a="1" a="2"/>', 'not XML']) error(value, 'invalid-xml');
    error('<root/>', 'unsupported-profile');
  }],
  ['OWS exception versions are safe service errors with no provider text in exceptions', () => {
    for (const ns of ['http://www.opengis.net/ows', 'http://www.opengis.net/ows/1.1', 'http://www.opengis.net/ows/2.0']) {
      const caught = error(`<o:ExceptionReport xmlns:o="${ns}"><o:Exception><o:ExceptionText>PRIVATE_PROVIDER_DETAIL</o:ExceptionText></o:Exception></o:ExceptionReport>`, 'service-exception');
      assert(!String(caught).includes('PRIVATE_PROVIDER_DETAIL') && !JSON.stringify(caught).includes('PRIVATE_PROVIDER_DETAIL'));
    }
    error(collection(['<o:ExceptionReport xmlns:o="http://www.opengis.net/ows/1.1"/>']), 'service-exception');
  }],
  ['DOCTYPE, internal/external ENTITY and processing instructions are rejected', () => {
    for (const value of ['<!DOCTYPE x>' + collection(), '<!DOCTYPE x [<!ENTITY x "expanded">]>' + collection(),
      '<!DOCTYPE x SYSTEM "https://blocked.invalid/dtd">' + collection(), '<!ENTITY x "value">' + collection(),
      '<?xml-stylesheet href="https://blocked.invalid/style"?>' + collection()]) error(value, 'unsafe-xml');
  }],
  ['wrong member roots, nested collections, links, text and multiple features fail explicitly', () => {
    error(collection().replace('</wfs:FeatureCollection>', '<wfs:featureMember/></wfs:FeatureCollection>'), 'unsupported-profile');
    error(collection(['']), 'unsupported-profile');
    error(collection([feature() + feature({ id: 'VA_MPNT.002' })]), 'unsupported-profile');
    error(collection([collection()]), 'unsupported-profile');
    error(collection([feature()]).replace('<wfs:member>', '<wfs:member xlink:href="https://blocked.invalid/object">'), 'unsupported-profile');
    error(collection([feature()]).replace('<wfs:member>', '<wfs:member>unexpected'), 'unsupported-profile');
  }],
  ['XYZ lines preserve every full vertex, ordering and partial legacy Z without clipping', () => {
    const source = parseGeminiGml(collection([partialZLine])).records[0];
    equal(source.geometry.coordinates, [[579000, 6559000, 12.5], [579300, 6559200, 0],
      [579600, 6559500, 0], [579900, 6559800, 13.25], [580200, 6560000, 14]]);
    assert(source.geometry.dimension === 3 && source.geometry.encoding === 'posList');
    assert(source.geometry.coordinateText.startsWith('579000 6559000 12.5'));
  }],
  ['all-zero Z lines retain their intermediate vertices and zero ordinates', () => {
    const source = parseGeminiGml(collection([line({ xyz: '579300 6559200 0 579400 6559300 0 579500 6559400 0' })])).records[0];
    equal(source.geometry.coordinates, [[579300, 6559200, 0], [579400, 6559300, 0], [579500, 6559400, 0]]);
  }],
  ['explicit XY lines remain XY, not padded XYZ', () => {
    const source = parseGeminiGml(collection([line({ dimension: '2', xyz: '579300 6559200 579400 6559300 579500 6559400' })])).records[0];
    equal(source.geometry.coordinates, [[579300, 6559200], [579400, 6559300], [579500, 6559400]]);
  }],
  ['line dimension can inherit from the feature, collection or coordinate node', () => {
    for (const xml of [
      collection([line({ dimension: null, attributes: 'srsDimension="3"' })]),
      collection([line({ dimension: null })], { attributes: 'srsDimension="3"' }),
      collection([line({ dimension: null, positionAttributes: 'srsDimension="3"' })]),
    ]) assert(parseGeminiGml(xml).records[0].geometry.dimension === 3);
  }],
  ['undeclared posList dimensions are rejected rather than guessed from divisibility', () => {
    for (const xyz of ['1 2 3 4 5 6', '1 2 3 4', '1 2 3 4 5 6 7 8 9']) {
      error(collection([line({ dimension: null, xyz })]), 'ambiguous-dimension');
    }
  }],
  ['contradictory/unsupported dimensions and invalid counts fail safely', () => {
    error(collection([line({ positionAttributes: 'srsDimension="2"' })]), 'invalid-dimension');
    for (const dimension of ['1', '4', '3.0', '', 'NaN']) error(collection([line({ dimension })]), 'invalid-dimension');
    for (const xyz of ['1 2 3', '1 2 3 4 5', '1 2 3 4 5 6 7']) error(collection([line({ xyz })]), 'invalid-coordinates');
    error(collection([line({ positionAttributes: 'count="3"' })]), 'invalid-coordinates');
    assert(parseGeminiGml(collection([line({ positionAttributes: 'count="2"' })])).counts.coordinates === 2);
  }],
  ['invalid numeric lexemes never manufacture coordinates', () => {
    for (const xyz of ['', ' ', 'NaN 2 3', 'Infinity 2 3', '0x10 2 3', '1,2 3', '1e999 2 3', '1 a 3']) {
      error(collection([feature({ xyz })]), 'invalid-coordinates');
    }
    equal(record({ xyz: '+5.793e5 6559200.25 -0' }).geometry.coordinates, [579300, 6559200.25, 0]);
    assert(Object.is(record({ xyz: '579300 6559200 -0' }).geometry.coordinates[2], -0));
  }],
  ['unsupported Polygon/MultiCurve/repeated-pos/nil or linked geometry is not dropped', () => {
    for (const geometry of ['<gml:Polygon/>', '<gml:MultiCurve/>', '<gml:MultiLineString/>',
      '<gml:LineString srsName="EPSG:25832"><gml:pos>1 2</gml:pos><gml:pos>3 4</gml:pos></gml:LineString>']) {
      error(collection([line({ geometry })]), 'unsupported-geometry');
    }
    error(collection([feature()]).replace('<gemini:GEOMETRY>', '<gemini:GEOMETRY xsi:nil="true">'), 'unsupported-geometry');
    error(collection([feature()]).replace('<gemini:GEOMETRY>', '<gemini:GEOMETRY xlink:href="https://blocked.invalid/g">'), 'unsupported-geometry');
    error(collection([feature()]).replace('<gemini:GEOMETRY>', '<gemini:GEOMETRY/><gemini:GEOMETRY>'), 'unsupported-geometry');
  }],
  ['XY/XYZ points preserve arity with or without explicit dimension', () => {
    for (const dimension of ['2', null]) equal(record({ dimension, xyz: '579300 6559200' }).geometry.coordinates, [579300, 6559200]);
    for (const dimension of ['3', null]) equal(record({ dimension, xyz: '579300 6559200 15.5' }).geometry.coordinates, [579300, 6559200, 15.5]);
    error(collection([feature({ xyz: '1 2' })]), 'invalid-coordinates');
  }],
  ['geometry zero/nonzero and COVER_Z absent/nil/empty/zero/nonzero are independent', () => {
    const variants = [
      ['', 'absent', null], [field('COVER_Z', '', { attributes: 'xsi:nil="true"' }), 'nil', null],
      [field('COVER_Z'), 'empty', null], [field('COVER_Z', '0'), 'text', 0], [field('COVER_Z', '17.75'), 'text', 17.75],
    ];
    for (const xyz of ['579300 6559200', '579300 6559200 0', '579300 6559200 12.5']) {
      for (const [fields, state, value] of variants) {
        const source = record({ xyz, dimension: null, fields: field('PSID', '0002') + fields });
        equal(source.geometry.coordinates, xyz.split(' ').map(Number));
        assert(getGeminiField(source, 'COVER_Z').state === state);
        assert(getGeminiNumericValue(source, 'COVER_Z') === value);
      }
    }
  }],
  ['scalar states retain whitespace, raw numeric strings, Unicode, nil metadata and FunctionResults', () => {
    const source = record({ fields: field('PSID', '0002') + field('DIM', '160.00', { attributes: 'xsi:type="xsd:decimal"' }) +
      field('FCODE', '001') + field('TITLE', 'ÆØÅ – grøft') + field('EMPTY') + field('SPACE', '  ') +
      field('NIL', '', { attributes: 'xsi:nil="1"' }) + field('NOT_NIL', '0', { attributes: 'xsi:nil="false"' }) +
      [1, 2, 3, 4, 5].map((index) => field(`FunctionResult${index}`, `inert ${index}`)).join('') +
      field('UNEXPECTED', 'https://blocked.invalid/inert') + field('__proto__', 'safe scalar') });
    assert(source.objectId === '0002' && getGeminiField(source, 'FCODE').rawText === '001');
    assert(getGeminiNumericValue(source, 'DIM') === 160 && getGeminiField(source, 'DIM').rawText === '160.00');
    assert(getGeminiField(source, 'TITLE').rawText === 'ÆØÅ – grøft');
    assert(getGeminiField(source, 'EMPTY').state === 'empty' && getGeminiField(source, 'SPACE').rawText === '  ');
    assert(getGeminiField(source, 'NIL').state === 'nil' && getGeminiField(source, 'NOT_NIL').state === 'text');
    assert(getGeminiNumericValue(source, 'SPACE') === null && getGeminiNumericValue(source, 'NIL') === null);
    assert(getGeminiField(source, 'FunctionResult5').rawText === 'inert 5');
    assert(getGeminiField(source, '__proto__').rawText === 'safe scalar' && getGeminiField(source, 'constructor').state === 'absent');
    assert(getGeminiField(source, 'DIM').xmlAttributes[0].value === 'xsd:decimal');
  }],
  ['nil contradictions, duplicate fields and nested/foreign scalar structures are explicit failures', () => {
    for (const fields of [field('COVER_Z', '1', { attributes: 'xsi:nil="true"' }),
      field('COVER_Z', '', { attributes: 'xsi:nil="yes"' }), field('PSID', '1') + field('PSID', '2'),
      '<gemini:UNEXPECTED><gemini:VALUE>nested</gemini:VALUE></gemini:UNEXPECTED>', '<gml:name>foreign field</gml:name>']) {
      error(collection([feature({ fields })]), 'invalid-attributes');
    }
  }],
  ['numeric convenience accessor does not turn missing/empty/invalid text into zero', () => {
    for (const value of ['', ' ', 'abc', 'Infinity', '0x10', '1e999']) {
      const source = record({ fields: field('VALUE', value) });
      assert(getGeminiNumericValue(source, 'VALUE') === null && getGeminiNumericValue(source, 'ABSENT') === null);
    }
    for (const value of ['0', '-2.25', '1.6e2']) assert(getGeminiNumericValue(record({ fields: field('VALUE', value) }), 'VALUE') === Number(value));
  }],
  ['duplicate GML IDs and absent/blank feature IDs fail without overwrite', () => {
    error(collection([feature(), feature()]), 'duplicate-feature-id');
    error(collection([feature(), line({ id: 'VA_MPNT.001' })]), 'duplicate-feature-id');
    error(collection([feature()]).replace('gml:id="VA_MPNT.001"', ''), 'invalid-feature-id');
    error(collection([feature({ id: ' ' })]), 'invalid-feature-id');
  }],
  ['stable keys survive ordering and retain exact leading-zero identity', () => {
    const a = feature({ id: 'VA_MPNT.0001', fields: field('PSID', '0001') });
    const b = line({ id: 'VA_LINE.0001' });
    const first = parseGeminiGml(collection([a, b]));
    const second = parseGeminiGml(collection([b, a]));
    assert(first.records[0].key === second.records[1].key && first.records[0].key !== first.records[1].key);
    equal(JSON.parse(first.records[0].key), ['gemini-wfs', namespace, 'VA_MPNT', 'VA_MPNT.0001']);
  }],
  ['CRS equivalences normalize while raw declarations survive', () => {
    for (const crs of ['EPSG:25832', 'urn:ogc:def:crs:EPSG::25832', 'http://www.opengis.net/def/crs/EPSG/0/25832',
      'https://www.opengis.net/def/crs/EPSG/0/25832']) {
      const source = record({ crs });
      assert(source.sourceCrs === 'EPSG:25832' && source.geometry.crsDeclarations[0].value === crs);
    }
  }],
  ['missing local CRS inherits explicit ancestor or collection/feature envelope CRS', () => {
    for (const xml of [collection([feature({ crs: null })], { attributes: 'srsName="EPSG:25832"' }),
      collection([feature({ crs: null, attributes: 'srsName="EPSG:25832"' })]),
      collection([feature({ crs: null })], { before: box() }),
      collection([feature({ crs: null, before: box() })])]) {
      assert(parseGeminiGml(xml).records[0].sourceCrs === 'EPSG:25832');
    }
    // A sibling XY envelope supplies CRS, not an inherited geometry dimension.
    assert(parseGeminiGml(collection([feature()], { before: box() })).records[0].geometry.dimension === 3);
  }],
  ['missing, unsupported and contradictory CRS declarations never fall back', () => {
    error(collection([feature({ crs: null })]), 'missing-crs');
    for (const crs of ['EPSG:25833', 'EPSG:4326', 'EPSG:5972', 'invalid', '']) error(collection([feature({ crs })]), 'unsupported-crs');
    error(collection([feature({ positionAttributes: 'srsName="EPSG:25833"' })]), 'conflicting-crs');
    error(collection([feature({ crs: 'EPSG:25833' })], { attributes: 'srsName="EPSG:25832"' }), 'conflicting-crs');
    error(collection([feature()], { before: box('EPSG:25833') }), 'unsupported-crs');
  }],
  ['known WGS84 projection is strict XY and leaves immutable XYZ source evidence intact', () => {
    const parsed = parseGeminiGml(populatedXml);
    const before = JSON.stringify(parsed);
    const display = buildGeminiMapFeatures(parsed);
    const point = display.features[1].geometry.coordinates;
    assert(Math.abs(point[0] - 10.43555) < 1e-7 && Math.abs(point[1] - 59.2251222222) < 1e-7);
    assert(point.length === 2 && parsed.records[1].geometry.coordinates.length === 3);
    assert(display.features[0].geometry.coordinates.length === parsed.records[0].geometry.coordinates.length);
    assert(JSON.stringify(parsed) === before && Object.isFrozen(parsed.records[0].geometry.coordinates[1]));
    assert(display.features[1].properties.sourceKey === parsed.records[1].key);
    assert(Object.isFrozen(display.features[0].geometry.coordinates[0]));
    const xy = parseGeminiGml(collection([feature({ dimension: null, xyz: '581932.579311 6566001.891835' })]));
    equal(buildGeminiMapFeatures(xy).features[0].geometry.coordinates, point);
  }],
  ['projection exceptions/nonfinite/invalid geography never become identity fallback', () => {
    const parsed = parseGeminiGml(collection([feature()]));
    for (const project of [() => { throw new Error('PRIVATE_PROJECTOR_DETAIL'); }, () => [NaN, 2],
      () => [181, 59], () => [10, 91], () => [579300, 6559200], () => null, () => 3]) {
      let caught;
      try { buildGeminiMapFeatures(parsed, { project }); } catch (value) { caught = value; }
      assert(caught?.code === 'invalid-display-projection' && !String(caught).includes('PRIVATE_PROJECTOR_DETAIL'));
    }
    const before = JSON.stringify(parsed);
    buildGeminiMapFeatures(parsed, { project: (_from, _to, xy) => { xy[0] = 10; xy[1] = 59; return xy; } });
    assert(JSON.stringify(parsed) === before);
  }],
  ['schemaLocation and attribute URLs/HTML remain inert without network or execution', () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = () => { calls += 1; throw new Error('Unexpected parser fetch'); };
    globalThis.geminiParserExecuted = false;
    try {
      const parsed = parseGeminiGml(collection([feature({ fields: field('FunctionResult1',
        '<img src="https://blocked.invalid/a" onerror="globalThis.geminiParserExecuted=true">') })], {
        attributes: 'xsi:schemaLocation="http://www.powel.com/gemini https://blocked.invalid/schema.xsd"',
      }));
      assert(getGeminiField(parsed.records[0], 'FunctionResult1').rawText.startsWith('<img'));
      assert(calls === 0 && globalThis.geminiParserExecuted === false);
    } finally { globalThis.fetch = originalFetch; delete globalThis.geminiParserExecuted; }
  }],
  ['feature limit permits 2000 and rejects 2001 without partial results', () => {
    const features = Array.from({ length: GEMINI_GML_LIMITS.features }, (_, index) => feature({ id: `VA_MPNT.${index}` }));
    assert(parseGeminiGml(collection(features)).counts.records === 2000);
    error(collection([...features, feature({ id: 'VA_MPNT.extra' })]), 'parser-limit');
  }],
  ['coordinate limit permits 100000 and rejects per-line/aggregate excess without truncation', () => {
    const xyz = '579300 6559200 '.repeat(GEMINI_GML_LIMITS.coordinates);
    const parsed = parseGeminiGml(collection([line({ dimension: '2', xyz })]));
    assert(parsed.counts.coordinates === 100000 && parsed.records[0].geometry.coordinates.length === 100000);
    error(collection([line({ dimension: '2', xyz: xyz + '579300 6559200' })]), 'parser-limit');
    const half = '579300 6559200 '.repeat(50001);
    error(collection([line({ dimension: '2', xyz: half }), line({ id: 'VA_LINE.002', dimension: '2', xyz: half })]), 'parser-limit');
  }],
  ['byte, tree depth, node and attribute-field safety caps are explicit', () => {
    error('ø'.repeat(GEMINI_GML_LIMITS.bytes / 2 + 1), 'parser-limit');
    error('<a>'.repeat(20) + '</a>'.repeat(20), 'parser-limit');
    error(collection([], { before: '<!--x-->'.repeat(GEMINI_GML_LIMITS.nodes) }), 'parser-limit');
    const fields = Array.from({ length: 129 }, (_, index) => field(`F${index}`, 'x')).join('');
    error(collection([feature({ fields })]), 'parser-limit');
  }],
];
}

export const checks = createGeminiGmlChecks();
