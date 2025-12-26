'use client';

import useStore from '@/lib/store';
import { useMemo, useState, useRef, useEffect } from 'react';
import fieldsData from '@/data/fields.json';

function SidebarSection({ title, children, isOpen, onToggle }) {
  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-white/50 hover:bg-white/80 transition-colors text-left"
      >
        <span className="font-semibold text-gray-800">{title}</span>
        <span className={`transform transition-transform duration-200 text-gray-400 ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="p-4 bg-white/30">
          {children}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ onReset }) {
  const file = useStore((state) => state.file);
  const data = useStore((state) => state.data);
  
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
    const punktField = fieldsData.find(f => f.fieldKey === 'Tema_punkt');
    const ledField = fieldsData.find(f => f.fieldKey === 'Tema_led');

    const punktMap = new Map(punktField?.acceptableValues?.map(v => [v.value, v.label]) || []);
    const ledMap = new Map(ledField?.acceptableValues?.map(v => [v.value, v.label]) || []);

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
    data.lines.forEach(line => {
      if (line.coordinates && line.coordinates.length > 1) {
        for (let i = 0; i < line.coordinates.length - 1; i++) {
          const p1 = line.coordinates[i];
          const p2 = line.coordinates[i+1];
          const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
          totalLength += dist;
        }
      }
    });

    // Calculate Tema stats (S_FCODE counts)
    const temaStats = {
      points: {},
      lines: {}
    };

    data.points.forEach(p => {
      const code = p.attributes?.S_FCODE || 'UKJENT';
      temaStats.points[code] = (temaStats.points[code] || 0) + 1;
    });

    data.lines.forEach(l => {
      const code = l.attributes?.S_FCODE || 'UKJENT';
      temaStats.lines[code] = (temaStats.lines[code] || 0) + 1;
    });

    return {
      pointCount,
      lineCount,
      totalLength: Math.round(totalLength),
      temaStats
    };
  }, [data]);

  if (!data) return null;

  return (
    <div 
      ref={sidebarRef}
      style={{ width: `${width}px` }}
      className="h-full bg-card border-r border-gray-200 flex flex-col shadow-xl z-20 relative flex-shrink-0"
    >
      {/* Resize Handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors z-30"
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white/50">
        <h1 className="text-lg font-bold text-primary">GMI Validering</h1>
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
                <span className="text-xs text-gray-500 block mb-1">Filnavn</span>
                <span className="font-medium text-gray-900 break-all block text-sm">{file?.name}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block mb-1">Størrelse</span>
                <span className="font-medium text-gray-900 text-sm">{(file?.size / 1024).toFixed(1)} KB</span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 gap-2">
              <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center">
                <span className="text-gray-600 text-sm">Punkter</span>
                <span className="font-bold text-primary">{stats.pointCount}</span>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center">
                <span className="text-gray-600 text-sm">Ledninger</span>
                <span className="font-bold text-primary">{stats.lineCount}</span>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                <span className="text-gray-600 text-sm block mb-1">Total lengde</span>
                <span className="font-bold text-primary">
                  {stats.totalLength.toLocaleString('nb-NO')} <span className="text-xs font-normal text-gray-500">meter</span>
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
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Punkter</h3>
              {Object.keys(stats.temaStats.points).length > 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Kode / Beskrivelse</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Antall</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.entries(stats.temaStats.points)
                        .sort(([,a], [,b]) => b - a)
                        .map(([code, count]) => {
                          const label = codeLookups.punktMap.get(code);
                          const isUnknown = !label;
                          return (
                            <tr key={code} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <div className={`font-mono text-xs font-bold ${isUnknown ? 'text-red-600' : 'text-gray-900'}`}>
                                  {code}
                                </div>
                                <div className={`text-xs ${isUnknown ? 'text-red-500 italic' : 'text-gray-500'}`}>
                                  {label || 'Ukjent kode'}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right text-gray-600 font-medium align-top">{count}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">Ingen punkter funnet.</p>
              )}
            </div>

            {/* Lines Table */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ledninger</h3>
              {Object.keys(stats.temaStats.lines).length > 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Kode / Beskrivelse</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Antall</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.entries(stats.temaStats.lines)
                        .sort(([,a], [,b]) => b - a)
                        .map(([code, count]) => {
                          const label = codeLookups.ledMap.get(code);
                          const isUnknown = !label;
                          return (
                            <tr key={code} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <div className={`font-mono text-xs font-bold ${isUnknown ? 'text-red-600' : 'text-gray-900'}`}>
                                  {code}
                                </div>
                                <div className={`text-xs ${isUnknown ? 'text-red-500 italic' : 'text-gray-500'}`}>
                                  {label || 'Ukjent kode'}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right text-gray-600 font-medium align-top">{count}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">Ingen ledninger funnet.</p>
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
          <p className="text-sm text-gray-500 italic">Ingen feltdefinisjoner lastet.</p>
        </SidebarSection>

        {/* Validering */}
        <SidebarSection 
          title="Validering" 
          isOpen={openSection === 'validering'} 
          onToggle={() => toggleSection('validering')}
        >
          <p className="text-sm text-gray-500 italic">Ingen valideringsfeil funnet.</p>
        </SidebarSection>

      </div>
      
      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 bg-white/50">
        <button 
          onClick={onReset}
          className="w-full py-2 px-4 bg-white border border-red-200 rounded-md shadow-sm text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
        >
          Nullstill og last opp ny
        </button>
      </div>
    </div>
  );
}
