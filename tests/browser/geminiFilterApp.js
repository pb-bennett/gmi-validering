import { TEST_CONNECTION } from '../fixtures/gemini-wfs/connection.mjs';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import MapInner from '../../src/components/MapInner';
import LayerManager from '../../src/components/LayerManager';
import useStore from '../../src/lib/store';
import { geminiSession } from '../../src/lib/gemini-wfs/geminiSession.mjs';
import { geminiPresentation } from '../../src/lib/gemini-wfs/geminiReferencePresentation.mjs';
import { collection, feature, field } from '../fixtures/gemini-wfs/syntheticProfile.mjs';

// Synthetic service only; every request is mocked before mounting.
const audit = { requests: 0, map: null, mode: 'mixed', errors: [] };
globalThis.addEventListener('error', (event) => audit.errors.push(event.message));
L.Map.addInitHook(function () { audit.map = this; });
const item = (side, id, xyz, values) => feature({ type: side === 'lines' ? 'VA_LINE' : 'VA_MPNT', id: `${side}.${id}`, xyz,
  fields: Object.entries(values).map(([name, value]) => field(name, value)).join('') });
const line = (id, y, values) => item('lines', id, `581900 ${y} 0 581980 ${y} 0`, values);
const common = { OWNER_TITLE: 'Kommunal', STATUS_TITLE: 'Drift' };
const DATA = {
  mixed: { lines: [
    line('vl', 6566000, { ...common, FCODE_TITLE: 'Vannledning', MATERIAL_TITLE: 'PE', DIM: '160.00' }),
    line('ov', 6565980, { ...common, FCODE_TITLE: 'Overvannsledning', MATERIAL_TITLE: 'PVC', DIM: '200' }),
    line('old', 6565960, { ...common, STATUS_TITLE: 'Nedlagt', FCODE_TITLE: 'Vannledning', MATERIAL_TITLE: 'PVC', DIM: '110' }),
    line('none', 6565940, { OWNER_TITLE: 'Privat (bygningseier)', FCODE_TITLE: 'Spillvannsledning' }),
  ], points: [
    item('points', 'kum', '581930 6566020 0', { ...common, FCODE_TITLE: 'Kum' }),
    item('points', 'gone', '581960 6566020 0', { ...common, STATUS_TITLE: 'Fjernet', FCODE_TITLE: 'Kum' }),
  ] },
  area: { lines: [line('new', 6565920, { ...common, FCODE_TITLE: 'Drensledning', MATERIAL_TITLE: 'Betong', DIM: '300' })], points: [] },
  removed: { lines: [line('old', 6565960, { ...common, STATUS_TITLE: 'Fjernet' })], points: [] },
  unknown: { lines: [line('odd', 6565960, { STATUS_TITLE: 'I drift' })], points: [] },
};
const large = (side) => Array.from({ length: 2000 }, (_, i) => {
  const x = 581900 + i % 50 * 3, y = 6565900 + Math.floor(i / 50) * 3;
  return item(side, i, side === 'lines' ? `${x} ${y} 0 ${x + 2} ${y + 2} 0` : `${x} ${y} 0`,
    { ...common, STATUS_TITLE: i % 2 ? 'Nedlagt' : 'Drift', MATERIAL_TITLE: `Materiale ${i % 12}`, DIM: String(i % 40 * 10) });
});
globalThis.fetch = async (url, init) => {
  if (url !== '/api/gemini-wfs') throw new Error('Unexpected test request');
  audit.requests += 1;
  if (audit.mode === 'error') return Response.json({ code: 'upstream_failure' }, { status: 502 });
  const side = JSON.parse(init.body).featureType;
  return new Response(collection(audit.mode === 'large' ? large(side) : DATA[audit.mode][side]), { headers: { 'Content-Type': 'application/gml+xml; charset=utf-8' } });
};
useStore.getState().resetAll();
useStore.setState({ ui: { ...useStore.getState().ui, mapBaseLayer: 'Ingen', mapOverlayVisibility: { eiendomsgrenser: false, geminiWms: true } } });
const data = { format: 'GMI', header: { COSYS_EPSG: 25832 }, points: [], lines: [{ id: 'l', attributes: { S_FCODE: 'VL' },
  coordinates: [{ x: 581900, y: 6566060, z: 0 }, { x: 581980, y: 6566060, z: 0 }] }] };
useStore.setState({ data, layers: { survey: { id: 'survey', data, file: { name: 'Synthetic survey.gmi', format: 'GMI' }, visible: true,
  hiddenTypes: [], hiddenCodes: [], feltHiddenValues: [] } }, layerOrder: ['survey'] });

createRoot(document.getElementById('root')).render(<div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100vh' }}>
  <aside style={{ minHeight: 0 }}><LayerManager onAddFile={() => {}} onOpenGemini={() => {}} /></aside>
  <main style={{ minHeight: 0 }}><MapInner /></main>
</div>);
globalThis.geminiFilter = {
  audit, useStore, geminiSession, geminiPresentation,
  connect: async (mode = 'mixed', resource = 'va-basis') => {
    audit.mode = mode;
    geminiSession.setConnection({ ...TEST_CONNECTION, url: TEST_CONNECTION.url.replace('va-basis', resource) });
    if (geminiSession.getSnapshot().connectionStatus !== 'connected') geminiSession.setCredentials({ username: crypto.randomUUID(), password: crypto.randomUUID() });
    return (await geminiSession.refresh()).ok;
  },
  area: async () => { audit.mode = 'area'; return (await geminiSession.fetchMap([581850, 6565850, 581950, 6565950])).ok; },
};
