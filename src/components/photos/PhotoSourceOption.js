'use client';

export const photoSourceButton = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong bg-gmi-surface px-3 py-2';

// One source card for both photo wizards: a radio choice (or a plain card for an attached source), an optional
// hint, and the source's own actions/status when it is the chosen one. Presentation only; callers own the workflow.
export default function PhotoSourceOption({ as: Element = 'div', name, value, label, hint = '', checked = false, disabled = false, onChange, children, sourceId }) {
  return <Element className="photo-import-source" data-source-option={value} data-source-id={sourceId}>
    {name ? <label><input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={() => onChange?.(value)} /> <strong>{label}</strong></label>
      : <p className="photo-import-source-title"><strong>{label}</strong></p>}
    {hint && <p>{hint}</p>}
    {children}
  </Element>;
}
