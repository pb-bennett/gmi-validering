'use client';

const STATUS_DOT_CLASSES = Object.freeze({
  red: 'bg-red-600',
  amber: 'bg-amber-500',
  green: 'bg-green-600',
});

function getRowId(presentation) {
  return `validation-v2-rule-${presentation.expansionKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function SummaryCount({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 py-1">
      <dt className="text-[10px] text-gray-500">{label}</dt>
      <dd className="text-xs font-semibold text-gray-900">{value}</dd>
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
        const statusClass = presentation.status.visualToken === 'red'
          ? 'bg-red-50 text-red-800'
          : presentation.status.visualToken === 'green'
            ? 'bg-green-50 text-green-800'
            : 'bg-amber-50 text-amber-900';
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
              className="flex min-h-10 w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            >
              <span
                role="img"
                aria-label={`Status: ${presentation.status.label}`}
                title={`Status: ${presentation.status.label}`}
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT_CLASSES[presentation.status.visualToken] || STATUS_DOT_CLASSES.amber}`}
              />
              <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">
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
                <div className="mb-1 flex items-center justify-end">
                  <button
                    type="button"
                    aria-label={`Feltinformasjon: ${presentation.displayName}`}
                    title="Feltinformasjon"
                    onClick={(event) => onInfo?.(presentation, event.currentTarget)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded text-xs ${statusClass} hover:ring-2 hover:ring-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  >
                    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3.25a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM8.75 9h2.5v5h-2.5V9Z" />
                    </svg>
                  </button>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
                  <SummaryCount label="Objekter i grunnlaget" value={counts.evaluatedCount} />
                  <SummaryCount label="Bestått" value={counts.passCount} />
                  <SummaryCount label="Må rettes" value={counts.failCount} />
                  <SummaryCount label="Må vurderes" value={counts.indeterminateCount} />
                  {counts.notEvaluatedCount > 0 && (
                    <SummaryCount label="Ikke kontrollert" value={counts.notEvaluatedCount} />
                  )}
                </dl>
              </section>
            )}
          </div>
        );
      })}
    </div>
  );
}
