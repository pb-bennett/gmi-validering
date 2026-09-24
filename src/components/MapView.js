'use client';

import dynamic from 'next/dynamic';
import useStore from '@/lib/store';

const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gmi-surface-soft">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gmi-interactive mx-auto mb-4"></div>
        <p className="text-gmi-text-subtle">Laster kart...</p>
      </div>
    </div>
  ),
});

const MapLegend = dynamic(() => import('./MapLegend'), {
  ssr: false,
});

export default function MapView(props) {
  const outlierResults = useStore((state) => state.outliers.results);
  const outlierPromptOpen = useStore(
    (state) => state.ui.outlierPromptOpen,
  );
  const setOutlierPromptOpen = useStore(
    (state) => state.setOutlierPromptOpen,
  );
  const toggleHideOutliers = useStore(
    (state) => state.toggleHideOutliers,
  );

  const zValidationPromptOpen = useStore(
    (state) => state.ui.zValidationPromptOpen,
  );
  const zValidationResults = useStore(
    (state) => state.zValidation.results,
  );
  const setZValidationPromptOpen = useStore(
    (state) => state.setZValidationPromptOpen,
  );
  const toggleZValidationModal = useStore(
    (state) => state.toggleZValidationModal,
  );

  return (
    <div className="relative h-full w-full">
      <MapInner {...props} />
      <MapLegend />

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
                          0,
                        ) / outlierResults.outliers.length;
                      const distKm = (avgOutlierDist / 1000).toFixed(
                        1,
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
                className="gmi-primary-control gmi-focus-ring px-3 py-1.5 text-sm font-medium border border-gmi-navy"
                title="Skjul avvikere"
              >
                Ignorer
              </button>
              <button
                onClick={() => {
                  toggleHideOutliers(false);
                  setOutlierPromptOpen(false);
                }}
                className="gmi-compact-button gmi-focus-ring px-3 py-1.5 text-sm font-medium border border-gmi-border-strong bg-gmi-surface"
                title="Behold avvikere"
              >
                Behold
              </button>
            </div>
          </div>
        )}

      {zValidationPromptOpen && zValidationResults && (
        <div
          className={`absolute left-1/2 transform -translate-x-1/2 z-1100 bg-white px-4 py-3 rounded-xl shadow-lg border border-amber-200 flex items-center gap-3 ${
            outlierPromptOpen ? 'top-74' : 'top-48'
          }`}
        >
          <div className="text-sm">
            <div className="font-medium text-amber-900">
              Fant objekter uten høyde (Z-verdi)
            </div>
            <div className="text-amber-800">
              {zValidationResults.summary?.missingPointObjects || 0}{' '}
              punkt og{' '}
              {zValidationResults.summary?.missingLineObjects || 0}{' '}
              linje(r)
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                toggleZValidationModal(true);
                setZValidationPromptOpen(false);
              }}
              className="gmi-primary-control gmi-focus-ring px-3 py-1.5 text-sm font-medium border border-gmi-navy"
              title="Åpne høydekontroll"
            >
              Åpne kontroll
            </button>
            <button
              onClick={() => setZValidationPromptOpen(false)}
              className="gmi-compact-button gmi-focus-ring px-3 py-1.5 text-sm font-medium border border-gmi-border-strong bg-gmi-surface"
              title="Senere"
            >
              Senere
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
