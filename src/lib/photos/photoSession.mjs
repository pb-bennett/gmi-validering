import { classifyPhotoFile, createPhotoThumbnail } from './imagePreview.mjs';

export const EMPTY_PHOTO_SNAPSHOT = Object.freeze({ photos: Object.freeze([]), selectedId: null, lastImport: null });
let fallbackId = 0;

export function createPhotoSession({
  createThumbnail = createPhotoThumbnail,
  createId = () => globalThis.crypto?.randomUUID?.() || `photo-${Date.now()}-${++fallbackId}`,
  urls = globalThis.URL,
  yieldJob = () => new Promise((resolve) => setTimeout(resolve, 0)),
} = {}) {
  // Originals and browser resources deliberately live outside Zustand/React snapshots.
  const records = new Map();
  const listeners = new Set();
  let snapshot = EMPTY_PHOTO_SNAPSHOT;
  let selectedId = null;
  let lastImport = null;
  let generation = 0;
  let queue = [];
  let running = false;
  let activeController = null;

  const publish = () => {
    snapshot = Object.freeze({
      photos: Object.freeze(Array.from(records.values(), ({ file: _file, ...photo }) => Object.freeze(photo))),
      selectedId,
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
        activeController = controller;
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
          activeController = null;
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    getSnapshot: () => snapshot,
    getFile: (id) => records.get(id)?.file || null,
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
        if (!errorCode) queue.push({ id, generation });
      }
      if (!selectedId) selectedId = acceptedIds[0] || null;
      lastImport = Object.freeze({ acceptedCount: acceptedIds.length, rejectedNames: Object.freeze(rejectedNames) });
      publish();
      void drain();
      return { acceptedIds, rejectedNames };
    },
    select(id) {
      if (!records.has(id) || id === selectedId) return;
      selectedId = id;
      publish();
    },
    clear() {
      generation++;
      queue = [];
      activeController?.abort();
      for (const record of records.values()) {
        if (record.preview.thumbnailUrl) urls.revokeObjectURL(record.preview.thumbnailUrl);
      }
      records.clear();
      selectedId = null;
      lastImport = null;
      publish();
    },
  };
}

export const photoSession = createPhotoSession();
