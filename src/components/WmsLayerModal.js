'use client';

import { useState, useEffect, useRef } from 'react';
import useStore from '@/lib/store';

/**
 * WMS Layer Modal
 * 
 * Security considerations:
 * - URL is stored in localStorage (for convenience on return visits)
 * - Username and password are NEVER stored anywhere
 * - Form uses proper autocomplete attributes for password manager integration
 * - Credentials are only kept in React state (cleared on page refresh)
 * - The component is wrapped in a form to enable password manager autofill
 */

const WMS_URL_STORAGE_KEY = 'gmi-validator-wms-url';

export default function WmsLayerModal({ isOpen, onClose }) {
  const setCustomWmsConfig = useStore((state) => state.setCustomWmsConfig);
  const customWmsConfig = useStore((state) => state.customWmsConfig);
  
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [layers, setLayers] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [availableLayers, setAvailableLayers] = useState([]);
  const [isFetchingLayers, setIsFetchingLayers] = useState(false);
  const [layersError, setLayersError] = useState(null);
  
  const formRef = useRef(null);
  const urlInputRef = useRef(null);

  // Load saved URL from localStorage on mount
  useEffect(() => {
    if (isOpen) {
      try {
        const savedUrl = localStorage.getItem(WMS_URL_STORAGE_KEY);
        if (savedUrl) {
          setUrl(savedUrl);
        }
        if (customWmsConfig?.url) {
          setUrl(customWmsConfig.url);
        }
        if (customWmsConfig?.layers) {
          setLayers(customWmsConfig.layers);
        }
        // Focus the URL input if empty, otherwise focus username
        setTimeout(() => {
          if (savedUrl && urlInputRef.current) {
            // URL is filled, browser might autofill credentials
          } else if (urlInputRef.current) {
            urlInputRef.current.focus();
          }
        }, 100);
      } catch (e) {
        console.warn('Could not access localStorage:', e);
      }
    }
  }, [isOpen, customWmsConfig]);

  // Reset form when closed
  useEffect(() => {
    if (!isOpen) {
      // Clear sensitive data from state when modal closes
      setPassword('');
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Basic validation
    if (!url.trim()) {
      setError('Du må oppgi en WMS-URL');
      setIsLoading(false);
      return;
    }

    if (!username.trim() || !password.trim()) {
      setError('Du må oppgi brukernavn og passord');
      setIsLoading(false);
      return;
    }

    if (!layers.trim()) {
      setShowAdvanced(true);
      try {
        setIsLoading(true);
        const available = await fetchCapabilitiesLayers();
        if (available.length === 1) {
          setLayers(available[0]);
        } else if (available.length > 1) {
          setAvailableLayers(available);
          setLayers(available.join(','));
        } else {
          setError('Fant ingen WMS-lag. Sjekk tilgang og URL.');
          setIsLoading(false);
          return;
        }
      } catch (e) {
        setError(
          e?.message || 'Kunne ikke hente WMS-lag. Sjekk URL/tilgang.',
        );
        setIsLoading(false);
        return;
      }
    }

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(url.trim());
      if (!parsedUrl.protocol.startsWith('http')) {
        throw new Error('URL må starte med http:// eller https://');
      }
    } catch (urlError) {
      setError('Ugyldig URL-format. Sjekk at URL-en er korrekt.');
      setIsLoading(false);
      return;
    }

    try {
      // Save URL to localStorage (NOT credentials)
      localStorage.setItem(WMS_URL_STORAGE_KEY, url.trim());

      // Store configuration in zustand (credentials in memory only, will be cleared on refresh)
      setCustomWmsConfig({
        url: url.trim(),
        username: username.trim(),
        password: password, // This is kept in zustand state (memory only, not persisted)
        layers: layers.trim() || undefined,
        enabled: true,
      });

      setIsLoading(false);
      onClose();
    } catch (err) {
      setError('Kunne ikke konfigurere WMS-lag: ' + err.message);
      setIsLoading(false);
    }
  };

  const handleRemoveWms = () => {
    try {
      localStorage.removeItem(WMS_URL_STORAGE_KEY);
    } catch (e) {
      console.warn('Could not remove from localStorage:', e);
    }
    setCustomWmsConfig(null);
    setUrl('');
    setUsername('');
    setPassword('');
    setLayers('');
    onClose();
  };

  const buildCapabilitiesUrl = (baseUrl) => {
    const capUrl = new URL(baseUrl);
    capUrl.searchParams.set('service', 'WMS');
    capUrl.searchParams.set('request', 'GetCapabilities');
    return capUrl.toString();
  };

  const fetchCapabilitiesLayers = async () => {
    if (!url.trim()) {
      throw new Error('Legg inn en WMS-URL først');
    }

    if (!username.trim() || !password.trim()) {
      throw new Error('Legg inn brukernavn og passord først');
    }

    const capUrl = buildCapabilitiesUrl(url.trim());
    const authHeader = `Basic ${btoa(`${username.trim()}:${password}`)}`;
    const proxyUrl = `/api/wms-proxy?url=${encodeURIComponent(capUrl)}`;
    const response = await fetch(proxyUrl, {
      headers: {
        'x-wms-auth': authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const names = Array.from(doc.querySelectorAll('Layer > Name'))
      .map((node) => node.textContent)
      .filter(Boolean);
    return Array.from(new Set(names));
  };

  const toggleLayerSelection = (layerName) => {
    const current = layers
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);
    const next = new Set(current);
    if (next.has(layerName)) {
      next.delete(layerName);
    } else {
      next.add(layerName);
    }
    setLayers(Array.from(next).join(','));
  };

  const handleFetchLayers = async () => {
    setLayersError(null);
    setIsFetchingLayers(true);

    try {
      const unique = await fetchCapabilitiesLayers();
      if (unique.length === 0) {
        setLayersError('Fant ingen lag i GetCapabilities');
      }
      setAvailableLayers(unique);
    } catch (e) {
      setLayersError(
        e?.message || 'Kunne ikke hente lagliste. Sjekk URL/tilgang.',
      );
    } finally {
      setIsFetchingLayers(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
              />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900">
              Legg til Gemini WMS
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            title="Lukk"
          >
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form ref={formRef} onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Security notice */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <div className="text-xs text-amber-800">
                <strong>Sikkerhet:</strong> URL-en lagres lokalt i nettleseren din for enklere bruk. 
                Brukernavn og passord lagres <strong>ikke</strong> – du må oppgi dem på nytt hver gang 
                du åpner siden. Bruk gjerne passordbehandleren i nettleseren din.
              </div>
            </div>
          </div>

          {/* URL Input */}
          <div>
            <label htmlFor="wms-url" className="block text-sm font-medium text-gray-700 mb-1">
              WMS URL
            </label>
            <input
              ref={urlInputRef}
              type="url"
              id="wms-url"
              name="url"
              autoComplete="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://eksempel.kommune.no/gemini/wms"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              required
            />
          </div>

          {/* Username Input */}
          <div>
            <label htmlFor="wms-username" className="block text-sm font-medium text-gray-700 mb-1">
              Brukernavn
            </label>
            <input
              type="text"
              id="wms-username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ditt brukernavn"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              required
            />
          </div>

          {/* Password Input */}
          <div>
            <label htmlFor="wms-password" className="block text-sm font-medium text-gray-700 mb-1">
              Passord
            </label>
            <input
              type="password"
              id="wms-password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ditt passord"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              required
            />
          </div>

          {/* Advanced options toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <svg
              className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            Avanserte innstillinger
          </button>

          {/* Advanced options */}
          {showAdvanced && (
            <div className="pl-4 border-l-2 border-gray-200">
              <div>
                <label htmlFor="wms-layers" className="block text-sm font-medium text-gray-700 mb-1">
                  WMS Lag (påkrevd)
                </label>
                <input
                  type="text"
                  id="wms-layers"
                  name="layers"
                  value={layers}
                  onChange={(e) => setLayers(e.target.value)}
                  placeholder="f.eks. va_ledninger,va_kummer"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Kommaseparert liste over lag. Bruk knappen under for å hente lagliste.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFetchLayers}
                    disabled={isFetchingLayers}
                    className="px-3 py-1.5 text-xs font-medium rounded border bg-white hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    {isFetchingLayers ? 'Henter lag...' : 'Hent lagliste'}
                  </button>
                  {layersError && (
                    <span className="text-xs text-red-600">
                      {layersError}
                    </span>
                  )}
                </div>

                {availableLayers.length > 0 && (
                  <div className="mt-3 max-h-40 overflow-auto border rounded bg-gray-50">
                    <div className="text-xs text-gray-600 px-2 py-1 border-b bg-gray-100">
                      Klikk for å velge lag
                    </div>
                    <ul className="divide-y">
                      {availableLayers.map((layerName) => {
                        const isSelected = layers
                          .split(',')
                          .map((l) => l.trim())
                          .includes(layerName);
                        return (
                          <li key={layerName}>
                            <button
                              type="button"
                              onClick={() => toggleLayerSelection(layerName)}
                              className={`w-full text-left px-2 py-1 text-xs hover:bg-blue-50 ${
                                isSelected
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'text-gray-700'
                              }`}
                            >
                              {layerName}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2">
            {customWmsConfig ? (
              <button
                type="button"
                onClick={handleRemoveWms}
                className="px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
              >
                Fjern WMS
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Avbryt
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-md transition-colors flex items-center gap-2"
              >
                {isLoading && (
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
                {customWmsConfig ? 'Oppdater' : 'Legg til'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
