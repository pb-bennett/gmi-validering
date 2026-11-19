'use client';
/* eslint-disable @next/next/no-img-element -- Reuses session-owned thumbnail URLs only. */
import { useId } from 'react';
import { WarningIcon } from '@phosphor-icons/react';
import { formatPhotoCaptureTime, photoMetadataSourceLabel } from '@/lib/photos/photoPresentation.mjs';
import './photoCollectionPanel.css';

const reasons = { 'capture-time-differs': 'Annen opptakstid', 'can-complete': 'Kan fullføres', 'can-replace-estimate': 'Kan erstatte anslått dato' };
const timeText = (value, provenance) => {
  const time = formatPhotoCaptureTime(value, provenance);
  return time ? `${time.text}${time.notes.length ? ` · ${time.notes.join(' · ')}` : ''}` : 'Ingen';
};
const proposalTag = (row) => row.option === 'complete' ? 'Fullstendig' : row.proposedValue?.precision === 'date' ? 'Kun dato' : 'Ufullstendig';
const byAsset = (a, b) => (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0);

// GML capture-time choices for one M2 reconciliation plan, shared by the positioning wizard (Koblinger) and the import
// wizard (Kontroll, «Fra GML-fil»). Nothing is applied here: the wizard sends the decision with its own commit.
// Both options start unchecked and conflicts keep the current value unless «Bruk GML» is chosen.
export default function PhotoGmlCaptureTimeChoices({ plan, choices, onChange, thumbnailFor = () => null, showPending = true }) {
  const name = useId();
  if (!plan) return null;
  const review = [...plan.conflicts, ...plan.reviewRows].sort(byAsset);
  const { complete, partial, partialHasMinute } = plan.options;
  // A5: the compatible rows behind the two options, listed for inspection only. Each row's tag names the option covering it.
  const proposals = [...plan.fill, ...plan.fillPartial, ...plan.completions].sort(byAsset);
  const pending = showPending && plan.pending.length > 0;
  if (!complete && !partial && !review.length && !pending) return null;
  const option = (key, label, count) => count > 0 && <label className="photo-gml-capture-choice">
    <input type="checkbox" className="accent-gmi-interactive" checked={Boolean(choices?.[key])} onChange={(event) => onChange({ [key]: event.target.checked })} />
    {label} ({count})
  </label>;
  const conflicts = plan.conflicts.length, completions = plan.reviewRows.length;
  const subject = review.length === 1 ? '1 bilde har' : `${review.length} bilder har`;
  const title = !completions ? `${subject} en annen opptakstid i GML-filen.`
    : !conflicts ? `${subject} en mindre fullstendig opptakstid enn GML-filen.`
      : `${subject} en annen eller mindre fullstendig opptakstid enn GML-filen.`;
  return <section className="photo-gml-capture" aria-label="Opptakstid fra GML" data-gml-capture>
    {pending && <p role="status">Leser opptakstid fra bildene …</p>}
    {option('complete', 'Bruk opptakstid fra GML', complete)}
    {option('partial', partialHasMinute ? 'Bruk ufullstendig opptakstid fra GML' : 'Bruk kun dato fra GML', partial)}
    {proposals.length > 0 && <details className="photo-gml-capture-proposals" data-gml-capture-proposals={proposals.length}>
      <summary>Vis forslag ({proposals.length})</summary>
      <ul className="photo-gml-capture-list">{proposals.map((row) => {
        const thumbnail = thumbnailFor(row.assetId);
        return <li key={row.assetId} data-gml-capture-proposal={row.assetId} data-gml-capture-option={row.option}>
          {thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <span className="photo-gml-capture-thumbnail" aria-hidden="true" />}
          <div>
            <strong className="photo-gml-capture-file">{row.filename}</strong>
            <span>Gjeldende: {timeText(row.current.value, row.current.provenance)}</span>
            <span>GML: {timeText(row.proposedValue)}</span>
            <span className="photo-gml-capture-tag">{proposalTag(row)}</span>
          </div>
        </li>;
      })}</ul>
    </details>}
    {review.length > 0 && <div className="photo-gml-capture-review gmi-validation-panel" data-validation-tone="warning" data-gml-capture-review={review.length}>
      <p className="photo-gml-capture-title"><WarningIcon size={16} weight="regular" aria-hidden="true" className="gmi-validation-accent" />
        <span><strong>SJEKK</strong> {title}</span></p>
      <fieldset className="photo-gml-capture-decision">
        <legend>Ved avvik</legend>
        {[['keep', 'Behold gjeldende'], ['gml', 'Bruk GML']].map(([value, label]) => <label key={value} className="photo-gml-capture-choice">
          <input type="radio" className="accent-gmi-interactive" name={name} value={value} checked={(choices?.conflicts || 'keep') === value}
            onChange={() => onChange({ conflicts: value })} />{label}
        </label>)}
      </fieldset>
      <details>
        <summary>Vis avvik ({review.length})</summary>
        <ul className="photo-gml-capture-list">{review.map((row) => {
          const thumbnail = thumbnailFor(row.assetId);
          return <li key={row.assetId} data-gml-capture-row={row.assetId}>
            {thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <span className="photo-gml-capture-thumbnail" aria-hidden="true" />}
            <div>
              <strong className="photo-gml-capture-file">{row.filename}</strong>
              <span>Gjeldende: {timeText(row.current.value, row.current.provenance)}{row.current.provenance ? ` · ${photoMetadataSourceLabel('captureTime', row.current.provenance)}` : ''}</span>
              <span>GML: {timeText(row.proposedValue)}</span>
              <span className="photo-gml-capture-reason">{reasons[row.reason]}</span>
            </div>
          </li>;
        })}</ul>
      </details>
    </div>}
  </section>;
}
