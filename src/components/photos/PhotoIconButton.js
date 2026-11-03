'use client';

import { useEffect, useRef } from 'react';
import { attachPhotoIconTooltip } from './photoIconTooltip';

export function usePhotoIconTooltip(ref, text, label) {
  const handle = useRef(null);
  useEffect(() => {
    handle.current = attachPhotoIconTooltip(ref.current);
    return () => { handle.current?.destroy(); handle.current = null; };
  }, [ref]);
  useEffect(() => { handle.current?.update({ text, label }); }, [text, label]);
}

// Every icon-only control in the FOTO workspace: aria-label, hover/focus tooltip, no native title.
// Unavailable controls stay focusable (aria-disabled) so the tooltip can explain why; clicks are no-ops.
export default function PhotoIconButton({ icon: Icon, label, tooltip = label, onClick, pressed, expanded, controls,
  unavailable = false, keyshortcuts, size = 16, className = '', children, buttonRef, ...rest }) {
  const ownRef = useRef(null);
  const ref = buttonRef || ownRef;
  usePhotoIconTooltip(ref, tooltip, label);
  return <button ref={ref} type="button" aria-label={label} aria-pressed={pressed} aria-expanded={expanded} aria-controls={controls}
    aria-disabled={unavailable || undefined} aria-keyshortcuts={keyshortcuts} data-icon-tooltip={tooltip}
    className={`photo-icon-button gmi-compact-button gmi-focus-ring${unavailable ? ' photo-icon-button-unavailable' : ''}${className ? ` ${className}` : ''}`}
    onClick={(event) => { if (unavailable) { event.preventDefault(); return; } onClick?.(event); }} {...rest}>
    <Icon size={size} weight="regular" aria-hidden="true" />
    {children}
  </button>;
}
