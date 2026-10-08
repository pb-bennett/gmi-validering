'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { normalizePhotoDirection } from '@/lib/photos/photoDirection.mjs';

export default function usePhotoDirectionEdit() {
  const [transaction, setTransaction] = useState(null);
  const transactionRef = useRef(null);
  const cancel = useCallback((restoreFocus = false) => {
    photoSession.cancelDirectionEdit(transactionRef.current?.ticket);
    transactionRef.current = null;
    setTransaction(null);
    if (restoreFocus) requestAnimationFrame(() => document.querySelector('.photo-direction-start')?.focus());
  }, []);
  const ticket = transaction?.ticket;
  useEffect(() => {
    if (!ticket) return;
    const unsubscribe = photoSession.subscribe(() => {
      if (!photoSession.directionEditIsLive(ticket)) cancel();
    });
    const escape = (event) => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      event.preventDefault(); cancel(true);
    };
    document.addEventListener('keydown', escape);
    return () => { unsubscribe(); document.removeEventListener('keydown', escape); photoSession.cancelDirectionEdit(ticket); };
  }, [ticket, cancel]);
  const begin = (layerId, photoId) => {
    cancel();
    const ticket = photoSession.beginDirectionEdit(layerId, photoId);
    if (!ticket) return;
    const next = { ticket, degrees: ticket.expectedCurrent?.degrees ?? 0 };
    transactionRef.current = next;
    setTransaction(next);
  };
  const propose = (degrees) => {
    const live = transactionRef.current;
    if (!live || !photoSession.directionEditIsLive(live.ticket)) { cancel(); return; }
    const next = { ...live, degrees: normalizePhotoDirection(degrees) };
    transactionRef.current = next;
    setTransaction(next);
  };
  const apply = () => {
    const live = transactionRef.current;
    if (!live || live.degrees === null) return;
    photoSession.applyDirectionEdit(live.ticket, live.degrees);
    cancel(true);
  };
  return { transaction, begin, propose, apply, cancel };
}
