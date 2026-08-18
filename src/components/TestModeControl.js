'use client';

import { useEffect } from 'react';
import useStore from '@/lib/store';
import { isTestModeEnabled } from '@/lib/telemetry/uploadTelemetry.mjs';
import { isTestModeActivation } from '@/lib/testModeActivation.mjs';

export default function TestModeControl() {
  const testMode = useStore((state) => isTestModeEnabled(state.settings));
  const hydrated = useStore((state) => state.hydrated === true);
  const updateSettings = useStore((state) => state.updateSettings);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (!isTestModeActivation(params)) return;

    updateSettings({ testMode: true });
    params.delete('testmodus');
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [hydrated, updateSettings]);

  if (!hydrated || !testMode) return null;

  return (
    <div
      className="fixed left-4 bottom-4 z-[10002] max-w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-amber-300 bg-amber-50/95 text-amber-950 shadow-lg backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="text-xs font-medium leading-5">
          Testmodus er aktiv – opplastinger registreres ikke i
          bruksstatistikken.
        </span>
        <button
          type="button"
          onClick={() => updateSettings({ testMode: false })}
          className="shrink-0 rounded-lg border border-amber-400 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          Slå av testmodus
        </button>
      </div>
    </div>
  );
}
