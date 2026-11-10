'use client';

import { ArrowSquareOutIcon, CaretDownIcon } from '@phosphor-icons/react';

const STATUS_TONES = Object.freeze({
  red: 'error',
  amber: 'warning',
  green: 'success',
});

function getRowId(presentation) {
  return `validation-v2-rule-${presentation.expansionKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function SummaryCount({ label, value, tone }) {
  return (
    <div data-validation-tone={tone} className={`inline-flex items-baseline gap-0.5 whitespace-nowrap ${tone ? 'gmi-validation-accent' : 'text-gmi-text'}`}>
      <dt className="text-[10px] font-medium">{label}</dt>
      <dd className="text-[11px] font-bold">{value}</dd>
    </div>
  );
}

export default function ValidationV2RuleList({
  presentations,
  expandedRuleKey,
  onToggle,
  onInfo,
  canCorrect,
  onCorrect,
}) {
  // Share the widest value across the list so every category stays aligned,
  // including datasets with counts larger than three digits.
  const countSlotWidth = Math.max(3, ...presentations.flatMap(({ counts }) => [
    counts.failCount, (counts.checkCount || 0) + counts.indeterminateCount, counts.passCount,
  ].map((value) => String(value).length)));
  return (
    <div className="gmi-elevated-surface divide-y divide-gmi-border overflow-hidden rounded-lg">
      {presentations.map((presentation) => {
        const rowId = getRowId(presentation);
        const panelId = `${rowId}-summary`;
        const isExpanded = expandedRuleKey === presentation.expansionKey;
        const { counts } = presentation;
        const checkCount = (counts.checkCount || 0) + counts.indeterminateCount;
        const countSlots = [
          { tone: 'error', value: counts.failCount },
          { tone: 'warning', value: checkCount },
          { tone: 'success', value: counts.passCount },
        ];
        const visibleCounts = countSlots.filter(({ value }) => value > 0);
        const countLabel = `${counts.evaluatedCount} objekter i kontrollgrunnlaget: ${counts.failCount} FEIL, ${checkCount} SJEKK, ${counts.passCount} OK.${counts.notEvaluatedCount > 0 ? ` Ikke evaluert: ${counts.notEvaluatedCount}.` : ''}${visibleCounts.length === 0 ? ' Ingen tellbare resultater.' : ''}`;
        return (
          <div key={presentation.expansionKey}>
            <button
              id={rowId}
              type="button"
              aria-expanded={isExpanded}
              aria-controls={panelId}
              aria-label={`${presentation.displayName}: ${presentation.status.label} for denne kontrollen for valgt geometri. ${countLabel}`}
              onClick={() => onToggle(presentation.expansionKey)}
              className={`flex min-h-10 w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors hover:bg-gmi-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gmi-interactive ${isExpanded ? 'bg-gmi-surface-soft' : 'bg-gmi-surface'}`}
            >
              <span
                role="img"
                aria-label={`Status: ${presentation.status.label}`}
                title={`Status: ${presentation.status.label}`}
                data-validation-tone={STATUS_TONES[presentation.status.visualToken] || 'warning'}
                className="gmi-validation-dot h-2.5 w-2.5 shrink-0 rounded-full"
              />
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-gmi-navy">
                {presentation.displayName}
              </span>
              <span title={countLabel} aria-hidden="true" className={`gmi-validation-rule-counts inline-grid shrink-0 items-baseline gap-x-[1.5ch] whitespace-nowrap text-[11px] font-medium tabular-nums text-gmi-text ${isExpanded ? 'invisible' : ''}`}
                style={{ gridTemplateColumns: `repeat(3, ${countSlotWidth}ch)` }}>
                {visibleCounts.length === 0 ? <span className="col-span-3 text-right font-normal">Ingen resultater</span> : countSlots.map(({ tone, value }) => (
                  <span key={tone} data-validation-count-slot={tone} data-validation-tone={value > 0 ? tone : undefined} className="gmi-validation-accent text-right font-medium">{value > 0 ? value : null}</span>
                ))}
              </span>
              <span aria-hidden="true" className="ml-1 shrink-0 text-gmi-text-subtle">
                <CaretDownIcon size={16} weight="regular" aria-hidden="true" className={isExpanded ? 'rotate-180' : ''} />
              </span>
            </button>
            {isExpanded && (
              <section
                id={panelId}
                role="region"
                aria-labelledby={rowId}
                className="border-t border-gmi-border bg-gmi-surface-soft px-2 pb-2 pt-2"
              >
                <div className="mb-1 flex flex-nowrap items-center gap-1">
                  <dl className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-2">
                    <SummaryCount label="Objekter" value={counts.evaluatedCount} />
                    {counts.failCount > 0 && <SummaryCount label="Feil" value={counts.failCount} tone="error" />}
                    {(counts.checkCount || 0) + counts.indeterminateCount > 0 && (
                      <SummaryCount label="Sjekk" value={(counts.checkCount || 0) + counts.indeterminateCount} tone="warning" />
                    )}
                    {counts.passCount > 0 && <SummaryCount label="Pass" value={counts.passCount} tone="success" />}
                  </dl>
                  <button
                    type="button"
                    aria-label={`Vis detaljer: ${presentation.displayName}`}
                    title="Vis"
                    onClick={(event) => onInfo?.(presentation, event.currentTarget)}
                    className="gmi-compact-button gmi-focus-ring inline-flex shrink-0 items-center gap-1 border border-gmi-border-strong bg-gmi-surface px-1.5 py-1 text-[11px] font-semibold text-gmi-interactive shadow-sm"
                  >
                    <ArrowSquareOutIcon aria-hidden="true" size={16} weight="regular" />
                    <span>Vis</span>
                  </button>
                </div>
                {canCorrect?.(presentation) && <button type="button" className="gmi-compact-button gmi-focus-ring text-gmi-interactive text-[11px]" onClick={() => onCorrect(presentation)}>Lag retting…</button>}
              </section>
            )}
          </div>
        );
      })}
    </div>
  );
}
