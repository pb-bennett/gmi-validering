'use client';

import { useState, useEffect } from 'react';
import useStore from '@/lib/store';
import {
  getTerrainStats,
  resetTerrainStats,
} from '@/lib/analysis/terrain';

/**
 * DevDiagnosticsPanel - Collapsible panel for terrain API stats
 *
 * Shows:
 * - API request count
 * - Points fetched/cached
 * - Cache hit rate
 * - Average request time
 * - Terrain type distribution
 * - Queue status
 */
export default function DevDiagnosticsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState(null);

  const terrainData = useStore((state) => state.terrain.data);
  const fetchQueue = useStore((state) => state.terrain.fetchQueue);
  const currentlyFetching = useStore(
    (state) => state.terrain.currentlyFetching,
  );
  const selectedPipeIndex = useStore(
    (state) => state.analysis.selectedPipeIndex,
  );

  const selectedTerrain =
    selectedPipeIndex !== null
      ? terrainData[selectedPipeIndex]
      : null;
  const selectedWarnings =
    selectedTerrain?.overcover?.warnings || [];

  const terrainJumpStats = (() => {
    if (!selectedTerrain?.points?.length) return null;
    const points = [...selectedTerrain.points]
      .map((p) => ({
        dist: p.dist,
        z: p.terrainZ ?? p.z ?? null,
      }))
      .filter((p) => p.z !== null && p.z !== undefined)
      .sort((a, b) => a.dist - b.dist);

    if (points.length < 2) return null;

    const jumps = [];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const dz = curr.z - prev.z;
      jumps.push({
        from: prev.dist,
        to: curr.dist,
        dz,
        abs: Math.abs(dz),
      });
    }

    const maxJump = jumps.reduce(
      (acc, j) => (j.abs > acc.abs ? j : acc),
      jumps[0],
    );
    const largeJumps = jumps.filter((j) => j.abs >= 1.0);
    const topJumps = [...jumps]
      .sort((a, b) => b.abs - a.abs)
      .slice(0, 5);

    return { maxJump, largeJumps, topJumps };
  })();

  // Refresh stats periodically when panel is open
  useEffect(() => {
    if (!isOpen) return;

    const updateStats = () => {
      setStats(getTerrainStats());
    };

    updateStats();
    const interval = setInterval(updateStats, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Count terrain data states
  const dataStats = Object.values(terrainData).reduce(
    (acc, td) => {
      acc.total++;
      if (td.status === 'done') acc.done++;
      else if (td.status === 'loading') acc.loading++;
      else if (td.status === 'error') acc.error++;
      if (td.overcover?.warnings?.length > 0) acc.overcoverWarnings++;
      return acc;
    },
    { total: 0, done: 0, loading: 0, error: 0, overcoverWarnings: 0 },
  );

  return (
    <div className="fixed bottom-2 right-2 z-[3000]">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow hover:bg-gray-700 flex items-center gap-1"
        title="Terrain API Diagnostics"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        DEV
      </button>

      {/* Panel */}
      {isOpen && stats && (
        <div className="absolute bottom-8 right-0 bg-gray-900 text-white text-xs rounded shadow-lg p-3 w-72 max-h-96 overflow-auto">
          <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
            <h3 className="font-bold">Terrain API Stats</h3>
            <button
              onClick={() => {
                resetTerrainStats();
                setStats(getTerrainStats());
              }}
              className="text-gray-400 hover:text-white px-1"
              title="Reset stats"
            >
              Reset
            </button>
          </div>

          {/* Queue Status */}
          <div className="mb-2 p-2 bg-gray-800 rounded">
            <div className="font-semibold text-gray-400 mb-1">
              Queue Status
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              <span className="text-gray-400">Queue Length:</span>
              <span className="font-mono">{fetchQueue.length}</span>

              <span className="text-gray-400">
                Currently Fetching:
              </span>
              <span className="font-mono">
                {currentlyFetching ?? 'None'}
              </span>

              <span className="text-gray-400">Total Loaded:</span>
              <span className="font-mono text-green-400">
                {dataStats.done}
              </span>

              <span className="text-gray-400">Loading:</span>
              <span className="font-mono text-yellow-400">
                {dataStats.loading}
              </span>

              <span className="text-gray-400">Errors:</span>
              <span className="font-mono text-red-400">
                {dataStats.error}
              </span>

              <span className="text-gray-400">
                Overcover Warnings:
              </span>
              <span className="font-mono text-orange-400">
                {dataStats.overcoverWarnings}
              </span>
            </div>
          </div>

          {/* Selected Line Overcover */}
          {selectedPipeIndex !== null && (
            <div className="mb-2 p-2 bg-gray-800 rounded">
              <div className="font-semibold text-gray-400 mb-1">
                Selected Line
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                <span className="text-gray-400">Line Index:</span>
                <span className="font-mono">{selectedPipeIndex}</span>

                <span className="text-gray-400">Terrain Status:</span>
                <span className="font-mono">
                  {selectedTerrain?.status || 'idle'}
                </span>

                <span className="text-gray-400">Warnings:</span>
                <span className="font-mono text-orange-400">
                  {selectedWarnings.length}
                </span>

                <span className="text-gray-400">Min Overcover:</span>
                <span className="font-mono">
                  {selectedTerrain?.overcover?.minOvercover !== null &&
                  selectedTerrain?.overcover?.minOvercover !== undefined
                    ? `${selectedTerrain.overcover.minOvercover.toFixed(2)}m`
                    : '-'}
                </span>
              </div>

              {terrainJumpStats && (
                <div className="mt-2">
                  <div className="text-gray-400 mb-1">
                    Terrain jumps (ΔZ between samples):
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                    <span className="text-gray-400">Max ΔZ:</span>
                    <span className="font-mono text-yellow-300">
                      {terrainJumpStats.maxJump.abs.toFixed(2)}m
                    </span>
                    <span className="text-gray-400">≥1m jumps:</span>
                    <span className="font-mono">
                      {terrainJumpStats.largeJumps.length}
                    </span>
                  </div>
                  <div className="mt-1 max-h-20 overflow-auto">
                    {terrainJumpStats.topJumps.map((j, i) => (
                      <div key={`${j.from}-${i}`} className="flex justify-between">
                        <span className="font-mono">
                          {j.from.toFixed(1)}–{j.to.toFixed(1)}m
                        </span>
                        <span className="font-mono text-yellow-300">
                          {j.dz.toFixed(2)}m
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      console.log(
                        'Terrain jumps (selected line):',
                        terrainJumpStats,
                      )
                    }
                    className="mt-2 text-[10px] text-gray-300 hover:text-white"
                  >
                    Log terrain jumps
                  </button>
                </div>
              )}

              {selectedWarnings.length > 0 && (
                <div className="mt-2">
                  <div className="text-gray-400 mb-1">
                    Warning points (dist / overcover):
                  </div>
                  <div className="max-h-24 overflow-auto">
                    {selectedWarnings.slice(0, 10).map((w, i) => (
                      <div key={`${w.dist}-${i}`} className="flex justify-between">
                        <span className="font-mono">
                          {w.dist.toFixed(1)}m
                        </span>
                        <span className="font-mono text-red-300">
                          {w.overcover.toFixed(2)}m
                        </span>
                      </div>
                    ))}
                    {selectedWarnings.length > 10 && (
                      <div className="text-gray-500">
                        +{selectedWarnings.length - 10} more
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      console.log(
                        'Overcover warnings (selected line):',
                        selectedWarnings,
                      )
                    }
                    className="mt-2 text-[10px] text-gray-300 hover:text-white"
                  >
                    Log warnings to console
                  </button>
                </div>
              )}
            </div>
          )}

          {/* API Stats */}
          <div className="mb-2 p-2 bg-gray-800 rounded">
            <div className="font-semibold text-gray-400 mb-1">
              API Stats
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              <span className="text-gray-400">Requests:</span>
              <span className="font-mono">{stats.requestCount}</span>

              <span className="text-gray-400">Points Requested:</span>
              <span className="font-mono">
                {stats.pointsRequested}
              </span>

              <span className="text-gray-400">
                Points from Cache:
              </span>
              <span className="font-mono text-green-400">
                {stats.pointsFromCache}
              </span>

              <span className="text-gray-400">Cache Hit Rate:</span>
              <span className="font-mono text-cyan-400">
                {stats.cacheHitRate}
              </span>

              <span className="text-gray-400">Avg Request Time:</span>
              <span className="font-mono">
                {stats.avgRequestTimeMs}
              </span>

              <span className="text-gray-400">Cache Size:</span>
              <span className="font-mono">{stats.cacheSize}</span>

              <span className="text-gray-400">Errors:</span>
              <span className="font-mono text-red-400">
                {stats.errors}
              </span>
            </div>
          </div>

          {/* Terrain Types */}
          {Object.keys(stats.terrainTypes).length > 0 && (
            <div className="p-2 bg-gray-800 rounded">
              <div className="font-semibold text-gray-400 mb-1">
                Terrain Types
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                {Object.entries(stats.terrainTypes)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <div key={type} className="contents">
                      <span
                        className="text-gray-400 truncate"
                        title={type}
                      >
                        {type}:
                      </span>
                      <span className="font-mono">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
