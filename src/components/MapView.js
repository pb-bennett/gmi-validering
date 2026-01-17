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
  const fieldValidationFilterActive = useStore(
    (state) => state.ui.fieldValidationFilterActive
  );

  const outlierResults = useStore((state) => state.outliers.results);
  const outlierPromptOpen = useStore(
    (state) => state.ui.outlierPromptOpen
  );
  const setOutlierPromptOpen = useStore(
    (state) => state.setOutlierPromptOpen
  );
  const toggleHideOutliers = useStore(
    (state) => state.toggleHideOutliers
  );

  const missingHeightPromptOpen = useStore(
    (state) => state.ui.missingHeightPromptOpen
  );
  const missingHeightDetailsOpen = useStore(
    (state) => state.ui.missingHeightDetailsOpen
  );
  const missingHeightLines = useStore(
    (state) => state.ui.missingHeightLines
  );
  const setMissingHeightPromptOpen = useStore(
    (state) => state.setMissingHeightPromptOpen
  );
  const setMissingHeightDetailsOpen = useStore(
    (state) => state.setMissingHeightDetailsOpen
  );

  return (
    <div className="relative h-full w-full">
      <MapInner {...props} />
      <MapLegend />
      <ThemeSwitcher />

      {outlierPromptOpen &&
        outlierResults &&
        outlierResults.outliers &&
        outlierResults.outliers.length > 0 && (
          <div className="absolute top-48 left-1/2 transform -translate-x-1/2 z-1100 bg-white px-4 py-3 rounded-xl shadow-lg border border-amber-200 flex items-center gap-3">
            <div className="text-sm">
              <div className="font-medium text-amber-900">
                Fant {outlierResults.outliers.length} avvikere langt
                unna resten av dataene
              </div>
              <div className="text-amber-800 text-xs">
                {outlierResults.summary
                  ? (() => {
                      const avgOutlierDist =
                        outlierResults.outliers.reduce(
                          (sum, o) => sum + (o.distance || 0),
                          0
                        ) / outlierResults.outliers.length;
                      const distKm = (avgOutlierDist / 1000).toFixed(
                        1
                      );
                      return `Gjennomsnittlig ${distKm} km fra hovedklynggen`;
                    })()
                  : 'Langt unna'}
              </div>
              <div className="text-amber-800">
                Vil du ignorere dem i kartet?
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  toggleHideOutliers(true);
                  setOutlierPromptOpen(false);
                }}
                className="px-3 py-1.5 text-sm font-medium rounded border"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'white',
                  borderColor: 'var(--color-primary-dark)',
                }}
                title="Skjul avvikere"
              >
                Ignorer
              </button>
              <button
                onClick={() => {
                  toggleHideOutliers(false);
                  setOutlierPromptOpen(false);
                }}
                className="px-3 py-1.5 text-sm font-medium rounded border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                title="Behold avvikere"
              >
                Behold
              </button>
            </div>
          </div>
        )}

      {missingHeightPromptOpen &&
        Array.isArray(missingHeightLines) &&
        missingHeightLines.length > 0 && (
          <div
            className={`absolute left-1/2 transform -translate-x-1/2 z-1100 bg-white px-4 py-3 rounded-xl shadow-lg border border-amber-200 flex items-center gap-3 ${
              outlierPromptOpen ? 'top-74' : 'top-48'
            }`}
          >
            <div className="text-sm">
              <div className="font-medium text-amber-900">
                En eller flere linjer mangler høyde (Z-verdi)
              </div>
              <div className="text-amber-800">
                Vil du se detaljer?
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setMissingHeightDetailsOpen(true);
                  setMissingHeightPromptOpen(false);
                }}
                className="px-3 py-1.5 text-sm font-medium rounded border"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'white',
                  borderColor: 'var(--color-primary-dark)',
                }}
                title="Vis detaljer"
              >
                Vis detaljer
              </button>
              <button
                onClick={() => setMissingHeightPromptOpen(false)}
                className="px-3 py-1.5 text-sm font-medium rounded border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                title="Lukk"
              >
                Lukk
              </button>
            </div>
          </div>
        )}

      {missingHeightDetailsOpen &&
        Array.isArray(missingHeightLines) &&
        missingHeightLines.length > 0 && (
          <div className="absolute inset-0 z-2000 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85%] flex flex-col overflow-hidden">
              <div className="flex-none p-4 border-b flex justify-between items-center bg-gray-50">
                <div>
                  <h2 className="text-lg font-semibold">
                    Linjer uten høyde (Z)
                  </h2>
                  <p className="text-sm text-gray-600">
                    Fant {missingHeightLines.length} linje(r) hvor én
                    eller flere punkter mangler Z-verdi.
                  </p>
                </div>
                <button
                  onClick={() => setMissingHeightDetailsOpen(false)}
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

              <div className="flex-1 overflow-auto p-4">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Linje
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Code
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {missingHeightLines.slice(0, 500).map((item) => (
                      <tr key={item.index}>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                          {item.index + 1}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                          {item.fcode || '(ukjent)'}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {item.type || '(ukjent)'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {missingHeightLines.length > 500 && (
                  <div className="pt-3 text-sm text-gray-500">
                    Viser 500 av {missingHeightLines.length} linjer.
                  </div>
                )}
              </div>

              <div className="flex-none p-4 border-t bg-gray-50 flex justify-end">
                <button
                  onClick={() => setMissingHeightDetailsOpen(false)}
                  className="px-3 py-1.5 text-sm font-medium rounded border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                >
                  Lukk
                </button>
              </div>
            </div>
          </div>
        )}

      {filteredFeatureIds && !fieldValidationFilterActive && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-1000 bg-white px-4 py-2 rounded-full shadow-lg border border-blue-200 flex items-center space-x-3">
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
