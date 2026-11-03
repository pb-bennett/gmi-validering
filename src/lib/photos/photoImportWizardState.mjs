export const initialImportState = (context) => ({ step: 'photos', placement: { kind: context.kind === 'gmi-layer' ? 'gmi' : 'none', exifFallback: false }, includeUnreferenced: true });
export function importSteps(context, placement) {
  return context.kind === 'gmi-layer' ? ['photos', 'review'] : ['photos', 'placement', ...(placement.kind === 'none' ? [] : ['review'])];
}
export function importWizardReducer(state, action) {
  if (action.type === 'step') return { ...state, step: action.step };
  if (action.type === 'placement') return { ...state, placement: { ...state.placement, ...action.placement } };
  if (action.type === 'include') return { ...state, includeUnreferenced: action.value };
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
    if (!count && !snapshot.loadedImport) reason = 'Ingen nye bilder legges til.';
  }
  return { ok: !reason, reason };
}
