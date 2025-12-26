'use client';

import useStore from '@/lib/store';
import { useState } from 'react';

export default function DataDisplayModal({ isOpen, onClose }) {
  const data = useStore((state) => state.data);
  const file = useStore((state) => state.file);
  const [activeTab, setActiveTab] = useState('header');

  if (!isOpen || !data) return null;

  const { header, points, lines } = data;

  return (
    <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90%] flex flex-col overflow-hidden">
        <div className="flex-none p-4 border-b flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-lg font-semibold">
              Data Inspector (Dev Tool)
            </h2>
            <p className="text-sm text-gray-500">Fil: {file?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-2"
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

        <div className="flex-none border-b px-4">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('header')}
              className={`py-3 px-4 ${
                activeTab === 'header'
                  ? 'border-b-2 border-blue-500 font-medium text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Header ({Object.keys(header).length})
            </button>
            <button
              onClick={() => setActiveTab('points')}
              className={`py-3 px-4 ${
                activeTab === 'points'
                  ? 'border-b-2 border-blue-500 font-medium text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Punkter ({points.length})
            </button>
            <button
              onClick={() => setActiveTab('lines')}
              className={`py-3 px-4 ${
                activeTab === 'lines'
                  ? 'border-b-2 border-blue-500 font-medium text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Linjer ({lines.length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
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
    </div>
  );
}
