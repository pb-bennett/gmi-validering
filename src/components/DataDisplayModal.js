'use client';

import useStore from '@/lib/store';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { fetchTerrainHeights } from '@/lib/analysis/terrain';

const formatCoord = (value, decimals = 2) => {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toFixed(decimals);
};

const formatCoordRow = (coord) =>
  coord
    ? `${formatCoord(coord.x)}, ${formatCoord(coord.y)}, ${formatCoord(coord.z)}`
    : '-';

export default function DataDisplayModal() {
  const data = useStore((state) => state.data);
  const file = useStore((state) => state.file);
  const terrainData = useStore((state) => state.terrain.data);
  const analysisResults = useStore((state) => state.analysis.results);
  const layers = useStore((state) => state.layers);
  const layerOrder = useStore((state) => state.layerOrder);
  const isOpen = useStore((state) => state.ui.dataInspectorOpen);
  const target = useStore((state) => state.ui.dataInspectorTarget);
  const closeDataInspector = useStore(
    (state) => state.closeDataInspector,
  );
  const setDataInspectorTarget = useStore(
    (state) => state.setDataInspectorTarget,
  );
  const [activeTab, setActiveTab] = useState('header');
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [expandedLinePoints, setExpandedLinePoints] = useState({});
  const [expandedLineTerrain, setExpandedLineTerrain] = useState({});
  const [expandedTargetPoints, setExpandedTargetPoints] =
    useState(false);
  const [expandedTargetTerrain, setExpandedTargetTerrain] =
    useState(false);
  const [pointTerrainHeights, setPointTerrainHeights] = useState({});
  const [fetchingPointTerrain, setFetchingPointTerrain] =
    useState(false);
  const pointTerrainKeyRef = useRef(null);

  const targetLayerId = target?.layerId || null;

  useEffect(() => {
    if (!targetLayerId && layerOrder.length > 0) {
      setSelectedLayerId((prev) => prev || layerOrder[layerOrder.length - 1]);
    }
  }, [targetLayerId, layerOrder]);

  // Reset point terrain when layer changes
  useEffect(() => {
    setPointTerrainHeights({});
    pointTerrainKeyRef.current = null;
  }, [targetLayerId, selectedLayerId]);

  const effectiveLayerId = targetLayerId || selectedLayerId || null;
  const activeLayer = effectiveLayerId ? layers[effectiveLayerId] : null;
  const activeData = activeLayer?.data || data;
  const activeFile = activeLayer?.file || file;
  const activeTerrainData = activeLayer?.terrain?.data || terrainData;
  const activeAnalysisResults =
    activeLayer?.analysis?.results || analysisResults;

  const header = activeData?.header || {};
  const points = activeData?.points || [];
  const lines = activeData?.lines || [];
  const targetPoint =
    target?.type === 'point' ? points?.[target.index] : null;
  const targetLine =
    target?.type === 'line' ? lines?.[target.index] : null;
  const targetTerrain = targetLine
    ? activeTerrainData?.[target.index]
    : null;
  const targetAnalysis = useMemo(() => {
    if (!targetLine) return null;
    return activeAnalysisResults?.find(
      (result) => result.lineIndex === target.index,
    );
  }, [activeAnalysisResults, targetLine, target?.index]);

  // Fetch terrain heights for points on demand (local state only)
  useEffect(() => {
    if (!isOpen) return;

    const wantsPoints =
      (!target && activeTab === 'points') || target?.type === 'point';
    if (!wantsPoints) return;

    const pts = activeData?.points || [];
    if (!pts.length) return;

    const fetchKey =
      target?.type === 'point'
        ? `point-${target.index}-${effectiveLayerId}`
        : `points-tab-${effectiveLayerId}`;

    if (pointTerrainKeyRef.current === fetchKey) return;
    pointTerrainKeyRef.current = fetchKey;

    const epsg = activeData?.header?.COSYS_EPSG || 25832;
    const coordsToFetch = [];
    const indexMap = [];

    if (target?.type === 'point') {
      const pt = pts[target.index];
      const c = pt?.coordinates?.[0];
      if (c?.x != null && c?.y != null) {
        coordsToFetch.push({ x: Number(c.x), y: Number(c.y) });
        indexMap.push(target.index);
      }
    } else {
      pts.slice(0, 100).forEach((pt, idx) => {
        const c = pt?.coordinates?.[0];
        if (c?.x != null && c?.y != null) {
          coordsToFetch.push({ x: Number(c.x), y: Number(c.y) });
          indexMap.push(idx);
        }
      });
    }

    if (!coordsToFetch.length) return;

    let cancelled = false;
    setFetchingPointTerrain(true);

    fetchTerrainHeights(coordsToFetch, epsg)
      .then((results) => {
        if (cancelled) return;
        setPointTerrainHeights((prev) => {
          const next = { ...prev };
          indexMap.forEach((ptIdx, i) => {
            next[ptIdx] = results[i] || null;
          });
          return next;
        });
      })
      .catch((err) =>
        console.error('Point terrain fetch error:', err),
      )
      .finally(() => {
        if (!cancelled) setFetchingPointTerrain(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, target, effectiveLayerId, activeData]);

  if (!isOpen || !activeData) return null;

  const handleClose = () => {
    closeDataInspector();
  };

  const renderPointCoordinates = (coords) => {
    if (!Array.isArray(coords) || coords.length === 0) return '-';
    if (coords.length === 1) return formatCoordRow(coords[0]);
    return coords.map((coord, idx) => (
      <div key={`coord-${idx}`}>{formatCoordRow(coord)}</div>
    ));
  };

  const renderLinePoints = (coords) => {
    if (!Array.isArray(coords) || coords.length === 0) {
      return (
        <div className="text-xs text-gray-500">Ingen punkter</div>
      );
    }

    return (
      <div className="max-h-60 overflow-auto border rounded bg-gray-50">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                #
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                X
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                Y
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                Z
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {coords.map((coord, idx) => (
              <tr key={`line-point-${idx}`}>
                <td className="px-3 py-1 text-xs text-gray-500">
                  {idx + 1}
                </td>
                <td className="px-3 py-1 text-xs text-gray-700">
                  {formatCoord(coord.x)}
                </td>
                <td className="px-3 py-1 text-xs text-gray-700">
                  {formatCoord(coord.y)}
                </td>
                <td className="px-3 py-1 text-xs text-gray-700">
                  {formatCoord(coord.z)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTerrainPoints = (terrainEntry) => {
    if (!terrainEntry) {
      return (
        <div className="text-xs text-gray-500">
          Ingen høydedata funnet ennå.
        </div>
      );
    }

    if (terrainEntry.status === 'loading') {
      return (
        <div className="text-xs text-gray-500">Henter høydedata...</div>
      );
    }

    if (terrainEntry.status === 'error') {
      return (
        <div className="text-xs text-red-600">
          Klarte ikke hente høydedata: {terrainEntry.error}
        </div>
      );
    }

    const terrainPoints = terrainEntry.points || [];
    if (terrainPoints.length === 0) {
      return (
        <div className="text-xs text-gray-500">
          Ingen høydedata tilgjengelig.
        </div>
      );
    }

    return (
      <div className="max-h-60 overflow-auto border rounded bg-gray-50">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                #
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                Distanse
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                X
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                Y
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                Terreng Z
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {terrainPoints.map((point, idx) => (
              <tr key={`terrain-point-${idx}`}>
                <td className="px-3 py-1 text-xs text-gray-500">
                  {idx + 1}
                </td>
                <td className="px-3 py-1 text-xs text-gray-700">
                  {formatCoord(point.dist, 2)}
                </td>
                <td className="px-3 py-1 text-xs text-gray-700">
                  {formatCoord(point.x)}
                </td>
                <td className="px-3 py-1 text-xs text-gray-700">
                  {formatCoord(point.y)}
                </td>
                <td className="px-3 py-1 text-xs text-gray-700">
                  {formatCoord(point.terrainZ ?? point.z)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90%] flex flex-col overflow-hidden">
        <div className="flex-none p-4 border-b flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-lg font-semibold">
              Datautforsker
            </h2>
            <p className="text-sm text-gray-500">
              Fil: {activeFile?.name || 'Ukjent fil'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!targetLayerId && layerOrder.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <span className="font-medium">Lag</span>
                <select
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                  value={effectiveLayerId || ''}
                  onChange={(e) =>
                    setSelectedLayerId(e.target.value || null)
                  }
                >
                  {layerOrder.map((layerId) => (
                    <option key={layerId} value={layerId}>
                      {layers[layerId]?.file?.name || layerId}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {target && (
              <button
                onClick={() => setDataInspectorTarget(null)}
                className="text-xs px-3 py-1.5 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              >
                Vis alle data
              </button>
            )}
            <button
              onClick={handleClose}
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
        </div>

        {!target && (
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
        )}

        <div className="flex-1 overflow-auto p-4">
          {targetPoint && (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-700">
                  Punkt #{target.index + 1}
                </h3>
                <div className="mt-2 text-xs text-gray-600">
                  Koordinater (X, Y, Z):
                </div>
                <div className="mt-1 text-sm text-gray-800">
                  {renderPointCoordinates(targetPoint.coordinates)}
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700">
                  Terrenghøyde
                </h4>
                <div className="mt-2 text-sm text-gray-800">
                  {fetchingPointTerrain &&
                  !pointTerrainHeights[target.index] ? (
                    <span className="text-xs text-gray-500">
                      Henter terrenghøyde…
                    </span>
                  ) : pointTerrainHeights[target.index]?.z !=
                    null ? (
                    <div className="text-xs space-y-1">
                      <div>
                        Terreng Z:{' '}
                        <span className="font-medium">
                          {formatCoord(
                            pointTerrainHeights[target.index].z,
                            3,
                          )}
                        </span>{' '}
                        m
                      </div>
                      {pointTerrainHeights[target.index]
                        .terreng && (
                        <div>
                          Type:{' '}
                          {pointTerrainHeights[target.index].terreng}
                        </div>
                      )}
                      {pointTerrainHeights[target.index]
                        .datakilde && (
                        <div>
                          Datakilde:{' '}
                          {
                            pointTerrainHeights[target.index]
                              .datakilde
                          }
                        </div>
                      )}
                      {targetPoint.coordinates?.[0]?.z != null && (
                        <div className="mt-1 pt-1 border-t">
                          Differanse (punkt − terreng):{' '}
                          <span className="font-medium">
                            {formatCoord(
                              Number(
                                targetPoint.coordinates[0].z,
                              ) -
                                pointTerrainHeights[target.index].z,
                              3,
                            )}
                          </span>{' '}
                          m
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">
                      Ingen terrenghøyde tilgjengelig
                    </span>
                  )}
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700">
                  Attributter
                </h4>
                <pre className="text-xs mt-2 bg-gray-50 p-3 rounded border max-h-72 overflow-auto">
                  {JSON.stringify(targetPoint.attributes, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {targetLine && (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-700">
                  Ledning #{target.index}
                </h3>
                {targetAnalysis && (
                  <div className="text-xs text-gray-500 mt-1">
                    Fall: {formatCoord(targetAnalysis.details?.incline, 2)}‰
                    {' • '}Lengde: {formatCoord(targetAnalysis.details?.length, 2)} m
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">
                    Linjepunkter (XYZ)
                  </h4>
                  <button
                    onClick={() =>
                      setExpandedTargetPoints((prev) => !prev)
                    }
                    className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
                  >
                    {expandedTargetPoints ? 'Skjul' : 'Vis'} ({
                      targetLine.coordinates?.length || 0
                    })
                  </button>
                </div>
                {expandedTargetPoints && (
                  <div className="mt-3">
                    {renderLinePoints(targetLine.coordinates)}
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">
                    Høydedata (terrengprofil)
                  </h4>
                  <button
                    onClick={() =>
                      setExpandedTargetTerrain((prev) => !prev)
                    }
                    className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
                  >
                    {expandedTargetTerrain ? 'Skjul' : 'Vis'} ({
                      targetTerrain?.points?.length || 0
                    })
                  </button>
                </div>
                {expandedTargetTerrain && (
                  <div className="mt-3">
                    {renderTerrainPoints(targetTerrain)}
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700">
                  Attributter
                </h4>
                <pre className="text-xs mt-2 bg-gray-50 p-3 rounded border max-h-72 overflow-auto">
                  {JSON.stringify(targetLine.attributes, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {target && !targetPoint && !targetLine && (
            <div className="text-sm text-gray-500">
              Fant ikke valgt objekt i gjeldende datasett.
            </div>
          )}

          {!target && activeTab === 'header' && (
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

          {!target && activeTab === 'points' && (
            <div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Koordinater (X, Y, Z)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Terreng Z
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Attributter
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Detaljer
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {points.slice(0, 100).map((point, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {idx + 1}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {renderPointCoordinates(point.coordinates)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {fetchingPointTerrain &&
                        pointTerrainHeights[idx] === undefined
                          ? '…'
                          : formatCoord(
                              pointTerrainHeights[idx]?.z,
                              3,
                            )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <pre className="text-xs">
                          {JSON.stringify(point.attributes, null, 2)}
                        </pre>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button
                          onClick={() =>
                            setDataInspectorTarget({
                              type: 'point',
                              index: idx,
                            })
                          }
                          className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
                        >
                          Vis
                        </button>
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

          {!target && activeTab === 'lines' && (
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
                      Detaljer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Attributter
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {lines.slice(0, 100).map((line, idx) => (
                    <Fragment key={idx}>
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {idx + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {line.coordinates?.length || 0} punkter
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() =>
                                setExpandedLinePoints((prev) => ({
                                  ...prev,
                                  [idx]: !prev[idx],
                                }))
                              }
                              className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
                            >
                              {expandedLinePoints[idx]
                                ? 'Skjul punkter'
                                : 'Vis punkter'}
                            </button>
                            <button
                              onClick={() =>
                                setExpandedLineTerrain((prev) => ({
                                  ...prev,
                                  [idx]: !prev[idx],
                                }))
                              }
                              className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
                            >
                              {expandedLineTerrain[idx]
                                ? 'Skjul høydedata'
                                : 'Vis høydedata'}
                            </button>
                            <button
                              onClick={() =>
                                setDataInspectorTarget({
                                  type: 'line',
                                  index: idx,
                                })
                              }
                              className="text-xs px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                            >
                              Fokus
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <pre className="text-xs">
                            {JSON.stringify(line.attributes, null, 2)}
                          </pre>
                        </td>
                      </tr>
                      {expandedLinePoints[idx] && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-6 pb-4 text-sm text-gray-500"
                          >
                            <div className="mt-2">
                              {renderLinePoints(line.coordinates)}
                            </div>
                          </td>
                        </tr>
                      )}
                      {expandedLineTerrain[idx] && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-6 pb-4 text-sm text-gray-500"
                          >
                            <div className="mt-2">
                              {renderTerrainPoints(activeTerrainData?.[idx])}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
