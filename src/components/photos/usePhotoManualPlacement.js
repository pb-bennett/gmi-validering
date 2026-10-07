'use client';

import { useCallback, useEffect, useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { isPhotoPosition } from '@/lib/photos/photoSpatial.mjs';

export default function usePhotoManualPlacement() {
  const [transaction, setTransaction] = useState(null);
  const cancel = useCallback((restoreFocus = false) => {
    setTransaction((previous) => {
      photoSession.cancelManualPlacement(previous?.ticket);
      return null;
    });
    if (restoreFocus) requestAnimationFrame(() => document.querySelector('.photo-manual-start')?.focus());
  }, []);
  const ticket = transaction?.ticket;
  useEffect(() => {
    if (!ticket) return;
    const unsubscribe = photoSession.subscribe(() => {
      if (!photoSession.manualPlacementIsLive(ticket)) cancel();
    });
    const escape = (event) => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      event.preventDefault(); cancel(true);
    };
    document.addEventListener('keydown', escape);
    return () => { unsubscribe(); document.removeEventListener('keydown', escape); photoSession.cancelManualPlacement(ticket); };
  }, [ticket, cancel]);
  const begin = (layerId, photoId) => {
    cancel();
    const ticket = photoSession.beginManualPlacement(layerId, photoId);
    if (ticket) setTransaction({ ticket, position: null });
  };
  const propose = useCallback((position) => {
    if (!isPhotoPosition(position)) return;
    setTransaction((live) => live && photoSession.manualPlacementIsLive(live.ticket) ? { ...live, position } : null);
  }, []);
  const apply = () => {
    if (!transaction?.position) return;
    photoSession.applyManualPlacement(transaction.ticket, transaction.position);
    cancel(true);
  };
  return { transaction, begin, propose, apply, cancel };
}
