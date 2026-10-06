import assert from 'node:assert/strict';

export async function assertPhotoDialogLayout(browser, label) {
  const geometry = await browser.evaluate(`(() => {
    const dialog = document.querySelector('.photo-collection-dialog[open]');
    const body = dialog.querySelector('.photo-collection-body');
    const style = getComputedStyle(dialog);
    return {
      label: ${JSON.stringify(label)}, viewport: { width: innerWidth, height: innerHeight },
      dialog: dialog.getBoundingClientRect().toJSON(),
      computed: { width: style.width, maxWidth: style.maxWidth, height: style.height, margin: style.margin },
      body: body.getBoundingClientRect().toJSON(), display: getComputedStyle(body).display,
      columns: getComputedStyle(body).gridTemplateColumns,
      gallery: dialog.querySelector('.photo-collection-gallery').getBoundingClientRect().toJSON(),
      inspector: dialog.querySelector('.photo-collection-inspector').getBoundingClientRect().toJSON()
    };
  })()`);
  const { viewport, dialog, body, gallery, inspector } = geometry;
  const narrow = viewport.width <= 700;
  const expectedWidth = narrow ? viewport.width - 16 : viewport.width * 0.94;
  const expectedHeight = narrow ? viewport.height - 16 : viewport.height * 0.94;
  const context = `${label}: ${JSON.stringify(geometry)}`;
  // Bounds-only assertions miss a shrink-to-fit dialog at (0,0).
  assert(Math.abs(dialog.width - expectedWidth) <= 2, context);
  assert(Math.abs(dialog.height - expectedHeight) <= 2, context);
  assert(Math.abs(dialog.left - (viewport.width - dialog.width) / 2) <= 2, context);
  assert(Math.abs(dialog.top - (viewport.height - dialog.height) / 2) <= 2, context);
  assert(dialog.right <= viewport.width && dialog.bottom <= viewport.height, context);
  assert.equal(geometry.display, 'grid', context);
  assert(gallery.width > 0 && gallery.height > 0 && inspector.width > 0 && inspector.height > 0, context);
  if (narrow) {
    assert(Math.abs(gallery.left - inspector.left) <= 2 && Math.abs(gallery.width - inspector.width) <= 2, context);
    assert(Math.abs(gallery.bottom - inspector.top) <= 2, context);
  } else {
    assert(Math.abs(gallery.top - inspector.top) <= 2, context);
    assert(Math.abs(gallery.right - inspector.left) <= 2, context);
    assert(Math.abs(gallery.width / body.width - 0.42) < 0.01, context);
    assert(Math.abs(inspector.width / body.width - 0.58) < 0.01, context);
  }
  return geometry;
}
