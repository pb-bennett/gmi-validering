'use client';

import { useSyncExternalStore } from 'react';
import { EMPTY_GEMINI_SNAPSHOT, geminiSession } from '@/lib/gemini-wfs/geminiSession.mjs';

const getServerSnapshot = () => EMPTY_GEMINI_SNAPSHOT;

// Unsubscribing a view does not dispose the workspace's shared reference data.
export default function useGeminiSession() {
  return useSyncExternalStore(geminiSession.subscribe, geminiSession.getSnapshot, getServerSnapshot);
}
