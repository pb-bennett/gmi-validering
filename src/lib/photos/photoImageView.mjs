export function photoImageFit(image, viewport) {
  if (!image?.width || !image?.height || !viewport.width || !viewport.height) return 1;
  return Math.min(1, Math.max(1, viewport.width - 24) / image.width, Math.max(1, viewport.height - 24) / image.height);
}

export function clampPhotoPan(pan, scale, image, viewport) {
  const x = Math.max(0, (image.width * scale - viewport.width) / 2);
  const y = Math.max(0, (image.height * scale - viewport.height) / 2);
  return { x: Math.max(-x, Math.min(x, pan.x)), y: Math.max(-y, Math.min(y, pan.y)) };
}

// Zoom around the pointer (or center for buttons), then keep the image in view.
export function zoomPhotoView(view, scale, anchor, image, viewport) {
  const next = Math.max(photoImageFit(image, viewport), Math.min(8, scale));
  const ratio = next / view.scale;
  const pan = clampPhotoPan({ x: anchor.x + (view.x - anchor.x) * ratio,
    y: anchor.y + (view.y - anchor.y) * ratio }, next, image, viewport);
  return { mode: 'zoom', scale: next, ...pan };
}
