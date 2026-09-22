'use client';

import { ArrowSquareOutIcon } from '@phosphor-icons/react';

const STATUS_DOT_CLASSES = Object.freeze({
  red: 'bg-red-600',
  amber: 'bg-amber-500',
  green: 'bg-green-600',
});

function getRowId(presentation) {
  return `validation-v2-rule-${presentation.expansionKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function SummaryCount({ label, value, className = 'text-slate-700' }) {
  return (
    <div className={`inline-flex items-baseline gap-0.5 whitespace-nowrap ${className}`}>
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
}) {
  return (
    <div className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
      {presentations.map((presentation) => {
        const rowId = getRowId(presentation);
        const panelId = `${rowId}-summary`;
        const isExpanded = expandedRuleKey === presentation.expansionKey;
        const { counts } = presentation;
        return (
          <div key={presentation.expansionKey}>
            <button
              id={rowId}
              type="button"
              aria-expanded={isExpanded}
              aria-controls={panelId}
              aria-label={`${presentation.displayName}: ${presentation.status.label} for denne kontrollen for valgt geometri`}
              onClick={() => onToggle(presentation.expansionKey)}
              className="flex min-h-10 w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
            >
              <span
                role="img"
                aria-label={`Status: ${presentation.status.label}`}
                title={`Status: ${presentation.status.label}`}
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT_CLASSES[presentation.status.visualToken] || STATUS_DOT_CLASSES.amber}`}
              />
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-gray-900">
                {presentation.displayName}
              </span>
              <span aria-hidden="true" className="shrink-0 text-gray-500">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d={isExpanded ? 'M5.5 12.5 10 8l4.5 4.5-1.25 1.25L10 10.5l-3.25 3.25z' : 'm5.5 7.5 1.25-1.25L10 9.5l3.25-3.25 1.25 1.25-4.5 4.5z'} />
                </svg>
              </span>
            </button>
            {isExpanded && (
              <section
                id={panelId}
                role="region"
                aria-labelledby={rowId}
                className="border-t border-gray-100 px-2 pb-2 pt-2"
              >
                <div className="mb-1 flex flex-nowrap items-center gap-1">
                  <dl className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-2">
                    <SummaryCount label="Objekter" value={counts.evaluatedCount} />
                    {counts.failCount > 0 && <SummaryCount label="Feil" value={counts.failCount} className="text-red-700" />}
                    {(counts.checkCount || 0) + counts.indeterminateCount > 0 && (
                      <SummaryCount label="Sjekk" value={(counts.checkCount || 0) + counts.indeterminateCount} className="text-amber-700" />
                    )}
                    {counts.passCount > 0 && <SummaryCount label="Pass" value={counts.passCount} className="text-green-700" />}
                  </dl>
                  <button
                    type="button"
                    aria-label={`Vis detaljer: ${presentation.displayName}`}
                    title="Vis"
                    onClick={(event) => onInfo?.(presentation, event.currentTarget)}
                    className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
                  >
                    <ArrowSquareOutIcon aria-hidden="true" size={16} weight="bold" />
                    <span>Vis</span>
                  </button>
                </div>
              </section>
            )}
          </div>
        );
      })}
    </div>
  );
}
