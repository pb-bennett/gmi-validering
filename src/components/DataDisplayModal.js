'use client';

import useStore from '@/lib/store';
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { fetchTerrainHeights } from '@/lib/analysis/terrain';
import { XIcon } from '@phosphor-icons/react';

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
      setSelectedLayerId(
        (prev) => prev || layerOrder[layerOrder.length - 1],
      );
    }
  }, [targetLayerId, layerOrder]);

  // Reset point terrain when layer changes
  useEffect(() => {
    setPointTerrainHeights({});
    pointTerrainKeyRef.current = null;
  }, [targetLayerId, selectedLayerId]);

  const effectiveLayerId = targetLayerId || selectedLayerId || null;
  const activeLayer = effectiveLayerId
    ? layers[effectiveLayerId]
    : null;
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
        <div className="text-xs text-gmi-text-subtle">Ingen punkter</div>
      );
    }

    return (
      <div className="max-h-60 overflow-auto border border-gmi-border rounded bg-gmi-surface-soft">
        <table className="min-w-full divide-y divide-gmi-border">
          <thead className="bg-gmi-surface-soft sticky top-0">
            <tr>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gmi-text-subtle uppercase tracking-wider">
                #
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gmi-text-subtle uppercase tracking-wider">
                X
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gmi-text-subtle uppercase tracking-wider">
                Y
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gmi-text-subtle uppercase tracking-wider">
                Z
              </th>
            </tr>
          </thead>
          <tbody className="bg-gmi-surface divide-y divide-gmi-border">
            {coords.map((coord, idx) => (
              <tr key={`line-point-${idx}`}>
                <td className="px-3 py-1 text-xs text-gmi-text-subtle">
                  {idx + 1}
                </td>
                <td className="px-3 py-1 text-xs text-gmi-text">
                  {formatCoord(coord.x)}
                </td>
                <td className="px-3 py-1 text-xs text-gmi-text">
                  {formatCoord(coord.y)}
                </td>
                <td className="px-3 py-1 text-xs text-gmi-text">
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
        <div className="text-xs text-gmi-text-subtle">
          Ingen høydedata funnet ennå.
        </div>
      );
    }

    if (terrainEntry.status === 'loading') {
      return (
        <div className="text-xs text-gmi-text-subtle">
          Henter høydedata...
        </div>
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
        <div className="text-xs text-gmi-text-subtle">
          Ingen høydedata tilgjengelig.
        </div>
      );
    }

    return (
      <div className="max-h-60 overflow-auto border border-gmi-border rounded bg-gmi-surface-soft">
        <table className="min-w-full divide-y divide-gmi-border">
          <thead className="bg-gmi-surface-soft sticky top-0">
            <tr>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gmi-text-subtle uppercase tracking-wider">
                #
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gmi-text-subtle uppercase tracking-wider">
                Distanse
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gmi-text-subtle uppercase tracking-wider">
                X
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gmi-text-subtle uppercase tracking-wider">
                Y
              </th>
              <th className="px-3 py-1 text-left text-[11px] font-medium text-gmi-text-subtle uppercase tracking-wider">
                Terreng Z
              </th>
            </tr>
          </thead>
          <tbody className="bg-gmi-surface divide-y divide-gmi-border">
            {terrainPoints.map((point, idx) => (
              <tr key={`terrain-point-${idx}`}>
                <td className="px-3 py-1 text-xs text-gmi-text-subtle">
                  {idx + 1}
                </td>
                <td className="px-3 py-1 text-xs text-gmi-text">
                  {formatCoord(point.dist, 2)}
                </td>
                <td className="px-3 py-1 text-xs text-gmi-text">
                  {formatCoord(point.x)}
                </td>
                <td className="px-3 py-1 text-xs text-gmi-text">
                  {formatCoord(point.y)}
                </td>
                <td className="px-3 py-1 text-xs text-gmi-text">
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
    <div className="absolute inset-0 z-2000 flex items-center justify-center bg-black/50 p-1.5 sm:p-2">
      <div className="bg-gmi-surface border border-gmi-border-strong rounded-lg shadow-xl w-full max-w-5xl h-[82%] flex flex-col overflow-hidden text-gmi-text">
        <div className="flex-none p-2.5 border-b border-gmi-border flex justify-between items-center bg-gmi-surface-soft">
          <div>
            <h2 className="text-base font-semibold text-gmi-navy">Datautforsker</h2>
            <p className="text-xs text-gmi-text-subtle">
              Fil: {activeFile?.name || 'Ukjent fil'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!targetLayerId && layerOrder.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-gmi-text-muted">
                <span className="font-medium">Lag</span>
                <select
                  className="gmi-compact-field px-2 py-1 text-xs"
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
                className="gmi-compact-button gmi-focus-ring text-xs px-3 py-1.5 border border-gmi-border-strong bg-gmi-border text-gmi-navy"
              >
                Vis alle data
              </button>
            )}
            <button
              onClick={handleClose}
              className="gmi-compact-button gmi-focus-ring p-1.5 text-gmi-text-muted"
              aria-label="Lukk datautforsker"
              title="Lukk"
            >
              <XIcon size={20} weight="regular" aria-hidden="true" />
            </button>
          </div>
        </div>

        {!target && (
          <div className="flex-none border-b border-gmi-border px-3 bg-gmi-surface">
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveTab('header')}
                className={`gmi-focus-ring py-2 px-2.5 text-sm ${
                  activeTab === 'header'
                    ? 'border-b-2 border-gmi-interactive font-medium text-gmi-navy'
                    : 'text-gmi-text-muted hover:text-gmi-navy'
                }`}
              >
                Header ({Object.keys(header).length})
              </button>
              <button
                onClick={() => setActiveTab('points')}
                className={`gmi-focus-ring py-2 px-2.5 text-sm ${
                  activeTab === 'points'
                    ? 'border-b-2 border-gmi-interactive font-medium text-gmi-navy'
                    : 'text-gmi-text-muted hover:text-gmi-navy'
                }`}
              >
                Punkter ({points.length})
              </button>
              <button
                onClick={() => setActiveTab('lines')}
                className={`gmi-focus-ring py-2 px-2.5 text-sm ${
                  activeTab === 'lines'
                    ? 'border-b-2 border-gmi-interactive font-medium text-gmi-navy'
                    : 'text-gmi-text-muted hover:text-gmi-navy'
                }`}
              >
                Linjer ({lines.length})
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto p-2.5">
          {targetPoint && (
            <div className="space-y-4">
              <div className="border border-gmi-border rounded-lg p-4 bg-gmi-surface-soft">
                <h3 className="text-sm font-semibold text-gmi-text">
                  Punkt #{target.index + 1}
                </h3>
                <div className="mt-2 text-xs text-gmi-text-muted">
                  Koordinater (X, Y, Z):
                </div>
                <div className="mt-1 text-sm text-gmi-text">
                  {renderPointCoordinates(targetPoint.coordinates)}
                </div>
              </div>

              <div className="border border-gmi-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gmi-text">
                  Terrenghøyde
                </h4>
                <div className="mt-2 text-sm text-gmi-text">
                  {fetchingPointTerrain &&
                  !pointTerrainHeights[target.index] ? (
                    <span className="text-xs text-gmi-text-subtle">
                      Henter terrenghøyde…
                    </span>
                  ) : pointTerrainHeights[target.index]?.z != null ? (
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
                      {pointTerrainHeights[target.index].terreng && (
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
                              Number(targetPoint.coordinates[0].z) -
                                pointTerrainHeights[target.index].z,
                              3,
                            )}
                          </span>{' '}
                          m
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gmi-text-subtle">
                      Ingen terrenghøyde tilgjengelig
                    </span>
                  )}
                </div>
              </div>

              <div className="border border-gmi-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gmi-text">
                  Attributter
                </h4>
                <pre className="text-xs mt-2 bg-gmi-surface-soft p-3 rounded border border-gmi-border max-h-72 overflow-auto">
                  {JSON.stringify(targetPoint.attributes, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {targetLine && (
            <div className="space-y-4">
              <div className="border border-gmi-border rounded-lg p-4 bg-gmi-surface-soft">
                <h3 className="text-sm font-semibold text-gmi-text">
                  Ledning #{target.index}
                </h3>
                {targetAnalysis && (
                  <div className="text-xs text-gmi-text-subtle mt-1">
                    Fall:{' '}
                    {formatCoord(targetAnalysis.details?.incline, 2)}‰
                    {' • '}Lengde:{' '}
                    {formatCoord(targetAnalysis.details?.length, 2)} m
                  </div>
                )}
              </div>

              <div className="border border-gmi-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gmi-text">
                    Linjepunkter (XYZ)
                  </h4>
                  <button
                    onClick={() =>
                      setExpandedTargetPoints((prev) => !prev)
                    }
                    className="gmi-compact-button gmi-focus-ring text-xs px-2 py-1 border border-gmi-border bg-gmi-surface"
                  >
                    {expandedTargetPoints ? 'Skjul' : 'Vis'} (
                    {targetLine.coordinates?.length || 0})
                  </button>
                </div>
                {expandedTargetPoints && (
                  <div className="mt-3">
                    {renderLinePoints(targetLine.coordinates)}
                  </div>
                )}
              </div>

              <div className="border border-gmi-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gmi-text">
                    Høydedata (terrengprofil)
                  </h4>
                  <button
                    onClick={() =>
                      setExpandedTargetTerrain((prev) => !prev)
                    }
                    className="gmi-compact-button gmi-focus-ring text-xs px-2 py-1 border border-gmi-border bg-gmi-surface"
                  >
                    {expandedTargetTerrain ? 'Skjul' : 'Vis'} (
                    {targetTerrain?.points?.length || 0})
                  </button>
                </div>
                {expandedTargetTerrain && (
                  <div className="mt-3">
                    {renderTerrainPoints(targetTerrain)}
                  </div>
                )}
              </div>

              <div className="border border-gmi-border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gmi-text">
                  Attributter
                </h4>
                <pre className="text-xs mt-2 bg-gmi-surface-soft p-3 rounded border border-gmi-border max-h-72 overflow-auto">
                  {JSON.stringify(targetLine.attributes, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {target && !targetPoint && !targetLine && (
            <div className="text-sm text-gmi-text-subtle">
              Fant ikke valgt objekt i gjeldende datasett.
            </div>
          )}

          {!target && activeTab === 'header' && (
            <table className="min-w-full divide-y divide-gmi-border">
              <thead className="bg-gmi-surface-soft sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gmi-text-subtle uppercase tracking-wider">
                    Nøkkel
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gmi-text-subtle uppercase tracking-wider">
                    Verdi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gmi-surface divide-y divide-gmi-border">
                {Object.entries(header).map(([key, value]) => (
                  <tr key={key}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gmi-navy">
                      {key}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gmi-text-subtle">
                      {String(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!target && activeTab === 'points' && (
            <div>
              <table className="min-w-full divide-y divide-gmi-border">
                <thead className="bg-gmi-surface-soft sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gmi-text-subtle uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gmi-text-subtle uppercase tracking-wider">
                      Koordinater (X, Y, Z)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gmi-text-subtle uppercase tracking-wider">
                      Terreng Z
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gmi-text-subtle uppercase tracking-wider">
                      Attributter
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gmi-text-subtle uppercase tracking-wider">
                      Detaljer
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-gmi-surface divide-y divide-gmi-border">
                  {points.slice(0, 100).map((point, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gmi-text-subtle">
                        {idx + 1}
                      </td>
                      <td className="px-6 py-4 text-sm text-gmi-text-subtle">
                        {renderPointCoordinates(point.coordinates)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gmi-text-subtle">
                        {fetchingPointTerrain &&
                        pointTerrainHeights[idx] === undefined
                          ? '…'
                          : formatCoord(
                              pointTerrainHeights[idx]?.z,
                              3,
                            )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gmi-text-subtle">
                        <pre className="text-xs">
                          {JSON.stringify(point.attributes, null, 2)}
                        </pre>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gmi-text-subtle">
                        <button
                          onClick={() =>
                            setDataInspectorTarget({
                              type: 'point',
                              index: idx,
                            })
                          }
                          className="gmi-compact-button gmi-focus-ring text-xs px-2 py-1 border border-gmi-border bg-gmi-surface"
                        >
                          Vis
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {points.length > 100 && (
                <div className="p-4 text-center text-gmi-text-subtle text-sm">
                  Viser 100 av {points.length} punkter
                </div>
              )}
            </div>
          )}

          {!target && activeTab === 'lines' && (
            <div>
              <table className="min-w-full table-fixed divide-y divide-gmi-border">
                <colgroup>
                  <col className="w-16" />
                  <col className="w-32" />
                  <col className="w-28" />
                  <col />
                </colgroup>
                <thead className="bg-gmi-surface-soft sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gmi-text-subtle uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gmi-text-subtle uppercase tracking-wider">
                      Punkter
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gmi-text-subtle uppercase tracking-wider">
                      Detaljer
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gmi-text-subtle uppercase tracking-wider">
                      Attributter
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-gmi-surface divide-y divide-gmi-border">
                  {lines.slice(0, 100).map((line, idx) => (
                    <Fragment key={idx}>
                      <tr>
                        <td className="px-3 py-2 align-top whitespace-nowrap text-sm text-gmi-text-subtle">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap text-sm text-gmi-text-subtle">
                          {line.coordinates?.length || 0} punkter
                        </td>
                        <td className="px-3 py-2 align-top text-sm text-gmi-text-subtle">
                          <div className="flex flex-col items-start gap-1">
                            <button
                              onClick={() =>
                                setExpandedLinePoints((prev) => ({
                                  ...prev,
                                  [idx]: !prev[idx],
                                }))
                              }
                              className="gmi-compact-button gmi-focus-ring text-xs px-1.5 py-0.5 border border-gmi-border bg-gmi-surface"
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
                              className="gmi-compact-button gmi-focus-ring text-xs px-1.5 py-0.5 border border-gmi-border bg-gmi-surface"
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
                              className="gmi-compact-button gmi-focus-ring text-xs px-1.5 py-0.5 border border-gmi-border-strong bg-gmi-border text-gmi-navy"
                            >
                              Fokus
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top text-sm text-gmi-text-subtle">
                          <pre className="text-xs whitespace-pre-wrap wrap-break-word">
                            {JSON.stringify(
                              line.attributes || {},
                              null,
                              2,
                            )}
                          </pre>
                        </td>
                      </tr>
                      {expandedLinePoints[idx] && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-6 pb-4 text-sm text-gmi-text-subtle"
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
                            className="px-6 pb-4 text-sm text-gmi-text-subtle"
                          >
                            <div className="mt-2">
                              {renderTerrainPoints(
                                activeTerrainData?.[idx],
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {lines.length > 100 && (
                <div className="p-4 text-center text-gmi-text-subtle text-sm">
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
