'use client';

import { useRef } from 'react';
import { FunnelSimpleIcon } from '@phosphor-icons/react';
import { gmiObjectCountLabel } from '@/lib/gmiEditView.mjs';
import GmiSeverityIcon from './GmiSeverityIcon';

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

const SPLIT = [['FEIL', 'error', 'FEIL'], ['SJEKK', 'warning', 'SJEKK'], ['none', 'success', 'uten funn'], ['unknown', null, 'ikke vurdert']];

/** B2: current Validator findings on the edited field per selected object (one category each), with «Behold bare FEIL». */
export function GmiCurrentFindingSplit({ split, scope, disabled = false, onNarrow }) {
  const labelRef = useRef(null);
  if (!split?.total) return null;
  const { counts } = split;
  return <section className="gmi-current-split" data-gmi-current-split aria-label={`Funn nå på ${split.field}`}
    data-feil={counts.FEIL} data-sjekk={counts.SJEKK} data-none={counts.none}>
    <p className="gmi-current-split-line"><span ref={labelRef} tabIndex={-1} className="gmi-current-split-label gmi-focus-ring">Nå på {split.field}:</span>
      {SPLIT.filter(([key]) => key !== 'unknown' || counts.unknown).map(([key, tone, label]) => <span key={key} className="gmi-split-count"
        data-validation-tone={counts[key] && tone ? tone : undefined} data-split={key} data-count={counts[key]}>
        {tone && <GmiSeverityIcon tone={tone} size={13} />}{counts[key]} {label}</span>)}
      {counts.FEIL > 0 && counts.FEIL < split.total && <button type="button" className="gmi-edit-link gmi-focus-ring" disabled={disabled} data-gmi-split-keep="FEIL"
        aria-label={`Behold bare objekter med FEIL på ${split.field}: ${gmiObjectCountLabel(counts.FEIL, scope)}`}
        onClick={() => { if (onNarrow({ label: `Funn nå på ${split.field}` }, { label: 'FEIL', keys: split.groups.FEIL })) labelRef.current?.focus(); }}>Behold bare FEIL ({counts.FEIL})</button>}
    </p>
    <p className="gmi-profile-note">Mangler en verdi på eksisterende ledningsnett, kan Validator gi SJEKK i stedet for FEIL. Slike objekter må ikke nødvendigvis rettes.</p>
  </section>;
}
