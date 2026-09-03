'use client';

import { useEffect, useRef, useState } from 'react';
import { getValidationV2FieldDataSummary } from '@/lib/validation-v2/fieldData';

const MISSING_INFORMATION = 'Ikke dokumentert i kontrollert kildemateriale';
const TABS = Object.freeze({ INSTRUCTION: 'instruction', DATA: 'data' });

function getFocusableElements(container) {
  return [...container.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.offsetParent !== null);
}

function InformationRow({ label, children }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,35%)_1fr] gap-2 border-b border-gray-100 py-1.5 text-xs last:border-0">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-gray-900">{children}</dd>
    </div>
  );
}

function InstructionPanel({ field, rule }) {
  const allowedValues = rule.allowedValues || [];
  const isRelationshipRule = rule.evaluatorKind === 'FIELD_RELATIONSHIP';
  return (
    <div className="space-y-3">
      <dl>
        <InformationRow label="Felt">
          <span className="font-semibold">{field.displayName}</span>
        </InformationRow>
        <InformationRow label="Kanonisk identitet">
          <code>{field.canonicalFieldId}</code>
        </InformationRow>
        <InformationRow label="GMI-kolonne">
          <code>{field.directGmiSourceKey}</code>
        </InformationRow>
        <InformationRow label="Gjelder">
          {field.appliesTo.join(' og ')}
        </InformationRow>
        <InformationRow label="Denne regelen">
          {field.required ? 'Påkrevd' : 'Ikke påkrevd'}
        </InformationRow>
      </dl>

      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Beskrivelse</h3>
        <p className="text-xs leading-5 text-gray-700">{field.description || MISSING_INFORMATION}</p>
      </section>

      {field.compatibility && (
        <section>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Type passer til Tema
          </h3>
          <p className="mb-1 text-xs text-gray-600">
            Eksakte kombinasjoner fra Innmålingsinstruks Vedlegg A, side {field.compatibility.sources[0]?.pages}.
          </p>
          <ul className="max-h-56 divide-y divide-gray-100 overflow-auto border-y border-gray-100 text-xs">
            {Object.entries(field.compatibility.byType).map(([type, relationship]) => (
              <li key={type} className="flex gap-2 py-1.5">
                <code className="shrink-0 font-semibold text-blue-700">{type}</code>
                <span className="text-gray-700">{relationship.temaValues.join(', ')}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-gray-500">
            Kontroller: {field.compatibility.sources[0]?.auditSourceRuleIds.join(', ')}
          </p>
        </section>
      )}

      <dl>
        <InformationRow label="Enhet">{field.units || MISSING_INFORMATION}</InformationRow>
        <InformationRow label="Dokumentert format">{field.documentedFormat || MISSING_INFORMATION}</InformationRow>
        <InformationRow label="Dokumentert område">{field.range || MISSING_INFORMATION}</InformationRow>
      </dl>

      {field.qualifications?.length > 0 && (
        <section>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Forbehold</h3>
          <ul className="space-y-1 text-xs text-gray-700">
            {field.qualifications.map((qualification, index) => (
              <li key={`${qualification.text}-${index}`}>{qualification.text}</li>
            ))}
          </ul>
        </section>
      )}

      {!isRelationshipRule && <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Verdier kontrollert av denne regelen
        </h3>
        {allowedValues.length > 0 ? (
          <ul className="divide-y divide-gray-100 border-y border-gray-100 text-xs">
            {allowedValues.map((value) => {
              const valueInfo = field.valueInfo?.[value];
              return (
                <li key={value} className="flex gap-2 py-1.5">
                  <code className="shrink-0 font-semibold text-blue-700">{value}</code>
                  <span className="text-gray-700">
                    {valueInfo?.label || MISSING_INFORMATION}
                    {valueInfo?.description && `: ${valueInfo.description}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-gray-600">Ingen tillatt verdiliste for denne regelen.</p>
        )}
      </section>}

      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Kilde</h3>
        {field.sources?.length > 0 ? (
          <ul className="space-y-1 text-xs text-gray-700">
            {field.sources.map((source) => (
              <li key={`${source.documentId}-${source.pages}`}>
                {source.title || source.documentId}, side {source.pages || MISSING_INFORMATION}
                {source.version ? ` (${source.version})` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-600">{MISSING_INFORMATION}</p>
        )}
      </section>
      <p className="border-t border-gray-100 pt-2 text-[11px] text-gray-500">
        Dokumentasjonen er informativ. Påkrevdhet og tillatte verdier kommer fra den aktive kontrollregelen.
      </p>
    </div>
  );
}

function FieldDataPanel({ summary, isLoading, error, onRetry }) {
  if (isLoading) return <p className="py-6 text-center text-xs text-gray-500">Laster fildata ...</p>;
  if (error) {
    return (
      <div className="space-y-2 py-4 text-xs text-red-800">
        <p>Fildata kunne ikke hentes.</p>
        <button type="button" onClick={onRetry} className="rounded border border-red-300 px-2 py-1 font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
          Prøv igjen
        </button>
      </div>
    );
  }
  if (!summary) return <p className="py-6 text-center text-xs text-gray-500">Velg Fildata for å starte analysen.</p>;
  const sourceColumn = summary.sourceColumn || (summary.sourceColumns.length > 0
    ? `Flere: ${summary.sourceColumns.join(', ')}`
    : MISSING_INFORMATION);
  const hasRuleAcceptance = summary.rows.some((row) => row.ruleAcceptance !== null);
  return (
    <div className="space-y-3">
      <dl>
        <InformationRow label="Kildekolonne"><code>{sourceColumn}</code></InformationRow>
        <InformationRow label="Objekter">{summary.objectCount}</InformationRow>
        <InformationRow label="Med verdi">{summary.withValueCount}</InformationRow>
        <InformationRow label="Mangler">{summary.missingCount}</InformationRow>
        {summary.unresolvedCount > 0 && <InformationRow label="Uavklart">{summary.unresolvedCount}</InformationRow>}
        <InformationRow label="Unike leverte verdier">{summary.uniqueValueCount}</InformationRow>
      </dl>
      {summary.rows.length > 0 ? (
        <div className="max-h-72 overflow-auto rounded border border-gray-200" aria-label="Fordeling av leverte feltverdier">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <caption className="sr-only">Fordeling av leverte feltverdier</caption>
            <thead className="sticky top-0 bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-2 py-1.5">Levert verdi</th>
                <th scope="col" className="px-2 py-1.5">Tolket verdi</th>
                <th scope="col" className="px-2 py-1.5 text-right">Antall</th>
                <th scope="col" className="px-2 py-1.5 text-right">Andel</th>
                {hasRuleAcceptance && <th scope="col" className="px-2 py-1.5">Regelverdi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {summary.rows.map((row) => (
                <tr key={row.key}>
                  <td className="max-w-32 break-all px-2 py-1.5 font-medium text-gray-900">{row.deliveredValue}</td>
                  <td className="max-w-24 break-all px-2 py-1.5 text-gray-500">{row.interpretedValue}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-gray-700">{row.count}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-gray-500">{row.percentage.toFixed(1)}%</td>
                  {hasRuleAcceptance && <td className="px-2 py-1.5 text-gray-700">{row.ruleAcceptance || '-'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-6 text-center text-xs text-gray-500">Ingen objekter i valgt geometri.</p>
      )}
      {summary.omittedRowCount > 0 && (
        <p className="text-[11px] text-gray-500">Viser {summary.maxVisibleRows} av {summary.uniqueValueCount} unike verdier</p>
      )}
    </div>
  );
}

export default function ValidationV2FieldInfoModal({
  isOpen,
  field,
  rule,
  geometryScope,
  layerId,
  dataset,
  result,
  onClose,
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const loadTimerRef = useRef(null);
  const tabRefs = useRef({});
  const onCloseRef = useRef(onClose);
  const [activeTab, setActiveTab] = useState(TABS.INSTRUCTION);
  const [fieldDataState, setFieldDataState] = useState({ loading: false, summary: null, error: null });
  const fieldDataEnabled = rule?.fieldDataEnabled !== false;

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

  useEffect(() => () => {
    if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current);
  }, []);

  if (!isOpen || !field || !rule) return null;

  const loadFieldData = () => {
    if (fieldDataState.loading) return;
    setFieldDataState({ loading: true, summary: null, error: null });
    loadTimerRef.current = window.setTimeout(() => {
      try {
        const summary = getValidationV2FieldDataSummary({
          layerId,
          dataset,
          result,
          geometryScope,
          canonicalFieldId: field.canonicalFieldId,
          rule,
        });
        setFieldDataState({ loading: false, summary, error: null });
      } catch {
        setFieldDataState({ loading: false, summary: null, error: true });
      }
    }, 0);
  };

  const selectTab = (tab) => {
    if (tab === TABS.DATA && !fieldDataEnabled) return;
    setActiveTab(tab);
    if (tab === TABS.DATA && !fieldDataState.summary && !fieldDataState.error) loadFieldData();
  };

  const moveTab = (event, direction) => {
    event.preventDefault();
    if (!fieldDataEnabled) return;
    const nextTab = direction === 'next' ? TABS.DATA : TABS.INSTRUCTION;
    selectTab(nextTab);
    requestAnimationFrame(() => tabRefs.current[nextTab]?.focus());
  };

  const moveTabTo = (event, tab) => {
    event.preventDefault();
    selectTab(tab);
    requestAnimationFrame(() => tabRefs.current[tab]?.focus());
  };

  return (
    <div className="fixed inset-0 z-[10003] flex items-center justify-center bg-black/40 p-3" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="validation-v2-field-info-title"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
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
        <div role="tablist" aria-label="Feltinformasjon" className="flex border-b border-gray-200 px-3">
          {[
            [TABS.INSTRUCTION, 'Instruks'],
            [TABS.DATA, 'Fildata'],
          ].map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`validation-v2-field-tab-${tab}`}
              ref={(element) => { tabRefs.current[tab] = element; }}
              aria-selected={activeTab === tab}
              aria-controls={`validation-v2-field-panel-${tab}`}
              disabled={tab === TABS.DATA && !fieldDataEnabled}
              title={tab === TABS.DATA && !fieldDataEnabled ? 'Fildata er ikke tilgjengelig for relasjonsregler' : undefined}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => selectTab(tab)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') moveTab(event, 'next');
                if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') moveTab(event, 'previous');
                if (event.key === 'Home') moveTabTo(event, TABS.INSTRUCTION);
                if (event.key === 'End') moveTabTo(event, TABS.DATA);
              }}
              className={`min-h-9 border-b-2 px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 ${activeTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {activeTab === TABS.INSTRUCTION ? (
            <div id={`validation-v2-field-panel-${TABS.INSTRUCTION}`} role="tabpanel" aria-labelledby={`validation-v2-field-tab-${TABS.INSTRUCTION}`}>
              <InstructionPanel field={field} rule={rule} />
            </div>
          ) : (
            <div id={`validation-v2-field-panel-${TABS.DATA}`} role="tabpanel" aria-labelledby={`validation-v2-field-tab-${TABS.DATA}`}>
              <FieldDataPanel
                summary={fieldDataState.summary}
                isLoading={fieldDataState.loading}
                error={fieldDataState.error}
                onRetry={loadFieldData}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
