'use client';

import { useMemo, useState } from 'react';
import useStore from '@/lib/store';
import fieldsData from '@/data/fields.json';

export default function DataTable() {
  const data = useStore((state) => state.data);
  const setHighlightedFeature = useStore(
    (state) => state.setHighlightedFeature
  );
  const toggleDataTable = useStore((state) => state.toggleDataTable);
  const viewObjectInMap = useStore((state) => state.viewObjectInMap);

  const [activeTab, setActiveTab] = useState('punkter');
  const [columnOrder, setColumnOrder] = useState([]);
  const [sortConfig, setSortConfig] = useState({
    field: null,
    direction: null,
  });
  const [draggedColumn, setDraggedColumn] = useState(null);

  // Get the appropriate dataset
  const items = useMemo(() => {
    if (!data) return [];
    return activeTab === 'punkter' ? data.points : data.lines;
  }, [data, activeTab]);

  // Extract field names with data (S_FCODE always first)
  const allFields = useMemo(() => {
    if (items.length === 0) return [];

    const fieldSet = new Set();
    const fieldHasData = {};

    items.forEach((item) => {
      if (item.attributes) {
        Object.keys(item.attributes).forEach((key) => {
          fieldSet.add(key);
          const value = item.attributes[key];
          if (value !== null && value !== undefined && value !== '') {
            fieldHasData[key] = true;
          }
        });
      }
    });

    // Only include fields that have at least one non-empty value
    const fields = Array.from(fieldSet).filter(
      (field) => fieldHasData[field]
    );

    // S_FCODE always first
    const sfcodeIndex = fields.indexOf('S_FCODE');
    if (sfcodeIndex > -1) {
      fields.splice(sfcodeIndex, 1);
      fields.unshift('S_FCODE');
    }

    return fields;
  }, [items]);

  // Use the stateful order if the user has reordered columns; otherwise fall back to allFields.
  const effectiveColumnOrder =
    columnOrder.length > 0 ? columnOrder : allFields;

  // Get field label from fields.json
  const getFieldLabel = (fieldName) => {
    const fieldDef = fieldsData.find((f) => f.fieldKey === fieldName);
    return fieldDef?.label || fieldName;
  };

  // Sort data
  const sortedItems = useMemo(() => {
    if (!sortConfig.field || !sortConfig.direction) return items;

    return [...items].sort((a, b) => {
      const aVal = a.attributes?.[sortConfig.field];
      const bVal = b.attributes?.[sortConfig.field];

      // Handle nulls
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      // Compare
      let comparison = 0;
      if (typeof aVal === 'string') {
        comparison = aVal.localeCompare(String(bVal));
      } else {
        comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      }

      return sortConfig.direction === 'asc'
        ? comparison
        : -comparison;
    });
  }, [items, sortConfig]);

  // Handle column sort
  const handleSort = (field) => {
    setSortConfig((current) => {
      if (current.field !== field) {
        return { field, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { field, direction: 'desc' };
      }
      return { field: null, direction: null };
    });
  };

  // Handle row click (highlight on map)
  const handleRowClick = (item, index) => {
    const featureId = `${activeTab}-${index}`;
    setHighlightedFeature(featureId);
  };

  // Handle zoom to feature
  const handleZoomTo = (item, index, e) => {
    e.stopPropagation();
    const featureId = `${activeTab}-${index}`;

    // Get coordinates for zooming
    // item.coordinates are in GMI format [y, x] (northing, easting)
    let coords = null;
    if (item.coordinates && item.coordinates.length > 0) {
      if (activeTab === 'punkter') {
        // Point - use first coordinate
        coords = item.coordinates[0];
      } else {
        // Line - use midpoint
        const midIdx = Math.floor(item.coordinates.length / 2);
        coords = item.coordinates[midIdx];
      }
    }

    if (coords && coords.y !== undefined && coords.x !== undefined) {
      // viewObjectInMap expects [y, x] format (northing, easting)
      viewObjectInMap(featureId, [coords.y, coords.x], 20);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, field) => {
    if (field === 'S_FCODE') return; // Can't drag S_FCODE
    setDraggedColumn(field);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, targetField) => {
    e.preventDefault();
    if (targetField === 'S_FCODE' || !draggedColumn) return;
  };

  const handleDrop = (e, targetField) => {
    e.preventDefault();
    if (
      targetField === 'S_FCODE' ||
      !draggedColumn ||
      draggedColumn === targetField
    ) {
      setDraggedColumn(null);
      return;
    }

    const newOrder = [...effectiveColumnOrder];
    const draggedIndex = newOrder.indexOf(draggedColumn);
    const targetIndex = newOrder.indexOf(targetField);

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedColumn);

    setColumnOrder(newOrder);
    setDraggedColumn(null);
  };

  if (!data) return null;

  return (
    <div
      className="flex flex-col h-full"
      style={{
        backgroundColor: 'var(--color-card)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-4 px-4 py-3 shrink-0"
        style={{
          backgroundColor: 'var(--color-page-bg)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <h3
          className="text-sm font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          Felt datatabell
        </h3>

        {/* Tabs - on the left next to title */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('punkter')}
            className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
            style={{
              backgroundColor:
                activeTab === 'punkter'
                  ? 'var(--color-primary)'
                  : 'transparent',
              color:
                activeTab === 'punkter'
                  ? 'white'
                  : 'var(--color-text-secondary)',
            }}
          >
            Punkter ({data.points.length})
          </button>
          <button
            onClick={() => setActiveTab('ledninger')}
            className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
            style={{
              backgroundColor:
                activeTab === 'ledninger'
                  ? 'var(--color-primary)'
                  : 'transparent',
              color:
                activeTab === 'ledninger'
                  ? 'white'
                  : 'var(--color-text-secondary)',
            }}
          >
            Ledninger ({data.lines.length})
          </button>
        </div>

        {/* Spacer to push close button to right */}
        <div className="flex-1" />

        {/* Close button */}
        <button
          onClick={toggleDataTable}
          className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
          style={{
            backgroundColor: '#e5e7eb',
            color: '#374151',
            border: '1px solid #d1d5db',
          }}
          title="Lukk tabell"
        >
          <span
            style={{
              fontSize: '18px',
              fontWeight: 'bold',
              lineHeight: 1,
            }}
          >
            ×
          </span>
        </button>
      </div>

      {/* Table container with horizontal scroll */}
      <div
        className="flex-1"
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <table
          className="text-xs border-collapse"
          style={{ minWidth: '100%', width: 'max-content' }}
        >
          <thead className="sticky top-0 z-10">
            <tr style={{ backgroundColor: 'var(--color-page-bg)' }}>
              {/* Zoom column */}
              <th
                className="sticky left-0 z-20 px-2 py-2 text-center border-b border-r font-medium"
                style={{
                  backgroundColor: 'var(--color-page-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-secondary)',
                  width: '50px',
                  minWidth: '50px',
                }}
              >
                Zoom
              </th>

              {/* Data columns */}
              {effectiveColumnOrder.map((field) => {
                const isFixed = field === 'S_FCODE';
                const isSorted = sortConfig.field === field;
                return (
                  <th
                    key={field}
                    draggable={!isFixed}
                    onDragStart={(e) => handleDragStart(e, field)}
                    onDragOver={(e) => handleDragOver(e, field)}
                    onDrop={(e) => handleDrop(e, field)}
                    onClick={() => handleSort(field)}
                    className={`px-3 py-2 text-left border-b font-medium cursor-pointer select-none ${
                      isFixed ? 'sticky z-20 border-r' : ''
                    }`}
                    style={{
                      backgroundColor: 'var(--color-page-bg)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                      left: isFixed ? '50px' : 'auto',
                      minWidth: '120px',
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">
                        {getFieldLabel(field)}
                      </span>
                      {isSorted && (
                        <span
                          style={{ color: 'var(--color-primary)' }}
                        >
                          {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                      {!isFixed && (
                        <span className="opacity-30 text-[10px]">
                          ⋮⋮
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item, index) => {
              return (
                <tr
                  key={index}
                  onClick={() => handleRowClick(item, index)}
                  className="cursor-pointer border-b transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  {/* Zoom button */}
                  <td
                    className="sticky left-0 z-10 px-2 py-1.5 text-center border-r"
                    style={{
                      backgroundColor: 'var(--color-card)',
                      borderColor: 'var(--color-border)',
                    }}
                  >
                    <button
                      onClick={(e) => handleZoomTo(item, index, e)}
                      className="w-6 h-6 rounded text-sm transition-transform hover:scale-110"
                      style={{
                        backgroundColor: 'var(--color-page-bg)',
                        color: 'var(--color-primary)',
                      }}
                      title="Zoom til"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 mx-auto"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </button>
                  </td>

                  {/* Data cells */}
                  {effectiveColumnOrder.map((field) => {
                    const value = item.attributes?.[field];
                    const displayValue =
                      value === null ||
                      value === undefined ||
                      value === ''
                        ? '-'
                        : String(value);
                    const isFixed = field === 'S_FCODE';

                    return (
                      <td
                        key={field}
                        className={`px-3 py-1.5 ${
                          isFixed
                            ? 'sticky z-10 border-r font-medium'
                            : ''
                        }`}
                        style={{
                          backgroundColor: isFixed
                            ? 'var(--color-card)'
                            : 'transparent',
                          borderColor: 'var(--color-border)',
                          color:
                            displayValue === '-'
                              ? 'var(--color-text-secondary)'
                              : 'var(--color-text)',
                          left: isFixed ? '50px' : 'auto',
                        }}
                      >
                        {displayValue}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-2 border-t text-xs shrink-0"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-secondary)',
          backgroundColor: 'var(--color-page-bg)',
        }}
      >
        <span>
          Viser {sortedItems.length}{' '}
          {activeTab === 'punkter' ? 'punkter' : 'ledninger'}
        </span>
        <button
          onClick={toggleDataTable}
          className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
          style={{
            backgroundColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          Lukk
        </button>
      </div>
    </div>
  );
}
