import { classifyPhotoFile, createPhotoThumbnail } from './imagePreview.mjs';

export const EMPTY_PHOTO_SNAPSHOT = Object.freeze({
  photos: Object.freeze([]), selectedId: null, batchSelectedIds: Object.freeze([]),
  photoLayers: Object.freeze([]), lastImport: null,
});
let fallbackId = 0;

export function createPhotoSession({
  createThumbnail = createPhotoThumbnail,
  createId = () => globalThis.crypto?.randomUUID?.() || `photo-${Date.now()}-${++fallbackId}`,
  urls = globalThis.URL,
  yieldJob = () => new Promise((resolve) => setTimeout(resolve, 0)),
} = {}) {
  // Originals and browser resources deliberately live outside Zustand/React snapshots.
  const records = new Map();
  // Each asset has exactly one owner: the current import or one created FOTO layer.
  // Transfer changes membership, never copies the File or invalidates thumbnail work.
  const layers = new Map();
  let importIds = [];
  let batchSelectedIds = new Set();
  const listeners = new Set();
  let snapshot = EMPTY_PHOTO_SNAPSHOT;
  let selectedId = null;
  let lastImport = null;
  let generation = 0;
  let queue = [];
  let running = false;
  let activeJob = null;

  const publicPhoto = ({ file: _file, ...photo }) => Object.freeze(photo);

  const publish = () => {
    snapshot = Object.freeze({
      photos: Object.freeze(importIds.map((id) => publicPhoto(records.get(id)))),
      selectedId,
      batchSelectedIds: Object.freeze(importIds.filter((id) => batchSelectedIds.has(id))),
      photoLayers: Object.freeze(Array.from(layers.values()).reverse()),
      lastImport,
    });
    for (const listener of listeners) listener();
  };

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        await yieldJob();
        const job = queue.shift();
        if (!job || job.generation !== generation) continue;
        const record = records.get(job.id);
        if (!record) continue;
        const controller = new AbortController();
        activeJob = { id: job.id, controller };
        let thumbnailUrl = null;
        try {
          const result = await createThumbnail(record.file, { signal: controller.signal });
          if (job.generation !== generation || !records.has(job.id)) continue;
          thumbnailUrl = urls.createObjectURL(result.thumbnailBlob);
          if (record.preview.thumbnailUrl) urls.revokeObjectURL(record.preview.thumbnailUrl);
          records.set(job.id, {
            ...record,
            dimensions: Object.freeze(result.dimensions),
            preview: Object.freeze({ state: 'ready', thumbnailUrl, errorCode: null }),
          });
          thumbnailUrl = null; // Ownership transferred to the registry.
          publish();
        } catch (error) {
          if (job.generation === generation && records.has(job.id)) {
            records.set(job.id, {
              ...record,
              dimensions: error.dimensions ? Object.freeze(error.dimensions) : null,
              preview: Object.freeze({ state: 'error', thumbnailUrl: null, errorCode: error.code || 'decode-failed' }),
            });
            publish();
          }
        } finally {
          if (thumbnailUrl) urls.revokeObjectURL(thumbnailUrl);
          activeJob = null;
        }
      }
    } finally {
      running = false;
    }
  }

  function release(ids) {
    const removed = new Set(ids);
    queue = queue.filter((job) => !removed.has(job.id));
    if (removed.has(activeJob?.id)) activeJob.controller.abort();
    for (const id of removed) {
      const record = records.get(id);
      if (record?.preview.thumbnailUrl) urls.revokeObjectURL(record.preview.thumbnailUrl);
      records.delete(id);
    }
  }

  function clearImport() {
    release(importIds);
    importIds = [];
    batchSelectedIds.clear();
    selectedId = null;
    lastImport = null;
    publish();
  }

  return {
    getSnapshot: () => snapshot,
    getFile: (id) => records.get(id)?.file || null,
    getPhoto: (id) => records.has(id) ? publicPhoto(records.get(id)) : null,
    getLayerPhotos: (layerId) => (layers.get(layerId)?.photoIds || []).map((id) => publicPhoto(records.get(id))),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    importFiles(files) {
      const acceptedIds = [];
      const rejectedNames = [];
      for (const file of files) {
        const classification = classifyPhotoFile(file);
        if (!classification.candidate) { rejectedNames.push(file.name); continue; }
        const id = createId();
        const errorCode = !classification.supported ? 'unsupported-format' : !file.size ? 'empty-file' : null;
        records.set(id, {
          id, file, originalFilename: file.name, mimeType: file.type || null,
          size: file.size, lastModified: file.lastModified, importedAt: Date.now(), source: 'local-file',
          dimensions: null,
          preview: Object.freeze({ state: errorCode ? 'error' : 'pending', thumbnailUrl: null, errorCode }),
        });
        acceptedIds.push(id);
        importIds.push(id);
        if (!errorCode) queue.push({ id, generation });
      }
      if (!selectedId) selectedId = acceptedIds[0] || null;
      lastImport = Object.freeze({ acceptedCount: acceptedIds.length, rejectedNames: Object.freeze(rejectedNames) });
      publish();
      void drain();
      return { acceptedIds, rejectedNames };
    },
    select(id) {
      if (!importIds.includes(id) || id === selectedId) return;
      selectedId = id;
      publish();
    },
    toggleBatchSelection(id) {
      if (!importIds.includes(id)) return;
      if (batchSelectedIds.has(id)) batchSelectedIds.delete(id);
      else batchSelectedIds.add(id);
      publish();
    },
    selectAll() { batchSelectedIds = new Set(importIds); publish(); },
    clearSelection() { batchSelectedIds.clear(); publish(); },
    removeSelected() {
      const oldIndex = importIds.indexOf(selectedId);
      const removed = importIds.filter((id) => batchSelectedIds.has(id));
      importIds = importIds.filter((id) => !batchSelectedIds.has(id));
      release(removed);
      if (!importIds.includes(selectedId)) selectedId = importIds[Math.min(oldIndex, importIds.length - 1)] || null;
      batchSelectedIds.clear();
      publish();
    },
    beginImport: clearImport,
    cancelImport: clearImport,
    createLayer() {
      if (!importIds.length) return null;
      let suffix = 1;
      let name = 'Bilder';
      const names = new Set(Array.from(layers.values(), (layer) => layer.name));
      while (names.has(name)) name = `Bilder (${++suffix})`;
      const layer = Object.freeze({
        id: `photo-layer-${createId()}`, type: 'FOTO', name,
        photoIds: Object.freeze([...importIds]), photoCount: importIds.length,
        visible: true, createdAt: Date.now(),
      });
      layers.set(layer.id, layer);
      importIds = [];
      selectedId = null;
      batchSelectedIds.clear();
      lastImport = null;
      publish();
      return layer;
    },
    setLayerVisibility(id, visible) {
      const layer = layers.get(id);
      if (!layer || layer.visible === visible) return;
      layers.set(id, Object.freeze({ ...layer, visible }));
      publish();
    },
    setAllLayersVisible(visible) {
      for (const [id, layer] of layers) layers.set(id, Object.freeze({ ...layer, visible }));
      publish();
    },
    deleteLayer(id) {
      const layer = layers.get(id);
      if (!layer) return;
      layers.delete(id);
      release(layer.photoIds);
      publish();
    },
    clear() {
      generation++;
      release(Array.from(records.keys()));
      layers.clear();
      importIds = [];
      selectedId = null;
      batchSelectedIds.clear();
      lastImport = null;
      publish();
    },
  };
}

export const photoSession = createPhotoSession();
