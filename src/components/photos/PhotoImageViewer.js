'use client';

/* eslint-disable @next/next/no-img-element -- Local Blob URLs must render without server image optimization. */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CaretLeftIcon, CaretRightIcon, CornersInIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, StackIcon } from '@phosphor-icons/react';
import { clampPhotoPan, photoImageFit, zoomPhotoView } from '@/lib/photos/photoImageView.mjs';
import PhotoIconButton from './PhotoIconButton';
import './photoImageViewer.css';

const initialView = { mode: 'fit', scale: 1, x: 0, y: 0 };
const ActualSizeGlyph = ({ size = 16 }) => <span aria-hidden="true" className="photo-image-viewer-glyph" style={{ fontSize: Math.round(size * 0.72) }}>1:1</span>;
const typingTarget = (target) => target?.closest?.('input, textarea, select, [contenteditable="true"]');

// Either `src` (a URL the caller owns and revokes, e.g. the import preview) or `file` (the viewer creates
// exactly one object URL for the shown file and revokes it when the photo changes or the viewer closes).
// `photoKey` identifies the shown photo: a change resets zoom/pan to fit and never keeps the old transform.
// `navigation` (layer-wide unique assets) and `sameLocation` (co-located assets) are optional and distinct.
export default function PhotoImageViewer({ src = null, file = null, photoKey = null, filename, dimensions, onClose, navigation = null, sameLocation = null }) {
  const dialogRef = useRef(null), viewportRef = useRef(null), dragRef = useRef(null), imageRef = useRef(null);
  const galleryId = useId(), helpId = useId();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [view, setView] = useState(initialView);
  const [shownKey, setShownKey] = useState(photoKey);
  const [failedKey, setFailedKey] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // A different photo starts at "fit"; the previous image's zoom and pan are never carried over.
  if (shownKey !== photoKey) { setShownKey(photoKey); setView(initialView); }
  const usable = Boolean(dimensions?.width && dimensions?.height) && (Boolean(src) || Boolean(file)) && failedKey !== photoKey;
  const imageWidth = usable ? dimensions.width : 1, imageHeight = usable ? dimensions.height : 1;
  const image = useMemo(() => ({ width: imageWidth, height: imageHeight }), [imageWidth, imageHeight]);
  const fit = photoImageFit(image, viewport);
  const scale = view.mode === 'fit' ? fit : Math.max(fit, view.scale);
  const pan = clampPhotoPan(view.mode === 'fit' ? { x: 0, y: 0 } : view, scale, image, viewport);
  const galleryItems = sameLocation?.items || [];
  const galleryAvailable = galleryItems.length > 1;

  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    dialog.showModal();
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(viewportRef.current);
    return () => { observer.disconnect(); dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);

  // One full-resolution URL at a time, only for the photo actually shown.
  useEffect(() => {
    const element = imageRef.current;
    if (!file || !element) return undefined;
    const url = URL.createObjectURL(file);
    element.src = url;
    return () => { element.removeAttribute('src'); URL.revokeObjectURL(url); };
  }, [file, photoKey]);

  useEffect(() => {
    const element = viewportRef.current;
    const wheel = (event) => {
      event.preventDefault();
      if (!usable) return;
      const box = element.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1);
      const factor = Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.005);
      setView((previous) => {
        const currentScale = previous.mode === 'fit' ? photoImageFit(image, viewport) : Math.max(fit, previous.scale);
        const currentPan = clampPhotoPan(previous.mode === 'fit' ? { x: 0, y: 0 } : previous, currentScale, image, viewport);
        return zoomPhotoView({ ...currentPan, scale: currentScale }, currentScale * factor,
          { x: event.clientX - box.left - box.width / 2, y: event.clientY - box.top - box.height / 2 }, image, viewport);
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [image, viewport, fit, usable]);

  const zoom = (next) => setView(zoomPhotoView({ scale, ...pan }, next, { x: 0, y: 0 }, image, viewport));
  const canPan = usable && (image.width * scale > viewport.width || image.height * scale > viewport.height);
  // Left/Right navigate the whole layer, but never while typing, inside the same-location gallery
  // (where arrows move between thumbnails) or with modifier keys.
  const onKeyDown = (event) => {
    if (!navigation || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || typingTarget(event.target)) return;
    if (event.target.closest?.('.photo-image-viewer-gallery')) return;
    if (event.key === 'ArrowLeft' && navigation.previous) { event.preventDefault(); navigation.onPrevious(); }
    if (event.key === 'ArrowRight' && navigation.next) { event.preventDefault(); navigation.onNext(); }
  };
  const galleryKeyDown = (event) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
    const index = buttons.indexOf(document.activeElement);
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: buttons.length - 1 }[event.key];
    if (target === undefined || index < 0) return;
    event.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, target))]?.focus();
  };

  return <dialog ref={dialogRef} className="photo-image-viewer" aria-labelledby="photo-image-viewer-title" data-photo-key={photoKey || undefined}
    onKeyDown={onKeyDown} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header>
      <h2 id="photo-image-viewer-title" title={filename}>{filename}</h2>
      {navigation && <p className="photo-image-viewer-position" aria-live="polite">{navigation.index + 1} av {navigation.total} {navigation.total === 1 ? 'bilde' : 'bilder'}</p>}
      <button type="button" className="gmi-compact-button gmi-focus-ring photo-image-viewer-close" onClick={onClose} autoFocus aria-label="Lukk bildevisning">Lukk</button>
    </header>
    <div className="photo-image-viewer-controls" role="toolbar" aria-label="Bildezoom">
      <PhotoIconButton icon={MagnifyingGlassMinusIcon} size={18} label="Zoom ut" tooltip={scale <= fit ? 'Zoom ut – bildet er tilpasset skjermen' : 'Zoom ut'}
        unavailable={!usable || scale <= fit} onClick={() => zoom(scale / 1.4)} />
      <output aria-live="polite" aria-label="Zoomnivå">{Math.round(scale * 100)} %</output>
      <PhotoIconButton icon={MagnifyingGlassPlusIcon} size={18} label="Zoom inn" tooltip={scale >= 8 ? 'Zoom inn – største zoom er nådd' : 'Zoom inn'}
        unavailable={!usable || scale >= 8} onClick={() => zoom(scale * 1.4)} />
      <span className="photo-image-viewer-separator" aria-hidden="true" />
      <PhotoIconButton icon={CornersInIcon} size={18} label="Tilpass skjermen" unavailable={!usable} onClick={() => setView(initialView)} />
      <PhotoIconButton icon={ActualSizeGlyph} size={18} label="Faktisk størrelse (100 %)" unavailable={!usable} onClick={() => zoom(1)} />
      {sameLocation && <>
        <span className="photo-image-viewer-separator" aria-hidden="true" />
        <PhotoIconButton icon={StackIcon} size={18} pressed={galleryAvailable ? galleryOpen : undefined} expanded={galleryAvailable ? galleryOpen : undefined}
          controls={galleryOpen ? galleryId : undefined} unavailable={!galleryAvailable}
          label={`Bilder på samme sted (${galleryItems.length})`}
          tooltip={galleryAvailable ? 'Bilder på samme sted' : 'Bilder på samme sted – ingen andre bilder har denne plasseringen'}
          className="photo-image-viewer-stack" onClick={() => setGalleryOpen((value) => !value)}>
          {galleryAvailable && <span className="photo-image-viewer-count" aria-hidden="true">{galleryItems.length}</span>}
        </PhotoIconButton>
      </>}
    </div>
    <div className="photo-image-viewer-stage">
      <div ref={viewportRef} className={`photo-image-viewer-viewport${canPan ? ' photo-image-viewer-pannable' : ''}`} aria-describedby={helpId}
        onPointerDown={(event) => {
          if (!canPan || event.button !== 0) return;
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ...pan };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          setView({ mode: 'zoom', scale, ...clampPhotoPan({ x: drag.x + event.clientX - drag.startX,
            y: drag.y + event.clientY - drag.startY }, scale, image, viewport) });
        }}
        onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}
        onLostPointerCapture={() => { dragRef.current = null; }}>
        <span id={helpId} className="sr-only">Rull for å zoome. Dra for å flytte bildet når det er forstørret.</span>
        {usable ? <img key={photoKey || 'image'} ref={imageRef} src={file ? undefined : src} alt={filename} draggable={false} decoding="async"
          width={dimensions.width} height={dimensions.height} onError={() => setFailedKey(photoKey)}
          style={{ width: dimensions.width, height: dimensions.height,
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale})` }} />
          : <p className="photo-image-viewer-unavailable" role="status">Bildet kan ikke vises.</p>}
      </div>
      {navigation && <>
        <PhotoIconButton icon={CaretLeftIcon} size={26} label="Forrige bilde" tooltip={navigation.previous ? 'Forrige bilde' : 'Forrige bilde – dette er det første bildet'}
          unavailable={!navigation.previous} keyshortcuts="ArrowLeft" className="photo-image-viewer-nav photo-image-viewer-previous" onClick={() => navigation.onPrevious()} />
        <PhotoIconButton icon={CaretRightIcon} size={26} label="Neste bilde" tooltip={navigation.next ? 'Neste bilde' : 'Neste bilde – dette er det siste bildet'}
          unavailable={!navigation.next} keyshortcuts="ArrowRight" className="photo-image-viewer-nav photo-image-viewer-next" onClick={() => navigation.onNext()} />
      </>}
    </div>
    {sameLocation && galleryOpen && galleryAvailable && <section id={galleryId} className="photo-image-viewer-gallery" aria-label="Bilder på samme sted">
      <p>{galleryItems.length} bilder på samme sted</p>
      <div role="group" aria-label="Velg bilde på samme sted" onKeyDown={galleryKeyDown}>
        {galleryItems.map((item) => <button key={item.id} type="button" aria-pressed={item.current} data-photo-id={item.id}
          aria-label={`${item.filename}${item.current ? ' (vises)' : ''}`} title={item.filename}
          className={`photo-image-viewer-thumb gmi-focus-ring${item.current ? ' photo-image-viewer-thumb-current' : ''}`} onClick={() => sameLocation.onSelect(item.id)}>
          {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" decoding="async" loading="lazy" draggable={false} /> : <span aria-hidden="true">Bilde</span>}
          <span className="photo-image-viewer-thumb-name">{item.filename}</span>
        </button>)}
      </div>
    </section>}
  </dialog>;
}
