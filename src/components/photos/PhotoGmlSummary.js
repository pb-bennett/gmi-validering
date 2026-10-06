'use client';

const errors = {
  'invalid-xml': 'GML-filen er ikke gyldig XML.',
  'unsupported-gml-profile': 'Filen må inneholde Skråfoto i Terrain-formatet fra 2019.',
  'gml-too-large': 'GML-filen er for stor (maks. 10 MiB).',
  'gml-doctype-not-supported': 'GML med dokumenttype eller eksterne entiteter støttes ikke.',
  'multiple-gml-files': 'Velg én GML-fil med bildeposisjoner om gangen.',
};

export default function PhotoGmlSummary({ source, ledger, state = 'ready', errorCode, onDiscardError }) {
  if (!source && state === 'empty') return null;
  return (
    <section className="mt-1 text-xs" aria-label="GML-posisjoner">
      {state === 'pending' && <p role="status">Leser GML-posisjoner …</p>}
      {state === 'error' && <div role="alert" className="text-red-700">
        <p>{errors[errorCode] || 'GML-posisjonene kunne ikke leses.'} {source ? 'Forrige GML-fil er beholdt.' : ''}</p>
        <button type="button" className="gmi-compact-button gmi-focus-ring underline" onClick={onDiscardError}>{source ? 'Fortsett med forrige GML' : 'Fortsett uten GML'}</button>
      </div>}
      {source && ledger && <>
        <p className="font-medium">GML: {ledger.summary.matchedCount} treff · {ledger.summary.unmatchedCount} uten bilde · {ledger.summary.ambiguousCount} tvetydige · {ledger.summary.viablePlacementCount} brukbare posisjoner</p>
        <details className="photo-gml-details">
          <summary className="cursor-pointer">Kildefil og detaljer</summary>
          <p className="break-all">{source.filename}</p>
          {source.issues.includes('terrain-envelope-fallback') && <p>Eldre Terrain GML: koordinatsystem fra samlingens avgrensning. Høyde og retning beholdes som kildedata.</p>}
          <p>{ledger.unmatchedPhotoIds.length} bilder uten entydig GML-treff. {ledger.summary.invalidCount} GML-punkter uten brukbar geometri eller CRS.</p>
          <ul className="list-inside list-disc break-all">
            {ledger.matches.filter((match) => match.status !== 'matched').map((match) => <li key={match.entryId}>{source.entries.find((entry) => entry.id === match.entryId)?.raw.fotolink || 'Mangler bildereferanse'}: {match.status === 'ambiguous' ? 'Tvetydig referanse' : 'Ingen treff'} ({match.reason})</li>)}
            {source.entries.filter((entry) => entry.status !== 'viable').map((entry) => <li key={`invalid-${entry.id}`}>{entry.raw.fotolink || entry.id}: {entry.errorCode}</li>)}
          </ul>
        </details>
      </>}
    </section>
  );
}
