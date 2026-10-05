export const THUMBNAIL_MAX_EDGE = 320;
export const THUMBNAIL_JPEG_QUALITY = 0.8;

const supportedExtensions = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp' };
const supportedTypes = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
const otherImageExtensions = new Set(['heic', 'heif', 'tif', 'tiff', 'svg', 'svgz', 'gif', 'bmp', 'avif', 'ico', 'jxl']);
const otherImageTypes = new Set(['image/heic', 'image/heif', 'image/tiff', 'image/svg+xml', 'image/gif', 'image/bmp', 'image/avif', 'image/x-icon', 'image/jxl']);

// Classification is a preview promise, not content validation. Decoding can still fail.
export function classifyPhotoFile(file) {
  const extension = (file.name || '').split('.').at(-1).toLowerCase();
  const mime = (file.type || '').toLowerCase().split(';')[0].trim();
  if (otherImageExtensions.has(extension) || otherImageTypes.has(mime)) {
    return { candidate: true, supported: false, format: null };
  }
  const format = (Object.hasOwn(supportedExtensions, extension) && supportedExtensions[extension])
    || (Object.hasOwn(supportedTypes, mime) && supportedTypes[mime]);
  return { candidate: Boolean(format) || mime.startsWith('image/'), supported: Boolean(format), format: format || null };
}

export function thumbnailDimensions(width, height, maxEdge = THUMBNAIL_MAX_EDGE) {
  if (!(width > 0 && height > 0 && maxEdge > 0)) throw new Error('Invalid image dimensions');
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function previewError(code) {
  return Object.assign(new Error(code), { code });
}

async function cancellable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) throw previewError('cancelled');
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(previewError('cancelled'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([promise, cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

// Browser dependencies are resolved at call time; importing this module is SSR-safe.
export async function createPhotoThumbnail(file, {
  format = classifyPhotoFile(file).format,
  maxEdge = THUMBNAIL_MAX_EDGE,
  quality = THUMBNAIL_JPEG_QUALITY,
  signal,
  urls = globalThis.URL,
  createImage = () => new Image(),
  createCanvas = () => document.createElement('canvas'),
} = {}) {
  if (!classifyPhotoFile(file).supported) throw previewError('unsupported-format');
  if (!file.size) throw previewError('empty-file');
  if (signal?.aborted) throw previewError('cancelled');
  let temporaryUrl;
  let image;
  let canvas;
  let dimensions;
  try {
    temporaryUrl = urls.createObjectURL(file);
    image = createImage();
    image.src = temporaryUrl;
    await cancellable(image.decode(), signal);
    dimensions = { width: image.naturalWidth, height: image.naturalHeight };
    const bounded = thumbnailDimensions(dimensions.width, dimensions.height, maxEdge);
    canvas = createCanvas();
    canvas.width = bounded.width;
    canvas.height = bounded.height;
    const context = canvas.getContext('2d');
    if (!context) throw previewError('thumbnail-failed');
    context.drawImage(image, 0, 0, bounded.width, bounded.height);
    // Preserve transparency for PNG/WebP; camera JPEGs use a compact JPEG derivative.
    const thumbnailBlob = await cancellable(new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(previewError('thumbnail-failed')),
        format === 'jpeg' ? 'image/jpeg' : 'image/png', quality);
    }), signal);
    return { dimensions, thumbnailBlob };
  } catch (error) {
    throw Object.assign(previewError(error.code || (dimensions ? 'thumbnail-failed' : 'decode-failed')), { dimensions });
  } finally {
    if (temporaryUrl) urls.revokeObjectURL(temporaryUrl);
    image?.removeAttribute('src');
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    image = null;
    canvas = null;
  }
}

export function photoPreviewMessage(code) {
  switch (code) {
    case 'unsupported-format': return 'Forhåndsvisning støttes foreløpig bare for JPEG, PNG og WebP.';
    case 'empty-file': return 'Filen er tom og kan ikke forhåndsvises.';
    case 'thumbnail-failed': return 'Miniatyrbildet kunne ikke opprettes.';
    default: return 'Bildet kunne ikke leses. Filen kan være skadet eller ha et annet format.';
  }
}
