'use client';

import { FileArrowUpIcon } from '@phosphor-icons/react';

// Presentation only, and transparent to pointer events: drag events keep reaching the real drop handlers.
export default function FileDropOverlay({ title, hint = null, icon: Icon = FileArrowUpIcon, refused = false, contained = false }) {
  return <div role="status" className={`file-drop-overlay${contained ? ' file-drop-overlay-contained' : ''}`} data-tone={refused ? 'refused' : 'accepted'}>
    <div className="file-drop-overlay-message">
      <Icon size={28} weight="regular" aria-hidden="true" />
      <div>
        <p className="file-drop-overlay-title">{title}</p>
        {hint && <p className="file-drop-overlay-hint">{hint}</p>}
      </div>
    </div>
  </div>;
}
