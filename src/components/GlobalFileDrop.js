'use client';

import { useEffect, useState } from 'react';
import { ProhibitIcon } from '@phosphor-icons/react';
import { useFileLoader } from '@/components/FileUpload';
import FileDropOverlay from '@/components/FileDropOverlay';
import useFileDragTracker from '@/components/useFileDragTracker';
import { hasFileDrag, surveyFileDragAccepted, surveyFileDropAccepted } from '@/lib/fileDragState.mjs';

// The app's only window-level file drop. While disabled (FOTO workspace, import wizard, parsing) there is no
// drop region: file drags stay refused here, so a stray drop cannot navigate away from the in-memory session.
export default function GlobalFileDrop({ enabled = true }) {
  const { handleFile } = useFileLoader();
  const { active, tracker } = useFileDragTracker();
  const [accepted, setAccepted] = useState(true);

  useEffect(() => {
    const onDragEnter = (e) => {
      if (!hasFileDrag(e)) return;
      e.preventDefault();
      if (!enabled) return;
      setAccepted(surveyFileDragAccepted(e.dataTransfer));
      tracker.enter();
    };

    const onDragOver = (e) => {
      if (!hasFileDrag(e)) return;
      e.preventDefault();
      if (!enabled) { e.dataTransfer.dropEffect = 'none'; return; }
      // A drag can resume without a new dragenter, so this keeps the message current too.
      const fileAccepted = surveyFileDragAccepted(e.dataTransfer);
      e.dataTransfer.dropEffect = fileAccepted ? 'copy' : 'none';
      setAccepted(fileAccepted);
      tracker.over();
    };

    const onDragLeave = (e) => {
      if (!hasFileDrag(e)) return;
      e.preventDefault();
      if (enabled) tracker.leave();
    };

    const onDrop = (e) => {
      if (!hasFileDrag(e)) return;
      // The overlay lets drops reach the page, so a FileUpload zone may already have handled this one.
      const handled = e.defaultPrevented;
      e.preventDefault();
      tracker.reset();
      if (!enabled || handled || !surveyFileDropAccepted(e.dataTransfer)) return;

      const file = e.dataTransfer?.files?.[0];
      if (file) {
        handleFile(file);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      tracker.reset();
    };
  }, [enabled, handleFile, tracker]);

  if (!enabled || !active) return null;

  return accepted
    ? <FileDropOverlay title="Slipp filer her for å importere" hint="Støtter .gmi, .sos/.sosi og .kof, én fil om gangen" />
    : <FileDropOverlay refused icon={ProhibitIcon} title="Denne filtypen kan ikke importeres her" hint="Støtter .gmi, .sos/.sosi og .kof. Bilder legges til med bildeimporten." />;
}
