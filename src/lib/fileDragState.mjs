// Browsers report only MIME types while a file drag is in progress, never file names. The survey formats have
// no registered type (empty string on Windows), so only types that can never be a survey file are refused early.
const NOT_SURVEY_FILE = /^(image|video|audio)\/|^application\/pdf$/;

export const hasFileDrag = (event) => Array.from(event?.dataTransfer?.types || []).includes('Files');

export function surveyFileDragAccepted(dataTransfer) {
  const first = Array.from(dataTransfer?.items || []).find((item) => item.kind === 'file');
  // Routing imports only the first file; later eligible files must not make an image-first drag look accepted.
  return !first || !NOT_SURVEY_FILE.test(first.type || '');
}

// Names become available at drop time. Keep the existing text-file sniffing path, but refuse other extensions
// before the loader changes file/parsing state. Do not scan ahead for another survey file in a mixed selection.
export function surveyFileDropAccepted(dataTransfer) {
  const first = dataTransfer?.files?.[0];
  return Boolean(first && /\.(gmi|sos|sosi|kof|txt)$/i.test(first.name || ''));
}

// dragover repeats about every 350 ms while a drag is over the page, even with a still pointer.
export const FILE_DRAG_IDLE_MS = 1500;

// Nested elements send paired dragenter/dragleave events, so depth only reaches zero when the drag has really left.
// A missing dragleave (removed element, cancelled drag) would otherwise leave the drag active forever: without
// a dragover heartbeat the tracker resets itself.
export function createFileDragTracker({ onChange, idleMs = FILE_DRAG_IDLE_MS, schedule = setTimeout, cancel = clearTimeout }) {
  let depth = 0, active = false, timer = null;
  const set = (next) => { if (next !== active) { active = next; onChange(next); } };
  const reset = () => { depth = 0; cancel(timer); timer = null; set(false); };
  const heartbeat = () => { cancel(timer); timer = schedule(reset, idleMs); };
  return {
    enter() { depth += 1; set(true); heartbeat(); },
    over() { depth = Math.max(depth, 1); set(true); heartbeat(); },
    leave() { depth -= 1; if (depth <= 0) reset(); },
    reset,
  };
}
