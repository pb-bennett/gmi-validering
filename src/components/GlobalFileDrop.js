'use client';

import { useEffect, useRef, useState } from 'react';
import { useFileLoader } from '@/components/FileUpload';

const hasFiles = (event) => {
  const types = Array.from(event?.dataTransfer?.types || []);
  return types.includes('Files');
};

export default function GlobalFileDrop({ enabled = true }) {
  const { handleFile } = useFileLoader();
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const onDragEnter = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter.current += 1;
      setIsDragging(true);
    };

    const onDragOver = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };

    const onDragLeave = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsDragging(false);
      }
    };

    const onDrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);

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
    };
  }, [enabled, handleFile]);

  if (!enabled || !isDragging) return null;

  return (
    <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-gmi-ink/40 backdrop-blur-sm">
      <div className="w-[90%] max-w-2xl rounded-xl border-2 border-dashed border-gmi-interactive bg-gmi-surface/95 p-10 text-center shadow-xl">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="w-14 h-14 text-gmi-interactive"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <div className="text-xl font-semibold text-gmi-navy">
            Slipp filen for å laste inn
          </div>
          <div className="text-sm text-gmi-text-muted">
            Støtter .gmi, .sos/.sosi og .kof
          </div>
        </div>
      </div>
    </div>
  );
}
