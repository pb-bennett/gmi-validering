/** Shared local clipboard lifecycle for React cells and DOM-based Leaflet popups. */
export function createFilenameCopyAction(filename, onStatus, {
  writeText = (text) => globalThis.navigator.clipboard.writeText(text),
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  let timer;
  let disposed = false;
  let pending = false;
  return {
    async copy(event) {
      event?.stopPropagation();
      if (disposed || pending) return;
      pending = true;
      cancel(timer);
      onStatus('pending');
      try {
        await writeText(filename);
        if (!disposed) onStatus('copied');
      } catch {
        if (!disposed) onStatus('error');
      } finally {
        pending = false;
        if (!disposed) timer = schedule(() => onStatus('idle'), 1400);
      }
    },
    dispose() {
      disposed = true;
      cancel(timer);
    },
  };
}

export function filenameCopyFeedback(status) {
  return status === 'copied' ? 'Kopiert' : status === 'error' ? 'Ikke kopiert' : '';
}
