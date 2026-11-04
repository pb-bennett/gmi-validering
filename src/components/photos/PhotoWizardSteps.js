'use client';

// The step indicator shared by every photo wizard (import and source positioning): numbered steps, the current
// one marked with aria-current, and earlier steps as back-navigation buttons where the wizard allows it.
export default function PhotoWizardSteps({ steps, current, canGoBack = () => false, onBack, label = 'Steg' }) {
  return <ol className="photo-import-steps" aria-label={label}>{steps.map(({ key, label: stepLabel }, index) =>
    <li key={key} aria-current={key === current ? 'step' : undefined}>
      {canGoBack(key)
        ? <button type="button" className="gmi-compact-button gmi-focus-ring" aria-label={`Gå tilbake til ${stepLabel}`} onClick={() => onBack(key)}>{index + 1}. {stepLabel}</button>
        : <span>{index + 1}. {stepLabel}</span>}
    </li>)}</ol>;
}
