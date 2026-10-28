'use client';

import { useMemo } from 'react';
import { CornersOutIcon, EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import useGeminiSession from './useGeminiSession';
import useGeminiPresentation from './useGeminiPresentation';
import { geminiPresentation, getGeminiReferenceBounds, getGeminiReferenceNotice } from '@/lib/gemini-wfs/geminiReferencePresentation.mjs';

export default function GeminiReferenceCard() {
  const session = useGeminiSession();
  const { result } = session;
  const visibility = useGeminiPresentation();
  const sourceName = useStore((state) => state.layers[result?.provenance.sourceLayerId]?.file?.name);
  const bounds = useMemo(() => getGeminiReferenceBounds(result), [result]);
  if (!result) return null;
  const notice = getGeminiReferenceNotice(session);
  return (
    <section className="border-b-2 border-gmi-border py-1 text-gmi-text" aria-label="Eksisterende anlegg · Gemini VA">
      <div className="flex items-start gap-2 p-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-medium">Eksisterende anlegg · Gemini VA</h3>
          <p className="truncate text-[10px] text-gmi-text-subtle" title={sourceName}>
            Referanse{sourceName ? ` · ${sourceName}` : ''}
          </p>
        </div>
        <button type="button" onClick={() => geminiPresentation.requestZoom()} disabled={!bounds}
          aria-label="Zoom til Gemini-referanse" title="Zoom til Gemini-referanse"
          className="gmi-focus-ring shrink-0 rounded-lg p-1 text-gmi-text-subtle hover:bg-gmi-surface-soft hover:text-gmi-navy disabled:cursor-not-allowed disabled:opacity-40">
          <CornersOutIcon size={14} weight="regular" aria-hidden="true" />
        </button>
      </div>
      <div className="mx-2 mb-2 border-l border-gmi-border pl-2">
        {[["lines", "Ledninger"], ["points", "Punkter"]].map(([side, label]) => {
          const visible = visibility[`${side}Visible`];
          const Icon = visible ? EyeIcon : EyeSlashIcon;
          return <div key={side} className="flex items-center gap-2 py-0.5 text-xs">
            <span className="flex-1">{label}</span>
            <span className="text-[10px] tabular-nums text-gmi-text-subtle" aria-label={`${label}: ${result.counts[side]}`}>{result.counts[side]}</span>
            <button type="button" onClick={() => geminiPresentation.setVisible(side, !visible)}
              aria-label={`Vis ${label.toLowerCase()} fra Gemini VA`} aria-pressed={visible}
              title={`${visible ? 'Skjul' : 'Vis'} ${label.toLowerCase()} fra Gemini VA`}
              className="gmi-focus-ring rounded-lg p-1 text-gmi-text-muted hover:bg-gmi-surface-soft hover:text-gmi-navy">
              <Icon size={14} weight="regular" aria-hidden="true" />
            </button>
          </div>;
        })}
      </div>
      {notice && <p role="status" className="px-2 pb-2 text-[10px] text-gmi-text-muted">{notice}</p>}
    </section>
  );
}
