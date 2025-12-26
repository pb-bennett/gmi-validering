'use client';

import useStore from '@/lib/store';
import { useState } from 'react';

export default function DataDisplay() {
  const data = useStore((state) => state.data);
  const file = useStore((state) => state.file);
  const resetParsing = useStore((state) => state.resetParsing);
  const clearData = useStore((state) => state.clearData);
  const clearFile = useStore((state) => state.clearFile);
  const [activeTab, setActiveTab] = useState('header');

  const handleReset = () => {
    clearData();
    clearFile();
    resetParsing();
  };

  if (!data) return null;

  const { header, points, lines } = data;

  return (
    <div className="h-full flex flex-col bg-white shadow rounded-lg overflow-hidden">
      <div className="flex-none p-6 border-b">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Fil: {file?.name}</h2>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            Last opp ny fil
          </button>
        </div>

        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('header')}
            className={`pb-2 px-4 ${
              activeTab === 'header'
                ? 'border-b-2 border-blue-500 font-medium'
                : 'text-gray-500'
            }`}
          >
            Header ({Object.keys(header).length})
          </button>
          <button
            onClick={() => setActiveTab('points')}
            className={`pb-2 px-4 ${
              activeTab === 'points'
                ? 'border-b-2 border-blue-500 font-medium'
                : 'text-gray-500'
            }`}
          >
            Punkter ({points.length})
          </button>
          <button
            onClick={() => setActiveTab('lines')}
            className={`pb-2 px-4 ${
              activeTab === 'lines'
                ? 'border-b-2 border-blue-500 font-medium'
                : 'text-gray-500'
            }`}
          >
            Linjer ({lines.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'header' && (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nøkkel
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Verdi
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(header).map(([key, value]) => (
                <tr key={key}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {key}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'points' && (
          <div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Koordinater (N, E, H)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Attributter
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {points.slice(0, 100).map((point, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {idx + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {point.geometry?.coordinates
                        ?.map((c) => c.toFixed(2))
                        .join(', ')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <pre className="text-xs">
                        {JSON.stringify(point.attributes, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {points.length > 100 && (
              <div className="p-4 text-center text-gray-500 text-sm">
                Viser 100 av {points.length} punkter
              </div>
            )}
          </div>
        )}

        {activeTab === 'lines' && (
          <div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Punkter
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Attributter
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {lines.slice(0, 100).map((line, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {idx + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {line.geometry?.coordinates?.length} punkter
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <pre className="text-xs">
                        {JSON.stringify(line.attributes, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lines.length > 100 && (
              <div className="p-4 text-center text-gray-500 text-sm">
                Viser 100 av {lines.length} linjer
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
