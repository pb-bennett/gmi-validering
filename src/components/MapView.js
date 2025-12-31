'use client';

import dynamic from 'next/dynamic';
import useStore from '@/lib/store';

const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-500">Laster kart...</p>
      </div>
    </div>
  ),
});

const MapLegend = dynamic(() => import('./MapLegend'), {
  ssr: false,
});

const ThemeSwitcher = dynamic(() => import('./ThemeSwitcher'), {
  ssr: false,
});

export default function MapView(props) {
  const filteredFeatureIds = useStore(
    (state) => state.ui.filteredFeatureIds
  );
  const setFilteredFeatureIds = useStore(
    (state) => state.setFilteredFeatureIds
  );

  return (
    <div className="relative h-full w-full">
      <MapInner {...props} />
      <MapLegend />
      <ThemeSwitcher />

      {filteredFeatureIds && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-white px-4 py-2 rounded-full shadow-lg border border-blue-200 flex items-center space-x-3">
          <span className="text-sm font-medium text-blue-800">
            Viser {filteredFeatureIds.size} objekter med mangler
          </span>
          <button
            onClick={() => setFilteredFeatureIds(null)}
            className="text-gray-500 hover:text-gray-800 focus:outline-none"
            title="Fjern filter"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
