'use client';

import { useState } from 'react';

export default function FieldDetailModal({ field, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'values'

  if (!isOpen || !field) return null;

  const sortedValues = field.stats.valueCounts
    ? Object.entries(field.stats.valueCounts)
        .map(([value, count]) => ({
          value,
          count,
          percentage: (count / field.stats.present) * 100,
          isValid:
            !field.acceptableValues ||
            field.acceptableValues.length === 0 ||
            field.acceptableValues.some(
              (av) => String(av.value) === String(value)
            ),
        }))
        .sort((a, b) => b.count - a.count)
    : [];

  return (
    <div className="absolute inset-0 z-[3000] flex flex-col bg-white animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50 flex-none">
        <div className="flex items-start gap-3">
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-600"
            title="Tilbake"
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
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {field.label}
            </h2>
            <code className="text-xs text-gray-500 mt-1 block bg-gray-100 px-2 py-1 rounded w-fit">
              {field.fieldKey}
            </code>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b flex-none">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-blue-500 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          Oversikt
        </button>
        <button
          onClick={() => setActiveTab('values')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'values'
              ? 'border-blue-500 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          Verdifordeling ({sortedValues.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {activeTab === 'overview' ? (
          <>
            {/* Description */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Beskrivelse
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                {field.description}
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">
                  Utfyllingsgrad
                </div>
                <div className="text-lg font-bold text-gray-900">
                  {field.stats.completion.toFixed(1)}%
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                  <div
                    className={`h-1.5 rounded-full ${
                      field.stats.completion === 100
                        ? 'bg-green-500'
                        : field.stats.completion > 50
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${field.stats.completion}%` }}
                  />
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">
                  Status
                </div>
                <div
                  className={`text-lg font-bold ${
                    field.status === 'error'
                      ? 'text-red-600'
                      : field.status === 'warning'
                      ? 'text-yellow-600'
                      : 'text-green-600'
                  }`}
                >
                  {field.status === 'error'
                    ? 'Mangler data'
                    : field.status === 'warning'
                    ? 'Delvis utfylt'
                    : 'OK'}
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 col-span-2">
                <div className="text-xs text-gray-500 mb-1">Krav</div>
                <div className="flex gap-2 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      field.required === 'always'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {field.required === 'always'
                      ? `Påkrevd ${
                          field.conditionLabel
                            ? `(${field.conditionLabel})`
                            : ''
                        }`
                      : 'Betinget / Valgfritt'}
                  </span>
                  {field.objectTypes.map((type) => (
                    <span
                      key={type}
                      className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize"
                    >
                      {type}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Detailed Stats */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Statistikk
              </h3>
              <div className="bg-white border rounded-lg divide-y text-sm">
                <div className="flex justify-between p-2">
                  <span className="text-gray-600">
                    Totalt antall objekter
                  </span>
                  <span className="font-mono font-medium">
                    {field.stats.total}
                  </span>
                </div>
                <div className="flex justify-between p-2">
                  <span className="text-gray-600">Utfylt</span>
                  <span className="font-mono font-medium text-green-600">
                    {field.stats.present}
                  </span>
                </div>
                <div className="flex justify-between p-2">
                  <span className="text-gray-600">Mangler</span>
                  <span className="font-mono font-medium text-red-600">
                    {field.stats.missing}
                  </span>
                </div>
                {field.stats.unexpected > 0 && (
                  <div className="flex justify-between p-2">
                    <span className="text-gray-600">
                      Uventet (feil type)
                    </span>
                    <span className="font-mono font-medium text-orange-600">
                      {field.stats.unexpected}
                    </span>
                  </div>
                )}
                {field.acceptableValues && (
                  <div className="flex justify-between p-2">
                    <span className="text-gray-600">
                      Ugyldige verdier
                    </span>
                    <span className="font-mono font-medium text-yellow-600">
                      {field.stats.invalid}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Acceptable Values */}
            {field.acceptableValues &&
              field.acceptableValues.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Gyldige verdier ({field.acceptableValues.length})
                  </h3>
                  <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="overflow-y-auto max-h-[400px]">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                              Kode
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Beskrivelse
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {field.acceptableValues.map((val) => (
                            <tr
                              key={val.value}
                              className="hover:bg-gray-50"
                            >
                              <td className="px-3 py-2 whitespace-nowrap align-top">
                                <code className="text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                  {val.value}
                                </code>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-900 align-top">
                                <div className="font-medium">
                                  {val.label}
                                </div>
                                {val.description && (
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    {val.description}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
          </>
        ) : (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Fordeling av verdier
            </h3>
            {sortedValues.length > 0 ? (
              <div className="bg-white border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Verdi
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Antall
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Andel
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sortedValues.map((item) => (
                      <tr
                        key={item.value}
                        className={!item.isValid ? 'bg-red-50' : ''}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.value}
                          {!item.isValid && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                              Ugyldig
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">
                          {item.count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right font-mono">
                          {item.percentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 italic bg-gray-50 rounded-lg border border-dashed">
                Ingen verdier funnet for dette feltet.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t bg-gray-50 flex justify-end flex-none">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
        >
          Lukk
        </button>
      </div>
    </div>
  );
}
