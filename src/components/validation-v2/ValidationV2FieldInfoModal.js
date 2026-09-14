'use client';

import { useEffect, useRef, useState } from 'react';
import { ValidationV2FieldDetailContent } from './ValidationV2FieldDetailContent';

function getFocusableElements(container) {
  return [...container.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.offsetParent !== null);
}

export default function ValidationV2FieldInfoModal({
  isOpen,
  field,
  rule,
  rules,
  geometryScope,
  layerId,
  dataset,
  result,
  onClose,
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [activeTab, setActiveTab] = useState('result');

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    closeButtonRef.current?.focus();
    const dialog = dialogRef.current;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener('keydown', handleKeyDown);
    return () => dialog?.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen || !field || !rule) return null;

  return (
    <div className="fixed inset-0 z-[10003] flex items-center justify-center bg-black/40 p-3" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="validation-v2-field-info-title"
        className="flex h-[calc(100vh-1.5rem)] max-h-[720px] w-full max-w-[44rem] flex-col overflow-hidden rounded-lg bg-white shadow-xl sm:h-[min(720px,calc(100vh-3rem))]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-3 py-2.5">
          <div>
            <h2 id="validation-v2-field-info-title" className="text-sm font-bold text-gray-900">{field.displayName}</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">Feltinformasjon for valgt geometri</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Lukk feltinformasjon"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="m5.5 5.5 9 9-1 1-9-9 1-1Zm8 0 1 1-9 9-1-1 9-9Z" /></svg>
          </button>
        </header>
        <ValidationV2FieldDetailContent
          field={field}
          rule={rule}
          rules={rules}
          geometryScope={geometryScope}
          layerId={layerId}
          dataset={dataset}
          result={result}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    </div>
  );
}
