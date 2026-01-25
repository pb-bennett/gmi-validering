'use client';

import useStore from '@/lib/store';

const formatIndices = (indices, max = 20) => {
  if (!Array.isArray(indices) || indices.length === 0) return '-';
  if (indices.length <= max) return indices.join(', ');
  return `${indices.slice(0, max).join(', ')} (+${
    indices.length - max
  })`;
};

export default function ZValidationModal() {
  const data = useStore((state) => state.data);
  const results = useStore((state) => state.zValidation.results);
  const isOpen = useStore((state) => state.zValidation.isOpen);
  const toggleZValidationModal = useStore(
    (state) => state.toggleZValidationModal,
  );
  const viewObjectInMap = useStore((state) => state.viewObjectInMap);

  if (!isOpen || !data) return null;

  const summary = results?.summary;
  const missingPoints = results?.missingPoints || [];
  const missingLines = results?.missingLines || [];

  const handleFocusPoint = (index) => {
    const coord = data?.points?.[index]?.coordinates?.[0];
    if (!coord) return;
    viewObjectInMap(`punkter-${index}`, [coord.y, coord.x], 20);
  };

  const handleFocusLine = (index) => {
    const coord = data?.lines?.[index]?.coordinates?.[0];
    if (!coord) return;
    viewObjectInMap(`ledninger-${index}`, [coord.y, coord.x], 19);
  };

  return (
    <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[85%] flex flex-col overflow-hidden">
        <div className="flex-none p-4 border-b flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-lg font-semibold">
              Høydekontroll (Z)
            </h2>
            <p className="text-sm text-gray-600">
              Kontrollerer at alle objekter har gyldig Z-verdi.
            </p>
          </div>
          <button
            onClick={() => toggleZValidationModal(false)}
            className="text-gray-500 hover:text-gray-700 p-2"
            title="Lukk"
          >
            <svg
              className="w-6 h-6"
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

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded border p-3 bg-gray-50">
              <div className="font-medium text-gray-700">
                Punkter
              </div>
              <div className="text-gray-600 text-xs mt-1">
                {summary?.missingPointObjects || 0} av{' '}
                {summary?.totalPoints || 0} punkter mangler Z
              </div>
              <div className="text-gray-500 text-xs">
                {summary?.missingPointCoords || 0} av{' '}
                {summary?.totalPointCoords || 0} punktkoordinater
              </div>
            </div>
            <div className="rounded border p-3 bg-gray-50">
              <div className="font-medium text-gray-700">
                Linjer
              </div>
              <div className="text-gray-600 text-xs mt-1">
                {summary?.missingLineObjects || 0} av{' '}
                {summary?.totalLines || 0} linjer mangler Z
              </div>
              <div className="text-gray-500 text-xs">
                {summary?.missingLineCoords || 0} av{' '}
                {summary?.totalLineCoords || 0} linjepunkter
              </div>
            </div>
          </div>

          {missingPoints.length === 0 && missingLines.length === 0 && (
            <div className="text-sm text-gray-600">
              Ingen objekter mangler høyde (Z).
            </div>
          )}

          {missingPoints.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Punkter uten Z ({missingPoints.length})
              </h3>
              <div className="border rounded overflow-auto max-h-64">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        Manglende indeks
                      </th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {missingPoints.map((point) => (
                      <tr key={`z-point-${point.index}`}>
                        <td className="px-3 py-2 text-gray-600">
                          {point.index + 1}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {point.label}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {formatIndices(point.missingIndices)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => handleFocusPoint(point.index)}
                            className="px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
                          >
                            Vis i kart
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {missingLines.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Linjer uten Z ({missingLines.length})
              </h3>
              <div className="border rounded overflow-auto max-h-64">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        Manglende indeks
                      </th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {missingLines.map((line) => (
                      <tr key={`z-line-${line.index}`}>
                        <td className="px-3 py-2 text-gray-600">
                          {line.index + 1}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {line.label}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {formatIndices(line.missingIndices)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => handleFocusLine(line.index)}
                            className="px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
                          >
                            Vis i kart
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
