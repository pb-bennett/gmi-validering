import { TEST_CONNECTION } from '../fixtures/gemini-wfs/connection.mjs';
import { createGeminiClient, decodeGeminiXml } from '../../src/lib/gemini-wfs/geminiClient.mjs';
import { createGeminiSession } from '../../src/lib/gemini-wfs/geminiSession.mjs';
import { parseGeminiGml, getGeminiField } from '../../src/lib/gemini-wfs/parseGeminiGml.mjs';
import { buildGeminiMapFeatures } from '../../src/lib/gemini-wfs/geminiMapFeatures.mjs';
import { collection, partialZLine, independentPoint, feature } from '../fixtures/gemini-wfs/syntheticProfile.mjs';

const assert = (condition, message = 'Gemini service assertion failed') => { if (!condition) throw new Error(message); };
const equal = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected));
const credentials = () => ({ username: crypto.randomUUID(), password: ` ${crypto.randomUUID()} ` });
const bbox = [579200, 6559100, 579400, 6559300];
const layer = () => ({ file: { format: 'GMI' }, data: { format: 'GMI', header: { COSYS_EPSG: 25832 },
  points: [{ coordinates: [{ x: 579300, y: 6559200, z: 0 }] }], lines: [] } });
const xml = (text, contentType = 'application/xml') => new Response(new TextEncoder().encode(text), { headers: { 'Content-Type': contentType } });
function transport({ empty = false } = {}) {
  const calls = [];
  const fetchProxy = async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body, init });
    return xml(collection(empty ? [] : [body.featureType === 'lines' ? partialZLine : independentPoint]), 'application/gml+xml; charset=UTF-8');
  };
  return { calls, fetchProxy };
}
async function rejects(work, expected) {
  let caught; try { await work(); } catch (error) { caught = error; }
  assert(caught?.code === expected, `Expected safe ${expected}, received ${caught?.code || 'no structured error'}`);
}

export const checks = [
  ['native same-origin session passes a deployment gate; omit is rejected before M1', async () => {
    const denied = await fetch('/api/gemini-wfs', {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    equal(denied.status, 401);
    await denied.body.cancel();
    const pair = await createGeminiClient()({ connection: TEST_CONNECTION, bbox, credentials: credentials() });
    equal(pair.counts, { lines: 1, points: 1, total: 2 });
  }],
  ['native decoder + native DOMParser + proj4 create one coherent source/display pair', async () => {
    const { calls, fetchProxy } = transport();
    const account = credentials();
    const pair = await createGeminiClient({ fetchProxy })({ connection: TEST_CONNECTION, bbox, credentials: account });
    assert(calls.length === 2 && calls.every((call) => call.url === '/api/gemini-wfs'));
    equal(pair.counts, { lines: 1, points: 1, total: 2 });
    const source = pair.lines.source.records[0];
    equal(source.geometry.coordinates.map((tuple) => tuple[2]), [12.5, 0, 0, 13.25, 14]);
    assert(source.geometry.coordinates.length === 5);
    assert(source.sourceCrs === 'EPSG:25832');
    const point = pair.points.source.records[0];
    assert(point.geometry.coordinates[2] === 0);
    assert(getGeminiField(point, 'COVER_Z').rawText === '17.75');
    const projected = pair.points.display.features[0].geometry.coordinates;
    assert(projected.length === 2 && Math.abs(projected[0] - 10.43555) < 1e-7 && Math.abs(projected[1] - 59.2251222222) < 1e-7);
    assert(getGeminiField(point, 'TYPE_TITLE').rawText === 'Kum ÆØÅ');
    assert(!JSON.stringify(pair).includes(account.password));
  }],
  ['actual browser decoding supports UTF8/ASCII and rejects alternate or invalid byte encodings', async () => {
    equal(decodeGeminiXml(new TextEncoder().encode('<a>ÆØÅ</a>'), 'text/xml; charset=utf8'), '<a>ÆØÅ</a>');
    equal(decodeGeminiXml(new TextEncoder().encode('<a/>'), 'application/xml; charset=us-ascii'), '<a/>');
    await rejects(() => decodeGeminiXml(new Uint8Array([0xe9]), 'application/xml; charset=us-ascii'), 'unsupported_response_encoding');
    await rejects(() => decodeGeminiXml(new Uint8Array([0xff]), 'application/xml'), 'unsupported_response_encoding');
    await rejects(() => decodeGeminiXml(new Uint8Array(), 'application/xml; charset=windows-1252'), 'unsupported_response_encoding');
  }],
  ['empty native-parsed collections publish valid zero-count pairs', async () => {
    const { fetchProxy } = transport({ empty: true });
    const pair = await createGeminiClient({ fetchProxy })({ connection: TEST_CONNECTION, bbox, credentials: credentials() });
    equal(pair.counts, { lines: 0, points: 0, total: 0 });
    equal(pair.lines.display.features, []); equal(pair.points.display.features, []);
  }],
  ['service + session publish atomically, release XML and preserve prior result on native parser failure', async () => {
    const { calls, fetchProxy } = transport(); let broken = false;
    const sourceLayer = layer();
    const client = createGeminiClient({ fetchProxy: (url, init) => broken && JSON.parse(init.body).featureType === 'points'
      ? xml('<broken') : fetchProxy(url, init) });
    const session = createGeminiSession({ getLayer: () => sourceLayer, requestPair: client });
    const account = credentials(); session.setConnection(TEST_CONNECTION); session.setCredentials(account);
    const snapshots = []; session.subscribe(() => snapshots.push(session.getSnapshot()));
    assert((await session.fetch('survey')).ok);
    const good = session.getSnapshot().result;
    assert(calls.length === 2 && good.provenance.bufferMetres === 100);
    broken = true; const outcome = await session.refresh('survey');
    assert(!outcome.ok && outcome.error.code === 'gml_parser_error');
    assert(outcome.error.parserCode === 'invalid-xml');
    assert(session.getSnapshot().result === good && session.getSnapshot().result.fetchedAt === good.fetchedAt);
    assert(snapshots.every((entry) => entry.result === null || entry.result === good));
    assert(!JSON.stringify(snapshots).includes('FeatureCollection xmlns'));
    assert(!JSON.stringify(snapshots).includes(account.username)); session.dispose();
  }],
  ['native display projection failure cannot publish a half-pair', async () => {
    const { fetchProxy } = transport();
    const client = createGeminiClient({ fetchProxy, buildDisplay: (parsed) => buildGeminiMapFeatures(parsed, { project: () => [NaN, 59] }) });
    const sourceLayer = layer();
    const session = createGeminiSession({ getLayer: () => sourceLayer, requestPair: client });
    session.setConnection(TEST_CONNECTION); session.setCredentials(credentials());
    assert((await session.fetch('survey')).error.code === 'display_projection_error');
    assert(session.getSnapshot().result === null); session.dispose();
  }],
  ['one proxy-side failure cannot publish new data or replace the previous complete pair', async () => {
    const { fetchProxy } = transport(); let fail = false;
    const client = createGeminiClient({ fetchProxy: (url, init) => fail && JSON.parse(init.body).featureType === 'points'
      ? Response.json({ code: 'permission_denied', message: 'synthetic provider detail' }, { status: 403 }) : fetchProxy(url, init) });
    const sourceLayer = layer();
    const session = createGeminiSession({ getLayer: () => sourceLayer, requestPair: client });
    session.setConnection(TEST_CONNECTION); session.setCredentials(credentials());
    assert((await session.fetch('survey')).ok); const good = session.getSnapshot().result;
    fail = true;
    assert((await session.refresh('survey')).error.code === 'permission_denied');
    assert(session.getSnapshot().result === good); session.dispose();
  }],
  ['browser cancellation ignores late replies and reset clears private access', async () => {
    const releases = [], sourceLayer = layer();
    const client = createGeminiClient({ fetchProxy: () => new Promise((resolve) => releases.push(resolve)) });
    const session = createGeminiSession({ getLayer: () => sourceLayer, requestPair: client });
    session.setConnection(TEST_CONNECTION); session.setCredentials(credentials()); const pending = session.fetch('survey');
    await Promise.resolve(); assert(releases.length === 2);
    session.reset(); for (const release of releases) release(xml(collection()));
    assert((await pending).error.code === 'request_aborted');
    assert(session.getSnapshot().result === null);
    assert((await session.fetch('survey')).error.code === 'credentials_unavailable'); session.dispose();
  }],
  ['both real adapter stages execute once for each response, retaining XY source points', async () => {
    const counts = { parse: 0, display: 0 };
    const client = createGeminiClient({
      fetchProxy: async (_url, init) => xml(collection(JSON.parse(init.body).featureType === 'lines' ? [] : [feature({ dimension: '2', xyz: '579300 6559200' })])),
      parseGml: (text) => { counts.parse++; return parseGeminiGml(text); },
      buildDisplay: (source) => { counts.display++; return buildGeminiMapFeatures(source); },
    });
    const pair = await client({ connection: TEST_CONNECTION, bbox, credentials: credentials() });
    equal(counts, { parse: 2, display: 2 });
    equal(pair.points.source.records[0].geometry.coordinates, [579300, 6559200]);
  }],
];
