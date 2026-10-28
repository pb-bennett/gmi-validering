'use client';

import { useSyncExternalStore } from 'react';
import { EMPTY_GEMINI_PRESENTATION, geminiPresentation } from '@/lib/gemini-wfs/geminiReferencePresentation.mjs';

const getServerSnapshot = () => EMPTY_GEMINI_PRESENTATION;
export default function useGeminiPresentation() {
  return useSyncExternalStore(geminiPresentation.subscribe, geminiPresentation.getSnapshot, getServerSnapshot);
}
