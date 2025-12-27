'use client';

import dynamic from 'next/dynamic';

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

export default function MapView(props) {
  return (
    <div className="relative h-full w-full">
      <MapInner {...props} />
      <MapLegend />
    </div>
  );
}
