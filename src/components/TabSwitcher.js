'use client';

import useStore from '@/lib/store';
import TestModeControl from './TestModeControl';

export default function TabSwitcher() {
  const activeViewTab = useStore((state) => state.ui.activeViewTab);
  const setActiveViewTab = useStore((state) => state.setActiveViewTab);
  const viewer3DOpen = useStore((state) => state.ui.viewer3DOpen);
  const data = useStore((state) => state.data);

  return (
    <div className="fixed top-2 left-1/2 z-[10001] flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-gray-200/50 bg-white/95 p-0.5 shadow-lg backdrop-blur-sm empty:hidden">
      {viewer3DOpen && data && (
        <>
          <button
            type="button"
            onClick={() => setActiveViewTab('map')}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all ${
              activeViewTab === 'map'
                ? 'bg-gray-700 text-white shadow-sm'
                : 'bg-transparent text-gray-600 hover:bg-gray-100'
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
              />
            </svg>
            Kartoversikt
          </button>
          <button
            type="button"
            onClick={() => setActiveViewTab('3d')}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all ${
              activeViewTab === '3d'
                ? 'bg-gray-700 text-white shadow-sm'
                : 'bg-transparent text-gray-600 hover:bg-gray-100'
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"
              />
            </svg>
            3D-visning
          </button>
        </>
      )}
      <TestModeControl />
    </div>
  );
}
