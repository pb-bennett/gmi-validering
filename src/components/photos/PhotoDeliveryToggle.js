'use client';

import { CheckIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { applyPhotoDeliveryChoice, photoDeliveryOptions } from '@/lib/photos/photoDeliveryChoice.mjs';

// Compact two-position GMI/GML control for exactly one occurrence. Rounded pills in the shared destination palette; the
// chosen one is filled, carries a check mark and is aria-checked. A click applies the choice at once through the M8
// session actions: ordinary choices are reversible and need no confirmation. Unlinked occurrences offer «Ikke med» and
// GML instead of an invalid GMI destination.
export default function PhotoDeliveryToggle({ entry, layerId, label, describedBy, onResult, compact = false }) {
  const options = photoDeliveryOptions(entry);
  if (!options.length) return null;
  const choose = (item) => {
    if (item.disabled || item.active || !item.apply) return;
    onResult?.(applyPhotoDeliveryChoice(photoSession, layerId, entry.photoId, item), item);
  };
  const enabled = options.filter((item) => !item.disabled && item.apply);
  const focusKey = (options.find((item) => item.active) || enabled[0] || options[0]).key;
  return <div role="radiogroup" aria-label={label} aria-describedby={describedBy} data-delivery-status={entry.status}
    className={`photo-delivery-toggle${compact ? ' photo-delivery-toggle-compact' : ''}`}
    onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || enabled.length < 2) return;
      event.preventDefault();
      const index = enabled.findIndex((item) => item.key === event.target.dataset?.destination);
      const next = enabled[(index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? enabled.length - 1 : 1)) % enabled.length];
      choose(next);
      event.currentTarget.querySelector(`[data-destination="${next.key}"]`)?.focus();
    }}>
    {options.map((item) => <button key={item.key} type="button" role="radio" aria-checked={item.active} data-destination={item.key}
      aria-disabled={item.disabled || undefined} tabIndex={item.key === focusKey ? 0 : -1} title={item.reason || undefined}
      className="photo-delivery-option gmi-focus-ring" onClick={() => choose(item)}>
      {item.active && <CheckIcon size={12} weight="regular" aria-hidden="true" />}{item.label}
    </button>)}
  </div>;
}
