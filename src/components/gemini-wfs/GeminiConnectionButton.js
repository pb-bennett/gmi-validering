'use client';

import { PlugsIcon } from '@phosphor-icons/react';

export default function GeminiConnectionButton({ onOpen }) {
  return <button type="button" onClick={() => onOpen()} aria-label="Åpne Gemini WFS" title="Hent eksisterende anlegg fra Gemini WFS"
    className="gmi-compact-button gmi-focus-ring flex items-center gap-1 border border-gmi-border bg-gmi-surface/90 px-2 py-1.5 text-xs font-medium shadow backdrop-blur">
    <PlugsIcon size={14} weight="regular" aria-hidden="true" />Gemini WFS
  </button>;
}
