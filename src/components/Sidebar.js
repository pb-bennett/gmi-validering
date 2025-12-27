'use client';

import useStore from '@/lib/store';
import React, { useMemo, useState, useRef, useEffect } from 'react';
import fieldsData from '@/data/fields.json';

function SidebarSection({ title, children, isOpen, onToggle }) {
  return (
    <div className="border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 transition-colors text-left"
        style={{ 
          backgroundColor: 'var(--color-sidebar-bg)',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-sidebar-bg)'}
      >
        <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{title}</span>
        <span
          className={`transform transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ▼
        </span>
      </button>
      {isOpen && <div className="p-4" style={{ backgroundColor: 'var(--color-card)' }}>{children}</div>}
    </div>
  );
}

export default function Sidebar({ onReset }) {
  const file = useStore((state) => state.file);
  const data = useStore((state) => state.data);
  const setHighlightedCode = useStore(
    (state) => state.setHighlightedCode
  );
  const setHighlightedType = useStore(
    (state) => state.setHighlightedType
  );
  const toggleHiddenCode = useStore(
    (state) => state.toggleHiddenCode
  );
  const toggleHiddenType = useStore(
    (state) => state.toggleHiddenType
  );
  const hiddenCodes = useStore((state) => state.ui.hiddenCodes);
  const hiddenTypes = useStore((state) => state.ui.hiddenTypes);

  // State for sidebar width and resizing
  const [width, setWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);

  // State for accordion sections
  const [openSection, setOpenSection] = useState('oversikt');

  const toggleSection = (section) => {
    setOpenSection(openSection === section ? null : section);
  };

  // Prepare code lookups
  const codeLookups = useMemo(() => {
    const punktField = fieldsData.find(
      (f) => f.fieldKey === 'Tema_punkt'
    );
    const ledField = fieldsData.find(
      (f) => f.fieldKey === 'Tema_led'
    );

    const punktMap = new Map(
      punktField?.acceptableValues?.map((v) => [v.value, v.label]) ||
        []
    );
    const ledMap = new Map(
      ledField?.acceptableValues?.map((v) => [v.value, v.label]) || []
    );

    return { punktMap, ledMap };
  }, []);

  // Handle resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth > 200 && newWidth < 800) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const stats = useMemo(() => {
    if (!data) return null;

    const pointCount = data.points.length;
    const lineCount = data.lines.length;

    let totalLength = 0;
    data.lines.forEach((line) => {
      if (line.coordinates && line.coordinates.length > 1) {
        for (let i = 0; i < line.coordinates.length - 1; i++) {
          const p1 = line.coordinates[i];
          const p2 = line.coordinates[i + 1];
          const dist = Math.sqrt(
            Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
          );
          totalLength += dist;
        }
      }
    });

    // Calculate Tema stats (S_FCODE counts)
    const temaStats = {
      points: {},
      lines: {},
    };

    data.points.forEach((p) => {
      const code = p.attributes?.S_FCODE || 'UKJENT';
      if (!temaStats.points[code]) {
        temaStats.points[code] = { count: 0, types: {} };
      }
      temaStats.points[code].count++;

      // Track Type distribution
      const typeVal = p.attributes?.Type || '(Mangler Type)';
      temaStats.points[code].types[typeVal] =
        (temaStats.points[code].types[typeVal] || 0) + 1;
    });

    data.lines.forEach((l) => {
      const code = l.attributes?.S_FCODE || 'UKJENT';
      if (!temaStats.lines[code]) {
        temaStats.lines[code] = { count: 0, types: {} };
      }
      temaStats.lines[code].count++;

      // Track Type distribution
      const typeVal = l.attributes?.Type || '(Mangler Type)';
      temaStats.lines[code].types[typeVal] =
        (temaStats.lines[code].types[typeVal] || 0) + 1;
    });

    return {
      pointCount,
      lineCount,
      totalLength: Math.round(totalLength),
      temaStats,
    };
  }, [data]);

  if (!data) return null;

  return (
    <div
      ref={sidebarRef}
      style={{ 
        width: `${width}px`,
        backgroundColor: 'var(--color-card)',
        borderRightColor: 'var(--color-border)'
      }}
      className="h-full border-r flex flex-col shadow-xl z-20 relative flex-shrink-0"
    >
      {/* Resize Handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors z-30"
        style={{ backgroundColor: 'transparent' }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-primary-light)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Header */}
      <div 
        className="p-4 border-b" 
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-sidebar-bg)'
        }}
      >
        <h1 className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
          GMI Validering
        </h1>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        {/* Oversikt */}
        <SidebarSection
          title="Oversikt"
          isOpen={openSection === 'oversikt'}
          onToggle={() => toggleSection('oversikt')}
        >
          <div className="space-y-4">
            {/* File Info */}
            <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
              <div className="mb-2">
                <span className="text-xs text-gray-500 block mb-1">
                  Filnavn
                </span>
                <span className="font-medium text-gray-900 break-all block text-sm">
                  {file?.name}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block mb-1">
                  Størrelse
                </span>
                <span className="font-medium text-gray-900 text-sm">
                  {(file?.size / 1024).toFixed(1)} KB
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 gap-2">
              <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center">
                <span className="text-gray-600 text-sm">Punkter</span>
                <span className="font-bold text-primary">
                  {stats.pointCount}
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center">
                <span className="text-gray-600 text-sm">
                  Ledninger
                </span>
                <span className="font-bold text-primary">
                  {stats.lineCount}
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                <span className="text-gray-600 text-sm block mb-1">
                  Total lengde
                </span>
                <span className="font-bold text-primary">
                  {stats.totalLength.toLocaleString('nb-NO')}{' '}
                  <span className="text-xs font-normal text-gray-500">
                    meter
                  </span>
                </span>
              </div>
            </div>
          </div>
        </SidebarSection>

        {/* Tema */}
        <SidebarSection
          title="Tema"
          isOpen={openSection === 'tema'}
          onToggle={() => toggleSection('tema')}
        >
          <div className="space-y-6">
            {/* Points Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Punkter
                </h3>
                {Object.keys(stats.temaStats.points).length > 0 && (
                  <button
                    onClick={() => {
                      const pointCodes = Object.keys(
                        stats.temaStats.points
                      );
                      const allHidden = pointCodes.every((code) =>
                        hiddenCodes.includes(code)
                      );
                      if (allHidden) {
                        // Show all: remove all point codes from hiddenCodes
                        pointCodes.forEach((code) => {
                          if (hiddenCodes.includes(code)) {
                            toggleHiddenCode(code);
                          }
                        });
                      } else {
                        // Hide all: add all point codes to hiddenCodes
                        pointCodes.forEach((code) => {
                          if (!hiddenCodes.includes(code)) {
                            toggleHiddenCode(code);
                          }
                        });
                      }
                    }}
                    className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                  >
                    {Object.keys(stats.temaStats.points).every(
                      (code) => hiddenCodes.includes(code)
                    )
                      ? 'Vis alle'
                      : 'Skjul alle'}
                  </button>
                )}
              </div>
              {Object.keys(stats.temaStats.points).length > 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Kode / Beskrivelse
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Antall
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.entries(stats.temaStats.points)
                        .sort(([, a], [, b]) => b.count - a.count)
                        .map(([code, data]) => {
                          const label =
                            codeLookups.punktMap.get(code);
                          const isUnknown = !label;
                          const isHidden = hiddenCodes.includes(code);
                          const hasTypes =
                            Object.keys(data.types).length > 0 &&
                            !(
                              Object.keys(data.types).length === 1 &&
                              data.types['(Mangler Type)']
                            );

                          return (
                            <React.Fragment key={code}>
                              <tr
                                className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                                  isHidden ? 'opacity-50' : ''
                                }`}
                                onMouseEnter={() =>
                                  setHighlightedCode(code)
                                }
                                onMouseLeave={() =>
                                  setHighlightedCode(null)
                                }
                              >
                                <td className="px-3 py-2">
                                  <div className="flex items-start gap-2">
                                    <input
                                      type="checkbox"
                                      checked={!isHidden}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        toggleHiddenCode(code);
                                      }}
                                      className="mt-1 h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div>
                                      <div
                                        className={`font-mono text-xs font-bold ${
                                          isUnknown
                                            ? 'text-red-600'
                                            : 'text-gray-900'
                                        }`}
                                      >
                                        {code}
                                      </div>
                                      <div
                                        className={`text-xs ${
                                          isUnknown
                                            ? 'text-red-500 italic'
                                            : 'text-gray-500'
                                        }`}
                                      >
                                        {label || 'Ukjent kode'}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right text-gray-600 font-medium align-top">
                                  {data.count}
                                </td>
                              </tr>
                              {hasTypes && (
                                <tr className="bg-gray-50/50">
                                  <td
                                    colSpan="2"
                                    className="px-3 py-1 pb-2"
                                  >
                                    <div className="ml-8 text-xs border-l-2 border-gray-200 pl-2 space-y-1">
                                      {Object.entries(data.types)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(
                                          ([typeVal, typeCount]) => {
                                            const isTypeHidden =
                                              hiddenTypes.some(
                                                (ht) =>
                                                  ht.type ===
                                                    typeVal &&
                                                  ht.code === code
                                              );
                                            return (
                                              <div
                                                key={typeVal}
                                                className={`flex justify-between items-center text-gray-500 cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 transition-colors ${
                                                  isTypeHidden
                                                    ? 'opacity-50'
                                                    : ''
                                                }`}
                                                onMouseEnter={() =>
                                                  setHighlightedType(
                                                    typeVal,
                                                    code
                                                  )
                                                }
                                                onMouseLeave={() =>
                                                  setHighlightedType(
                                                    null,
                                                    null
                                                  )
                                                }
                                              >
                                                <div className="flex items-center gap-1">
                                                  <input
                                                    type="checkbox"
                                                    checked={
                                                      !isTypeHidden
                                                    }
                                                    onChange={(e) => {
                                                      e.stopPropagation();
                                                      toggleHiddenType(
                                                        typeVal,
                                                        code
                                                      );
                                                    }}
                                                    className="h-2.5 w-2.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                  />
                                                  <span
                                                    className={
                                                      typeVal ===
                                                      '(Mangler Type)'
                                                        ? 'italic text-red-400'
                                                        : ''
                                                    }
                                                  >
                                                    {typeVal}
                                                  </span>
                                                </div>
                                                <span className="font-mono text-gray-400">
                                                  {typeCount}
                                                </span>
                                              </div>
                                            );
                                          }
                                        )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  Ingen punkter funnet.
                </p>
              )}
            </div>

            {/* Lines Table - LEDNINGER SECTION */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Ledninger
                </h3>
                {Object.keys(stats.temaStats.lines).length > 0 && (
                  <button
                    onClick={() => {
                      const lineCodes = Object.keys(
                        stats.temaStats.lines
                      );
                      const allHidden = lineCodes.every((code) =>
                        hiddenCodes.includes(code)
                      );
                      if (allHidden) {
                        // Show all: remove all line codes from hiddenCodes
                        lineCodes.forEach((code) => {
                          if (hiddenCodes.includes(code)) {
                            toggleHiddenCode(code);
                          }
                        });
                      } else {
                        // Hide all: add all line codes to hiddenCodes
                        lineCodes.forEach((code) => {
                          if (!hiddenCodes.includes(code)) {
                            toggleHiddenCode(code);
                          }
                        });
                      }
                    }}
                    className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                  >
                    {Object.keys(stats.temaStats.lines).every(
                      (code) => hiddenCodes.includes(code)
                    )
                      ? 'Vis alle'
                      : 'Skjul alle'}
                  </button>
                )}
              </div>
              {Object.keys(stats.temaStats.lines).length > 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Kode / Beskrivelse
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Antall
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.entries(stats.temaStats.lines)
                        .sort(([, a], [, b]) => b.count - a.count)
                        .map(([code, data]) => {
                          const label = codeLookups.ledMap.get(code);
                          const isUnknown = !label;
                          const isHidden = hiddenCodes.includes(code);
                          const hasTypes =
                            Object.keys(data.types).length > 0 &&
                            !(
                              Object.keys(data.types).length === 1 &&
                              data.types['(Mangler Type)']
                            );

                          return (
                            <React.Fragment key={code}>
                              <tr
                                className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                                  isHidden ? 'opacity-50' : ''
                                }`}
                                onMouseEnter={() =>
                                  setHighlightedCode(code)
                                }
                                onMouseLeave={() =>
                                  setHighlightedCode(null)
                                }
                              >
                                <td className="px-3 py-2">
                                  <div className="flex items-start gap-2">
                                    <input
                                      type="checkbox"
                                      checked={!isHidden}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        toggleHiddenCode(code);
                                      }}
                                      className="mt-1 h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div>
                                      <div
                                        className={`font-mono text-xs font-bold ${
                                          isUnknown
                                            ? 'text-red-600'
                                            : 'text-gray-900'
                                        }`}
                                      >
                                        {code}
                                      </div>
                                      <div
                                        className={`text-xs ${
                                          isUnknown
                                            ? 'text-red-500 italic'
                                            : 'text-gray-500'
                                        }`}
                                      >
                                        {label || 'Ukjent kode'}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right text-gray-600 font-medium align-top">
                                  {data.count}
                                </td>
                              </tr>
                              {hasTypes && (
                                <tr className="bg-gray-50/50">
                                  <td
                                    colSpan="2"
                                    className="px-3 py-1 pb-2"
                                  >
                                    <div className="ml-8 text-xs border-l-2 border-gray-200 pl-2 space-y-1">
                                      {Object.entries(data.types)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(
                                          ([typeVal, typeCount]) => {
                                            const isTypeHidden =
                                              hiddenTypes.some(
                                                (ht) =>
                                                  ht.type ===
                                                    typeVal &&
                                                  ht.code === code
                                              );
                                            return (
                                              <div
                                                key={typeVal}
                                                className={`flex justify-between items-center text-gray-500 cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 transition-colors ${
                                                  isTypeHidden
                                                    ? 'opacity-50'
                                                    : ''
                                                }`}
                                                onMouseEnter={() =>
                                                  setHighlightedType(
                                                    typeVal,
                                                    code
                                                  )
                                                }
                                                onMouseLeave={() =>
                                                  setHighlightedType(
                                                    null,
                                                    null
                                                  )
                                                }
                                              >
                                                <div className="flex items-center gap-1">
                                                  <input
                                                    type="checkbox"
                                                    checked={
                                                      !isTypeHidden
                                                    }
                                                    onChange={(e) => {
                                                      e.stopPropagation();
                                                      toggleHiddenType(
                                                        typeVal,
                                                        code
                                                      );
                                                    }}
                                                    className="h-2.5 w-2.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                  />
                                                  <span
                                                    className={
                                                      typeVal ===
                                                      '(Mangler Type)'
                                                        ? 'italic text-red-400'
                                                        : ''
                                                    }
                                                  >
                                                    {typeVal}
                                                  </span>
                                                </div>
                                                <span className="font-mono text-gray-400">
                                                  {typeCount}
                                                </span>
                                              </div>
                                            );
                                          }
                                        )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  Ingen ledninger funnet.
                </p>
              )}
            </div>
          </div>
        </SidebarSection>

        {/* Felt */}
        <SidebarSection
          title="Felt"
          isOpen={openSection === 'felt'}
          onToggle={() => toggleSection('felt')}
        >
          <p className="text-sm text-gray-500 italic">
            Ingen feltdefinisjoner lastet.
          </p>
        </SidebarSection>

        {/* Validering */}
        <SidebarSection
          title="Validering"
          isOpen={openSection === 'validering'}
          onToggle={() => toggleSection('validering')}
        >
          <p className="text-sm text-gray-500 italic">
            Ingen valideringsfeil funnet.
          </p>
        </SidebarSection>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-sidebar-bg)' }}>
        <button
          onClick={onReset}
          className="w-full py-2 px-4 border rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors"
          style={{
            backgroundColor: 'var(--color-card)',
            borderColor: 'var(--color-primary-light)',
            color: 'var(--color-primary-dark)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-page-bg)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-card)'}
        >
          Nullstill og last opp ny
        </button>
      </div>
    </div>
  );
}
