// Roadmap D: what a reload, tab close or reset would lose. Nothing here is persisted (store.js keeps only settings and
// UI preferences), so every loaded file counts (DD1); validator results and preferences are re-derived and do not.
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * One consolidated answer for every guard. Inputs are counts from their existing owners:
 * survey layers (store), FOTO layers (photo session), import-draft photos, staged changes in the positioning wizard,
 * unsaved Edit-mode photo changes, and GMI layers with corrections not downloaded (gmiEditSessions).
 */
export function sessionLossState({ surveyLayers = 0, photoLayers = [], importPhotos = 0, wizardChanges = 0, photoEdits = 0, rettingerLayers = 0 } = {}) {
  const photos = photoLayers.reduce((sum, layer) => sum + (layer.assetCount ?? layer.photoCount ?? 0), 0);
  const items = [
    surveyLayers > 0 && { key: 'survey', text: plural(surveyLayers, 'kartlag', 'kartlag') },
    photoLayers.length > 0 && { key: 'photo', text: `${plural(photoLayers.length, 'fotolag', 'fotolag')} med ${plural(photos, 'bilde', 'bilder')}` },
    importPhotos > 0 && { key: 'import', text: `${plural(importPhotos, 'bilde', 'bilder')} som ikke er lagt til ennå` },
    wizardChanges > 0 && { key: 'wizard', text: 'endringer i kildekontrollen som ikke er lagret' },
    photoEdits > 0 && { key: 'photo-edits', text: plural(photoEdits, 'ulagret bildeendring', 'ulagrede bildeendringer') },
    rettingerLayers > 0 && { key: 'rettinger', text: `ikke nedlastede rettinger i ${plural(rettingerLayers, 'lag', 'lag')}` },
  ].filter(Boolean).map((item) => Object.freeze(item));
  return Object.freeze({ meaningful: items.length > 0, items: Object.freeze(items), summary: items.map((item) => item.text).join(' · ') });
}

/**
 * The native browser warning on reload and tab close, attached only while the session is meaningful, so an empty
 * session keeps normal unload (and bfcache) behaviour. One listener; `update(meaningful)` attaches or detaches it.
 * The browser shows its own text. The Rettinger guards keep their own listener and stronger rules.
 */
export function createSessionLossGuard(target) {
  let attached = false, meaningful = false;
  const listener = (event) => {
    if (!meaningful) return undefined;
    event.preventDefault();
    event.returnValue = ''; // legacy browsers need a value to show the prompt
    return '';
  };
  return {
    get attached() { return attached; },
    listener,
    update(next) {
      meaningful = Boolean(next);
      if (!target?.addEventListener) return;
      if (meaningful && !attached) { target.addEventListener('beforeunload', listener); attached = true; }
      else if (!meaningful && attached) { target.removeEventListener('beforeunload', listener); attached = false; }
    },
    dispose() { if (attached) target.removeEventListener('beforeunload', listener); attached = false; meaningful = false; },
  };
}
