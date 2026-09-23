import useStore from '@/lib/store';
import { analyzeIncline } from '@/lib/analysis/incline';
import { XIcon } from '@phosphor-icons/react';

export default function StandardsInfoModal({ isOpen, onClose }) {
  const data = useStore((state) => state.data);
  const setAnalysisResults = useStore(
    (state) => state.setAnalysisResults,
  );
  const inclineRequirementMode = useStore(
    (state) => state.settings.inclineRequirementMode,
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-gmi-surface border border-gmi-border-strong rounded-lg shadow-xl max-w-2xl w-full m-4 p-6 text-gmi-text"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4 border-b border-gmi-border pb-2">
          <h2 className="text-xl font-bold text-gmi-navy">
            Krav til selvfall (Norsk Vann)
          </h2>
          <button
            onClick={onClose}
            className="gmi-compact-button gmi-focus-ring text-gmi-text-muted"
            aria-label="Lukk krav til selvfall"
            title="Lukk"
          >
            <XIcon size={24} weight="regular" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-gmi-text">
          <p>
            Analysen baserer seg på Norsk Vanns standarder for
            minimumsfall på selvfallsledninger. Kravene varierer
            basert på rørdimensjon for å sikre selvrensing.
          </p>

          <div className="bg-gmi-surface-soft p-4 rounded-md border border-gmi-border">
            <h3 className="font-semibold text-gmi-navy mb-2">
              Minimumskrav til fall:
            </h3>
            <div className="space-y-3 mb-3">
              <label className="flex items-start gap-2 text-sm text-gmi-text cursor-pointer">
                <input
                  type="radio"
                  name="inclineRequirement"
                  value="fixed10"
                  checked={inclineRequirementMode === 'fixed10'}
                  onChange={() => handleModeChange('fixed10')}
                  className="mt-0.5 accent-gmi-interactive focus:ring-gmi-interactive"
                />
                <div>
                  <div className="font-medium">
                    Fast krav til fall: 10‰ for alle dimensjoner
                  </div>
                  <div className="text-xs text-gmi-text-muted">
                    Dette er standard og vil være valgt ved lasting.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 text-sm text-gmi-text cursor-pointer">
                <input
                  type="radio"
                  name="inclineRequirement"
                  value="variable"
                  checked={inclineRequirementMode === 'variable'}
                  onChange={() => handleModeChange('variable')}
                  className="mt-0.5 accent-gmi-interactive focus:ring-gmi-interactive"
                />
                <div>
                  <div className="font-medium">
                    Variabelt krav til fall basert på dimensjon
                  </div>
                  <div className="text-xs text-gmi-text-muted">
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
            <p className="text-sm text-gmi-text mb-3">
              Overdekning er avstanden fra topp rør til
              terrengoverflaten. Minimumskrav sikrer at ledninger har
              tilstrekkelig beskyttelse mot frost og mekaniske
              påkjenninger.
            </p>
            <div className="text-xs text-gmi-text-muted mb-3">
              Innstillingen for minstekrav til overdekning justeres nå
              direkte i profilanalysen.
            </div>
            <div className="text-xs text-amber-700 bg-amber-100 p-2 rounded">
              <strong>Merk:</strong> Terrengdata hentes fra Geonorge
              Høydedata API. Overdekning beregnes som terreng-høyde
              minus rør-høyde.
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gmi-navy">
              Kilder og referanser:
            </h3>
            <ul className="list-disc list-inside text-gmi-interactive">
              <li>
                <a
                  href="https://va-norm.no/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gmi-focus-ring hover:underline"
                >
                  VA-Norm (Norsk Vann)
                </a>
              </li>
              <li>
                <a
                  href="https://www.norskvann.no/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gmi-focus-ring hover:underline"
                >
                  Norsk Vann Rapporter
                </a>
              </li>
            </ul>
          </div>

          <div className="mt-4 text-xs text-gmi-text-subtle border-t border-gmi-border pt-2">
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
            className="gmi-primary-control gmi-focus-ring px-4 py-2"
          >
            Lukk
          </button>
        </div>
      </div>
    </div>
  );
}
