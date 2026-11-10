// UI state only. Identity deliberately excludes editing revision/stateKey:
// stage/undo/redo change the proposed copy, not source object identity.
export function gmiSelectionBinding(layerId, status) {
  return status?.state === 'editable' && status.sessionId && status.fingerprint
    ? { layerId, sessionId: status.sessionId, fingerprint: status.fingerprint } : null;
}
export const sameGmiSelectionBinding = (a, b) => Boolean(a && b && a.layerId === b.layerId && a.sessionId === b.sessionId && a.fingerprint === b.fingerprint);
export const gmiSelectionKey = (scope, index) => `${scope}:${index}`;

function validKey(key, scope, counts) {
  const match = /^(line|point):(0|[1-9]\d*)$/.exec(key);
  return Boolean(match && match[1] === scope && Number(match[2]) < (counts[scope] || 0));
}

export function reconcileGmiEditSelection(selection, { workspaceLayerId, layers, statuses }) {
  if (!selection) return null;
  const id = selection.binding.layerId;
  if (workspaceLayerId !== id || !layers[id] || !sameGmiSelectionBinding(selection.binding, gmiSelectionBinding(id, statuses[id]))) return null;
  const counts = { line: layers[id].data?.lines?.length, point: layers[id].data?.points?.length };
  const keys = selection.keys.filter((key) => validKey(key, selection.scope, counts));
  return keys.length === selection.keys.length ? selection : keys.length ? { ...selection, keys, anchor: null } : null;
}

/** Explicit snapshot actions. Filters/search/sorting/focus are not actions here. */
export function reduceGmiEditSelection(selection, action, { binding, counts }) {
  if (!binding) return null;
  const current = sameGmiSelectionBinding(selection?.binding, binding) ? selection : null;
  if (action.type === 'clear') return null;
  if (action.type === 'show-only') return current ? { ...current, showOnly: Boolean(action.value) } : null;
  const scope = action.scope;
  if (!['point', 'line'].includes(scope)) return current;
  if (current?.keys.length && current.scope !== scope && !action.replace) return current;
  const base = current?.scope === scope ? current : { binding, scope, keys: [], anchor: null, showOnly: false };
  const clean = (keys) => [...new Set((keys || []).filter((key) => validKey(key, scope, counts)))];
  let keys = new Set(base.keys), anchor = base.anchor;
  if (action.type === 'toggle' && validKey(action.key, scope, counts)) {
    if (keys.has(action.key)) keys.delete(action.key); else keys.add(action.key);
    anchor = action.key;
  } else if (action.type === 'range' && validKey(action.key, scope, counts)) {
    const ordered = clean(action.orderedKeys);
    const start = ordered.indexOf(base.anchor), end = ordered.indexOf(action.key);
    const range = start < 0 || end < 0 ? [action.key] : ordered.slice(Math.min(start, end), Math.max(start, end) + 1);
    for (const key of range) { if (action.checked === false) keys.delete(key); else keys.add(key); }
    anchor = start < 0 ? action.key : base.anchor;
  } else if (action.type === 'add' || action.type === 'remove') {
    for (const key of clean(action.keys)) { if (action.type === 'add') keys.add(key); else keys.delete(key); }
  } else return current;
  return keys.size ? { ...base, keys: [...keys], anchor } : null;
}

export function gmiSelectionCounts(selection, scope, visibleKeys) {
  const visible = new Set(visibleKeys);
  const selectedVisible = selection?.scope === scope ? selection.keys.filter((key) => visible.has(key)).length : 0;
  const total = selection?.keys.length || 0;
  return { total, visible: selectedVisible, hidden: total - selectedVisible,
    checked: visible.size > 0 && selectedVisible === visible.size,
    indeterminate: selectedVisible > 0 && selectedVisible < visible.size };
}

export function gmiSelectedFeatureIds(selection, workspaceLayerId) {
  if (!selection || selection.binding.layerId !== workspaceLayerId) return new Set();
  return new Set(selection.keys.map((key) => `${key.startsWith('line:') ? 'ledninger' : 'punkter'}-${workspaceLayerId}-${key.split(':')[1]}`));
}
