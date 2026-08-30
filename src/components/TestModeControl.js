'use client';

import { useEffect, useState } from 'react';
import useStore from '@/lib/store';
import { isTestModeEnabled } from '@/lib/telemetry/uploadTelemetry.mjs';
import { isTestModeActivation } from '@/lib/testModeActivation.mjs';
import { GearSixIcon } from '@phosphor-icons/react';
import DevDiagnosticsPanel from './DevDiagnosticsPanel';

export function TestModeActivation() {
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

  return null;
}

export default function TestModeControl() {
  const testMode = useStore((state) => isTestModeEnabled(state.settings));
  const hydrated = useStore((state) => state.hydrated === true);
  const updateSettings = useStore((state) => state.updateSettings);
  const [developerToolsOpen, setDeveloperToolsOpen] = useState(false);

  if (!hydrated || !testMode) return null;

  return (
    <div className="relative flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-950 shadow-sm">
      <span
        className="text-xs font-semibold"
        title="Testmodus er aktiv – opplastinger registreres ikke i bruksstatistikken."
      >
        Testmodus
      </span>
      <button
        type="button"
        onClick={() => setDeveloperToolsOpen((open) => !open)}
        aria-expanded={developerToolsOpen}
        className="flex shrink-0 items-center gap-1 rounded border border-amber-400 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600"
      >
        <GearSixIcon aria-hidden="true" size={13} weight="bold" />
        Utviklerverktøy
      </button>
      <span className="sr-only">
        Testmodus er aktiv – opplastinger registreres ikke i bruksstatistikken.
      </span>
      <button
        type="button"
        onClick={() => updateSettings({ testMode: false })}
        aria-label="Slå av testmodus"
        className="shrink-0 rounded border border-amber-400 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600"
      >
        Slå av testmodus
      </button>
      <DevDiagnosticsPanel isOpen={developerToolsOpen} />
    </div>
  );
}
