'use client';

import { useMemo, useState, useEffect } from 'react';
import useStore from '@/lib/store';
import { validateFields } from '@/lib/validation/fieldValidation';
import FieldDetailModal from './FieldDetailModal';
import MissingFieldsReport from './MissingFieldsReport';

export default function FieldValidationSidebar() {
  const data = useStore((state) => state.data);
  const toggleFieldValidation = useStore(
    (state) => state.toggleFieldValidation
  );
  const setHoveredFeature = useStore(
    (state) => state.setHoveredFeature
  );
  const setFilteredFeatureIds = useStore(
    (state) => state.setFilteredFeatureIds
  );
  const [selectedField, setSelectedField] = useState(null);
  const [filter, setFilter] = useState('OK'); // OK, WARNING, ERROR
  const [activeTab, setActiveTab] = useState('ledninger'); // 'ledninger' | 'punkter'
  const [showReport, setShowReport] = useState(false);
  const [showOnlyFailing, setShowOnlyFailing] = useState(false);

  const validationResults = useMemo(() => {
    return validateFields(data);
  }, [data]);

  const filteredResults = useMemo(() => {
    // First filter by tab (object type)
    let results = validationResults.filter((r) => {
      if (activeTab === 'ledninger')
        return r.objectTypes.includes('ledninger');
      if (activeTab === 'punkter')
        return r.objectTypes.includes('punktobjekter');
      return false;
    });

    // Then filter by status
    results = results.filter((r) => {
      if (filter === 'ERROR') return r.status === 'error';
      if (filter === 'WARNING') return r.status === 'warning';
      if (filter === 'OK') return r.status === 'ok';
      return true;
    });

    return results;
  }, [validationResults, filter, activeTab]);

  const stats = useMemo(() => {
    // Calculate stats based on current tab only
    const tabResults = validationResults.filter((r) => {
      if (activeTab === 'ledninger')
        return r.objectTypes.includes('ledninger');
      if (activeTab === 'punkter')
        return r.objectTypes.includes('punktobjekter');
      return false;
    });

    return {
      total: tabResults.length,
      error: tabResults.filter((r) => r.status === 'error').length,
      warning: tabResults.filter((r) => r.status === 'warning')
        .length,
      ok: tabResults.filter((r) => r.status === 'ok').length,
    };
  }, [validationResults, activeTab]);

  // Effect to filter map features when "show only failing" is enabled
  useEffect(() => {
    if (showOnlyFailing) {
      // Collect all failing feature IDs from all validation results
      const failingIds = new Set();
      validationResults.forEach((result) => {
        if (result.failingIds) {
          result.failingIds.forEach((id) => failingIds.add(id));
        }
      });
      setFilteredFeatureIds(failingIds);
    } else {
      // Clear filter
      setFilteredFeatureIds(null);
    }
  }, [showOnlyFailing, validationResults, setFilteredFeatureIds]);

  // Clear filter when component unmounts
  useEffect(() => {
    return () => {
      setFilteredFeatureIds(null);
    };
  }, [setFilteredFeatureIds]);

  if (showReport) {
    return (
      <MissingFieldsReport onClose={() => setShowReport(false)} />
    );
  }

  return (
    <div className="h-full flex flex-col bg-white border-r shadow-xl relative z-20">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        {/* Back/Close button at top-left */}
        <button
          onClick={() => toggleFieldValidation(false)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3 transition-colors"
          title="Lukk feltvalidering"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Tilbake
        </button>
        
        <div className="mb-3">
          <h2 className="text-lg font-bold text-gray-900">
            Feltvalidering
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Sjekker {stats.total} felt mot innmålingsinstruks
          </p>
        </div>

        {/* Toggle: Show only failing features in map */}
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyFailing}
            onChange={(e) => setShowOnlyFailing(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-600">
            Vis kun objekter med feil i kartet
          </span>
        </label>

        <button
          onClick={() => setShowReport(true)}
          className="w-full py-2 px-4 bg-white border border-gray-300 rounded shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center justify-center"
        >
          <svg
            className="w-4 h-4 mr-2 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Vis mangelliste (Rapport)
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('ledninger')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'ledninger'
              ? 'border-blue-500 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          Ledninger
        </button>
        <button
          onClick={() => setActiveTab('punkter')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'punkter'
              ? 'border-blue-500 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          Punkter
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex border-b bg-gray-50">
        <button
          onClick={() => setFilter('OK')}
          className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
            filter === 'OK'
              ? 'border-green-500 text-green-700 bg-green-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          OK
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              filter === 'OK' ? 'bg-green-200' : 'bg-gray-200'
            }`}
          >
            {stats.ok}
          </span>
        </button>
        <button
          onClick={() => setFilter('WARNING')}
          className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
            filter === 'WARNING'
              ? 'border-yellow-500 text-yellow-700 bg-yellow-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          Delvis
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              filter === 'WARNING' ? 'bg-yellow-200' : 'bg-gray-200'
            }`}
          >
            {stats.warning}
          </span>
        </button>
        <button
          onClick={() => setFilter('ERROR')}
          className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
            filter === 'ERROR'
              ? 'border-red-500 text-red-700 bg-red-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          Mangler
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              filter === 'ERROR' ? 'bg-red-200' : 'bg-gray-200'
            }`}
          >
            {stats.error}
          </span>
        </button>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50 pb-24">
        <div className="grid grid-cols-1 gap-3">
          {filteredResults.map((field) => (
            <div
              key={field.fieldKey}
              onClick={() => setSelectedField(field)}
              onMouseEnter={() => {
                // Highlight the first failing feature on hover
                if (field.failingIds && field.failingIds.length > 0) {
                  setHoveredFeature(field.failingIds[0]);
                }
              }}
              onMouseLeave={() => {
                setHoveredFeature(null);
              }}
              className={`
                bg-white rounded-lg border p-3 cursor-pointer transition-all hover:shadow-md
                ${
                  field.status === 'error'
                    ? 'border-l-4 border-l-red-500'
                    : field.status === 'warning'
                    ? 'border-l-4 border-l-yellow-500'
                    : 'border-l-4 border-l-green-500'
                }
              `}
            >
              <div className="flex justify-between items-start mb-1">
                <h3
                  className="font-semibold text-gray-900 truncate pr-2 text-sm"
                  title={field.label}
                >
                  {field.label}
                </h3>
                {field.required === 'always' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                    Påkrevd{' '}
                    {field.conditionLabel
                      ? `(${field.conditionLabel})`
                      : ''}
                  </span>
                )}
              </div>

              <div className="text-xs text-gray-500 mb-2 font-mono truncate">
                {field.fieldKey}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">
                    Utfyllingsgrad
                  </span>
                  <span className="font-medium">
                    {field.stats.completion.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      field.status === 'error'
                        ? 'bg-red-500'
                        : field.status === 'warning'
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${field.stats.completion}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>
                    {field.stats.present} / {field.stats.total}
                  </span>
                  <div className="flex gap-2">
                    {field.stats.invalid > 0 && (
                      <span className="text-yellow-600 font-medium">
                        {field.stats.invalid} ugyldige
                      </span>
                    )}
                    {field.stats.unexpected > 0 && (
                      <span className="text-orange-600 font-medium">
                        {field.stats.unexpected} uventet
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <FieldDetailModal
        field={selectedField}
        isOpen={!!selectedField}
        onClose={() => setSelectedField(null)}
      />
    </div>
  );
}
