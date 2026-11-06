'use client';

/* eslint-disable @next/next/no-img-element -- Reuses session-owned thumbnail URLs only. */

export const completionButton = 'gmi-compact-button gmi-focus-ring min-h-9 border border-gmi-border-strong bg-gmi-surface px-3 py-1.5 text-sm font-medium disabled:opacity-40';
export const completionRowButton = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong bg-gmi-surface px-2 py-1 text-xs font-medium';

export function CompletionHeading({ title, requirementLabel, note, excluded = 0 }) {
  return <header className="photo-completion-panel-heading">
    <h3 tabIndex={-1} data-completion-heading>{title}</h3>
    {requirementLabel && <span className="photo-completion-requirement" data-requirement-label>{requirementLabel}</span>}
    {note && <p className="photo-completion-requirement-note">{note}</p>}
    {excluded > 0 && <p className="photo-completion-requirement-note">{excluded} uten posisjon er ikke med her, fordi uplasserte bilder ikke blir med i leveransen.</p>}
  </header>;
}

export function CompletionCounts({ counts }) {
  return <dl className="photo-completion-counts" aria-label="Oversikt">
    {counts.map(({ key, label, count }) => <div key={key} data-count={key}><dt>{label}</dt><dd>{count}</dd></div>)}
  </dl>;
}

export function CompletionNotes({ items }) {
  return items.length > 0 && <ul className="photo-completion-notes" aria-label="Bør kontrolleres">
    {items.map(({ code, text }) => <li key={code} data-recommendation={code}>{text}</li>)}
  </ul>;
}

function RowBody({ row, children }) {
  return <>
    {row.thumbnailUrl ? <img src={row.thumbnailUrl} alt="" loading="lazy" decoding="async" /> : <span className="photo-completion-thumbnail" aria-hidden="true" />}
    <div className="photo-completion-row-body">
      <p className="photo-completion-filename">{row.filename}{row.occurrence && <small> · {row.occurrence}</small>}</p>
      {row.acceptedText && <p data-accepted-value>Godtatt: {row.acceptedText}</p>}
      {row.sources?.map((source) => <p key={source.key} data-source-value>{source.text}</p>)}
      {row.note && <p className="photo-completion-row-note">{row.note}</p>}
      {children}
    </div>
  </>;
}

function Row({ row, selected, onToggle, action }) {
  return <li data-completion-row={row.key} data-state={row.state}>
    {onToggle && (row.selectable
      ? <input type="checkbox" className="gmi-focus-ring" aria-label={`Velg ${row.filename}${row.occurrence ? `, ${row.occurrence}` : ''}`} checked={selected} onChange={() => onToggle(row.key)} />
      : <span className="photo-completion-check-gap" aria-hidden="true" />)}
    <RowBody row={row} />
    {action && <div className="photo-completion-row-action">{action}</div>}
  </li>;
}

// Rows grouped by state, with one selection across all groups. rowAction may return nothing for rows it cannot act on.
export function CompletionGroups({ groups, selected, onSelection, rowAction }) {
  const chosen = new Set(selected);
  const toggle = (key) => onSelection(chosen.has(key) ? selected.filter((item) => item !== key) : [...selected, key]);
  return groups.map((group) => {
    const keys = group.rows.filter((row) => row.selectable).map((row) => row.key);
    const allChosen = keys.length > 0 && keys.every((key) => chosen.has(key));
    return <details key={group.state} className="photo-completion-group" data-group={group.state} open={group.open}>
      <summary>{group.label} ({group.rows.length})</summary>
      {group.hint && <p className="photo-completion-requirement-note">{group.hint}</p>}
      {keys.length > 1 && <button type="button" className={completionRowButton} onClick={() => onSelection(allChosen ? selected.filter((key) => !keys.includes(key)) : [...new Set([...selected, ...keys])])}>
        {allChosen ? 'Fjern valg i gruppen' : `Velg alle i gruppen (${keys.length})`}
      </button>}
      <ul className="photo-completion-rows">{group.rows.map((row) => <Row key={row.key} row={row} selected={chosen.has(row.key)} onToggle={toggle} action={rowAction?.(row)} />)}</ul>
    </details>;
  });
}

// Accepted values stay reviewable with their source.
export function CompletionDone({ rows, rowAction }) {
  return rows.length > 0 && <details className="photo-completion-group" data-group="done">
    <summary>Ferdig ({rows.length})</summary>
    <ul className="photo-completion-rows">{rows.map((row) => <Row key={row.key} row={row} action={rowAction?.(row)} />)}</ul>
  </details>;
}

export function CompletionSelection({ count, scope, onClear }) {
  return scope > 0 && <p className="photo-completion-selection" data-completion-selection>
    {count > 0 ? `${count} valgt. Handlingene gjelder bare de valgte.` : 'Ingen av de valgte gjenstår. Fjern valg for å bruke handlingene på alle.'} <button type="button" className={completionRowButton} onClick={onClear}>Fjern valg</button>
  </p>;
}
