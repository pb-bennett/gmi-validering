import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { readGeminiConnection, saveGeminiConnection, GEMINI_CONNECTION_STORAGE_KEY } from '../src/lib/gemini-wfs/geminiConnection.mjs';
import { parseGeminiGml } from '../src/lib/gemini-wfs/parseGeminiGml.mjs';
import { parseNodeXml } from '../src/lib/gemini-wfs/nodeXmlParser.mjs';
import { TEST_CONNECTION } from './fixtures/gemini-wfs/connection.mjs';
import { collection, partialZLine } from './fixtures/gemini-wfs/syntheticProfile.mjs';
register('./esmJsLoader.mjs', import.meta.url);
const { createGeminiSession } = await import('../src/lib/gemini-wfs/geminiSession.mjs');

test('connection persistence whitelists only ID, name and URL and restores edits', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readGeminiConnection(storage), null);
  assert.equal(saveGeminiConnection({ ...TEST_CONNECTION, username: 'not-saved', password: 'never-save-this' }, storage), true);
  assert.deepEqual(readGeminiConnection(storage), TEST_CONNECTION);
  const raw = JSON.parse(values.get(GEMINI_CONNECTION_STORAGE_KEY));
  assert.deepEqual(Object.keys(raw).sort(), ['id', 'name', 'url']);
  assert.equal([...values.values()].some((value) => /never-save-this|not-saved|password/.test(value)), false);
  const edited = { ...TEST_CONNECTION, id: 'new-local-id', name: 'Changed', url: TEST_CONNECTION.url.replace('tenant.', 'another.') };
  saveGeminiConnection(edited, storage);
  assert.deepEqual(readGeminiConnection(storage), edited);
  values.set(GEMINI_CONNECTION_STORAGE_KEY, '{invalid'); assert.equal(readGeminiConnection(storage), null);
  values.set(GEMINI_CONNECTION_STORAGE_KEY, JSON.stringify({ ...edited, url: 'https://localhost/private' }));
  assert.equal(readGeminiConnection(storage), null);
});

test('unavailable browser storage does not prevent an in-memory connection', () => {
  const storage = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } };
  assert.equal(readGeminiConnection(storage), null);
  assert.equal(saveGeminiConnection(TEST_CONNECTION, storage), false);
});

test('changing connection cancels old work, releases credentials/results, and scopes future requests', async () => {
  const calls = []; let release;
  const empty = { lines: { source: { records: [] }, display: { features: [] } },
    points: { source: { records: [] }, display: { features: [] } }, counts: { lines: 0, points: 0, total: 0 } };
  const layer = { file: { format: 'GMI' }, data: { format: 'GMI', header: { COSYS_EPSG: 25832 }, points: [{ coordinates: [{ x: 579300, y: 6559200 }] }], lines: [] } };
  const session = createGeminiSession({ getLayers: () => ({ survey: layer }), requestPair: (args) => {
    calls.push(args); return calls.length === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve(empty);
  } });
  session.setConnection(TEST_CONNECTION); session.setCredentials({ username: 'invented', password: 'invented' });
  const old = session.fetch('survey'); await new Promise((resolve) => setImmediate(resolve));
  const next = { ...TEST_CONNECTION, id: 'new-id', url: TEST_CONNECTION.url.replace('tenant.', 'another.') };
  session.setConnection(next);
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(session.getSnapshot().result, null);
  assert.equal(session.getSnapshot().connectionStatus, 'disconnected');
  release(empty); assert.equal((await old).error.code, 'request_aborted');
  assert.equal((await session.fetch('survey')).error.code, 'credentials_unavailable');
  session.setCredentials({ username: 'invented-new', password: 'invented-new' });
  assert.equal((await session.fetch('survey')).ok, true);
  assert.deepEqual(calls[1].connection, next);
  assert.equal(session.getSnapshot().result.provenance.connectionId, next.id);
  const result = session.getSnapshot().result;
  session.setConnection({ ...next, name: 'Renamed' });
  assert.equal(session.getSnapshot().result, result); // A display-name edit is not a new destination.
  session.disconnect();
  assert.equal(session.getSnapshot().result, null);
  assert.deepEqual(session.getSnapshot().connection, { ...next, name: 'Renamed' });
  session.dispose();
});

test('same GML ID has connection-scoped source identity without changing parser safeguards', () => {
  const xml = collection([partialZLine]);
  const first = parseGeminiGml(xml, { parseXml: parseNodeXml, connectionId: 'local-a' });
  const second = parseGeminiGml(xml, { parseXml: parseNodeXml, connectionId: 'local-b' });
  assert.notEqual(first.records[0].key, second.records[0].key);
  assert.equal(second.connectionId, 'local-b');
  assert.deepEqual(first.records[0].geometry, second.records[0].geometry);
});
