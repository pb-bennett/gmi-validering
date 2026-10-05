import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

class FakeText {
  constructor(value) {
    this.nodeType = 3;
    this.textContent = value;
    this.parentNode = null;
  }
}

class FakeElement {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.parentNode = null;
    this.className = '';
    this.style = {};
    this._textContent = '';
  }

  set textContent(value) {
    this.children = [];
    this._textContent = String(value);
  }

  get textContent() {
    return `${this._textContent}${this.children
      .map((child) => child.textContent)
      .join('')}`;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (child.nodeType === 1) {
        if (child.tagName.toLowerCase() === selector) matches.push(child);
        matches.push(...child.querySelectorAll(selector));
      }
    }
    return matches;
  }
}

const fakeDocument = {
  createElement: (tagName) => new FakeElement(tagName),
  createElementNS: (_namespace, tagName) => new FakeElement(tagName),
  createTextNode: (value) => new FakeText(String(value)),
};

const renderPopup = (...args) => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDocument;
  try {
    return createFeaturePopupContent(...args);
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
};

const { createFeaturePopupContent } = await import(
  '../src/lib/map/featurePopupContent.mjs'
);
const mapInnerSource = await readFile(
  new URL('../src/components/MapInner.js', import.meta.url),
  'utf8',
);
const popupSource = await readFile(
  new URL('../src/lib/map/featurePopupContent.mjs', import.meta.url),
  'utf8',
);
const cssSource = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8');

test('object popup uses a larger preference bounded by the map, with one internal scroller', () => {
  assert.match(mapInnerSource, /className: 'gmi-object-popup',[\s\S]*?minWidth: 0,[\s\S]*?maxWidth: 560/);
  assert.match(mapInnerSource, /className="gmi-object-map"/);
  assert.match(mapInnerSource, /autoPanPaddingTopLeft: \[24, 64\]/);
  assert.match(mapInnerSource, /autoPanPaddingBottomRight: \[24, 48\]/);
  assert.match(cssSource, /\.gmi-object-map\s*\{\s*container-type: size/);
  assert.match(cssSource, /\.gmi-object-popup \.leaflet-popup-content\s*\{\s*width: min\(35rem, calc\(100cqw - 6rem\)\) !important/);
  assert.match(cssSource, /max-height: min\(38rem, calc\(100cqh - 10rem\)\)/);
  assert.match(cssSource, /@media \(max-height: 1000px\) and \(min-width: 1024px\)\s*\{\s*\.gmi-feature-popup\s*\{\s*max-height: min\(34rem, calc\(100cqh - 10rem\)\)/);
  assert.doesNotMatch(popupSource, /max-h-72|overflow-auto/);
  const popup = renderPopup({ featureType: 'Line', NAME: 'A long ordinary attribute' });
  assert.match(popup.children[1].className, /min-h-0 flex-1 overflow-y-auto overflow-x-hidden/);
  assert.match(popup.children[0].className, /shrink-0/);
  assert.match(popup.children[2].className, /shrink-0/);
});

test('file section associates controls with source links, without derived filename rows', () => {
  const raw = String.raw`h:3(link:"Attachments\Photo_A.jpg" sign:"NOSEVIE" link:"Photos/Photo_B.jpg" link:"other/Photo_A.jpg")`;
  const popup = renderPopup({ featureType: 'Point', NAME: 'Ordinary', S_HYPERLINK: raw, Status: 'D' });
  const section = popup.querySelectorAll('section')[0];
  assert.equal(section.getAttribute('aria-label'), 'Filreferanser');
  assert.equal(section.querySelectorAll('h3')[0].textContent, 'Filreferanser (S_HYPERLINK)');
  const rows = section.children.slice(1);
  assert.equal(rows.map((row) => row.children[0].textContent).join(''), raw);
  const copies = section.querySelectorAll('button');
  assert.equal(copies.length, 2);
  assert.match(copies[0].parentNode.children[0].textContent, /link:"Attachments\\Photo_A.jpg"/);
  assert.match(copies[1].parentNode.children[0].textContent, /link:"Photos\/Photo_B.jpg"/);
  const metadata = rows.find((row) => row.textContent.includes('sign:'));
  assert.match(metadata.textContent, /NOSEVIE/);
  assert.equal(metadata.querySelectorAll('button').length, 0);
  assert.equal(rows.find((row) => row.textContent.includes('other/')).querySelectorAll('button').length, 0);
  assert(!rows.some((row) => ['Photo_A.jpg', 'Photo_B.jpg'].includes(row.children[0].textContent)));
  assert.match(popup.textContent, /NAME: Ordinary/);
  assert.match(popup.textContent, /Status: D/);
});

test('plain and long references retain a single source row and nearby compact control', () => {
  const source = `Photos/${'long-folder/'.repeat(30)}Photo.jpg`;
  const popup = renderPopup({ featureType: 'Point', S_HYPERLINK: source });
  const section = popup.querySelectorAll('section')[0];
  assert.equal(section.children.length, 2);
  assert.equal(section.querySelectorAll('button').length, 1);
  const row = section.children[1];
  assert.equal(row.children[0].textContent, source);
  assert.match(row.children[0].className, /min-w-0 flex-1.*overflow-wrap:anywhere/);
  assert.match(row.querySelectorAll('button')[0].className, /shrink-0/);
});

test('generic popup exposes canonical Status and Eier as ordinary attributes', () => {
  const popup = renderPopup({ featureType: 'Point', S_FCODE: 'KUM', Status: 'D', Eier: 'K' });
  assert.match(popup.textContent, /Status: D/);
  assert.match(popup.textContent, /Eier: K/);
});

test('hostile attribute names and values remain literal popup text', () => {
  const hostileImage = '<img src=x onerror="alert(1)">';
  const hostileScript = '<script>alert(2)</script>';
  const hostileLink = '<a href="https://example.invalid">...</a>';
  const popup = renderPopup(
    {
      featureType: 'Point',
      id: 4,
      _layerId: hostileImage,
      [hostileImage]: hostileScript,
      ordinary: hostileLink,
    },
    hostileImage,
    '#0101FF',
  );

  assert.match(popup.textContent, new RegExp(hostileImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(popup.textContent, new RegExp(hostileScript.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(popup.textContent, new RegExp(hostileLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(popup.querySelectorAll('img').length, 0);
  assert.equal(popup.querySelectorAll('script').length, 0);
  assert.equal(popup.querySelectorAll('a').length, 0);

  const buttons = popup.querySelectorAll('button');
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].getAttribute('data-feature-id'), hostileImage);
  assert.equal(buttons[0].getAttribute('data-layer-id'), hostileImage);
});

test('ordinary point and line popups preserve their structure and actions', () => {
  const pointPopup = renderPopup(
    { featureType: 'Point', id: 2, S_FCODE: 'KUM', NAME: 'Kum 2' },
    'punkter-2',
    '#cc3300',
    'KUM',
  );
  const linePopup = renderPopup(
    { featureType: 'Line', id: 3, S_FCODE: 'VL', DIM: 110 },
    'ledninger-3',
    '#0101FF',
    'VL',
  );

  assert.match(pointPopup.textContent, /Type:Point/);
  assert.match(pointPopup.textContent, /NAME: Kum 2/);
  assert.equal(pointPopup.querySelectorAll('button').length, 2);
  assert.equal(linePopup.querySelectorAll('button').length, 3);
  assert.equal(linePopup.querySelectorAll('strong').length, 1);
  assert.equal(linePopup.querySelectorAll('button')[2].textContent, 'Vis profilanalyse');
  assert.match(linePopup.className, /gmi-feature-popup/);
  assert.match(linePopup.children[0].className, /font-semibold text-gmi-navy/);
  assert.match(linePopup.children[1].className, /overflow-y-auto overflow-x-hidden border-t border-gmi-border/);
  assert.match(linePopup.children[2].className, /grid grid-cols-2 shrink-0 gap-1\.5 border-t/);
});

test('MapInner passes a DOM popup element instead of an interpolated HTML string', () => {
  assert.match(
    mapInnerSource,
    /layer\.bindPopup\(\s*createFeaturePopupContent\(props, featureId, color, fcode\)/,
  );
  assert.doesNotMatch(mapInnerSource, /let content = [`']/);
  assert.match(popupSource, /\.textContent\s*=/);
  assert.match(popupSource, /\.setAttribute\(/);
  assert.doesNotMatch(popupSource, /innerHTML|insertAdjacentHTML|dangerouslySetInnerHTML/);
});

test('hyperlink popup preserves raw fields and exposes every distinct filename separately', async () => {
  const raw = String.raw`h:2(link:"Attachments\Photo_A.jpg",link:"Photos/Photo_B.jpg")`;
  const props = { featureType: 'Point', id: 7, S_HYPERLINK: raw, Eier: 'K', Status: 'D' };
  const popup = renderPopup(props, 'punkter-layer-7', '#123456', 'KUM');
  const copies = popup.querySelectorAll('button').filter((button) => button.getAttribute('aria-label')?.startsWith('Kopier filnavn'));
  assert.equal(copies.length, 2);
  assert.deepEqual(copies.map((button) => button.getAttribute('aria-label')), ['Kopier filnavn Photo_A.jpg', 'Kopier filnavn Photo_B.jpg']);
  assert(popup.textContent.includes(raw));
  assert.match(popup.textContent, /Eier: K/);
  assert.match(popup.textContent, /Status: D/);
  assert.equal(props.S_HYPERLINK, raw);
  const actions = popup.querySelectorAll('button').filter((button) => !copies.includes(button));
  assert.deepEqual(actions.map((button) => button.textContent), ['Vis i 3D', 'Inspiser data']);
  assert.equal(actions[1].getAttribute('data-feature-id'), 'punkter-layer-7');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const writes = [];
  let stopped = 0;
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (text) => writes.push(text) } } });
    for (const copy of copies) {
      assert.equal(copy.getAttribute('type'), 'button');
      assert.match(copy.className, /gmi-focus-ring/);
      assert.equal(copy.textContent, '', 'copy is icon-only, with its name in accessibility attributes');
      const svg = copy.querySelectorAll('svg')[0];
      assert.equal(svg.getAttribute('aria-hidden'), 'true');
      assert.equal(svg.getAttribute('width'), '12');
      assert.equal(copy.getAttribute('title'), copy.getAttribute('aria-label'));
      const path = svg.querySelectorAll('path')[0];
      const originalPath = path.getAttribute('d');
      await copy.onclick({ stopPropagation: () => { stopped++; } });
      assert.notEqual(path.getAttribute('d'), originalPath, 'success changes Copy to Check');
      assert.match(copy.parentNode.textContent, /Kopiert/);
      assert.equal(copy.disabled, false);
    }
    assert.deepEqual(writes, ['Photo_A.jpg', 'Photo_B.jpg']);
    assert.equal(stopped, 2);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});

test('popup invalid references have no copy action and clipboard rejection remains local', async () => {
  for (const S_HYPERLINK of [undefined, null, '', 'h:1(link:"")', {}]) {
    const popup = renderPopup({ featureType: 'Point', S_HYPERLINK });
    assert.equal(popup.querySelectorAll('button').length, 2);
  }
  const popup = renderPopup({ featureType: 'Point', S_HYPERLINK: 'Photos/Photo.jpg' });
  const copy = popup.querySelectorAll('button')[0];
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('denied'); } } } });
    await copy.onclick({ stopPropagation() {} });
    assert.match(copy.parentNode.textContent, /Ikke kopiert/);
    assert(!copy.parentNode.textContent.includes('Kopiert'));
    assert.equal(copy.disabled, false);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});

test('observed link/sign popup keeps raw text and copies filename with temporary Phosphor feedback', async () => {
  const raw = String.raw`h:1(link:"Attachments\20251119_154646.jpg"` + '\nsign:"NOSEVIE")';
  const props = { featureType: 'Point', S_HYPERLINK: raw };
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousTimeout = globalThis.setTimeout;
  let reset;
  const writes = [];
  try {
    globalThis.setTimeout = (callback) => { reset = callback; return undefined; };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (text) => writes.push(text) } } });
    const popup = renderPopup(props);
    const copy = popup.querySelectorAll('button')[0];
    assert.equal(copy.getAttribute('aria-label'), 'Kopier filnavn 20251119_154646.jpg');
    assert.equal(copy.textContent, '');
    assert(popup.textContent.includes(raw));
    const path = copy.querySelectorAll('path')[0];
    const initialPath = path.getAttribute('d');
    let stopped = false;
    await copy.onclick({ stopPropagation() { stopped = true; } });
    assert(stopped);
    assert.deepEqual(writes, ['20251119_154646.jpg']);
    assert.match(copy.parentNode.textContent, /Kopiert/);
    assert.notEqual(path.getAttribute('d'), initialPath);
    reset();
    assert.equal(path.getAttribute('d'), initialPath);
    assert(!copy.parentNode.textContent.includes('Kopiert'));
    assert.equal(props.S_HYPERLINK, raw);
  } finally {
    globalThis.setTimeout = previousTimeout;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});
