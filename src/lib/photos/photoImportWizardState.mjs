// GML capture-time choices (M3) belong to one draft GML source: `sourceId` ties them to it, so another source starts
// again from the unchecked defaults while navigation keeps them.
export const EMPTY_IMPORT_GML_CAPTURE = Object.freeze({ sourceId: null, complete: false, partial: false, conflicts: 'keep' });
export const importGmlCaptureDecision = (state, sourceId) => sourceId && state.gmlCaptureTime?.sourceId === sourceId ? state.gmlCaptureTime
  : Object.freeze({ ...EMPTY_IMPORT_GML_CAPTURE, sourceId: sourceId || null });
export const initialImportState = (context) => ({ step: 'photos', placement: { kind: context.kind === 'gmi-layer' ? 'gmi' : 'none', exifFallback: false }, includeUnreferenced: true,
  captureSuggestions: Object.freeze({ complete: false, dateOnly: false }), gmlCaptureTime: EMPTY_IMPORT_GML_CAPTURE });
export function importSteps(context, placement) {
  return context.kind === 'gmi-layer' ? ['photos', 'review'] : ['photos', 'placement', ...(placement.kind === 'none' ? [] : ['review'])];
}
export function canNavigateBack(context, state, step) {
  const steps = importSteps(context, state.placement);
  const index = steps.indexOf(step);
  return index >= 0 && index < steps.indexOf(state.step);
}
export function importWizardReducer(state, action) {
  if (action.type === 'back') return canNavigateBack(action.context, state, action.step) ? { ...state, step: action.step } : state;
  if (action.type === 'step') return { ...state, step: action.step };
  if (action.type === 'placement') return { ...state, placement: { ...state.placement, ...action.placement } };
  if (action.type === 'include') return { ...state, includeUnreferenced: action.value };
  // Filename capture-time choices are independent of steps and placement, so back navigation keeps them.
  if (action.type === 'captureSuggestions') return { ...state, captureSuggestions: Object.freeze({ ...state.captureSuggestions, ...action.value }) };
  if (action.type === 'gmlCaptureTime') return { ...state, gmlCaptureTime: Object.freeze({ ...importGmlCaptureDecision(state, action.sourceId), ...action.value, sourceId: action.sourceId }) };
  return state;
}
export function canAdvance(step, snapshot, state) {
  const count = snapshot.appendStatus?.appendableIds.length ?? snapshot.photos.length;
  let reason = !count && (!snapshot.draftTargetLayerId || !snapshot.loadedImport) ? 'Velg minst ett bilde.' : '';
  if (step !== 'photos') {
    const source = state.placement.kind === 'gmi' ? snapshot.loadedImport : state.placement.kind === 'gml' ? snapshot.positioning : null;
    if (source && source.state !== 'ready') reason = source.state === 'pending' ? 'Leser kildefilen …' : 'Velg en tilgjengelig kilde.';
    if (['gmi', 'gml'].includes(state.placement.kind) && !source) reason = 'Velg en kildefil.';
    if (state.placement.kind !== 'none' && snapshot.photos.some((photo) => photo.spatial.exifRead.state === 'pending')) reason = 'Leser GPS fra bildene …';
    if ((state.captureSuggestions?.complete || state.captureSuggestions?.dateOnly) && snapshot.photos.some((photo) => photo.spatial.exifRead.state === 'pending')) reason = 'Leser opptakstid fra bildene …';
    if (!count && !snapshot.loadedImport) reason = 'Ingen nye bilder legges til.';
  }
  return { ok: !reason, reason };
}
