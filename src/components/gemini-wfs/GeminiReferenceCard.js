'use client';

import { useMemo } from 'react';
import { ArrowClockwiseIcon, CornersOutIcon, EyeIcon, EyeSlashIcon, PlugsIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import useGeminiSession from './useGeminiSession';
import useGeminiPresentation from './useGeminiPresentation';
import { geminiPresentation, getGeminiReferenceBounds, getGeminiReferenceNotice } from '@/lib/gemini-wfs/geminiReferencePresentation.mjs';
import { geminiSession } from '@/lib/gemini-wfs/geminiSession.mjs';
import { getGeminiUiError } from '@/lib/gemini-wfs/geminiWorkflowUi.mjs';
import { GEMINI_WFS_HALO } from '@/lib/map/layerHighlight.mjs';

export default function GeminiReferenceCard({ onOpenConnection }) {
  const session = useGeminiSession();
  const { result } = session;
  const visibility = useGeminiPresentation();
  const sourceName = useStore((state) => state.layers[result?.provenance.sourceLayerId]?.file?.name);
  const bounds = useMemo(() => getGeminiReferenceBounds(result), [result]);
  if (!result) return null;
  const notice = session.error ? `${getGeminiUiError(session.error)} Forrige resultat vises.` : getGeminiReferenceNotice(session);
  const connected = session.connectionStatus === 'connected';
  return (
    <section className="border-b-2 border-gmi-border py-1 text-gmi-text" aria-label="Eksisterende anlegg · Gemini WFS">
      <div className="flex items-start gap-2 p-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-xs font-medium">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: GEMINI_WFS_HALO.color }} />
            Eksisterende anlegg · Gemini WFS
          </h3>
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
              aria-label={`Vis ${label.toLowerCase()} fra Gemini WFS`} aria-pressed={visible}
              title={`${visible ? 'Skjul' : 'Vis'} ${label.toLowerCase()} fra Gemini WFS`}
              className="gmi-focus-ring rounded-lg p-1 text-gmi-text-muted hover:bg-gmi-surface-soft hover:text-gmi-navy">
              <Icon size={14} weight="regular" aria-hidden="true" />
            </button>
          </div>;
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-2 pb-2 text-[10px]">
        <button type="button" disabled={session.status === 'loading' || (!connected && !onOpenConnection)}
          onClick={() => connected ? void geminiSession.refresh(result.provenance.sourceLayerId) : onOpenConnection(result.provenance.sourceLayerId)}
          aria-label={connected ? 'Oppdater Gemini-referanse' : 'Oppgi Gemini-tilgang'}
          className="gmi-compact-button gmi-focus-ring flex items-center gap-1 px-2 py-1 disabled:opacity-50">
          <ArrowClockwiseIcon size={13} weight="regular" aria-hidden="true" />{connected ? 'Oppdater' : 'Oppgi tilgang'}
        </button>
        {onOpenConnection && <button type="button" onClick={() => onOpenConnection(result.provenance.sourceLayerId)}
          aria-label="Endre Gemini-tilgang eller innmålingsfil" className="gmi-compact-button gmi-focus-ring px-2 py-1">Tilgang</button>}
        <button type="button" onClick={() => geminiSession.disconnect()} aria-label="Koble fra Gemini WFS" title="Koble fra og fjern Gemini-referansen"
          className="gmi-compact-button gmi-focus-ring ml-auto flex items-center gap-1 px-2 py-1">
          <PlugsIcon size={13} weight="regular" aria-hidden="true" />Koble fra
        </button>
      </div>
      {notice && <p role="status" className="px-2 pb-2 text-[10px] text-gmi-text-muted">{notice}</p>}
    </section>
  );
}
