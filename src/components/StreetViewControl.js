'use client';

import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { ArrowSquareOutIcon, PersonSimpleWalkIcon, XIcon } from '@phosphor-icons/react';
import { openStreetView, streetViewUrl } from '@/lib/map/streetView.mjs';
import PhotoIconButton from './photos/PhotoIconButton';

const DRAG_THRESHOLD = 4;
const PICK_HINT = 'Klikk i kartet for å åpne Google Street View der, eller bruk kartets midtpunkt.';

// Batch F: drag the walking figure onto the map, or press it and then click the map (or use the map centre), to open
// Google Street View at that point in a new tab. It never selects, edits or places anything on the map, and nothing
// is sent anywhere before that explicit action.
export default function StreetViewControl() {
  const map = useMap();
  const wrapperRef = useRef(null), midpointRef = useRef(null);
  const drag = useRef(null), suppressClick = useRef(false);
  const [picking, setPicking] = useState(false);
  const [ghost, setGhost] = useState(null);
  const [notice, setNotice] = useState(null);

  // Clicks, wheel and pointer gestures on the control stay out of Leaflet: no map click, selection or pan from here.
  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
  }, []);

  const open = (latlng) => {
    const url = latlng ? streetViewUrl(latlng.wrap ? latlng.wrap() : latlng) : null;
    if (!url) { setNotice({ text: 'Stedet kan ikke brukes. Velg et annet sted i kartet.' }); return; }
    if (openStreetView(url)) setNotice(null);
    else setNotice({ text: 'Nettleseren blokkerte den nye fanen.', url });
  };

  // Pick mode: the next plain click on the map opens Street View there and is consumed before Leaflet sees it.
  useEffect(() => {
    if (!picking) return undefined;
    const container = map.getContainer();
    let down = null;
    const pointerDown = (event) => { down = { x: event.clientX, y: event.clientY }; };
    const click = (event) => {
      // Everything drawn on the map (tiles, survey features, photo markers, arrows) is consumed, so nothing is selected
      // or placed. Controls outside the map panes and open popups keep working while a point is being picked.
      const onMap = event.target === container || (event.target.closest?.('.leaflet-map-pane') && !event.target.closest('.leaflet-popup'));
      if (!onMap || wrapperRef.current?.contains(event.target)) return;
      // A pan ends in a click on the same element; only a click without movement picks a point.
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > DRAG_THRESHOLD) return;
      event.stopPropagation(); event.preventDefault();
      setPicking(false);
      open(map.mouseEventToLatLng(event));
    };
    const escape = (event) => {
      // Captured first, so another Escape handler (tooltip, workspace) cannot leave pick mode on.
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      event.preventDefault(); setPicking(false);
    };
    container.addEventListener('pointerdown', pointerDown, true);
    // FOTO placement also captures clicks on the map container. Intercept the pick before it reaches that container.
    document.addEventListener('click', click, true);
    window.addEventListener('keydown', escape, true);
    container.classList.add('gmi-street-view-picking');
    return () => {
      container.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('click', click, true);
      window.removeEventListener('keydown', escape, true);
      container.classList.remove('gmi-street-view-picking');
    };
  }, [picking, map]);

  // Drag: the pointer is captured by the button, so the map never receives the gesture. Escape cancels.
  const endDrag = () => {
    drag.current = null; setGhost(null);
    map.getContainer().classList.remove('gmi-street-view-dragging');
  };
  useEffect(() => {
    if (!ghost) return undefined;
    const escape = (event) => { if (event.key === 'Escape') { event.preventDefault(); suppressClick.current = true; endDrag(); } };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- endDrag only touches refs, state setters and the fixed map.
  }, [ghost !== null]);
  const handlers = {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      suppressClick.current = false;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event) => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) <= DRAG_THRESHOLD) return;
      if (!current.moved) { current.moved = true; setPicking(false); setNotice(null); map.getContainer().classList.add('gmi-street-view-dragging'); }
      setGhost({ x: event.clientX, y: event.clientY });
    },
    onPointerUp: (event) => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      if (!current.moved) { drag.current = null; return; }
      suppressClick.current = true;
      endDrag();
      const rect = map.getContainer().getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
        && !wrapperRef.current?.contains(document.elementFromPoint(event.clientX, event.clientY));
      if (!inside) { setNotice({ text: 'Slipp symbolet på kartet for å åpne Street View der.' }); return; }
      open(map.containerPointToLatLng([event.clientX - rect.left, event.clientY - rect.top]));
    },
    onPointerCancel: () => { if (drag.current) { suppressClick.current = drag.current.moved; endDrag(); } },
    onLostPointerCapture: () => { if (drag.current?.moved) { suppressClick.current = true; endDrag(); } },
  };
  const toggle = (event) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    const next = !picking;
    setPicking(next); setNotice(null);
    // From the keyboard, focus goes to the alternative that needs no pointer.
    if (next && event.detail === 0) requestAnimationFrame(() => midpointRef.current?.focus());
  };

  return <div ref={wrapperRef} className="gmi-street-view" data-street-view={picking ? 'picking' : ghost ? 'dragging' : 'idle'}>
    <PhotoIconButton icon={PersonSimpleWalkIcon} size={18} label="Google Street View" pressed={picking}
      tooltip={picking ? 'Avbryt Street View' : 'Street View: dra symbolet til kartet, eller trykk og klikk i kartet'}
      className="gmi-map-toolbar-icon-button gmi-elevated-surface gmi-street-view-button" onClick={toggle} {...handlers} />
    {picking && <div className="gmi-street-view-panel gmi-elevated-surface" role="group" aria-label="Street View">
      <p>{PICK_HINT}</p>
      <div className="gmi-street-view-actions">
        <button ref={midpointRef} type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => { setPicking(false); open(map.getCenter()); }}>Bruk kartets midtpunkt</button>
        <PhotoIconButton icon={XIcon} size={16} label="Avbryt Street View" onClick={() => setPicking(false)} className="gmi-street-view-close" />
      </div>
    </div>}
    {notice && !picking && <div className="gmi-street-view-panel gmi-elevated-surface" role="status" data-street-view-notice>
      <p>{notice.text}</p>
      <div className="gmi-street-view-actions">
        {notice.url && <a className="gmi-compact-button gmi-focus-ring" href={notice.url} target="_blank" rel="noopener noreferrer" onClick={() => setNotice(null)}>
          <ArrowSquareOutIcon size={16} weight="regular" aria-hidden="true" />Åpne Street View</a>}
        <PhotoIconButton icon={XIcon} size={16} label="Lukk Street View-melding" onClick={() => setNotice(null)} className="gmi-street-view-close" />
      </div>
    </div>}
    {ghost && <span className="gmi-street-view-ghost" aria-hidden="true" style={{ left: ghost.x, top: ghost.y }}>
      <PersonSimpleWalkIcon size={24} weight="regular" />
    </span>}
  </div>;
}
