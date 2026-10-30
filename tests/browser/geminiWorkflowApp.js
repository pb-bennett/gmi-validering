import { TEST_CONNECTION } from '../fixtures/gemini-wfs/connection.mjs';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import MapInner from '../../src/components/MapInner';
import LayerManager from '../../src/components/LayerManager';
import GeminiConnectionModal from '../../src/components/gemini-wfs/GeminiConnectionModal';
import GeminiConnectionButton from '../../src/components/gemini-wfs/GeminiConnectionButton';
import WmsLayerModal from '../../src/components/WmsLayerModal';
import LayerHighlightPanel from '../../src/components/LayerHighlightPanel';
import useStore from '../../src/lib/store';
import { readGeminiMapBbox } from '../../src/lib/gemini-wfs/geminiMapViewport.mjs';
import { classifyGeminiMapExtent } from '../../src/lib/gemini-wfs/geminiCoveragePolicy.mjs';
import { geminiSession } from '../../src/lib/gemini-wfs/geminiSession.mjs';
import { geminiPresentation } from '../../src/lib/gemini-wfs/geminiReferencePresentation.mjs';
import { photoSession } from '../../src/lib/photos/photoSession.mjs';
import { collection, feature, field, partialZLine, independentPoint } from '../fixtures/gemini-wfs/syntheticProfile.mjs';
import { popupLine, popupPoint, lineValues, pointValues } from '../fixtures/gemini-wfs/popupProfile.mjs';

const audit = { calls: [], mode: 'success', map: null, errors: [], leaked: false };
const credentials = []; // Synthetic values exist only inside this test closure.
let currentCredentials = null;
const waiting = [];
const containsCredential = (value) => credentials.some((item) => [item.username, item.password].some((secret) => String(value).includes(secret)));
for (const method of ['log', 'warn', 'error']) {
  const original = console[method].bind(console);
  console[method] = (...args) => {
    if (args.some((arg) => containsCredential(typeof arg === 'string' ? arg : JSON.stringify(arg)))) { audit.leaked = true; return; }
    original(...args);
  };
}
document.addEventListener('submit', (event) => {
  if (event.target.id !== 'gemini-va-connection-form') return;
  const values = new FormData(event.target);
  if (values.get('username') && values.get('password')) currentCredentials = { username: values.get('username'), password: values.get('password') };
}, true);
globalThis.addEventListener('error', (event) => audit.errors.push(event.message));
L.Map.addInitHook(function () { audit.map = this; });
function response(side, mode) {
  if (mode === 'compact') {
    const values = side === 'lines' ? { ...lineValues, FCODE: 'SP', FCODE_TITLE: 'Spillvannsledning', DIM: '250', YEAR: '2018' } :
      { ...pointValues, TYPE_TITLE: 'Kum for kommunalt fordelingsnett og inspeksjon' };
    Object.assign(values, { MATERIAL_TITLE: 'Polyvinylklorid', OWNER_TITLE: 'Kommunal', STATUS_TITLE: 'Drift' });
    return new Response(collection([feature({ type: side === 'lines' ? 'VA_LINE' : 'VA_MPNT',
      xyz: side === 'lines' ? '581900 6565940 12 581980 6565960 0' : '581970 6566030 0',
      fields: Object.entries(values).map(([name, value]) => field(name, value)).join(''),
    })]), { headers: { 'Content-Type': 'application/gml+xml' } });
  }
  const errors = { auth: [401, 'authentication_failed'], permission: [403, 'permission_denied'], origin: [403, 'origin_rejected'], timeout: [504, 'timeout'],
    error: [502, 'upstream_failure'], size: [502, 'response_too_large'] };
  if (errors[mode]) {
    const [status, code] = errors[mode]; return Response.json({ code, message: 'UNTRUSTED_PROVIDER_DETAIL' }, { status });
  }
  if (mode === 'parser') return new Response('<broken', { headers: { 'Content-Type': 'application/xml' } });
  const text = mode === 'inspection' ? collection([side === 'lines' ? popupLine : popupPoint]) : collection(side === 'lines' ? [partialZLine] : mode === 'display'
    ? [feature({ xyz: '1e100 1e100 0' })] : mode === 'replacement'
      ? [independentPoint, feature({ id: 'VA_MPNT.002', xyz: '581940 6566010 0' })] : [independentPoint]);
  return new Response(text, { headers: { 'Content-Type': mode === 'encoding' ? 'application/xml; charset=iso-8859-1' : 'application/gml+xml; charset=utf-8' } });
}
globalThis.fetch = async (url, init) => {
  if (url !== '/api/gemini-wfs') { audit.leaked ||= containsCredential(url); throw new Error('Unexpected test fetch'); }
  const body = JSON.parse(init.body), { featureType } = body;
  audit.calls.push({ url, featureType, bbox: body.bbox, keys: Object.keys(body).sort(),
    credentialsMatch: body.username === currentCredentials?.username && body.password === currentCredentials?.password,
    safeHeaders: !init.headers.Authorization && !init.headers.Cookie,
    sameOriginCredentials: init.credentials === 'same-origin' });
  if (audit.mode === 'pending') return new Promise((resolve) => waiting.push((mode) => resolve(response(featureType, mode))));
  return response(featureType, audit.mode);
};

const normalData = () => ({ format: 'GMI', header: { COSYS_EPSG: 25832 },
  points: [{ id: 'p', attributes: { S_FCODE: 'KUM' }, coordinates: [{ x: 581932.579311, y: 6566001.891835, z: 0 }] }],
  lines: [{ id: 'l', attributes: { S_FCODE: 'VL' }, coordinates: [{ x: 581900, y: 6565990, z: 0 }, { x: 581970, y: 6566020, z: 0 }] }] });
const layer = (id = 'survey', format = 'GMI') => ({ id, data: { ...normalData(), format }, file: { name: `${id}.${format.toLowerCase()}`, format }, visible: true,
  hiddenTypes: [], hiddenCodes: [], feltHiddenValues: [] });
useStore.getState().resetAll();
useStore.setState({ data: normalData(), layers: { survey: layer() }, layerOrder: ['survey'],
  customWmsConfig: { url: 'https://reference.invalid/wms' },
  ui: { ...useStore.getState().ui, mapBaseLayer: 'Ingen', mapOverlayVisibility: { eiendomsgrenser: false, geminiWms: true } } });
const photoId = photoSession.importFiles([new File(['synthetic'], 'Synthetic photo.heic')]).acceptedIds[0];
const photoLayer = photoSession.createLayer();
photoSession.applyManualPlacement(photoSession.beginManualPlacement(photoLayer.id, photoId), { crs: 'EPSG:4326', longitude: 10.43555, latitude: 59.2251222222 });

function App() {
  const [dialog, setDialog] = useState(null), [wmsOpen, setWmsOpen] = useState(false);
  const [mapMode, setMapMode] = useState({});
  useEffect(() => { audit.setMapMode = setMapMode; }, []);
  return <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: '100vh' }}>
    <aside style={{ minHeight: 0 }}><LayerManager onAddFile={() => {}} onOpenPhotoLayer={() => {}} onOpenGemini={(sourceLayerId) => setDialog({ sourceLayerId })} /></aside>
    <main style={{ minHeight: 0, position: 'relative' }}><MapInner {...mapMode} /><LayerHighlightPanel />
      <div style={{ position: 'absolute', bottom: 16, left: 112, zIndex: 1000, display: 'flex', gap: 4 }}>
        <GeminiConnectionButton onOpen={() => setDialog({})} /><button type="button" aria-label="Test WMS setup" onClick={() => setWmsOpen(true)}>WMS</button>
      </div>
    </main>
    {dialog && <GeminiConnectionModal initialSourceId={dialog.sourceLayerId} onClose={() => setDialog(null)} />}
    <WmsLayerModal isOpen={wmsOpen} onClose={() => setWmsOpen(false)} />
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
globalThis.geminiWorkflow = {
  audit, useStore, geminiSession, geminiPresentation, photoSession, readGeminiMapBbox, classifyGeminiMapExtent,
  fillCredentials: () => {
    if (!document.querySelector('#gemini-wfs-url').value) document.querySelector('#gemini-wfs-url').value = TEST_CONNECTION.url;
    if (!document.querySelector('#gemini-wfs-connection-name').value) document.querySelector('#gemini-wfs-connection-name').value = TEST_CONNECTION.name;
    const value = { username: crypto.randomUUID(), password: ` ${crypto.randomUUID()} ` };
    credentials.push(value);
    for (const [name, text] of Object.entries(value)) document.querySelector(`dialog input[name="${name}"]`).value = text;
  },
  release: (mode = 'success') => { audit.mode = mode; for (const resolve of waiting.splice(0)) resolve(mode); },
  privateStateClean: () => !audit.leaked && !containsCredential(JSON.stringify(geminiSession.getSnapshot())) &&
    !containsCredential(JSON.stringify(geminiPresentation.getSnapshot())) && !containsCredential(JSON.stringify(useStore.getState())) &&
    !containsCredential(JSON.stringify(Object.entries(localStorage))) && !containsCredential(JSON.stringify(Object.entries(sessionStorage))) &&
    !containsCredential(document.body.innerText) && !containsCredential(document.cookie),
  sources: (mode = 'single') => {
    const layers = mode === 'none' ? {} : mode === 'multiple' ? { survey: layer(), second: layer('second', 'SOSI'), third: layer('third', 'KOF') } : { survey: layer() };
    for (const [index, item] of Object.values(layers).entries()) {
      for (const feature of [...item.data.points, ...item.data.lines]) for (const coordinate of feature.coordinates) coordinate.x += index * 20000;
    }
    useStore.setState({ layers, layerOrder: Object.keys(layers) });
  },
  sourceVariant: (mode) => {
    const next = layer(); next.visible = false;
    if (mode === 'empty') { next.data.points = []; next.data.lines = []; }
    if (mode === 'crs') next.data.header.COSYS_EPSG = 9999;
    if (mode === 'large') next.data.points[0].coordinates.push({ x: 590000, y: 6566001 });
    useStore.setState({ layers: { survey: next }, layerOrder: ['survey'] });
  },
};
