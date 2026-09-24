'use client';

import { useEffect, useRef } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { ValidationV2FieldDetailContent } from './ValidationV2FieldDetailContent';
import { VALIDATION_V2_FIELD_MODAL_MAX_WIDTH } from './fieldDetailLayout';

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
  activeTab = 'result',
  onTabChange,
  onOpenObjects,
  onClose,
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);

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
    <div className="fixed inset-0 z-[10003] flex items-center justify-center bg-gmi-ink/40 p-3 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="validation-v2-field-info-title"
        className="gmi-elevated-surface flex h-[calc(100vh-1.5rem)] max-h-[720px] w-full flex-col overflow-hidden rounded-2xl shadow-xl sm:h-[min(720px,calc(100vh-3rem))]"
        style={{ maxWidth: VALIDATION_V2_FIELD_MODAL_MAX_WIDTH }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-gmi-border bg-gmi-surface px-3 py-2.5">
          <div className="min-w-0">
            <h2 id="validation-v2-field-info-title" className="truncate text-sm font-bold text-gmi-navy">{field.displayName}</h2>
            <p className="mt-0.5 text-[11px] text-gmi-text-subtle">Feltinformasjon for valgt geometri</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Lukk feltinformasjon"
            onClick={onClose}
            className="gmi-compact-button inline-flex h-8 w-8 flex-none items-center justify-center text-gmi-text-muted hover:text-gmi-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-gmi-interactive"
          >
            <XIcon aria-hidden="true" size={16} weight="regular" />
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
          onTabChange={onTabChange}
          onOpenObjects={onOpenObjects}
        />
      </div>
    </div>
  );
}
