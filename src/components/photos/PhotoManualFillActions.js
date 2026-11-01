'use client';

import { useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { planManualPhotoFill } from '@/lib/photos/photoManualFill.mjs';

const fields = [
  ['captureTime', 'opptakstid', 'bilder', 'Denne verdien brukes på alle bilder som fortsatt mangler godtatt opptakstid. Sekunder kreves. Tidssone utelates hvis ukjent.'],
  ['photographer', 'fotograf', 'bilder', 'Dette navnet brukes på alle bilder som fortsatt mangler godtatt fotograf.'],
  ['direction', 'retning', 'forekomster', 'Denne retningen brukes på alle forekomster som fortsatt mangler godtatt retning. Med klokken fra geografisk nord. 0° = nord, 90° = øst, 180° = sør, 270° = vest. 0° betyr godtatt nord, ikke ukjent.'],
];
const errors = {
  captureTime: 'Oppgi gyldig ISO-dato og klokkeslett med sekunder, eventuelt brøkdelssekunder og tidssone (Z eller ±HH:MM).',
  photographer: 'Oppgi et navn uten ugyldige XML-tegn. Tom verdi kan ikke brukes.',
  direction: 'Oppgi et endelig tall fra 0 til 360 grader. 360° blir 0°; brøkdeler beholdes.',
};
const control = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1 text-xs disabled:opacity-40';

export default function PhotoManualFillActions({ photos, layerId, selectedIds, onFill }) {
  const [message, setMessage] = useState('');
  const plans = fields.map(([field, label, unit, help]) => ({ field, label, unit, help,
    plan: planManualPhotoFill(photos, field, selectedIds) }));
  const missing = plans.some(({ plan }) => plan.counts.eligible);
  return <div className="space-y-2" aria-label="Manuell utfylling av manglende verdier">
    {missing && <fieldset className="space-y-2 border border-gmi-border-strong p-2">
      <legend>Manuell utfylling · bare manglende verdier</legend>
      <p>Bruk kildeverdier først når de er riktige. Her godtar du én egen verdi for alle som fortsatt mangler feltet, også ved kildekonflikt. Eksisterende godtatte verdier beholdes.</p>
      {plans.filter(({ plan }) => plan.counts.eligible).map(({ field, label, unit, help, plan }) => <form key={`${layerId}:${field}`} data-manual-fill={field} className="space-y-1" onSubmit={(event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.value;
        const result = photoSession.fillMissingPhotoValues(layerId, field, field === 'direction' ? input.valueAsNumber : input.value, selectedIds);
        if (!result.ok) { setMessage(errors[field]); return; }
        const c = result.counts;
        setMessage(`${label}: ${c.adopted} ${unit} godtatt av ${c.eligible} manglende · ${c.alreadyAccepted} allerede godtatt · ${c.stale} fjernet/utdatert · ${c.deduplicated} delte forekomster telt én gang · ${c.repeatedApplications} anvendelser på delte forekomster. Lag eksportforhåndsvisning igjen.`);
        if (c.adopted) onFill?.();
      }}>
        <p>Mangler {label}: {plan.counts.eligible} {unit}. {help}</p>
        <label className="block">Manuell {label} for manglende
          <input name="value" aria-label={`Manuell ${label} for manglende`} required className="block w-full border border-gmi-border-strong px-1"
            type={field === 'direction' ? 'number' : 'text'} min={field === 'direction' ? 0 : undefined} max={field === 'direction' ? 360 : undefined}
            step={field === 'direction' ? 'any' : undefined} placeholder={field === 'captureTime' ? 'ÅÅÅÅ-MM-DDTtt:mm:ss (ev. +02:00)' : undefined} />
        </label>
        <button type="submit" className={control}>Bruk manuell {label} på {plan.counts.eligible} manglende {unit}</button>
      </form>)}
    </fieldset>}
    {message && <p role="status">{message}</p>}
  </div>;
}
