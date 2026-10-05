'use client';

import { useEffect, useRef, useState } from 'react';
import { CopyIcon, CheckIcon } from '@phosphor-icons/react';
import { createFilenameCopyAction, filenameCopyFeedback } from '@/lib/filenameClipboard.mjs';

export default function FilenameCopyButton({ filename, referenceNumber }) {
  const [status, setStatus] = useState('idle');
  const action = useRef(null);
  useEffect(() => {
    action.current = createFilenameCopyAction(filename, setStatus);
    return () => action.current.dispose();
  }, [filename]);
  const feedback = filenameCopyFeedback(status);
  const Icon = status === 'copied' ? CheckIcon : CopyIcon;
  return (
    <button
      type="button"
      onClick={(event) => action.current?.copy(event)}
      disabled={status === 'pending'}
      aria-label={`Kopier filnavn ${filename}`}
      title={feedback || `Kopier filnavn ${filename}`}
      className="gmi-compact-button gmi-focus-ring flex h-5 shrink-0 items-center justify-center gap-0.5 px-1 text-[10px] text-gmi-interactive"
    >
      <Icon size={12} weight="regular" aria-hidden="true" />
      {referenceNumber && !feedback ? <span>{referenceNumber}</span> : null}
      <span role="status">{feedback}</span>
    </button>
  );
}
