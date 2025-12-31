'use client';

import useStore from '@/lib/store';

export default function Tooltip3D({ object, position, onClose }) {
  const viewObjectInMap = useStore((state) => state.viewObjectInMap);

  if (!object) return null;

  const handleViewInMap = () => {
    // Get coordinates from object
    const coords = object.coordinates;
    const featureId = object.featureId;

    if (coords && featureId) {
      viewObjectInMap(featureId, coords, 20); // Zoom level 20 for close-up view
    }
    onClose();
  };

  return (
    <div
      className="fixed z-10002 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-200/50 p-4 min-w-75 max-w-100"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -120%)',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
        title="Lukk"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Object type header */}
      <div className="mb-3 pb-2 border-b border-gray-100">
        <h3 className="font-semibold text-base text-gray-800">
          {object.type === 'pipe' ? '🔵 Ledning' : '⚫ Kum/Sluk'}
        </h3>
        <p className="text-sm text-gray-500 font-medium">
          {object.fcode}
        </p>
      </div>

      {/* Attributes */}
      <div className="space-y-1.5 mb-4">
        {object.attributes &&
          Object.entries(object.attributes)
            .filter(([key]) => !key.startsWith('_'))
            .slice(0, 8)
            .map(([key, value]) => (
              <div
                key={key}
                className="flex justify-between text-sm gap-4"
              >
                <span className="font-medium text-gray-500">
                  {key}:
                </span>
                <span className="text-gray-800 font-medium">
                  {String(value)}
                </span>
              </div>
            ))}
      </div>

      {/* View in Map button */}
      <button
        onClick={handleViewInMap}
        className="w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
      >
        <svg
          className="w-4 h-4"
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
        Vis i kart
      </button>
    </div>
  );
}
