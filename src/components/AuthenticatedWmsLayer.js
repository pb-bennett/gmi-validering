'use client';

import L from 'leaflet';
import {
  createLayerComponent,
  updateGridLayer,
} from '@react-leaflet/core';

/**
 * Authenticated WMS Tile Layer
 *
 * This component renders a WMS layer with Basic Authentication.
 * Uses a server-side proxy to avoid CORS issues with WMS servers
 * that don't support cross-origin requests with auth headers.
 *
 * Security Notes:
 * - Credentials are passed as props and only exist in memory
 * - Credentials are sent to our own proxy, which forwards them to the WMS server
 * - The proxy doesn't store or log credentials
 */

/**
 * Custom TileLayer.WMS that uses our proxy for authentication
 */
const ProxiedAuthWMSTileLayer = L.TileLayer.WMS.extend({
  initialize: function (url, options) {
    this._authHeader = options.authHeader;
    this._originalUrl = url;
    delete options.authHeader;

    // Don't call parent with the original URL yet
    L.TileLayer.WMS.prototype.initialize.call(this, url, options);
  },

  getTileUrl: function (coords) {
    // Get the original WMS URL with all parameters
    const originalUrl = L.TileLayer.WMS.prototype.getTileUrl.call(
      this,
      coords,
    );

    // Route through our proxy
    const proxyUrl = `/api/wms-proxy?url=${encodeURIComponent(originalUrl)}`;

    return proxyUrl;
  },

  createTile: function (coords, done) {
    const tile = document.createElement('img');
    tile.alt = '';
    tile.setAttribute('role', 'presentation');

    const url = this.getTileUrl(coords);

    // If we have auth header, use fetch with our custom header
    if (this._authHeader) {
      fetch(url, {
        headers: {
          'x-wms-auth': this._authHeader,
        },
      })
        .then((response) => {
          if (!response.ok) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn(
                'WMS proxy returned non-OK status for tile:',
                response.status,
                response.statusText,
                url,
              );
            }
            throw new Error(`HTTP ${response.status}`);
          }
          return response.blob();
        })
        .then((blob) => {
          if (process.env.NODE_ENV !== 'production') {
            console.debug(
              'WMS tile fetched successfully, size:',
              blob.size,
              url,
            );
          }
          tile.src = URL.createObjectURL(blob);
          done(null, tile);
        })
        .catch((error) => {
          console.warn('WMS tile fetch failed:', error, url);
          // On error, show a transparent tile
          tile.src =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
          done(error, tile);
        });
    } else {
      // No auth, use standard approach
      tile.onload = () => done(null, tile);
      tile.onerror = (e) => done(e, tile);
      tile.src = url;
    }

    return tile;
  },
});

const createAuthenticatedWmsLayer = (props, context) => {
  const {
    url,
    username,
    password,
    layers,
    opacity = 1,
    zIndex = 500,
    maxZoom = 25,
    maxNativeZoom = 25,
  } = props;

  const authHeader =
    username && password
      ? `Basic ${btoa(`${username}:${password}`)}`
      : null;

  const instance = new ProxiedAuthWMSTileLayer(url, {
    layers: layers || '',
    format: 'image/png',
    transparent: true,
    version: '1.1.1',
    authHeader,
    opacity,
    zIndex,
    maxZoom,
    maxNativeZoom,
    attribution: 'Gemini WMS',
  });

  return { instance, context };
};

const updateAuthenticatedWmsLayer = (instance, props, prevProps) => {
  updateGridLayer(instance, props, prevProps);

  if (props.url !== prevProps.url) {
    instance.setUrl(props.url);
  }

  if (props.layers !== prevProps.layers) {
    instance.setParams({ layers: props.layers || '' });
  }

  if (
    props.username !== prevProps.username ||
    props.password !== prevProps.password
  ) {
    instance._authHeader =
      props.username && props.password
        ? `Basic ${btoa(`${props.username}:${props.password}`)}`
        : null;
    instance.redraw();
  }

  if (props.maxZoom !== prevProps.maxZoom) {
    instance.options.maxZoom = props.maxZoom;
  }

  if (props.maxNativeZoom !== prevProps.maxNativeZoom) {
    instance.options.maxNativeZoom = props.maxNativeZoom;
  }
};

const AuthenticatedWmsLayer = createLayerComponent(
  createAuthenticatedWmsLayer,
  updateAuthenticatedWmsLayer,
);

export default AuthenticatedWmsLayer;
