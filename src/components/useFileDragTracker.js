'use client';

import { useEffect, useState } from 'react';
import { createFileDragTracker } from '@/lib/fileDragState.mjs';

// One tracker per drop region: the app window, or the import dialog while it holds the top layer.
export default function useFileDragTracker() {
  const [active, setActive] = useState(false);
  const [tracker] = useState(() => createFileDragTracker({ onChange: setActive }));
  useEffect(() => () => tracker.reset(), [tracker]);
  return { active, tracker };
}
