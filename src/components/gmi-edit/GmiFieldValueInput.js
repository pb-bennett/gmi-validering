'use client';

import { useEffect, useId, useRef, useState } from 'react';

/** Keep the accepted G4 batch interface unchanged. D3 integration is a separate slice. */
function BatchFieldValueInput({ column, value, onChange, problem, disabled }) {
  const domain = column?.domain;
  const enumerated = domain?.kind === 'enumeration';
  const props = { 'aria-label': 'Ny verdi', value, disabled, 'aria-invalid': Boolean(problem),
    onChange: (event) => onChange(event.target.value) };
  return <label>Ny verdi{enumerated ? <select {...props}>
    <option value="">Velg verdi…</option>
    {domain.options.map((option) => <option key={option.value} value={option.value}>
      {option.value}{option.label !== option.value ? ` – ${option.label}` : ''}
    </option>)}
  </select> : <input {...props} type="text" autoComplete="off" spellCheck={false}
    inputMode={['integer', 'year'].includes(domain?.kind) ? 'numeric' : domain?.kind === 'decimal' ? 'decimal' : 'text'}
    placeholder={domain?.format || undefined} />}</label>;
}

const optionLabel = (option) => [option.value, option.label !== option.value ? option.label : null, option.longLabel].filter(Boolean).join(' – ');

/** Offered values and format hints only: all verdicts still come from the Validator.
 * Only typed drafts are uppercased. Mounting, list selection and external value resets preserve exact lexemes.
 */
function ObjectFieldValueInput({ domain, value, onChange, id, ...props }) {
  const [custom, setCustom] = useState(false);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(-1);
  const customOption = `custom-${useId()}`;
  const input = useRef(null), list = useRef(null);
  const options = domain?.options || [];
  const enumerated = domain?.kind === 'enumeration';
  const searchable = enumerated && options.length > 12;
  const current = options.find((option) => option.value === value);
  const matches = options.filter((option) => optionLabel(option).toLocaleLowerCase('nb').includes(query.toLocaleLowerCase('nb')));
  const hint = [current ? current.label !== current.value ? current.label : null : enumerated && value ? 'Verdien er ikke i kodelisten. Validator vurderer verdien.' : null,
    domain?.format, domain?.unit].filter(Boolean).join(' · ');
  const hintId = `${id}-domain`, listId = `${id}-options`;
  const controlProps = { ...props, id, value, 'aria-describedby': [props['aria-describedby'], hint ? hintId : null].filter(Boolean).join(' ') || undefined };
  const typed = (text) => domain?.upperCase ? text.toUpperCase() : text;
  const choose = (option) => { onChange(option.value); setOpen(false); setQuery(''); setActive(-1); };
  useEffect(() => { if (custom) input.current?.focus(); }, [custom]);
  useEffect(() => {
    if (open && active >= 0) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);
  return <div className="gmi-field-value-control" data-gmi-value-kind={domain?.kind || 'text'}>
    {enumerated && !searchable && !custom ? <select {...controlProps} onChange={(event) => {
      if (event.target.value === customOption) setCustom(true);
      else onChange(event.target.value);
    }}>
      <option value="">Tom verdi</option>
      {value && !current && <option value={value}>{value} – ikke i kodelisten</option>}
      {options.map((option) => <option key={option.value} value={option.value}>{optionLabel(option)}</option>)}
      <option value={customOption}>Annen verdi…</option>
    </select> : <>
      <input {...controlProps} ref={input} type="text" autoComplete="off" spellCheck={false}
        inputMode={['integer', 'year'].includes(domain?.kind) ? 'numeric' : domain?.kind === 'decimal' || domain?.comparison === 'numeric' ? 'decimal' : 'text'}
        placeholder={searchable ? 'Søk på kode eller betydning' : domain?.format || undefined}
        role={searchable ? 'combobox' : undefined} aria-autocomplete={searchable ? 'list' : undefined}
        aria-expanded={searchable ? open : undefined} aria-controls={searchable ? listId : undefined}
        aria-activedescendant={searchable && open && matches[active] ? `${listId}-${active}` : undefined}
        onFocus={() => { if (searchable) { setOpen(true); setQuery(''); setActive(-1); } }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          const next = typed(event.target.value); onChange(next);
          if (searchable) { setQuery(next); setOpen(true); setActive(-1); }
        }}
        onKeyDown={(event) => {
          if (!searchable) return;
          if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive((index) => !matches.length ? -1 : index < 0 ? event.key === 'ArrowDown' ? 0 : matches.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
          } else if (event.key === 'Enter' && open && matches[active]) { event.preventDefault(); choose(matches[active]); }
        }} />
      {custom && <button type="button" className="gmi-edit-link gmi-focus-ring" onClick={() => setCustom(false)}>Vis kodeliste</button>}
    </>}
    {searchable && open && <>
      <ul ref={list} id={listId} role="listbox" aria-label="Verdier i kodelisten" className="gmi-field-value-options">
        {matches.map((option, index) => <li key={option.value} id={`${listId}-${index}`} role="option"
          aria-selected={active === index} onPointerDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
          {optionLabel(option)}
        </li>)}
      </ul>
      {!matches.length && <span className="gmi-edit-muted" role="status">Ingen treff. Egen verdi kan brukes og vurderes av Validator.</span>}
    </>}
    {hint && <span id={hintId} className="gmi-field-value-hint" title={current?.longLabel || undefined}>{hint}</span>}
  </div>;
}

export default function GmiFieldValueInput({ variant = 'batch', ...props }) {
  return variant === 'object' ? <ObjectFieldValueInput {...props} /> : <BatchFieldValueInput {...props} />;
}
