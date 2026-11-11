'use client';

import { useEffect, useRef, useState } from 'react';
import useStore from '@/lib/store';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { dryRunGmiFieldBatch } from '@/lib/gmiFieldBatchPlan.mjs';

/** Validate the exact memoized candidate; cleanup revokes every older result. */
export default function useGmiBatchValidation(view, candidate, referenceDate) {
  'use no memo';
  const [state, setState] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const cancelRef = useRef(null);
  useEffect(() => {
    if (!candidate?.ok || !candidate.changeSet.cells.length) return undefined;
    let live = true, phase = 0;
    cancelRef.current = () => { live = false; setState({ candidate, status: 'cancelled' }); };
    const isLive = () => live && gmiEditSessions.getSession(view.handle).session === view.session;
    setState({ candidate, status: 'running', phase: 0 });
    dryRunGmiFieldBatch(view.session, candidate, {
      referenceDate, getReferenceDate: () => useStore.getState().gmiValidatorReferenceDate, isLive,
      yieldWork: async () => {
        if (live) setState({ candidate, status: 'running', phase: ++phase });
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    }).then((batch) => {
      if (live) setState({ candidate, status: batch.ok ? 'ready' : 'failed', batch, phase });
    }).catch(() => { if (live) setState({ candidate, status: 'failed' }); });
    return () => { live = false; };
  }, [view.session, view.handle, candidate, referenceDate, attempt]);
  return { state: state?.candidate === candidate ? state : null,
    cancel: () => cancelRef.current?.(), retry: () => setAttempt((value) => value + 1) };
}
