'use client';

import { useEffect, useState } from 'react';
import { gmiEditObjectDiagnostics } from '@/lib/gmiEditValidation.mjs';

// Only the selected object's effective values are evaluated. Rapid typing
// cancels pending work; stale diagnostics are hidden until the current draft
// has been checked. No proposed-file reparse or full Validator run occurs.
export default function useGmiObjectValidation(view, scope, sourceIndex, rows, drafts) {
  'use no memo';
  const [checked, setChecked] = useState(null);
  useEffect(() => {
    if (!view || !scope || !Number.isInteger(sourceIndex)) return undefined;
    const timer = setTimeout(() => {
      const result = gmiEditObjectDiagnostics({ view, scope, sourceIndex, rows, drafts });
      setChecked({ view, scope, sourceIndex, rows, drafts, result });
    }, 180);
    return () => clearTimeout(timer);
  }, [view, scope, sourceIndex, rows, drafts]);
  const current = checked && checked.view === view && checked.scope === scope && checked.sourceIndex === sourceIndex
    && checked.rows === rows && checked.drafts === drafts;
  return { findings: current ? checked.result.findings : [], pending: Boolean(view && scope && !current) };
}
