export default function Home() {
  // Onboarding card (Norwegian copy)
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)] bg-page-bg">
      <main className="mx-auto w-full max-w-xl px-6 py-12">
        <section
          className="rounded-md bg-card p-8 shadow-sm text-center"
          role="region"
          aria-label="Last opp GMI"
        >
          <h2 className="text-2xl font-serif font-bold text-text mb-2">
            Last opp en GMI-fil
          </h2>
          <p className="text-text/80 mb-6">
            Dra og slipp en{' '}
            <code className="bg-white/10 px-1 rounded">.gmi</code>-fil
            her, eller klikk for å velge en fil.
          </p>

          <label className="inline-flex items-center gap-3 rounded px-4 py-2 bg-primary text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/60">
            Velg fil
            <input type="file" accept=".gmi" className="hidden" />
          </label>

          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-text/80">
              Om denne appen
            </summary>
            <div className="mt-2 text-text/80">
              Denne applikasjonen sjekker at GMI-filer inneholder
              nødvendige felter og at verdier følger forventet format.
              Den flagger manglende eller ugyldige verdier før import
              til VA-databaser.
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
