'use client';

import { useEffect, useRef, useCallback } from 'react';
import useStore from '@/lib/store';
import {
  fetchTerrainForProfile,
  fetchTerrainHeightsPriority,
} from '@/lib/analysis/terrain';
import { generateProfilePoints } from '@/lib/analysis/lineSampling';

/**
 * TerrainFetcher - Background component that fetches terrain data for all lines.
 *
 * Features:
 * - Processes terrain fetch queue in background
 * - Prioritizes currently selected pipe
 * - Updates store with terrain data and status
 * - Non-blocking to keep app responsive
 */
export default function TerrainFetcher() {
  // Minimal subscriptions - only what triggers processing
  const fetchQueueLength = useStore(
    (state) => state.terrain.fetchQueue.length,
  );
  const selectedPipeIndex = useStore(
    (state) => state.analysis.selectedPipeIndex,
  );
  const analysisLayerId = useStore(
    (state) => state.analysis.layerId,
  );
  const layerOrder = useStore((state) => state.layerOrder);
  const layerQueueSignal = useStore((state) => {
    const ids = state.layerOrder || [];
    if (ids.length === 0) return '';
    return ids
      .map(
        (id) => state.layers[id]?.terrain?.fetchQueue?.length || 0,
      )
      .join(',');
  });

  // Base terrain actions (stable references)
  const setTerrainData = useStore((state) => state.setTerrainData);
  const setTerrainStatus = useStore(
    (state) => state.setTerrainStatus,
  );
  const popFromTerrainQueue = useStore(
    (state) => state.popFromTerrainQueue,
  );
  const prioritizeTerrainFetch = useStore(
    (state) => state.prioritizeTerrainFetch,
  );

  // Layer terrain actions (stable references)
  const setLayerTerrainData = useStore(
    (state) => state.setLayerTerrainData,
  );
  const setLayerTerrainStatus = useStore(
    (state) => state.setLayerTerrainStatus,
  );
  const popFromLayerTerrainQueue = useStore(
    (state) => state.popFromLayerTerrainQueue,
  );
  const prioritizeLayerTerrainFetch = useStore(
    (state) => state.prioritizeLayerTerrainFetch,
  );

  const isFetchingRef = useRef(false);

  // Prioritize selected pipe when it changes (base or layer)
  // Use getState() to avoid subscribing to terrain.data changes
  useEffect(() => {
    if (selectedPipeIndex === null) return;

    const state = useStore.getState();
    if (analysisLayerId) {
      const layer = state.layers[analysisLayerId];
      if (
        layer &&
        !layer.terrain?.data?.[selectedPipeIndex]?.status
      ) {
        prioritizeLayerTerrainFetch(
          analysisLayerId,
          selectedPipeIndex,
        );
      }
    } else if (!state.terrain.data[selectedPipeIndex]?.status) {
      prioritizeTerrainFetch(selectedPipeIndex);
    }
  }, [
    selectedPipeIndex,
    analysisLayerId,
    prioritizeTerrainFetch,
    prioritizeLayerTerrainFetch,
  ]);

  // Main processing loop — handles base queue then layer queues
  const processQueue = useCallback(async () => {
    if (isFetchingRef.current) return;

    const state = useStore.getState();

    // === 1. Process base terrain queue ===
    if (state.terrain.fetchQueue.length > 0 && state.data?.lines) {
      isFetchingRef.current = true;
      const lineIndex = popFromTerrainQueue();

      if (lineIndex === undefined || lineIndex === null) {
        isFetchingRef.current = false;
        return;
      }

      const line = state.data.lines[lineIndex];
      const epsg = state.data.header?.COSYS_EPSG || 25832;

      if (
        !line ||
        !line.coordinates ||
        line.coordinates.length < 2
      ) {
        setTerrainStatus(lineIndex, 'error', 'Ugyldig geometri');
        isFetchingRef.current = false;
        setTimeout(processQueue, 10);
        return;
      }

      setTerrainStatus(lineIndex, 'loading');

      try {
        const profilePoints = generateProfilePoints(
          line.coordinates,
          1,
        );
        const currentState = useStore.getState();
        const isPriority =
          currentState.analysis.selectedPipeIndex === lineIndex &&
          !currentState.analysis.layerId;

        const terrainPoints = isPriority
          ? await fetchTerrainForProfilePriority(profilePoints, epsg)
          : await fetchTerrainForProfile(profilePoints, epsg);

        setTerrainData(lineIndex, terrainPoints);
      } catch (error) {
        console.error(
          `Terrain fetch error for line ${lineIndex}:`,
          error,
        );
        setTerrainStatus(lineIndex, 'error', error.message);
      }

      isFetchingRef.current = false;
      setTimeout(processQueue, 50);
      return;
    }

    // === 2. Process layer terrain queues ===
    for (const layerId of state.layerOrder) {
      const layer = state.layers[layerId];
      if (
        !layer?.terrain?.fetchQueue?.length ||
        !layer?.data?.lines
      ) {
        continue;
      }

      isFetchingRef.current = true;
      const lineIndex = popFromLayerTerrainQueue(layerId);

      if (lineIndex === undefined || lineIndex === null) {
        isFetchingRef.current = false;
        continue;
      }

      const line = layer.data.lines[lineIndex];
      const epsg = layer.data.header?.COSYS_EPSG || 25832;

      if (
        !line ||
        !line.coordinates ||
        line.coordinates.length < 2
      ) {
        setLayerTerrainStatus(
          layerId,
          lineIndex,
          'error',
          'Ugyldig geometri',
        );
        isFetchingRef.current = false;
        setTimeout(processQueue, 10);
        return;
      }

      setLayerTerrainStatus(layerId, lineIndex, 'loading');

      try {
        const profilePoints = generateProfilePoints(
          line.coordinates,
          1,
        );
        const currentState = useStore.getState();
        const isPriority =
          currentState.analysis.selectedPipeIndex === lineIndex &&
          currentState.analysis.layerId === layerId;

        const terrainPoints = isPriority
          ? await fetchTerrainForProfilePriority(profilePoints, epsg)
          : await fetchTerrainForProfile(profilePoints, epsg);

        setLayerTerrainData(layerId, lineIndex, terrainPoints);
      } catch (error) {
        console.error(
          `Layer terrain fetch error for ${layerId}/${lineIndex}:`,
          error,
        );
        setLayerTerrainStatus(
          layerId,
          lineIndex,
          'error',
          error.message,
        );
      }

      isFetchingRef.current = false;
      setTimeout(processQueue, 50);
      return;
    }
  }, [
    popFromTerrainQueue,
    setTerrainData,
    setTerrainStatus,
    popFromLayerTerrainQueue,
    setLayerTerrainData,
    setLayerTerrainStatus,
  ]);

  // Watch base queue and process when items are available
  useEffect(() => {
    if (fetchQueueLength > 0 && !isFetchingRef.current) {
      processQueue();
    }
  }, [fetchQueueLength, processQueue]);

  // Watch for layer queue changes (including prioritization/force-fetch in
  // multi-layer mode) and process when work is available.
  useEffect(() => {
    if (layerOrder.length > 0 && !isFetchingRef.current) {
      const state = useStore.getState();
      const hasLayerWork = layerOrder.some(
        (id) => state.layers[id]?.terrain?.fetchQueue?.length > 0,
      );
      if (hasLayerWork) processQueue();
    }
  }, [layerOrder, layerQueueSignal, processQueue]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isFetchingRef.current = false;
    };
  }, []);

  // This is a background component, renders nothing
  return null;
}

/**
 * Priority version of fetchTerrainForProfile
 */
async function fetchTerrainForProfilePriority(profilePoints, epsg) {
  const terrainResults = await fetchTerrainHeightsPriority(
    profilePoints,
    epsg,
  );

  return profilePoints.map((p, i) => ({
    ...p,
    terrainZ: terrainResults[i]?.z ?? null,
    terreng: terrainResults[i]?.terreng ?? null,
    datakilde: terrainResults[i]?.datakilde ?? null,
  }));
}
