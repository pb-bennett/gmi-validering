'use client';

import { MapTrifoldIcon, CubeIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';

export default function TabSwitcher({ compact = false }) {
  const activeViewTab = useStore((state) => state.ui.activeViewTab);
  const setActiveViewTab = useStore((state) => state.setActiveViewTab);
  const viewer3DOpen = useStore((state) => state.ui.viewer3DOpen);
  const data = useStore((state) => state.data);

  return (
    <div className="flex w-max max-w-full flex-nowrap items-center gap-0.5 rounded-lg border border-gmi-border bg-gmi-surface/95 p-0.5 shadow-sm backdrop-blur-sm empty:hidden">
      {viewer3DOpen && data && (
        <>
          <button
            type="button"
            onClick={() => setActiveViewTab('map')}
            aria-label="Kartoversikt"
            aria-pressed={activeViewTab === 'map'}
            title="Kartoversikt"
            className={`gmi-compact-button gmi-focus-ring flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
              activeViewTab === 'map'
                ? 'gmi-selected-control shadow-sm'
                : 'bg-transparent text-gmi-text-muted hover:bg-gmi-surface-soft hover:text-gmi-navy'
            }`}
          >
            <MapTrifoldIcon size={14} weight="regular" aria-hidden="true" />
            {compact ? 'Kart' : 'Kartoversikt'}
          </button>
          <button
            type="button"
            onClick={() => setActiveViewTab('3d')}
            aria-label="3D-visning"
            aria-pressed={activeViewTab === '3d'}
            title="3D-visning"
            className={`gmi-compact-button gmi-focus-ring flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
              activeViewTab === '3d'
                ? 'gmi-selected-control shadow-sm'
                : 'bg-transparent text-gmi-text-muted hover:bg-gmi-surface-soft hover:text-gmi-navy'
            }`}
          >
            <CubeIcon size={14} weight="regular" aria-hidden="true" />
            {compact ? '3D' : '3D-visning'}
          </button>
        </>
      )}
    </div>
  );
}
