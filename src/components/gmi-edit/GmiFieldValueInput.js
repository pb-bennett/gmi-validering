'use client';

/** G4 basic control. The capability domain is the sole owner of listed values. */
export default function GmiFieldValueInput({ column, value, onChange, problem, disabled }) {
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
