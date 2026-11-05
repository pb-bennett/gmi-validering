// Map inspection shows photos larger than the session thumbnail was made for. Display previews are derived from
// the original on demand, one at a time, and kept in a small cache; nothing is processed per layer.
// 800 px covers the 340 px popup and 220 px hover preview up to a device pixel ratio of about 2.3.
export const DISPLAY_PREVIEW_MAX_EDGE = 800;
export const DISPLAY_PREVIEW_JPEG_QUALITY = 0.85;
export const DISPLAY_PREVIEW_CACHE_SIZE = 24;

export function createDisplayPreviewCache({ createPreview, urls = globalThis.URL, maxEntries = DISPLAY_PREVIEW_CACHE_SIZE }) {
  // Insertion order is recency: the first entry is the least recently requested.
  const ready = new Map();
  const jobs = new Map();
  let pending = [];
  let running = false;

  const settle = (job, url) => {
    jobs.delete(job.id);
    pending = pending.filter((item) => item !== job);
    for (const resolve of job.waiters) resolve(url);
    job.waiters.clear();
  };
  const cancel = (job) => { job.controller.abort(); settle(job, null); };
  const store = (id, url) => {
    ready.set(id, url);
    while (ready.size > maxEntries) {
      const [oldest, oldestUrl] = ready.entries().next().value;
      ready.delete(oldest);
      urls.revokeObjectURL(oldestUrl);
    }
  };

  async function pump() {
    if (running) return;
    running = true;
    try {
      // Newest first: after rapid hovering the photo under the pointer is not stuck behind earlier ones.
      while (pending.length) {
        const job = pending.pop();
        try {
          const { thumbnailBlob } = await createPreview(job.file, { signal: job.controller.signal });
          if (job.controller.signal.aborted) continue;
          const url = urls.createObjectURL(thumbnailBlob);
          store(job.id, url);
          settle(job, url);
        } catch {
          // The caller keeps showing the thumbnail; a later request may try again.
          if (jobs.get(job.id) === job) settle(job, null);
        }
      }
    } finally { running = false; }
  }

  return {
    request(id, file, { signal } = {}) {
      if (signal?.aborted || !file) return Promise.resolve(null);
      const cached = ready.get(id);
      if (cached) { ready.delete(id); ready.set(id, cached); return Promise.resolve(cached); }
      let job = jobs.get(id);
      if (!job) {
        job = { id, file, controller: new AbortController(), waiters: new Set() };
        jobs.set(id, job);
        pending.push(job);
      }
      const current = job;
      const result = new Promise((resolve) => {
        current.waiters.add(resolve);
        signal?.addEventListener('abort', () => {
          current.waiters.delete(resolve);
          resolve(null);
          // A preview nobody is waiting for any more is not worth decoding.
          if (!current.waiters.size && jobs.get(id) === current) cancel(current);
        }, { once: true });
      });
      void pump();
      return result;
    },
    drop(id) {
      const job = jobs.get(id);
      if (job) cancel(job);
      const url = ready.get(id);
      if (url) { ready.delete(id); urls.revokeObjectURL(url); }
    },
    size: () => ready.size,
  };
}
