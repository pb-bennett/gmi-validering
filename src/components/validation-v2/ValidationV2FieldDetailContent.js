'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { getValidationV2FieldDataSummary } from '@/lib/validation-v2/fieldData';
import { buildValidationV2FieldDataPresentation } from '@/lib/validation-v2/fieldDataPresentation';
import { getNobbItemHref } from '@/lib/validation-v2/nobbLink';
import { composeFieldRulePresentation } from '@/lib/validation-v2/registry/fieldInformation';
import {
  buildFieldDiagnosticsForRules,
  getValidationV2DependencyPresentation,
  getValidationV2DiagnosticPresentation,
  getValidationV2CoveragePresentation,
  renderValidationV2DiagnosticBreakdown,
  renderValidationV2ResultHeading,
  ValidationV2DiagnosticState,
} from '@/lib/validation-v2/diagnostics';

const MISSING_INFORMATION = 'Ikke dokumentert i kontrollert kildemateriale';
const TABS = Object.freeze({ RESULT: 'result', RULE: 'rule' });

function InformationRow({ label, children }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,35%)_1fr] gap-2 border-b border-gmi-border py-1.5 text-xs last:border-0">
      <dt className="text-gmi-text-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-gmi-text">{children}</dd>
    </div>
  );
}

function LegacyRulePanel({ field, rule }) {
  const allowedValues = rule.allowedValues || [];
  const isRelationshipRule = rule.evaluatorKind === 'FIELD_RELATIONSHIP';
  return (
    <div className="space-y-3">
      <dl>
        <InformationRow label="Felt">
          <span className="font-semibold">{field.displayName}</span>
        </InformationRow>
        <InformationRow label="Felt-ID">
          <code>{field.canonicalFieldId}</code>
        </InformationRow>
        <InformationRow label="Kildekolonne">
          <code>{field.directGmiSourceKey}</code>
        </InformationRow>
        <InformationRow label="Gjelder">
          {field.appliesTo.join(' og ')}
        </InformationRow>
        <InformationRow label="Krav">
          {field.requiredness === 'CONDITIONAL'
            ? 'Betinget'
            : field.required ? 'Påkrevd' : 'Ikke påkrevd'}
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
        <InformationRow label="Format">{field.documentedFormat || MISSING_INFORMATION}</InformationRow>
        <InformationRow label="Område">{field.range || MISSING_INFORMATION}</InformationRow>
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
          Godkjente verdier
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

function RuleSection({ title, children }) {
  return <section className="space-y-1.5"><h3 className="text-sm font-semibold text-gmi-navy">{title}</h3>{children}</section>;
}

function StatusGuidance({ rows }) {
  const styles = {
    Feil: 'border-red-200 bg-red-50/60 text-red-800',
    Sjekk: 'border-orange-200 bg-orange-50/60 text-orange-800',
    Pass: 'border-green-200 bg-green-50/60 text-green-800',
  };
  return <div className="space-y-1.5">{rows.map((row) => <div key={row.status} className={`rounded-lg border px-2.5 py-2 text-xs ${styles[row.status]}`}><span className="font-semibold">{row.status}</span><span className="ml-2 text-gmi-text">{row.text}</span></div>)}</div>;
}

const VALUE_COLUMN_LABELS = {
  code: 'Kode', meaning: 'Betydning', shortMeaning: 'Kort beskrivelse',
  longMeaning: 'Lang beskrivelse', tema: 'Gjelder for tema',
};

function SourceValueTable({ columns, rows, source, compactType = false }) {
  const visibleColumns = [...columns, ...(rows.some((row) => row.validator) ? ['validator'] : [])];
  const tableClass = 'min-w-full text-xs';
  const wrapperClass = compactType
    ? 'relative max-w-full overflow-x-auto overflow-y-clip rounded-lg border border-gmi-border'
    : 'max-w-full overflow-x-auto overflow-y-clip rounded-lg border border-gmi-border';
  return <><div className={wrapperClass}><table className={tableClass}><thead className={`${compactType ? 'sticky top-0 z-10 ' : ''}bg-gmi-surface-soft text-left text-[11px] text-gmi-text-subtle`}><tr>{visibleColumns.map((column) => <th key={column} className={`px-2 ${compactType ? 'py-1' : 'py-1.5'} ${compactType && column === 'tema' ? 'w-32' : ''}`}>{column === 'validator' ? 'Vurdering' : VALUE_COLUMN_LABELS[column]}</th>)}</tr></thead><tbody className="divide-y divide-gmi-border bg-gmi-surface">{rows.map((row) => <tr key={row.code}>{visibleColumns.map((column) => <td key={column} className={`px-2 ${compactType ? 'py-1' : 'py-1.5'} align-top ${column === 'code' ? 'font-mono font-semibold text-gmi-navy' : column === 'validator' ? 'font-medium text-orange-700' : 'whitespace-pre-line break-words text-gmi-text'} ${compactType && column === 'code' ? 'whitespace-nowrap' : ''}`}>{row[column] || ''}</td>)}</tr>)}</tbody></table></div>{source && <p className="mt-1 text-[11px] text-gmi-text-subtle">Kilde: {source.document}, {source.section}, side {source.page}</p>}</>;
}

function ModernRulePanel({ field, rule }) {
  const presentation = composeFieldRulePresentation({ field, rule });
  const applicability = presentation.applicabilityGuidance;
  return (
    <div className="space-y-5">
      {presentation.summary && <RuleSection title="Kort forklart"><p className="text-xs leading-5 text-gmi-text">{presentation.summary}</p></RuleSection>}
      {presentation.evaluationGuidance.length > 0 && <RuleSection title="Hvordan vurderes feltet?"><StatusGuidance rows={presentation.evaluationGuidance} /></RuleSection>}
      {applicability && <RuleSection title="Når er feltet aktuelt?"><p className="text-xs leading-5 text-gmi-text">{applicability.text}</p>{applicability.values && <div className="flex flex-wrap gap-1.5 pt-1">{applicability.values.map((value) => <code key={value} className="rounded bg-gmi-surface-soft px-1.5 py-0.5 text-[11px] text-gmi-text">{value}</code>)}</div>}</RuleSection>}
      {presentation.compatibility && <RuleSection title="Type passer til Tema"><p className="text-xs leading-5 text-gmi-text">Type vurderes mot Tema. Tabellen viser de godkjente kombinasjonene.</p><div className="max-w-full overflow-x-auto overflow-y-clip rounded-lg border border-gmi-border"><table className="min-w-full text-xs"><tbody className="divide-y divide-gmi-border bg-gmi-surface">{Object.entries(presentation.compatibility.byType).map(([type, relationship]) => <tr key={type}><td className="px-2 py-1.5 font-mono font-semibold text-gmi-navy">{type}</td><td className="px-2 py-1.5 text-gmi-text-muted">{relationship.temaValues.join(', ')}</td></tr>)}</tbody></table></div></RuleSection>}
      {presentation.allowedValues && <RuleSection title={presentation.allowedValues.heading}><SourceValueTable columns={presentation.allowedValues.columns} rows={presentation.allowedValues.rows} source={presentation.allowedValues.source} compactType={field.canonicalFieldId === 'type'} />{presentation.allowedValues.validatorCodesMatch === false && <p className="text-[11px] text-amber-800">Kildetabellen samsvarer ikke med aktive validatorverdier.</p>}{presentation.allowedValues.groups?.map((group) => <div key={group.heading} className="space-y-1.5 pt-2"><h4 className="text-xs font-semibold text-gmi-text">{group.heading}</h4><SourceValueTable columns={group.columns} rows={group.rows} source={group.source} /></div>)}</RuleSection>}
      {presentation.source && <RuleSection title="Kilde"><ul className="space-y-1 text-xs text-gmi-text-muted">{presentation.source.map((source) => <li key={`${source.title}-${source.pages}`}>{source.title}{source.pages ? `, side ${source.pages}` : ''}{source.version ? ` (${source.version})` : ''}</li>)}</ul></RuleSection>}
      {presentation.technicalDetails.length > 0 && <details className="border-t border-gmi-border pt-3"><summary className="cursor-pointer text-sm font-semibold text-gmi-text focus:outline-none focus-visible:ring-2 focus-visible:ring-gmi-interactive">Tekniske detaljer</summary><dl className="mt-2">{presentation.technicalDetails.map((detail) => <InformationRow key={detail.label} label={detail.label}>{detail.code ? <code>{detail.value}</code> : detail.value}</InformationRow>)}</dl></details>}
    </div>
  );
}

function LegacyResultPanel({ summary, isLoading, error, onRetry, result, geometryScope, ruleId }) {
  if (isLoading) return <p className="py-6 text-center text-xs text-gray-500">Laster resultat ...</p>;
  if (error) {
    return (
      <div className="space-y-2 py-4 text-xs text-red-800">
        <p>Resultatinformasjon kunne ikke hentes.</p>
        <button type="button" onClick={onRetry} className="rounded border border-red-300 px-2 py-1 font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
          Prøv igjen
        </button>
      </div>
    );
  }
  if (!summary) return <p className="py-6 text-center text-xs text-gray-500">Velg Resultat for å starte analysen.</p>;
  const sourceColumn = summary.sourceColumn || (summary.sourceColumns.length > 0
    ? `Flere: ${summary.sourceColumns.join(', ')}`
    : MISSING_INFORMATION);
  const hasRuleAcceptance = summary.rows.some((row) => row.ruleAcceptance !== null);
  const prominentText = summary.canonicalFieldId === 'note';
  const rowOutcomeCounts = summary.rows.reduce((totals, row) => {
    Object.entries(row.outcomeBreakdown || {}).forEach(([label, count]) => {
      if (label in totals) totals[label] += count;
    });
    return totals;
  }, { Feil: 0, Sjekk: 0, Pass: 0 });
  const resultCounts = result?.ruleResults?.find((ruleResult) => ruleResult.rule?.ruleId === ruleId)
    ?.geometryBreakdown?.[geometryScope];
  const outcomeCounts = resultCounts
    ? {
      Feil: resultCounts.failCount || 0,
      Sjekk: (resultCounts.checkCount || 0) + (resultCounts.indeterminateCount || 0),
      Pass: resultCounts.passCount || 0,
    }
    : rowOutcomeCounts;
  const resultSummary = outcomeCounts.Feil > 0
    ? `${outcomeCounts.Feil} av ${summary.objectCount} objekter har en verdi som gir Feil.${outcomeCounts.Sjekk > 0 ? ` ${outcomeCounts.Sjekk} objekter har en verdi som bør kontrolleres.` : ''}`
    : outcomeCounts.Sjekk > 0
      ? `${outcomeCounts.Sjekk} av ${summary.objectCount} objekter har en verdi som bør kontrolleres.${outcomeCounts.Pass > 0 ? ` ${outcomeCounts.Pass} objekter består denne kontrollen.` : ''}`
      : `Alle ${summary.objectCount} objekter består denne kontrollen.`;
  return (
    <div className="space-y-3">
      <p className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-700">{resultSummary}</p>
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
                  <td className={`${prominentText ? 'min-w-64 whitespace-pre-wrap break-words bg-amber-50' : 'max-w-32 break-all'} px-2 py-1.5 font-medium text-gray-900`}>
                    {getNobbItemHref(summary.canonicalFieldId, row.deliveredValue) ? (
                      <a className="text-blue-700 underline hover:text-blue-900" href={getNobbItemHref(summary.canonicalFieldId, row.deliveredValue)} target="_blank" rel="noreferrer">
                        {row.deliveredValue}
                      </a>
                    ) : row.deliveredValue}
                  </td>
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

function DiagnosticBlock({ diagnostic, onOpenObjects }) {
  const isFail = diagnostic.state === ValidationV2DiagnosticState.FAIL;
  const presentation = getValidationV2DiagnosticPresentation(diagnostic);
  return (
    <section className={`rounded-lg border px-2 py-1.5 ${isFail ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex items-start justify-between gap-2">
      <div className={`text-[10px] font-bold uppercase tracking-wide ${isFail ? 'text-red-700' : 'text-amber-700'}`}>
        {isFail ? 'Feil' : 'Sjekk'} · {diagnostic.count} {diagnostic.count === 1 ? 'objekt' : 'objekter'}
      </div>
      {diagnostic.hasCompleteExactObjectRefs && onOpenObjects && (
        <button
          type="button"
          onClick={() => onOpenObjects(diagnostic)}
          aria-label={`Vis ${diagnostic.exactObjectRefs.length} objekter i tabell: ${presentation.summary}`}
          className="gmi-compact-button -mt-0.5 shrink-0 border border-gmi-border-strong bg-gmi-surface px-1.5 py-0.5 text-[10px] font-semibold text-gmi-interactive shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-gmi-interactive"
        >
          Vis {diagnostic.exactObjectRefs.length} {diagnostic.exactObjectRefs.length === 1 ? 'objekt' : 'objekter'}
        </button>
      )}
      </div>
      <p className="mt-0.5 text-xs leading-4 text-gmi-text">{presentation.summary}</p>
      {presentation.detailLines.map((line) => <p key={line} className="mt-0.5 text-[11px] leading-4 text-gmi-text">{line}</p>)}
      {presentation.guidance && <p className="mt-1 text-[11px] leading-4 text-gmi-text-muted">{presentation.guidance}</p>}
      {renderValidationV2DiagnosticBreakdown(diagnostic) && (
        <p className="mt-0.5 text-[11px] font-medium text-gmi-text-muted">{renderValidationV2DiagnosticBreakdown(diagnostic)}</p>
      )}
    </section>
  );
}

function CoverageSummary({ coverage, field }) {
  const view = getValidationV2CoveragePresentation({ coverage, field });
  if (!view) return null;
  return (
    <section className="rounded-lg border border-gmi-border bg-gmi-surface-soft px-2.5 py-2" aria-label="Dekning">
      <div className="text-sm font-semibold text-gmi-navy">{view.main}</div>
      <div className="mt-0.5 text-[11px] text-gmi-text-muted">{view.secondary}</div>
    </section>
  );
}

function ContextQualifier({ qualifier, status }) {
  const [clickedOpen, setClickedOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const tooltipId = useId();
  const open = clickedOpen || hovered || focused;
  if (!qualifier) return null;
  return (
    <span className="relative mt-0.5 flex items-center gap-1 text-[10px] font-normal text-gmi-text-muted">
      <span>{qualifier.label}</span>
      <button
        type="button"
        aria-label={`Forklaring på hvorfor raden er ${status}`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setClickedOpen((value) => !value)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => event.key === 'Escape' && setClickedOpen(false)}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-gmi-border-strong text-[9px] font-bold text-gmi-text-muted hover:bg-gmi-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-gmi-interactive"
      >i</button>
      {open && <span id={tooltipId} role="tooltip" className="absolute left-0 top-full z-30 mt-1 w-72 min-w-[min(16rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] whitespace-normal break-normal [overflow-wrap:normal] hyphens-none rounded-lg bg-gmi-ink px-2.5 py-2 text-[11px] font-normal leading-4 text-gmi-text-on-dark shadow-lg">{qualifier.explanation}</span>}
    </span>
  );
}

function DiagnosticResultPanel({ summary, diagnostics, isLoading, error, onRetry, field, onOpenObjects }) {
  if (isLoading) return <p className="py-6 text-center text-xs text-gmi-text-subtle">Laster resultat ...</p>;
  if (error) {
    return (
      <div className="space-y-2 py-4 text-xs text-red-800">
        <p>Resultatinformasjon kunne ikke hentes.</p>
        <button type="button" onClick={onRetry} className="gmi-compact-button border border-red-300 px-2 py-1 font-medium text-red-800 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gmi-interactive">Prøv igjen</button>
      </div>
    );
  }
  const model = diagnostics || { diagnostics: [], unresolved: [], counts: {} };
  const objectCount = summary?.objectCount || model.counts?.pass + model.counts?.check + model.counts?.fail || 0;
  const distribution = buildValidationV2FieldDataPresentation(summary);
  const details = summary ? (
    <details className="rounded-lg border border-gmi-border bg-gmi-surface">
      <summary className="cursor-pointer px-2.5 py-2 text-xs font-semibold text-gmi-text focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gmi-interactive">Detaljer</summary>
      <div className="space-y-3 border-t border-gmi-border px-2.5 py-2">
        <dl>
          <InformationRow label="Kildekolonne"><code>{summary.sourceColumn || (summary.sourceColumns?.length ? `Flere: ${summary.sourceColumns.join(', ')}` : MISSING_INFORMATION)}</code></InformationRow>
          <InformationRow label="Objekter">{summary.objectCount}</InformationRow>
          <InformationRow label="Med verdi">{summary.withValueCount}</InformationRow>
          <InformationRow label="Mangler">{summary.missingCount}</InformationRow>
          {summary.unresolvedCount > 0 && <InformationRow label="Uavklart">{summary.unresolvedCount}</InformationRow>}
          <InformationRow label="Unike leverte verdier">{summary.uniqueValueCount}</InformationRow>
        </dl>
        {distribution?.rows.length > 0 && (
          <div className="max-h-72 overflow-auto rounded-lg border border-gmi-border" aria-label="Fordeling av leverte feltverdier">
            <table className="min-w-full divide-y divide-gmi-border text-xs">
              <thead className="sticky top-0 bg-gmi-surface-soft text-left text-[10px] uppercase tracking-wide text-gmi-text-subtle">
                <tr>
                  <th className="px-2 py-1.5">Levert verdi</th>
                  {distribution.hasMeaning && <th className="px-2 py-1.5">Betydning</th>}
                  <th className="px-2 py-1.5 text-right">Antall</th><th className="px-2 py-1.5 text-right">Andel</th><th className="px-2 py-1.5">Resultat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gmi-border bg-gmi-surface">
                {distribution.rows.map((row) => (
                  <tr key={row.key} className={row.style.row}>
                    <td className="max-w-32 break-all px-2 py-1.5 font-medium text-gmi-navy">
                      {getNobbItemHref(summary.canonicalFieldId, row.deliveredValue) ? <a className="text-gmi-interactive underline hover:text-gmi-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-gmi-interactive" href={getNobbItemHref(summary.canonicalFieldId, row.deliveredValue)} target="_blank" rel="noreferrer">{row.deliveredValue}</a> : row.deliveredValue}
                      <ContextQualifier qualifier={row.qualifier} status={row.status} />
                      {row.interpretedValue !== row.deliveredValue && !row.isMissing && !row.isUnresolved && <details className="mt-0.5 text-[10px] font-normal text-gmi-text-subtle"><summary className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gmi-interactive">Tolket verdi</summary><code className="break-all">{row.interpretedValue}</code></details>}
                    </td>
                    {distribution.hasMeaning && <td className="min-w-28 max-w-64 px-2 py-1.5 align-top text-gmi-text">
                      {row.meaning || '—'}
                      {row.longMeaning && row.longMeaning !== row.meaning && <details className="mt-0.5 text-[10px] text-gmi-text-subtle"><summary className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gmi-interactive">Mer beskrivelse</summary><p className="whitespace-pre-line pt-1">{row.longMeaning}</p></details>}
                    </td>}
                    <td className="px-2 py-1.5 text-right font-mono text-gmi-text">{row.count}</td><td className="px-2 py-1.5 text-right font-mono text-gmi-text-subtle">{row.share.toFixed(1)}%</td>
                    <td className={`px-2 py-1.5 ${row.style.text}`}>{row.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {summary.omittedRowCount > 0 && <p className="text-[11px] text-gmi-text-subtle">Viser {summary.maxVisibleRows} av {summary.uniqueValueCount} unike verdier</p>}
      </div>
    </details>
  ) : null;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gmi-navy">{renderValidationV2ResultHeading({ field, ...model })}</h3>
      <CoverageSummary coverage={model.coverage} field={field} />
      {model.diagnostics.map((diagnostic) => <DiagnosticBlock key={diagnostic.diagnosticId} diagnostic={diagnostic} onOpenObjects={onOpenObjects} />)}
      {model.unresolved.map((note) => {
        const presentation = getValidationV2DependencyPresentation(note);
        return (
          <section key={note.diagnosticId} className="rounded-lg border border-gmi-border bg-gmi-surface-soft px-2.5 py-2 text-xs leading-5 text-gmi-text-muted">
            <p>{presentation.summary}</p>
            {presentation.detailLines.map((line) => <p key={line} className="mt-1 text-[11px] leading-4">{line}</p>)}
            {presentation.guidance && <p className="mt-2 text-[11px] leading-4">{presentation.guidance}</p>}
          </section>
        );
      })}
      {!model.diagnostics.length && !model.unresolved.length && objectCount === 0 && <p className="text-xs text-gmi-text-muted">Ingen objekter i valgt geometri.</p>}
      {details}
    </div>
  );
}

export function useValidationV2FieldDetailModel({
  field,
  rule,
  rules,
  geometryScope,
  layerId,
  dataset,
  result,
}) {
  const fieldDataEnabled = rule?.fieldDataEnabled !== false;
  const [fieldDataRetry, setFieldDataRetry] = useState(0);
  const fieldDataState = useMemo(() => {
    if (!field || !rule || !fieldDataEnabled) {
      return { loading: false, summary: null, error: null };
    }
    try {
      const summary = getValidationV2FieldDataSummary({
        layerId,
        dataset,
        result,
        geometryScope,
        canonicalFieldId: field.canonicalFieldId,
        rule,
      });
      return { loading: false, summary, error: null };
    } catch {
      return { loading: false, summary: null, error: true };
    }
  }, [
    field,
    rule,
    fieldDataEnabled,
    layerId,
    dataset,
    result,
    geometryScope,
    fieldDataRetry,
  ]);
  const diagnostics = useMemo(() => buildFieldDiagnosticsForRules({
    result, rules: rules?.length ? rules : [rule], field, geometryScope, summary: fieldDataState.summary,
  }), [result, rule, rules, field, geometryScope, fieldDataState.summary]);

  const retryFieldData = () => setFieldDataRetry((retry) => retry + 1);
  return { fieldDataState, diagnostics, retryFieldData };
}

export function ValidationV2FieldDetailContent({
  field,
  rule,
  rules,
  geometryScope,
  layerId,
  dataset,
  result,
  activeTab,
  onTabChange,
  onOpenObjects,
}) {
  const tabRefs = useRef({});
  const { fieldDataState, diagnostics, retryFieldData } = useValidationV2FieldDetailModel({
    field, rule, rules, geometryScope, layerId, dataset, result,
  });

  const selectTab = (tab) => onTabChange?.(tab);

  const moveTab = (event, direction) => {
    event.preventDefault();
    const nextTab = direction === 'next' ? TABS.RULE : TABS.RESULT;
    selectTab(nextTab);
    requestAnimationFrame(() => tabRefs.current[nextTab]?.focus());
  };

  const moveTabTo = (event, tab) => {
    event.preventDefault();
    selectTab(tab);
    requestAnimationFrame(() => tabRefs.current[tab]?.focus());
  };

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gmi-surface">
    <div role="tablist" aria-label="Feltinformasjon" className="flex shrink-0 gap-1 border-b border-gmi-border bg-gmi-surface px-3">
      {[[TABS.RESULT, 'Resultat'], [TABS.RULE, 'Regel']].map(([tab, label]) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`validation-v2-field-tab-${tab}`}
          ref={(element) => { tabRefs.current[tab] = element; }}
          aria-selected={activeTab === tab}
          aria-controls={`validation-v2-field-panel-${tab}`}
          tabIndex={activeTab === tab ? 0 : -1}
          onClick={() => selectTab(tab)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') moveTab(event, 'next');
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') moveTab(event, 'previous');
            if (event.key === 'Home') moveTabTo(event, TABS.RESULT);
            if (event.key === 'End') moveTabTo(event, TABS.RULE);
          }}
          className={`gmi-compact-button min-h-9 border-b-2 px-3 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gmi-interactive disabled:cursor-not-allowed disabled:opacity-40 ${activeTab === tab ? 'gmi-selected-control border-gmi-border-strong' : 'border-transparent text-gmi-text-subtle hover:text-gmi-navy'}`}
        >{label}</button>
      ))}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto bg-gmi-surface px-3 py-3">
      <div className="mx-auto w-full max-w-2xl px-2.5">
      {activeTab === TABS.RESULT ? (
        <div id={`validation-v2-field-panel-${TABS.RESULT}`} role="tabpanel" aria-labelledby={`validation-v2-field-tab-${TABS.RESULT}`}>
          <DiagnosticResultPanel summary={fieldDataState.summary} diagnostics={diagnostics} isLoading={fieldDataState.loading} error={fieldDataState.error} onRetry={retryFieldData} field={field} onOpenObjects={onOpenObjects} />
        </div>
      ) : (
        <div id={`validation-v2-field-panel-${TABS.RULE}`} role="tabpanel" aria-labelledby={`validation-v2-field-tab-${TABS.RULE}`}>
          <ModernRulePanel field={field} rule={rule} />
        </div>
      )}
      </div>
    </div>
  </div>;
}
