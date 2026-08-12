'use client';

export default function DetailedStatsSection({ distributions = null }) {
  // Slice 3 will provide fixed one-dimensional distributions here.
  void distributions;

  return (
    <section
      className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"
      aria-labelledby="detailed-statistics-heading"
      data-detailed-statistics-state="inactive"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h16" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l3-4 3 2 5-7" />
          </svg>
        </div>
        <div>
          <h3
            id="detailed-statistics-heading"
            className="text-sm font-semibold text-slate-800"
          >
            Detaljert statistikk
          </h3>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Detaljert statistikk er ikke aktivert ennå.
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Ingen filer, filnavn, nøyaktige koordinater eller personopplysninger
            lagres i den detaljerte statistikken.
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Detaljene vil vises som uavhengige, aggregerte fordelinger og kan
            ikke kobles til enkeltopplastinger eller unike brukere.
          </p>
        </div>
      </div>
    </section>
  );
}
