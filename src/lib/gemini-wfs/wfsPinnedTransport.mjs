import dns from 'node:dns/promises';
import https from 'node:https';
import { Readable } from 'node:stream';
import { isIP } from 'node:net';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import { isPublicAddress } from '../wmsProxyPolicy.mjs';
import { normalizeGeminiWfsUrl } from './geminiConnection.mjs';
import { WfsProxyError } from './wfsProxyPolicy.mjs';

export async function resolveWfsDestination(url, { lookup = (...args) => dns.lookup(...args), signal } = {}) {
  // Request parameters are exclusively server-generated; validate the base again.
  const target = new URL(url);
  if (target.username || target.password || target.hash) throw new WfsProxyError('invalid_request');
  normalizeGeminiWfsUrl(`${target.origin}${target.pathname}`);
  signal?.throwIfAborted();
  const addresses = await lookup(target.hostname, { all: true, verbatim: true });
  signal?.throwIfAborted();
  if (!Array.isArray(addresses) || !addresses.length || addresses.some((entry) =>
    !entry || !isPublicAddress(entry.address) || ![4, 6].includes(entry.family) || entry.family !== isIP(entry.address))) {
    throw new WfsProxyError('invalid_request');
  }
  return { target, address: { ...(addresses.find((entry) => entry.family === 4) ?? addresses[0]) } };
}

// Node runtime only. The TLS host/SNI remains the validated tenant; DNS is not
// consulted a second time. No pooled connection or redirect can escape the pin.
export async function fetchPinnedWfs(url, options, dependencies = {}) {
  const { target, address } = await resolveWfsDestination(url, { ...dependencies, signal: options.signal });
  const requestHttps = dependencies.request ?? ((...args) => https.request(...args));
  return new Promise((resolve, reject) => {
    const request = requestHttps(target, {
      method: 'GET', agent: false, signal: options.signal,
      servername: target.hostname,
      headers: { Authorization: options.headers.Authorization, Accept: options.headers.Accept },
      lookup: (_hostname, lookupOptions, callback) => {
        if (_hostname !== target.hostname) { callback(new WfsProxyError('invalid_request')); return; }
        callback(null, lookupOptions.all ? [address] : address.address, address.family);
      },
    }, (incoming) => {
      try {
        if (!Number.isInteger(incoming.statusCode) || incoming.statusCode < 200 || incoming.statusCode > 599) {
          throw new WfsProxyError('invalid_upstream_response');
        }
        // A rejected status needs no provider body. Destroy it without reading.
        if (incoming.statusCode !== 200) {
          incoming.destroy();
          resolve(new Response(null, { status: incoming.statusCode }));
          return;
        }
        const headers = new Headers();
        for (const name of ['content-type', 'content-length', 'content-encoding']) {
          const value = incoming.headers[name];
          if (typeof value === 'string') headers.set(name, value);
        }
        const decoders = { gzip: createGunzip, deflate: createInflate, br: createBrotliDecompress };
        const encoding = incoming.headers['content-encoding']?.toLowerCase();
        const decoder = Object.hasOwn(decoders, encoding) ? decoders[encoding] : null;
        const stream = decoder ? incoming.pipe(decoder()) : incoming;
        if (stream !== incoming) incoming.on('error', (error) => stream.destroy(error));
        const body = Readable.toWeb(stream);
        const response = new Response(body, { status: 200, headers });
        // Web-stream cancellation and deadline both tear down the actual socket.
        stream.on('close', () => incoming.destroy());
        resolve(response);
      } catch {
        incoming.destroy();
        reject(new WfsProxyError('invalid_upstream_response'));
      }
    });
    request.once('error', reject);
    request.end();
  });
}
