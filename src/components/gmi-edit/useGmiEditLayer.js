'use client';

import { useEffect, useMemo, useState } from 'react';
import useStore from '@/lib/store';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';

/**
 * The editing state of one survey layer for the Rettinger UI.
 *
 * Driven only by the lightweight `state.gmiEditStatus[layerId]` that M3
 * publishes: every derived value (handle, document, change list, changed
 * cells) is recomputed once per published status object, i.e. once per
 * editing revision, never per render. Nothing here runs M1 verification or
 * the Validator; the proposed dataset is requested separately and only where
 * it is shown (Data Table modes, export).
 *
 * `autoOpen` opens the session when the layer's source is retained but not
 * yet loaded (entering Rettinger). An error state is not retried
 * automatically; `retry()` does that explicitly.
 */
export default function useGmiEditLayer(layerId, { autoOpen = false } = {}) {
  // Opted out of the React Compiler: it turns optional chains on nullable session views (`view?.x`)
  // into non-optional memo dependencies and crashes before a session exists. Derived values are
  // memoized explicitly per published editing revision instead.
  'use no memo';
  const status = useStore((state) => (layerId ? state.gmiEditStatus?.[layerId] : null)) || null;
  const layer = useStore((state) => (layerId ? state.layers[layerId] : null));
  const [opening, setOpening] = useState(null);   // { layerId, code } of the last explicit open

  // Unopened layers have no published status: describe() is cheap and reads no bytes.
  const descriptor = useMemo(() => {
    if (!layerId || !layer) return null;
    return status || gmiEditSessions.describe(layerId);
  }, [layerId, layer, status]);

  const shouldOpen = autoOpen && descriptor?.state === 'unloaded';
  useEffect(() => {
    if (!shouldOpen) return undefined;
    let cancelled = false;
    void gmiEditSessions.open(layerId).then((result) => {
      if (!cancelled) setOpening({ layerId, code: result.ok ? null : result.code });
    });
    return () => { cancelled = true; };
  }, [shouldOpen, layerId]);

  const view = useMemo(() => {
    if (status === null) return null;
    if (status.state !== 'editable' && status.state !== 'read-only') return null;
    const handle = gmiEditSessions.getHandle(layerId);
    if (!handle || handle.sessionId !== status.sessionId) return null;
    const resolved = gmiEditSessions.resolve(handle);
    const inspected = gmiEditSessions.inspect(handle);
    if (!resolved.ok || !inspected.ok) return null;
    const effective = new Map([...inspected.cells.changed, ...inspected.cells.reverted].map((cell) => [cell.key, cell]));
    return Object.freeze({
      handle,
      document: resolved.document,
      session: resolved.session,
      summary: inspected.summary,
      changeSets: inspected.changeSets,
      redo: resolved.session.redo,
      changedCells: inspected.cells.changed,
      effective,
    });
    // `status` identity is the editing revision.
  }, [layerId, status]);

  const retry = () => {
    if (!layerId) return;
    void gmiEditSessions.open(layerId).then((result) => setOpening({ layerId, code: result.ok ? null : result.code }));
  };

  return {
    layer,
    status,
    descriptor,
    view,
    openError: opening?.layerId === layerId ? opening.code : null,
    retry,
  };
}
