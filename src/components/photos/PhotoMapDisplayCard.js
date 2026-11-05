'use client';

import { CameraIcon, ImageSquareIcon } from '@phosphor-icons/react';
import { PHOTO_POSITION_SOURCES, PHOTO_THUMBNAIL_MIN_ZOOM, photoCameraGlyph, photoLegendArrow, photoThumbnailsVisible } from '@/lib/photos/photoMarkerPresentation.mjs';

const MODES = [['markers', 'Markører', CameraIcon], ['thumbnails', 'Miniatyrer', ImageSquareIcon]];

// The shared Markører/Miniatyrer radiogroup: the FOTO workspace card and the main map legend both use it,
// with one persisted preference (usePhotoMapDisplayPreference).
export function PhotoMapDisplayModes({ mode, onModeChange, zoom }) {
  const thumbnailsHidden = mode === 'thumbnails' && !photoThumbnailsVisible(mode, zoom);
  const choose = (next) => { if (next !== mode) onModeChange?.(next); };
  return <>
    <div role="radiogroup" aria-label="Visning av bilder" className="photo-map-display-modes" onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const next = mode === 'markers' ? 'thumbnails' : 'markers';
      choose(next);
      event.currentTarget.querySelector(`[data-mode="${next}"]`)?.focus();
    }}>
      {MODES.map(([key, label, Icon]) => <button key={key} type="button" role="radio" data-mode={key} aria-checked={mode === key}
        tabIndex={mode === key ? 0 : -1} className={`gmi-compact-button gmi-focus-ring${mode === key ? ' gmi-selected-control' : ''}`} onClick={() => choose(key)}>
        <Icon size={14} weight="regular" aria-hidden="true" /><span>{label}</span>
      </button>)}
    </div>
    {thumbnailsHidden && <p className="photo-map-display-note" role="status">Miniatyrer vises fra zoom {PHOTO_THUMBNAIL_MIN_ZOOM}</p>}
  </>;
}

// Map-local display control and legend for the workspace FOTO layer.
export default function PhotoMapDisplayCard({ mode, onModeChange, zoom, editing = false }) {
  return (
    <section aria-label="Bilder på kartet" className="photo-map-display-card gmi-elevated-surface absolute bottom-20 right-4 z-1000 rounded-lg px-3 py-2 text-gmi-text">
      <h2 className="mb-1.5 text-xs font-semibold">Bilder på kartet</h2>
      <PhotoMapDisplayModes mode={mode} onModeChange={onModeChange} zoom={zoom} />
      <ul className="photo-map-display-legend">
        {PHOTO_POSITION_SOURCES.map(({ kind, label, color }) => (
          <li key={kind} data-legend-source={kind}>
            {photoThumbnailsVisible(mode, zoom)
              ? <span className="photo-map-display-swatch"><span className="photo-source-dot" style={{ '--photo-source': color }} /></span>
              : <span className="photo-map-display-swatch" dangerouslySetInnerHTML={{ __html: photoCameraGlyph({ sourceKind: kind, size: 16 }) }} />}
            <span>{label}</span>
          </li>
        ))}
        <li data-legend="direction"><span className="photo-map-display-swatch" dangerouslySetInnerHTML={{ __html: photoLegendArrow() }} /><span>Retning</span></li>
        <li data-legend="selected"><span className="photo-map-display-swatch" dangerouslySetInnerHTML={{ __html: photoCameraGlyph({ sourceKind: 'unknown', size: 14, selected: true }) }} /><span>Valgt</span></li>
        <li data-legend="sibling"><span className="photo-map-display-swatch" dangerouslySetInnerHTML={{ __html: photoCameraGlyph({ sourceKind: 'unknown', size: 14, sibling: true }) }} /><span>Samme bilde</span></li>
        {editing && <li data-legend="staged"><span className="photo-map-display-swatch" dangerouslySetInnerHTML={{ __html: photoLegendArrow({ staged: true }) }} /><span>Endret</span></li>}
      </ul>
    </section>
  );
}
