import { TEST_CONNECTION } from '../fixtures/gemini-wfs/connection.mjs';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import MapInner from '../../src/components/MapInner';
import LayerManager from '../../src/components/LayerManager';
import useStore from '../../src/lib/store';
import { geminiSession } from '../../src/lib/gemini-wfs/geminiSession.mjs';
import { geminiPresentation } from '../../src/lib/gemini-wfs/geminiReferencePresentation.mjs';
import { photoSession } from '../../src/lib/photos/photoSession.mjs';
import { collection, partialZLine, independentPoint, feature } from '../fixtures/gemini-wfs/syntheticProfile.mjs';

// Only this local test entry can seed the real public session. Nothing is added
// to the production app/window; all requests below are mocked before mounting.
const audit = { requests: 0, map: null, mode: 'pair', photoOpened: 0, errors: [] };
globalThis.geminiAcceptance = { audit };
globalThis.addEventListener('error', (event) => audit.errors.push(event.message));
L.Map.addInitHook(function () { audit.map = this; });
globalThis.fetch = async (url, init) => {
  if (url !== '/api/gemini-wfs') throw new Error('Unexpected test request');
  audit.requests++;
  if (audit.mode === 'error') return Response.json({ code: 'upstream_failure' }, { status: 502 });
  const side = JSON.parse(init.body).featureType;
  if (audit.mode === 'pending') return new Promise(() => {});
  const bulk = ['representative', 'large'].includes(audit.mode);
  const size = audit.mode === 'large' ? 2000 : side === 'lines' ? 267 : 162;
  const members = bulk ? Array.from({ length: size }, (_, index) => feature({
    type: side === 'lines' ? 'VA_LINE' : 'VA_MPNT', id: `${side}.${index}`,
    xyz: side === 'lines'
      ? `${581900 + index % 30 * 3} ${6565990 + Math.floor(index / 30) * 3} 0 ${581905 + index % 30 * 3} ${6565995 + Math.floor(index / 30) * 3} 0`
      : `${581900 + index % 30 * 3} ${6565990 + Math.floor(index / 30) * 3} 0`,
  })) : audit.mode === 'empty' ? [] : side === 'lines'
    ? (audit.mode === 'point' ? [] : [partialZLine])
    : audit.mode === 'line' ? [] : audit.mode === 'replacement'
      ? [independentPoint, feature({ id: 'VA_MPNT.002', xyz: '581940 6566010 9' })] : [independentPoint];
  return new Response(collection(members), { headers: { 'Content-Type': 'application/gml+xml; charset=utf-8' } });
};
useStore.getState().resetAll();
const data = { format: 'GMI', header: { COSYS_EPSG: 25832 }, points: [
  { id: 'p', attributes: { S_FCODE: 'KUM' }, coordinates: [{ x: 581932.579311, y: 6566001.891835, z: 0 }] },
], lines: [{ id: 'l', attributes: { S_FCODE: 'VL' }, coordinates: [
  { x: 581900, y: 6565990, z: 0 }, { x: 581970, y: 6566020, z: 0 },
] }] };
useStore.setState({ data, layers: { survey: { id: 'survey', data, file: { name: 'Synthetic survey.gmi', format: 'GMI' }, visible: true,
  hiddenTypes: [], hiddenCodes: [], feltHiddenValues: [] } }, layerOrder: ['survey'],
  customWmsConfig: { url: 'https://reference.invalid/wms' },
  ui: { ...useStore.getState().ui, mapBaseLayer: 'Ingen', mapOverlayVisibility: { eiendomsgrenser: false, geminiWms: true } } });
const photoId = photoSession.importFiles([new File(['synthetic'], 'Synthetic photo.heic')]).acceptedIds[0];
const photoLayer = photoSession.createLayer();
photoSession.applyManualPlacement(photoSession.beginManualPlacement(photoLayer.id, photoId), { crs: 'EPSG:4326', longitude: 10.43555, latitude: 59.2251222222 });

function App() {
  return <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: '100vh' }}>
    <aside style={{ minHeight: 0 }}><LayerManager onAddFile={() => {}} onOpenPhotoLayer={() => {}} /></aside>
    <main style={{ minHeight: 0 }}><MapInner onOpenPhoto={() => { audit.photoOpened++; }} /></main>
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
globalThis.geminiAcceptance = {
  audit, useStore, geminiSession, geminiPresentation, photoSession,
  seed: async (mode = 'pair') => {
    audit.mode = mode;
    geminiSession.setConnection(TEST_CONNECTION);
    if (geminiSession.getSnapshot().connectionStatus !== 'connected') geminiSession.setCredentials({ username: crypto.randomUUID(), password: crypto.randomUUID() });
    return geminiSession.refresh('survey');
  },
  clear: () => geminiSession.clearResult(),
  reset: () => useStore.getState().resetAll(),
};
