'use client';

/* eslint-disable @next/next/no-img-element -- Reuses the inspector's existing original Blob URL. */
import { useEffect, useRef, useState } from 'react';
import { clampPhotoPan, photoImageFit, zoomPhotoView } from '@/lib/photos/photoImageView.mjs';
import './photoImageViewer.css';

const initialView = { mode: 'fit', scale: 1, x: 0, y: 0 };
const buttonClass = 'gmi-compact-button gmi-focus-ring';

// The inspector owns and revokes src. This viewer never creates a File/Blob URL.
export default function PhotoImageViewer({ src, filename, dimensions, onClose }) {
  const dialogRef = useRef(null), viewportRef = useRef(null), dragRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [view, setView] = useState(initialView);
  const fit = photoImageFit(dimensions, viewport);
  const scale = view.mode === 'fit' ? fit : Math.max(fit, view.scale);
  const pan = clampPhotoPan(view.mode === 'fit' ? { x: 0, y: 0 } : view, scale, dimensions, viewport);

  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    dialog.showModal();
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(viewportRef.current);
    return () => { observer.disconnect(); dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    const wheel = (event) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1);
      const factor = Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.005);
      setView((previous) => {
        const currentScale = previous.mode === 'fit' ? photoImageFit(dimensions, viewport) : Math.max(fit, previous.scale);
        const currentPan = clampPhotoPan(previous.mode === 'fit' ? { x: 0, y: 0 } : previous, currentScale, dimensions, viewport);
        return zoomPhotoView({ ...currentPan, scale: currentScale }, currentScale * factor,
          { x: event.clientX - box.left - box.width / 2, y: event.clientY - box.top - box.height / 2 }, dimensions, viewport);
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [dimensions, viewport, fit]);

  const zoom = (next) => setView(zoomPhotoView({ scale, ...pan }, next, { x: 0, y: 0 }, dimensions, viewport));
  const canPan = dimensions.width * scale > viewport.width || dimensions.height * scale > viewport.height;
  return <dialog ref={dialogRef} className="photo-image-viewer" aria-labelledby="photo-image-viewer-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2 id="photo-image-viewer-title" title={filename}>{filename}</h2>
      <button type="button" className={buttonClass} onClick={onClose} autoFocus aria-label="Lukk bildevisning">Lukk</button></header>
    <div className="photo-image-viewer-controls" aria-label="Bildezoom">
      <button type="button" className={buttonClass} aria-label="Zoom ut i bildet" disabled={scale <= fit} onClick={() => zoom(scale / 1.4)}>−</button>
      <output aria-live="polite">{Math.round(scale * 100)} %</output>
      <button type="button" className={buttonClass} aria-label="Zoom inn i bildet" disabled={scale >= 8} onClick={() => zoom(scale * 1.4)}>+</button>
      <button type="button" className={buttonClass} onClick={() => setView(initialView)}>Tilpass skjermen</button>
      <button type="button" className={buttonClass} onClick={() => zoom(1)}>100 %</button>
      <span>Rull for å zoome · dra for å flytte bildet</span>
    </div>
    <div ref={viewportRef} className={`photo-image-viewer-viewport${canPan ? ' photo-image-viewer-pannable' : ''}`}
      onPointerDown={(event) => {
        if (!canPan || event.button !== 0) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ...pan };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        setView({ mode: 'zoom', scale, ...clampPhotoPan({ x: drag.x + event.clientX - drag.startX,
          y: drag.y + event.clientY - drag.startY }, scale, dimensions, viewport) });
      }}
      onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}
      onLostPointerCapture={() => { dragRef.current = null; }}>
      <img src={src} alt={filename} draggable={false} decoding="async" width={dimensions.width} height={dimensions.height}
        style={{ width: dimensions.width, height: dimensions.height,
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale})` }} />
    </div>
  </dialog>;
}
