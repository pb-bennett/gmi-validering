'use client';

import { useEffect, useRef, useState } from 'react';
import { XIcon } from '@phosphor-icons/react';
import PhotoIconButton from './PhotoIconButton';

const AUTO_DISMISS_MS = 6000;

// Transient workspace feedback. Success auto-dismisses (paused on hover/focus); errors stay until closed.
export default function PhotoWorkspaceToast({ notice, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const ref = useRef(null);
  const persistent = notice.tone === 'error';
  // Parent re-renders must not restart the countdown, so the callback is read through a ref.
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; });
  useEffect(() => {
    if (persistent || paused) return undefined;
    const timer = setTimeout(() => dismiss.current(notice.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice.id, persistent, paused]);
  return <div ref={ref} className="photo-workspace-toast gmi-elevated-surface" data-tone={notice.tone || 'success'}
    role={persistent ? 'alert' : 'status'} aria-live={persistent ? 'assertive' : 'polite'}
    onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={(event) => { if (!ref.current?.contains(event.relatedTarget)) setPaused(false); }}>
    <p>{notice.text}</p>
    {notice.action && <button type="button" className="gmi-compact-button gmi-focus-ring photo-workspace-toast-action" onClick={() => { onDismiss(notice.id); notice.action.run(); }}>{notice.action.label}</button>}
    <PhotoIconButton icon={XIcon} size={14} label="Lukk melding" className="photo-workspace-toast-close" onClick={() => onDismiss(notice.id)} />
  </div>;
}
