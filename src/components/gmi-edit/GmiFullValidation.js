'use client';

import { useState } from 'react';
import { CheckCircleIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { getCanonicalField } from '@/lib/validation-v2/registry/registry';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import {
  GMI_VALIDATOR_DATASET_BY, buildGmiValidationComparison, gmiValidatorDefaultDataset, isCurrentGmiComparison, validatorCheckCount,
} from '@/lib/gmiValidatorEditing.mjs';
import { getGmiDocumentDataset } from '@/lib/gmi-edit/index.mjs';
import { describeGmiObject } from '@/lib/gmiEditView.mjs';

export default function GmiFullValidation({ view, layerId, guard }) {
  'use no memo';
  const referenceDate = useStore((state) => state.gmiValidatorReferenceDate);
  const [comparison, setComparison] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const severityLabel = (state) => state === 'FAIL' ? 'FEIL' : 'SJEKK';
  // Same object labels as the Rettinger object list, Data Table and history (source object number).
  const objectLabel = (scope, sourceIndex) => {
    const object = view ? getGmiDocumentDataset(view.document)?.[scope === 'line' ? 'lines' : 'points']?.[sourceIndex] : null;
    return describeGmiObject(scope, sourceIndex, object?.id ?? null);
  };
  const current = isCurrentGmiComparison(comparison, view?.session, referenceDate);
  // H4: without a dataset, keep the user's explicit choice; otherwise Foreslått when corrections exist.
  // `by: 'user'` marks the explicit Original/Foreslått column buttons.
  const inspect = (dataset = null, ruleId = null, geometryScope = null, by = GMI_VALIDATOR_DATASET_BY.AUTO) => guard(() => {
    const state = useStore.getState();
    const choice = dataset ? { dataset, by } : gmiValidatorDefaultDataset({ stored: state.gmiValidatorDatasets[layerId],
      storedBy: state.gmiValidatorDatasetsBy[layerId], changeSetCount: state.gmiEditStatus[layerId]?.changeSetCount || 0 });
    state.openGmiValidator(layerId, choice.dataset, ruleId, geometryScope, { by: choice.by });
  });
  const run = async () => {
    setBusy(true); setError(null); setComparison(null);
    const session = view.session;
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      if (gmiEditSessions.getSession(view.handle).session !== session) throw new Error('Økten er endret. Kontroller på nytt.');
      const validation = gmiEditSessions.revalidate(view.handle, { referenceDate });
      const next = buildGmiValidationComparison(session, validation, referenceDate);
      if (!next.ok) throw new Error('Foreslått kunne ikke verifiseres eller valideres. Ingen sammenligning er tilgjengelig.');
      setComparison(next);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <section className="max-h-64 shrink-0 overflow-y-auto border-t border-gmi-border p-2 text-xs" aria-label="Full kontroll av endringer">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="gmi-compact-button gmi-focus-ring inline-flex items-center gap-1 border border-gmi-border-strong px-2 py-1 text-gmi-interactive" disabled={!view || busy} onClick={run}><CheckCircleIcon size={16} /> {busy ? 'Kontrollerer…' : 'Kontroller endringer'}</button>
      <button type="button" className="gmi-edit-link" onClick={() => inspect()}>Åpne Validator</button>
    </div>
    <p className="gmi-edit-muted">Full kontroll av hele datasettet · <span title="Datoen kontrollen regnes mot, for eksempel alder på datafangst og fremtidige datoer. Ikke filens opprettelses- eller innmålingsdato.">Kontrolldato: {referenceDate}</span>. Skjemautkast er ikke med. Rådgivende; blokkerer ikke eksport.</p>
    {error && <p role="alert" className="gmi-validation-accent" data-validation-tone="error">{error}</p>}
    {comparison && !current && <p role="status">Kontrollen er utdatert. Kontroller endringer på nytt.</p>}
    {current && <div data-gmi-full-comparison>
      <table className="w-full text-left"><thead><tr><th>Kontrollresultat</th><th><button type="button" className="gmi-edit-link" onClick={() => inspect('original', null, null, GMI_VALIDATOR_DATASET_BY.USER)}>Original</button></th><th><button type="button" className="gmi-edit-link" onClick={() => inspect('proposed', null, null, GMI_VALIDATOR_DATASET_BY.USER)}>Foreslått</button></th></tr></thead><tbody>
        <tr data-validation-tone="error" className="gmi-validation-accent"><th>FEIL</th><td>{comparison.validation.original.summary.failFindingCount}</td><td>{comparison.validation.revised.summary.failFindingCount}</td></tr>
        <tr data-validation-tone="warning" className="gmi-validation-accent"><th>SJEKK</th><td>{validatorCheckCount(comparison.validation.original.summary)}</td><td>{validatorCheckCount(comparison.validation.revised.summary)}</td></tr>
      </tbody></table>
      <p>Nye FEIL: {comparison.newCounts.fail} · Nye SJEKK: {comparison.newCounts.check}</p>
      <p>Løste FEIL: {comparison.resolvedCounts.fail} · Løste SJEKK: {comparison.resolvedCounts.check}</p>
      <p>Uendrede funn: {comparison.unchanged.length} · Endret alvorlighet: {comparison.severityChanged.length}</p>
      <details><summary>Se nye, endrede og løste funn</summary><ul className="max-h-44 overflow-y-auto">
        {[...comparison.introduced.map((finding) => ({ finding, label: 'Nytt', dataset: 'proposed' })),
          ...comparison.severityChanged.map(({ previous, finding }) => ({ finding, label: `Alvorlighet ${severityLabel(previous.state)} → ${severityLabel(finding.state)}`, dataset: 'proposed' })),
          ...comparison.resolved.map((finding) => ({ finding, label: 'Løst', dataset: 'original' }))].sort((a, b) => (a.dataset === 'original' ? 2 : a.finding.state === 'FAIL' ? 0 : 1) - (b.dataset === 'original' ? 2 : b.finding.state === 'FAIL' ? 0 : 1)).map(({ finding, label, dataset }, index) => <li key={index} className="my-1">
            <button type="button" className="gmi-edit-link" onClick={() => inspect(dataset, finding.ruleId || finding.canonicalFieldId, finding.geometryScope)}>
              <ArrowSquareOutIcon size={14} /> {label} · {finding.state === 'FAIL' ? 'FEIL' : 'SJEKK'} · {getCanonicalField(finding.canonicalFieldId)?.displayLabel || 'Skjemakontroll'} · {finding.objectRef ? objectLabel(finding.geometryScope, finding.objectRef.sourceIndex) : 'Skjema'}
            </button>
          </li>)}
      </ul></details>
    </div>}
  </section>;
}
