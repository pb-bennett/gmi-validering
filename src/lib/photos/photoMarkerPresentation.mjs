import { normalizePhotoDirection } from './photoDirection.mjs';

const cameraGlyph = (size, selected) => `<svg class="photo-camera-glyph" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" stroke-linejoin="round"><path d="M3 7h4l2-3h6l2 3h4v13H3z" fill="${selected ? 'currentColor' : '#ffffffcc'}" stroke="white" stroke-width="4"/><path d="M3 7h4l2-3h6l2 3h4v13H3z" fill="${selected ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="${selected ? 'white' : 'currentColor'}" stroke-width="2"/></svg>`;

export function cameraMarkerOptions({ selected = false, degrees = null, proposed = false } = {}) {
  const heading = selected ? normalizePhotoDirection(degrees) : null;
  // Rotate inside the SVG around its geographic anchor. Leaflet owns the outer transform.
  const indicator = heading === null ? '' : `<svg class="photo-direction-indicator" aria-hidden="true" width="64" height="64" viewBox="0 0 64 64" data-degrees="${heading}" data-proposed="${proposed}"><g transform="rotate(${heading} 32 32)"><path d="M32 18V3m-5 6 5-6 5 6" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 18V3m-5 6 5-6 5 6" fill="none" stroke="${proposed ? '#a34c00' : '#075e9a'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
  return { className: `photo-camera-marker${selected ? ' photo-camera-marker-selected' : ''}`,
    iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -9], html: indicator + cameraGlyph(selected ? 22 : 16, selected) };
}

export const proposalMarkerOptions = {
  className: 'photo-proposed-marker', iconSize: [32, 32], iconAnchor: [16, 16],
  html: '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24"><path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="white" stroke-width="5"/><circle cx="12" cy="12" r="6" fill="#fff4df" stroke="white" stroke-width="5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="#a34c00" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="#fff4df" stroke="#a34c00" stroke-width="2"/></svg>',
};
