'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowClockwiseIcon, CaretDownIcon, CornersOutIcon, EyeIcon, EyeSlashIcon, PlugsIcon } from '@phosphor-icons/react';
import LayerTypeBadge from '../LayerTypeBadge';
import useGeminiSession from './useGeminiSession';
import useGeminiPresentation from './useGeminiPresentation';
import { geminiPresentation, getGeminiReferenceBounds, getGeminiReferenceNotice } from '@/lib/gemini-wfs/geminiReferencePresentation.mjs';
import { geminiSession } from '@/lib/gemini-wfs/geminiSession.mjs';
import { getGeminiUiError } from '@/lib/gemini-wfs/geminiWorkflowUi.mjs';
import { readGeminiMapBbox } from '@/lib/gemini-wfs/geminiMapViewport.mjs';
import { classifyGeminiMapExtent, GEMINI_MAP_WARNING, GEMINI_MAP_BLOCKED } from '@/lib/gemini-wfs/geminiCoveragePolicy.mjs';

export default function GeminiReferenceCard({ onOpenConnection }) {
  const session = useGeminiSession();
  if (!session.result && session.connectionStatus !== 'connected') return null;
  return <GeminiReferenceContent key={session.accountGeneration} session={session} onOpenConnection={onOpenConnection} />;
}

function GeminiReferenceContent({ session, onOpenConnection }) {
  const { result } = session;
  const visibility = useGeminiPresentation();
  const bounds = useMemo(() => getGeminiReferenceBounds(result), [result]);
  const [mapRequest, setMapRequest] = useState(null);
  // Presentation only: collapsing never changes source/line/point visibility or any request.
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const confirmation = useRef(null);
  useEffect(() => {
    if (mapRequest) confirmation.current?.showModal();
  }, [mapRequest]);
  const connected = session.connectionStatus === 'connected';
  const notice = session.error ? `${getGeminiUiError(session.error)}${result ? ' Forrige resultat vises.' : ''}` : getGeminiReferenceNotice(session);
  const counts = result?.counts ?? { lines: 0, points: 0 };
  const fetchMap = () => {
    try {
      const bbox = readGeminiMapBbox(), { level } = classifyGeminiMapExtent(bbox);
      if (level === 'ordinary') void geminiSession.fetchMap(bbox);
      else setMapRequest({ bbox, level });
    } catch (error) { setMapRequest({ level: 'error', error }); }
  };
  const sourceVisible = visibility.sourceVisible && (visibility.linesVisible || visibility.pointsVisible);
  return (
    <section className="border-b-2 border-gmi-border py-1 text-gmi-text" aria-label="Eksisterende anlegg · Gemini WFS" data-expanded={expanded}>
      <div className="flex items-center gap-2 p-2">
        <input type="checkbox" aria-label="Vis Gemini WFS-kilden"
          checked={sourceVisible}
          onChange={(event) => geminiPresentation.setSourceVisible(event.currentTarget.checked)}
          className="h-3.5 w-3.5 shrink-0 rounded border-gmi-border-strong accent-gmi-interactive text-gmi-interactive focus:ring-gmi-interactive"
          title={sourceVisible ? 'Skjul lag' : 'Vis lag'} />
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full border border-gmi-border-strong" style={{ backgroundColor: visibility.marking.highlightStyle.color }} />
        <div className="min-w-0 flex-1">
          <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
            <LayerTypeBadge type="WFS" />
            <span className="truncate" title="Eksisterende anlegg · Gemini WFS">Eksisterende anlegg · Gemini WFS</span>
          </h3>
          <p className="truncate text-[10px] text-gmi-text-subtle">
            {counts.lines} ledn. · {counts.points} punkt · {session.coverages.length} {session.coverages.length === 1 ? 'område' : 'områder'}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => geminiPresentation.requestZoom()} disabled={!bounds}
            aria-label="Zoom til Gemini-referanse" title="Zoom til Gemini-referanse"
            className="gmi-focus-ring rounded-lg p-1 text-gmi-text-subtle hover:bg-gmi-surface-soft hover:text-gmi-navy disabled:cursor-not-allowed disabled:opacity-40">
            <CornersOutIcon size={14} weight="regular" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls={detailsId}
            aria-label={expanded ? 'Skjul detaljer for Gemini WFS' : 'Vis detaljer for Gemini WFS'} title={expanded ? 'Skjul detaljer' : 'Vis detaljer'}
            className="gmi-focus-ring rounded-lg p-1 text-gmi-text-subtle hover:bg-gmi-surface-soft hover:text-gmi-navy">
            <CaretDownIcon size={12} weight="regular" aria-hidden="true" className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      {/* Status and errors stay visible while collapsed. */}
      {notice && <p role="status" className="px-2 pb-2 text-[10px] text-gmi-text-muted">{notice}</p>}
      {!session.coverages.length && <p role="status" className="px-2 pb-2 text-[10px] text-gmi-text-muted">Last inn en innmålingsfil, eller bruk Hent for kartutsnitt.</p>}
      {/* Without a usable connection, providing access is the essential action: never hidden behind the chevron. */}
      {!connected && onOpenConnection && <div className="px-2 pb-2 text-[10px]">
        <button type="button" disabled={session.status === 'loading'} onClick={() => onOpenConnection()} aria-label="Oppgi Gemini-tilgang"
          className="gmi-compact-button gmi-focus-ring flex items-center gap-1 px-2 py-1 disabled:opacity-50">
          <ArrowClockwiseIcon size={13} weight="regular" aria-hidden="true" />Oppgi tilgang
        </button>
      </div>}
      {expanded && <div id={detailsId} className="border-t border-gmi-border bg-gmi-surface-soft/60 pt-1">
        <p className="truncate px-2 pb-1 text-[10px] text-gmi-text-subtle">{session.connection?.name} · Referanse</p>
        <div className="mx-2 mb-2 border-l border-gmi-border pl-2">
          {[["lines", "Ledninger"], ["points", "Punkter"]].map(([side, label]) => {
            const visible = visibility[`${side}Visible`];
            const Icon = visible ? EyeIcon : EyeSlashIcon;
            return <div key={side} className="flex items-center gap-2 py-0.5 text-xs">
              <span className="flex-1">{label}</span>
              <span className="text-[10px] tabular-nums text-gmi-text-subtle" aria-label={`${label}: ${counts[side]}`}>{counts[side]}</span>
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
          {connected && <button type="button" disabled={session.status === 'loading'}
            onClick={() => void geminiSession.refresh()} aria-label="Oppdater Gemini-referanse"
            className="gmi-compact-button gmi-focus-ring flex items-center gap-1 px-2 py-1 disabled:opacity-50">
            <ArrowClockwiseIcon size={13} weight="regular" aria-hidden="true" />Oppdater
          </button>}
          <button type="button" disabled={!connected || session.status === 'loading'} onClick={fetchMap}
            aria-label="Hent for kartutsnitt" className="gmi-compact-button gmi-focus-ring px-2 py-1 disabled:opacity-50">Hent for kartutsnitt</button>
          {onOpenConnection && <button type="button" onClick={() => onOpenConnection()}
            aria-label="Endre Gemini-tilgang" className="gmi-compact-button gmi-focus-ring px-2 py-1">Tilgang</button>}
          <button type="button" onClick={() => geminiSession.disconnect()} aria-label="Koble fra Gemini WFS" title="Koble fra og fjern Gemini-referansen"
            className="gmi-compact-button gmi-focus-ring ml-auto flex items-center gap-1 px-2 py-1">
            <PlugsIcon size={13} weight="regular" aria-hidden="true" />Koble fra
          </button>
        </div>
      </div>}
      {mapRequest && <dialog ref={confirmation} aria-label="Hent for kartutsnitt" onCancel={() => setMapRequest(null)}
        className="m-auto w-[min(94vw,440px)] rounded-xl border border-gmi-border bg-gmi-surface p-4 text-sm text-gmi-text shadow-xl backdrop:bg-gmi-ink/60">
        <p>{mapRequest.level === 'confirm' ? GEMINI_MAP_WARNING : mapRequest.level === 'blocked' ? GEMINI_MAP_BLOCKED : getGeminiUiError(mapRequest.error)}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" autoFocus onClick={() => setMapRequest(null)} className="gmi-compact-button gmi-focus-ring px-3 py-2">Avbryt</button>
          {mapRequest.level === 'confirm' && <button type="button" onClick={() => {
            const bbox = mapRequest.bbox; setMapRequest(null); void geminiSession.fetchMap(bbox, { confirmed: true });
          }} className="gmi-primary-control gmi-focus-ring px-3 py-2">Hent likevel</button>}
        </div>
      </dialog>}
    </section>
  );
}
