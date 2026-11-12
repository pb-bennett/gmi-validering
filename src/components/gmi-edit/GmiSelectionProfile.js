'use client';

import { useRef } from 'react';
import { FunnelSimpleIcon } from '@phosphor-icons/react';
import { gmiObjectCountLabel } from '@/lib/gmiEditView.mjs';

const UNAVAILABLE = { absent: 'Finnes ikke i filen', ambiguous: 'Feltkoblingen er tvetydig' };
const INLINE = 3; // Values summarised inline before «N ulike verdier».

const summaryOf = (dimension) => dimension.groups.length > INLINE
  ? `${dimension.distinct} ulike verdier${dimension.missing ? ` · ${dimension.missing} tomme` : ''}`
  : dimension.groups.map((group) => `${group.label} (${group.count})`).join(' · ');

function ProfileRow({ dimension, scope, disabled, onNarrow }) {
  if (dimension.state !== 'bound') {
    return <div className="gmi-profile-row" data-profile-field={dimension.id} data-profile-state={dimension.state}>
      <dt>{dimension.label}</dt><dd className="gmi-profile-unavailable">{UNAVAILABLE[dimension.state] || 'Ikke tilgjengelig'}</dd>
    </div>;
  }
  if (dimension.uniform) {
    const [group] = dimension.groups;
    return <div className="gmi-profile-row" data-profile-field={dimension.id} data-profile-kind={dimension.kind} data-profile-uniform>
      <dt>{dimension.label}</dt><dd><span data-profile-value={group.value} data-missing={group.missing || undefined}>{group.label}</span> <span className="gmi-profile-all">(alle)</span></dd>
    </div>;
  }
  return <div className="gmi-profile-row" data-profile-field={dimension.id} data-profile-kind={dimension.kind}>
    <dt>{dimension.label}</dt>
    <dd><details className="gmi-profile-details">
      <summary>{summaryOf(dimension)}</summary>
      <ul className="gmi-profile-groups">{dimension.groups.map((group) => <li key={group.value} data-profile-value={group.value} data-missing={group.missing || undefined} data-count={group.count}>
        <span className="gmi-profile-value">{group.label}</span>
        <span className="gmi-profile-count">{group.count}</span>
        <button type="button" className="gmi-edit-link gmi-focus-ring" disabled={disabled} data-gmi-profile-keep
          aria-label={`Behold bare ${dimension.label} ${group.missing ? 'uten verdi' : group.label}: ${gmiObjectCountLabel(group.count, scope)}`}
          onClick={() => onNarrow(dimension, group)}>Behold bare disse ({group.count})</button>
      </li>)}</ul>
    </details></dd>
  </div>;
}

/** B1: compact value profile of the selected objects on the proposed dataset, with shrink-only narrowing. */
export default function GmiSelectionProfile({ profile, disabled = false, notice = null, onNarrow }) {
  const headingRef = useRef(null);
  if (!profile?.total) return null;
  const narrow = (dimension, group) => { if (onNarrow(dimension, group)) headingRef.current?.focus(); };
  const rows = [...profile.fields, ...profile.context];
  return <section className="gmi-selection-profile" data-gmi-selection-profile data-total={profile.total} aria-labelledby="gmi-selection-profile-heading">
    <p id="gmi-selection-profile-heading" ref={headingRef} tabIndex={-1} className="gmi-profile-heading gmi-focus-ring">
      <FunnelSimpleIcon size={13} weight="regular" aria-hidden="true" />Utvalget: {gmiObjectCountLabel(profile.total, profile.scope)} · Foreslått nå
    </p>
    <dl className="gmi-profile-list">
      {rows.map((dimension) => <ProfileRow key={dimension.id} dimension={dimension} scope={profile.scope} disabled={disabled} onNarrow={narrow} />)}
    </dl>
    {profile.context.length > 0 && <p className="gmi-profile-note">Hydraulisk klasse og øvrig regelgrunnlag er fra forhåndsvisningen.</p>}
    <p className="sr-only" role="status" aria-live="polite">{notice || ''}</p>
    {notice && <p className="gmi-profile-note" aria-hidden="true" data-gmi-profile-notice>{notice}</p>}
  </section>;
}
