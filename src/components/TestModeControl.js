'use client';

import { useState } from 'react';
import useStore from '@/lib/store';
import { isTestModeEnabled } from '@/lib/telemetry/uploadTelemetry.mjs';
import { GearSixIcon } from '@phosphor-icons/react';
import DevDiagnosticsPanel from './DevDiagnosticsPanel';

export default function TestModeControl() {
  const testMode = useStore((state) => isTestModeEnabled(state.settings));
  const hydrated = useStore((state) => state.hydrated === true);
  const updateSettings = useStore((state) => state.updateSettings);
  const [developerToolsOpen, setDeveloperToolsOpen] = useState(false);

  if (!hydrated || !testMode) return null;

  return (
    <div className="relative flex w-max max-w-full flex-nowrap items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-950 shadow-sm">
      <span className="text-xs font-semibold" title="Testmodus er aktiv – opplastinger registreres ikke i bruksstatistikken.">
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
