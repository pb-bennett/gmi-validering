'use client';

import { useId } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react';
import { geminiPresentation } from '@/lib/gemini-wfs/geminiReferencePresentation.mjs';
import { GEMINI_MISSING_VALUE } from '@/lib/gemini-wfs/geminiFilters.mjs';

const linkButton = 'gmi-focus-ring rounded text-[10px] text-gmi-interactive hover:text-gmi-navy hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40 disabled:hover:text-gmi-interactive';

function FilterGroup({ group, open }) {
  const panelId = useId();
  return <div data-gemini-filter={group.id} className="border-t border-gmi-border">
    <button type="button" aria-expanded={open} aria-controls={panelId}
      onClick={() => geminiPresentation.setFilterGroupOpen(group.id, !open)}
      className="gmi-focus-ring flex w-full items-center gap-2 px-2 py-1 text-left transition-colors hover:bg-gmi-surface-soft">
      <span className="text-[11px] font-semibold text-gmi-text">{group.label}</span>
      {group.linesOnly && <span className="whitespace-nowrap text-[10px] text-gmi-text-muted">Kun ledninger</span>}
      {group.hiddenValues > 0 && <span className="whitespace-nowrap rounded border border-gmi-border-strong px-1 text-[9px] text-gmi-text-muted">{group.hiddenValues} skjult</span>}
      <span className="ml-auto whitespace-nowrap text-[10px] text-gmi-text-muted">{group.rows.length} {group.rows.length === 1 ? 'verdi' : 'verdier'}</span>
      <CaretDownIcon size={12} weight="regular" aria-hidden="true"
        className={`shrink-0 text-gmi-text-subtle transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div id={panelId} role="group" aria-label={group.linesOnly ? `${group.label}, kun ledninger` : group.label} className="px-2 pb-1">
      <div className="flex justify-end gap-3 pb-0.5">
        <button type="button" className={linkButton} aria-label={`Vis alle: ${group.label}`}
          onClick={() => geminiPresentation.setFilterBase(group.id, 'all')}>Vis alle</button>
        <button type="button" className={linkButton} aria-label={`Skjul alle: ${group.label}`}
          onClick={() => geminiPresentation.setFilterBase(group.id, 'none')}>Skjul alle</button>
      </div>
      {group.rows.map((row) => <label key={row.key} data-filter-value={row.key}
        className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[11px] hover:bg-gmi-surface-soft">
        <input type="checkbox" checked={row.checked}
          onChange={(event) => geminiPresentation.setFilterValue(group.id, row.key, event.currentTarget.checked)}
          className="gmi-focus-ring h-3 w-3 shrink-0 rounded border-gmi-border-strong accent-gmi-interactive" />
        <span className={`min-w-0 flex-1 wrap-break-word ${row.key === GEMINI_MISSING_VALUE ? 'italic text-gmi-text-muted' : 'text-gmi-text'}`}>{row.label}</span>
        <span className="tabular-nums text-gmi-text-muted">{row.count}</span>
      </label>)}
    </div>}
  </div>;
}

export default function GeminiFilterGroups({ groups, openGroups, isDefault }) {
  return <div role="group" aria-label="Filter for Gemini WFS" className="mb-2 border-b border-gmi-border">
    <div className="flex items-center justify-between px-2 py-1">
      <span className="text-[10px] font-bold uppercase text-gmi-text-muted">Filter</span>
      <button type="button" className={linkButton} disabled={isDefault} onClick={() => geminiPresentation.resetFilters()}>Nullstill filtre</button>
    </div>
    {groups.map((group) => <FilterGroup key={group.id} group={group} open={openGroups.includes(group.id)} />)}
  </div>;
}
