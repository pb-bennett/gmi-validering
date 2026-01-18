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
  const data = useStore((state) => state.data);
  const fetchQueue = useStore((state) => state.terrain.fetchQueue);
  const currentlyFetching = useStore(
    (state) => state.terrain.currentlyFetching,
  );
  const selectedPipeIndex = useStore(
    (state) => state.analysis.selectedPipeIndex,
  );
  const terrainData = useStore((state) => state.terrain.data);

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

  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef(null);

  // Get EPSG from file header
  const epsg = data?.header?.COSYS_EPSG || 25832;

  // Prioritize selected pipe when it changes
  useEffect(() => {
    if (
      selectedPipeIndex !== null &&
      !terrainData[selectedPipeIndex]?.status
    ) {
      prioritizeTerrainFetch(selectedPipeIndex);
    }
  }, [selectedPipeIndex, terrainData, prioritizeTerrainFetch]);

  // Process the fetch queue
  const processQueue = useCallback(async () => {
    if (isFetchingRef.current || !data?.lines) {
      return;
    }

    const state = useStore.getState();
    const queue = state.terrain.fetchQueue;

    if (queue.length === 0) {
      return;
    }

    isFetchingRef.current = true;

    // Pop next item from queue
    const lineIndex = popFromTerrainQueue();

    if (lineIndex === undefined || lineIndex === null) {
      isFetchingRef.current = false;
      return;
    }

    // Get line data
    const line = data.lines[lineIndex];
    if (!line || !line.coordinates || line.coordinates.length < 2) {
      setTerrainStatus(lineIndex, 'error', 'Ugyldig geometri');
      isFetchingRef.current = false;
      // Continue processing queue
      setTimeout(processQueue, 10);
      return;
    }

    // Set status to loading
    setTerrainStatus(lineIndex, 'loading');

    try {
      // Generate sample points along the line (1m intervals)
      const profilePoints = generateProfilePoints(
        line.coordinates,
        1,
      );

      // Check if this is the selected pipe (use priority fetch)
      const currentState = useStore.getState();
      const isPriority =
        currentState.analysis.selectedPipeIndex === lineIndex;

      // Fetch terrain heights
      const terrainPoints = isPriority
        ? await fetchTerrainForProfilePriority(profilePoints, epsg)
        : await fetchTerrainForProfile(profilePoints, epsg);

      // Store the result
      setTerrainData(lineIndex, terrainPoints);
    } catch (error) {
      console.error(
        `Terrain fetch error for line ${lineIndex}:`,
        error,
      );
      setTerrainStatus(lineIndex, 'error', error.message);
    }

    isFetchingRef.current = false;

    // Continue processing queue with a small delay to avoid blocking UI
    setTimeout(processQueue, 50);
  }, [
    data,
    epsg,
    popFromTerrainQueue,
    setTerrainData,
    setTerrainStatus,
  ]);

  // Watch queue and process when items are available
  useEffect(() => {
    if (fetchQueue.length > 0 && !isFetchingRef.current) {
      processQueue();
    }
  }, [fetchQueue, processQueue]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
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
