'use client';

import { useMemo } from 'react';
import useStore from '@/lib/store';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { photoHyperlinkTransferPresentation, photoHyperlinkTransferViews } from '@/lib/photos/photoHyperlinkTransferScope.mjs';

/**
 * Batch 1B.2B: the active Rettinger hyperlink transfers of every FOTO layer, as Map<layerId, { transfers, presentation }>
 * (layers without one are absent). Recomputed on every FOTO publication (`photoLayers` is a new array each time) and on
 * every Rettinger publication (`gmiEditStatus`: commit, undo, redo, discard), so all FOTO surfaces refresh together.
 */
export default function usePhotoHyperlinkTransfers(photoLayers) {
  const statuses = useStore((state) => state.gmiEditStatus);
  return useMemo(() => {
    void statuses;   // the Rettinger publication signal; the views are read from the registry itself
    const out = new Map();
    for (const layer of photoLayers) {
      const transfers = photoHyperlinkTransferViews({ registry: gmiEditSessions, photoSession, photoLayerId: layer.id });
      if (transfers) out.set(layer.id, Object.freeze({ transfers, presentation: photoHyperlinkTransferPresentation(transfers, layer) }));
    }
    return out;
  }, [photoLayers, statuses]);
}
