'use client';

import { useId } from 'react';
import { CAPTURE_TIMEZONE_OPTIONS, captureTimeHelp } from '@/lib/photos/photoCaptureTimeInput.mjs';

const input = 'gmi-focus-ring rounded border border-gmi-border-strong bg-gmi-surface px-2 py-1 text-sm';

// Controlled: value = { date, time, zone, customOffset } from captureTimeFields/composeCaptureTime.
export default function PhotoCaptureTimeField({ value, onChange, error = null, legend = 'Opptakstid', help = captureTimeHelp() }) {
  const id = useId();
  const set = (patch) => onChange({ ...value, ...patch });
  return <fieldset className="photo-capture-time-field">
    <legend className="sr-only">{legend}</legend>
    <div className="photo-capture-time-inputs">
      <label htmlFor={`${id}-date`}>Dato<input id={`${id}-date`} className={input} type="date" value={value.date} onChange={(event) => set({ date: event.target.value })} /></label>
      <label htmlFor={`${id}-time`}>Klokkeslett<input id={`${id}-time`} className={input} type="time" step="1" value={value.time} onChange={(event) => set({ time: event.target.value })} /></label>
      <label htmlFor={`${id}-zone`}>Tidssone
        <select id={`${id}-zone`} className={input} value={value.zone} onChange={(event) => set({ zone: event.target.value })}>
          {CAPTURE_TIMEZONE_OPTIONS.map((option) => <option key={option.value || 'unknown'} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {value.zone === 'other' && <label htmlFor={`${id}-offset`}>Forskyvning<input id={`${id}-offset`} className={input} inputMode="text" placeholder="+05:30"
        pattern="[+\-][0-9]{2}:[0-9]{2}" value={value.customOffset} onChange={(event) => set({ customOffset: event.target.value })} /></label>}
    </div>
    <p className="photo-capture-time-help">{help}</p>
    {error && <p className="photo-capture-time-error" role="alert">{error}</p>}
  </fieldset>;
}
