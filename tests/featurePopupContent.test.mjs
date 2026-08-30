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
  assert.equal(linePopup.children[0].className, 'font-semibold flex items-center gap-1 whitespace-nowrap');
  assert.equal(linePopup.children[1].className, 'mt-1 border-t pt-1 flex-1 overflow-auto');
  assert.equal(linePopup.children[2].className, 'mt-1 pt-2 border-t grid grid-cols-2 gap-2');
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
