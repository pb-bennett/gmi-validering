'use client';

import { useId, useState } from 'react';
import GmiConfirmDialog from './gmi-edit/GmiConfirmDialog';

const CRS_CHOICES = [
  { epsg: 25832, label: 'UTM sone 32 (EPSG:25832)' },
  { epsg: 25833, label: 'UTM sone 33 (EPSG:25833)' },
];

/** A file without a usable CRS is imported only after an explicit choice. Nothing is preselected; cancel imports nothing. */
export default function CrsChoiceDialog({ fileName, invalid, onCancel, onConfirm }) {
  const [epsg, setEpsg] = useState(null);
  const group = useId();
  return (
    <GmiConfirmDialog title="Velg koordinatsystem" confirmLabel="Importer" destructive={false} testId="crs"
      confirmDisabled={epsg === null} onCancel={onCancel} onConfirm={() => onConfirm(epsg)}>
      <p className="break-words">
        {invalid
          ? `Filen «${fileName}» har et koordinatsystem (CRS) som ikke kan leses.`
          : `Filen «${fileName}» mangler koordinatsystem (CRS).`}
        {' '}Objektene plasseres feil i kartet hvis du velger en annen sone enn den filen er målt i. Originalfilen endres ikke.
      </p>
      <fieldset className="grid gap-1">
        <legend className="mb-1 font-medium">Koordinatsystem for filen</legend>
        {CRS_CHOICES.map((choice) => (
          <label key={choice.epsg} className="flex cursor-pointer items-center gap-2">
            <input type="radio" name={group} value={choice.epsg} checked={epsg === choice.epsg}
              onChange={() => setEpsg(choice.epsg)} className="accent-gmi-interactive" />
            {choice.label}
          </label>
        ))}
      </fieldset>
    </GmiConfirmDialog>
  );
}
