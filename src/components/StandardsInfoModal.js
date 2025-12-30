export default function StandardsInfoModal({ isOpen, onClose }) {
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
