import { PHOTO_POSITION_SOURCES, photoCameraGlyph } from '@/lib/photos/photoMarkerPresentation.mjs';

export default function PhotoPositionLegend() {
  return (
    <section aria-label="Bildeplassering" className="photo-position-legend gmi-elevated-surface pointer-events-none absolute bottom-20 right-4 z-1000 rounded-lg px-3 py-2 text-gmi-text">
      <h2 className="mb-1 text-xs font-semibold">Bildeplassering</h2>
      <ul className="space-y-1">
        {PHOTO_POSITION_SOURCES.map(({ kind, label }) => (
          <li key={kind} className="flex items-center gap-2 text-xs">
            <span className="flex h-5 w-5 items-center justify-center" dangerouslySetInnerHTML={{ __html: photoCameraGlyph({ sourceKind: kind, size: 18 }) }} />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
