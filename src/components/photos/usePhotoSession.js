'use client';

import { useSyncExternalStore } from 'react';
import { EMPTY_PHOTO_SNAPSHOT, photoSession } from '@/lib/photos/photoSession.mjs';

const getServerSnapshot = () => EMPTY_PHOTO_SNAPSHOT;

export default function usePhotoSession() {
  return useSyncExternalStore(photoSession.subscribe, photoSession.getSnapshot, getServerSnapshot);
}
