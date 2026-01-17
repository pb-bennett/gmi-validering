'use client';

import useStore from '@/lib/store';
import { useMemo, useEffect, useRef, useState } from 'react';
import { validateFields } from '@/lib/validation/fieldValidation';

export default function MissingFieldsReport({ onClose }) {
  const setFilteredFeatureIds = useStore(
    (state) => state.setFilteredFeatureIds
  );
  const filteredFeatureIds = useStore(
    (state) => state.ui.filteredFeatureIds
  );
  const setHighlightedFeatureIds = useStore(
    (state) => state.setHighlightedFeatureIds
  );
  const setFieldValidationFilterActive = useStore(
    (state) => state.setFieldValidationFilterActive
  );
  const data = useStore((state) => state.data);
  const [activeFieldKey, setActiveFieldKey] = useState(null);
  const previousFilteredIdsRef = useRef(null);

  // Clear filter when leaving the report
  useEffect(() => {
    return () => {
      setFilteredFeatureIds(previousFilteredIdsRef.current || null);
      setHighlightedFeatureIds(null);
      setFieldValidationFilterActive(false);
    };
  }, [
    setFilteredFeatureIds,
    setHighlightedFeatureIds,
    setFieldValidationFilterActive,
  ]);

  const validationResults = useMemo(() => {
    return validateFields(data);
  }, [data]);

  const handleToggleViewObjects = (field) => {
    if (!field.failingIds || field.failingIds.length === 0) return;

    if (activeFieldKey === field.fieldKey) {
      setFieldValidationFilterActive(false);
      setFilteredFeatureIds(previousFilteredIdsRef.current || null);
      setActiveFieldKey(null);
      return;
    }

    if (!activeFieldKey) {
      previousFilteredIdsRef.current = filteredFeatureIds || null;
    } else if (activeFieldKey !== field.fieldKey) {
      setFieldValidationFilterActive(false);
      setFilteredFeatureIds(previousFilteredIdsRef.current || null);
    }

    setTimeout(() => {
      setFilteredFeatureIds(new Set(field.failingIds));
      setFieldValidationFilterActive(true);
      setActiveFieldKey(field.fieldKey);
    }, 0);
  };

  const reportData = useMemo(() => {
    const ledninger = [];
    const punkter = [];

    validationResults.forEach((field) => {
      if (field.status === 'ok') return;

      const item = {
        ...field,
        missingText: `${field.stats.missing} av ${field.stats.total} mangler`,
        invalidText:
          field.stats.invalid > 0
            ? `${field.stats.invalid} ugyldige`
            : null,
      };

      if (field.objectTypes.includes('ledninger')) {
        ledninger.push(item);
      }
      if (field.objectTypes.includes('punktobjekter')) {
        punkter.push(item);
      }
    });

    return { ledninger, punkter };
  }, [validationResults]);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
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
            <h2 className="text-lg font-bold text-gray-900">
              Mangelliste
            </h2>
            <p className="text-xs text-gray-500">
              Oversikt over manglende eller ugyldige feltverdier
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Ledninger Column */}
        <div className="flex-1 overflow-y-auto p-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold mb-3 flex items-center text-blue-700 bg-blue-50 p-2 rounded sticky top-0 z-10">
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Ledninger ({reportData.ledninger.length})
          </h3>
          <div className="space-y-2">
            {reportData.ledninger.length === 0 ? (
              <p className="text-xs text-gray-500 italic">
                Ingen mangler funnet på ledninger.
              </p>
            ) : (
              reportData.ledninger.map((field) => (
                <ReportItem
                  key={field.fieldKey}
                  field={field}
                  isActive={activeFieldKey === field.fieldKey}
                  onToggle={() => handleToggleViewObjects(field)}
                  onHoverStart={() => {
                    if (
                      field.failingIds &&
                      field.failingIds.length > 0
                    ) {
                      setHighlightedFeatureIds(
                        new Set(field.failingIds)
                      );
                    }
                  }}
                  onHoverEnd={() => setHighlightedFeatureIds(null)}
                />
              ))
            )}
          </div>
        </div>

        {/* Punkter Column */}
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center text-green-700 bg-green-50 p-2 rounded sticky top-0 z-10">
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Punkter ({reportData.punkter.length})
          </h3>
          <div className="space-y-2">
            {reportData.punkter.length === 0 ? (
              <p className="text-xs text-gray-500 italic">
                Ingen mangler funnet på punkter.
              </p>
            ) : (
              reportData.punkter.map((field) => (
                <ReportItem
                  key={field.fieldKey}
                  field={field}
                  isActive={activeFieldKey === field.fieldKey}
                  onToggle={() => handleToggleViewObjects(field)}
                  onHoverStart={() => {
                    if (
                      field.failingIds &&
                      field.failingIds.length > 0
                    ) {
                      setHighlightedFeatureIds(
                        new Set(field.failingIds)
                      );
                    }
                  }}
                  onHoverEnd={() => setHighlightedFeatureIds(null)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportItem({
  field,
  onToggle,
  onHoverStart,
  onHoverEnd,
  isActive,
}) {
  const isError = field.status === 'error';

  return (
    <div
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className={`p-3 rounded border transition-all hover:shadow-sm ${
        isError
          ? 'border-red-200 bg-red-50 hover:bg-red-100'
          : 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100'
      }`}
    >
      <div className="flex justify-between items-start mb-1">
        <div>
          <h4 className="font-semibold text-sm text-gray-900">
            {field.label || field.fieldKey}
          </h4>
          {field.conditionLabel && (
            <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium bg-white border rounded-full text-gray-600 mt-0.5">
              {field.conditionLabel}
            </span>
          )}
        </div>
        <span
          className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${
            isError
              ? 'bg-red-200 text-red-800'
              : 'bg-yellow-200 text-yellow-800'
          }`}
        >
          {isError ? 'Mangler' : 'Advarsel'}
        </span>
      </div>

      <div className="text-xs text-gray-700 space-y-0.5">
        <div className="flex justify-between">
          <span>Mangler:</span>
          <span className="font-mono font-medium">
            {field.stats.missing} / {field.stats.total}
          </span>
        </div>
        {field.stats.invalid > 0 && (
          <div className="flex justify-between text-red-600">
            <span>Ugyldige:</span>
            <span className="font-mono font-medium">
              {field.stats.invalid}
            </span>
          </div>
        )}
        {field.stats.unexpected > 0 && (
          <div className="flex justify-between text-yellow-600">
            <span>Uventede:</span>
            <span className="font-mono font-medium">
              {field.stats.unexpected}
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${
            isError ? 'bg-red-500' : 'bg-yellow-500'
          }`}
          style={{ width: `${field.stats.completion}%` }}
        />
      </div>
      <div className="text-[10px] text-right mt-0.5 text-gray-500">
        {field.stats.completion.toFixed(1)}% utfylt
      </div>

      {field.failingIds && field.failingIds.length > 0 && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="text-[11px] px-2 py-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
          >
            {isActive ? 'Tilbake til full visning' : 'Vis objekter'}
          </button>
        </div>
      )}
    </div>
  );
}
