export default function Home() {
  return (
    <div className="bg-page-bg p-8">
      <div className="max-w-xl mx-auto bg-card rounded p-6">
        <h2 className="text-text mb-4">Last opp en GMI-fil</h2>
        <p className="text-text mb-4">
          Velg en .gmi-fil for å validere.
        </p>
        <label className="inline-block bg-primary text-white px-4 py-2 rounded cursor-pointer">
          Velg fil
          <input type="file" accept=".gmi" className="hidden" />
        </label>
      </div>
    </div>
  );
}
