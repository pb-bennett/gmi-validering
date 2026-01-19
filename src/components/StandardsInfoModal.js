import useStore from '@/lib/store';
import { analyzeIncline } from '@/lib/analysis/incline';

export default function StandardsInfoModal({ isOpen, onClose }) {
  const data = useStore((state) => state.data);
  const setAnalysisResults = useStore(
    (state) => state.setAnalysisResults,
  );
  const inclineRequirementMode = useStore(
    (state) => state.settings.inclineRequirementMode,
  );
  const minOvercover = useStore(
    (state) => state.settings.minOvercover,
  );
  const updateSettings = useStore((state) => state.updateSettings);

  const handleModeChange = (mode) => {
    updateSettings({ inclineRequirementMode: mode });
    if (data) {
      const results = analyzeIncline(data, {
        minInclineMode: mode,
      });
      setAnalysisResults(results);
    }
  };

  const handleOvercoverChange = (value) => {
    updateSettings({ minOvercover: value });
  };
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full m-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4 border-b pb-2">
          <h2 className="text-xl font-bold text-gray-800">
            Krav til selvfall (Norsk Vann)
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
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

        <div className="space-y-4 text-sm text-gray-700">
          <p>
            Analysen baserer seg på Norsk Vanns standarder for
            minimumsfall på selvfallsledninger. Kravene varierer
            basert på rørdimensjon for å sikre selvrensing.
          </p>

          <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
            <h3 className="font-semibold text-blue-800 mb-2">
              Minimumskrav til fall:
            </h3>
            <div className="space-y-3 mb-3">
              <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="inclineRequirement"
                  value="fixed10"
                  checked={inclineRequirementMode === 'fixed10'}
                  onChange={() => handleModeChange('fixed10')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="font-medium">
                    Fast krav til fall: 10‰ for alle dimensjoner
                  </div>
                  <div className="text-xs text-gray-600">
                    Dette er standard og vil være valgt ved lasting.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="inclineRequirement"
                  value="variable"
                  checked={inclineRequirementMode === 'variable'}
                  onChange={() => handleModeChange('variable')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="font-medium">
                    Variabelt krav til fall basert på dimensjon
                  </div>
                  <div className="text-xs text-gray-600">
                    Dimensjon &lt; 200 mm: 10 ‰ (1:100) · Dimensjon
                    200 - 315 mm: 4 ‰ (1:250) · Dimensjon &gt; 315 mm:
                    2 ‰ (1:500)
                  </div>
                </div>
              </label>
            </div>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>
                <span className="font-medium">
                  Dimensjon &lt; 200 mm:
                </span>
                <span className="font-bold ml-2">10 ‰ (1:100)</span>
              </li>
              <li>
                <span className="font-medium">
                  Dimensjon 200 - 315 mm:
                </span>
                <span className="font-bold ml-2">4 ‰ (1:250)</span>
              </li>
              <li>
                <span className="font-medium">
                  Dimensjon &gt; 315 mm:
                </span>
                <span className="font-bold ml-2">2 ‰ (1:500)</span>
              </li>
            </ul>
          </div>

          <div className="bg-amber-50 p-4 rounded-md border border-amber-100">
            <h3 className="font-semibold text-amber-800 mb-2">
              Krav til overdekning:
            </h3>
            <p className="text-sm text-gray-700 mb-3">
              Overdekning er avstanden fra topp rør til
              terrengoverflaten. Minimumskrav sikrer at ledninger har
              tilstrekkelig beskyttelse mot frost og mekaniske
              påkjenninger.
            </p>
            <div className="mb-3">
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <span className="font-medium">Minstekrav (m):</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={minOvercover ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const parsed = parseFloat(
                      String(raw).replace(',', '.'),
                    );
                    if (!Number.isFinite(parsed)) return;
                    handleOvercoverChange(parsed);
                  }}
                  className="w-24 rounded border border-amber-200 px-2 py-1 text-sm focus:border-amber-400 focus:ring-amber-400"
                  aria-label="Minstekrav til overdekning"
                />
              </label>
              <div className="text-xs text-gray-600 mt-1">
                Standardverdi er 1,6 m. Endring oppdaterer alle
                overdekningsvarsler.
              </div>
            </div>
            <div className="text-xs text-amber-700 bg-amber-100 p-2 rounded">
              <strong>Merk:</strong> Terrengdata hentes fra Geonorge
              Høydedata API. Overdekning beregnes som terreng-høyde
              minus rør-høyde.
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-800">
              Kilder og referanser:
            </h3>
            <ul className="list-disc list-inside text-blue-600">
              <li>
                <a
                  href="https://va-norm.no/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  VA-Norm (Norsk Vann)
                </a>
              </li>
              <li>
                <a
                  href="https://www.norskvann.no/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Norsk Vann Rapporter
                </a>
              </li>
            </ul>
          </div>

          <div className="mt-4 text-xs text-gray-500 border-t pt-2">
            <p>
              Merk: Analysen markerer ledninger med "Advarsel" (Gult)
              dersom fallet er under minimumskravet, men over 0.
              Ledninger med motfall (negativt fall) markeres med
              "Feil" (Rødt).
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Lukk
          </button>
        </div>
      </div>
    </div>
  );
}
