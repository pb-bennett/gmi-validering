'use client';

import { CheckIcon } from '@phosphor-icons/react';

// The step indicator shared by every photo wizard (import and source positioning): numbered steps, the current
// one marked with aria-current, and earlier steps as back-navigation buttons where the wizard allows it.
// `done`: the wizard's work is saved; every step is shown completed and none is navigable.
export default function PhotoWizardSteps({ steps, current, canGoBack = () => false, onBack, label = 'Steg', done = false }) {
  return <ol className="photo-import-steps" aria-label={label} data-steps-done={done || undefined}>{steps.map(({ key, label: stepLabel }, index) =>
    <li key={key} aria-current={!done && key === current ? 'step' : undefined}>
      {done && <><CheckIcon size={14} weight="regular" aria-hidden="true" className="photo-import-step-done" /><span className="sr-only">Fullført: </span></>}
      {canGoBack(key)
        ? <button type="button" className="gmi-compact-button gmi-focus-ring" aria-label={`Gå tilbake til ${stepLabel}`} onClick={() => onBack(key)}>{index + 1}. {stepLabel}</button>
        : <span>{index + 1}. {stepLabel}</span>}
    </li>)}</ol>;
}
