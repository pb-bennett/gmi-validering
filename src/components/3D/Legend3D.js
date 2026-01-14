'use client';

export default function Legend3D() {
  const pipeLegend = [
    { label: 'Vannledning (VL)', color: '#0101FF' },
    { label: 'Spillvann (SP)', color: '#02D902' },
    { label: 'Overvann (OV)', color: '#2a2a2a' },
    { label: 'Drenering (DR)', color: '#8B4513' },
  ];

  const pointLegend = [
    { label: 'Kum (KUM)', color: '#cc3300', shape: 'cylinder' },
    { label: 'Sluk (SLU/SLS)', color: '#000000', shape: 'cylinder' },
    { label: 'Sandfang (SAN)', color: '#1a1a1a', shape: 'cylinder' },
    { label: 'Kumlokk (LOK)', color: '#FFD400', shape: 'disc' },
    { label: 'Kran (KRN)', color: '#0066cc', shape: 'sphere' },
    { label: 'Anboring', color: '#0066cc', shape: 'sphere' },
    { label: 'Grenpunkt (GRN)', color: '#00cc00', shape: 'sphere' },
    { label: 'Diverse (DIV)', color: '#666666', shape: 'sphere' },
  ];

  return (
    <div className="absolute bottom-4 left-4 z-50 bg-white/95 backdrop-blur-sm text-gray-800 rounded-xl shadow-lg border border-gray-200/50 p-4 max-h-80 overflow-y-auto">
      <h3 className="text-sm font-semibold mb-2 text-gray-700">
        Ledninger
      </h3>
      <div className="space-y-1.5 mb-3">
        {pipeLegend.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-6 h-1.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-gray-600">
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <h3 className="text-sm font-semibold mb-2 border-t border-gray-200 pt-2 text-gray-700">
        Punkter
      </h3>
      <div className="space-y-1.5">
        {pointLegend.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            {item.shape === 'cylinder' ? (
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: item.color }}
              />
            ) : item.shape === 'disc' ? (
              <div
                className="w-4 h-1 rounded-full"
                style={{ backgroundColor: item.color }}
              />
            ) : (
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
            )}
            <span className="text-xs text-gray-600">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
