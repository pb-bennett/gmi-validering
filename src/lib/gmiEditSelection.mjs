// UI state only. Identity deliberately excludes editing revision/stateKey:
// stage/undo/redo change the proposed copy, not source object identity.
export function gmiSelectionBinding(layerId, status) {
  return status?.state === 'editable' && status.sessionId && status.fingerprint
    ? { layerId, sessionId: status.sessionId, fingerprint: status.fingerprint } : null;
}
export const sameGmiSelectionBinding = (a, b) => Boolean(a && b && a.layerId === b.layerId && a.sessionId === b.sessionId && a.fingerprint === b.fingerprint);
export const gmiSelectionKey = (scope, index) => `${scope}:${index}`;

// Missing hosts belong to Rettinger, including the existing R5 handoff.
export const GMI_RETTINGER_SELECTION_HOST = Object.freeze({ kind: 'rettinger' });
export function sameGmiSelectionHost(a = GMI_RETTINGER_SELECTION_HOST, b = GMI_RETTINGER_SELECTION_HOST) {
  return Boolean(a && b && a.kind === b.kind && (a.kind === 'rettinger'
    || (a.kind === 'inspection' && typeof a.key === 'string' && a.key.length > 0 && a.key === b.key)));
}

export function gmiSelectionHostIsActive(host = GMI_RETTINGER_SELECTION_HOST, layerId, { workspaceLayerId, inspection }) {
  if (host?.kind === 'rettinger') return workspaceLayerId === layerId;
  return host?.kind === 'inspection' && inspection?.layerId === layerId
    && sameGmiSelectionHost(host, { kind: 'inspection', key: inspection.selectionContext?.key });
}

function validKey(key, scope, counts, allowedKeys) {
  const match = /^(line|point):(0|[1-9]\d*)$/.exec(key);
  return Boolean(match && match[1] === scope && Number(match[2]) < (counts[scope] || 0) && (!allowedKeys || allowedKeys.has(key)));
}

export function reconcileGmiEditSelection(selection, { workspaceLayerId, inspection, layers, statuses }) {
  if (!selection) return null;
  const id = selection.binding.layerId;
  if (!gmiSelectionHostIsActive(selection.host, id, { workspaceLayerId, inspection })
    || !layers[id] || !sameGmiSelectionBinding(selection.binding, gmiSelectionBinding(id, statuses[id]))) return null;
  if (selection.host?.kind === 'inspection' && selection.scope !== inspection.geometryScope) return null;
  const counts = { line: layers[id].data?.lines?.length, point: layers[id].data?.points?.length };
  const allowedKeys = selection.host?.kind === 'inspection' && inspection.scopeIndices
    ? new Set(inspection.scopeIndices.map((index) => gmiSelectionKey(inspection.geometryScope, index))) : null;
  const keys = selection.keys.filter((key) => validKey(key, selection.scope, counts, allowedKeys));
  return keys.length === selection.keys.length ? selection : keys.length ? { ...selection, keys, anchor: null } : null;
}

/** Explicit snapshot actions. Filters/search/sorting/focus are not actions here. */
export function reduceGmiEditSelection(selection, action, { binding, counts, host = GMI_RETTINGER_SELECTION_HOST, allowedKeys }) {
  if (!binding || !sameGmiSelectionHost(host, host)) return null;
  const current = sameGmiSelectionBinding(selection?.binding, binding) && sameGmiSelectionHost(selection?.host, host) ? selection : null;
  const restricted = current?.origin?.kind === 'validator';
  if (action.type === 'make-ordinary') return current ? { ...current, origin: null } : null;
  if (action.type === 'clear') return restricted ? { ...current, keys: [], anchor: null } : null;
  if (action.type === 'show-only') return current ? { ...current, showOnly: Boolean(action.value) } : null;
  const scope = action.scope;
  if (!['point', 'line'].includes(scope)) return current;
  if (restricted && scope !== current.scope) return current;
  if (current?.keys.length && current.scope !== scope && !action.replace) return current;
  const base = current?.scope === scope ? current : { binding, host: Object.freeze({ ...host }), scope, keys: [], anchor: null, showOnly: false };
  const clean = (keys) => [...new Set((keys || []).filter((key) => validKey(key, scope, counts, allowedKeys)))];
  let keys = new Set(base.keys), anchor = base.anchor;
  if (action.type === 'toggle' && validKey(action.key, scope, counts, allowedKeys)) {
    if (keys.has(action.key)) keys.delete(action.key); else keys.add(action.key);
    anchor = action.key;
  } else if (action.type === 'range' && validKey(action.key, scope, counts, allowedKeys)) {
    const ordered = clean(action.orderedKeys);
    const start = ordered.indexOf(base.anchor), end = ordered.indexOf(action.key);
    const range = start < 0 || end < 0 ? [action.key] : ordered.slice(Math.min(start, end), Math.max(start, end) + 1);
    for (const key of range) { if (action.checked === false) keys.delete(key); else keys.add(key); }
    anchor = start < 0 ? action.key : base.anchor;
  } else if (action.type === 'add' || action.type === 'remove') {
    for (const key of clean(action.keys)) { if (action.type === 'add') keys.add(key); else keys.delete(key); }
  } else return current;
  // Every membership entry point (including replace/range/select-all) is shrink-only.
  if (restricted && [...keys].some((key) => !base.keys.includes(key))) return current;
  return keys.size || restricted ? { ...base, keys: [...keys], anchor } : null;
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
