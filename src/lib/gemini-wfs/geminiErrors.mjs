import { GeminiGmlError } from './parseGeminiGml.mjs';

const MESSAGES = Object.freeze({
  connection_unavailable: 'Oppgi en Gemini WFS-tilkobling f?rst.',
  invalid_connection: 'Oppgi navn og en gyldig HTTPS-adresse til en Gemini Suite WFS-tjeneste uten parametere.',
  no_survey_source: 'Velg et innmålingslag.',
  no_source_geometry: 'Innmålingslaget har ingen koordinater.',
  unsupported_crs: 'Innmålingslaget mangler et støttet koordinatsystem.',
  invalid_survey_coordinate: 'Innmålingslaget har ugyldige koordinater.',
  extent_projection_failed: 'Innmålingskoordinatene kunne ikke transformeres.',
  extent_too_large: 'Området er for stort. Velg et mindre innmålingslag.',
  invalid_bbox: 'Området ligger utenfor støttet koordinatområde.',
  credentials_unavailable: 'Oppgi Gemini-tilgang før henting.',
  invalid_credentials: 'Kontroller Gemini-tilgangen.',
  proxy_request_failed: 'Kunne ikke hente eksisterende anlegg.',
  invalid_request: 'Ugyldig forespørsel om eksisterende anlegg.',
  request_too_large: 'Forespørselen er for stor.',
  unsupported_media_type: 'Forespørselen har et format som ikke støttes.',
  origin_rejected: 'Forespørselens opprinnelse ble avvist.',
  authentication_failed: 'Gemini WFS-tjenesten avviste autentiseringen. Årsaken er ikke avklart.',
  permission_denied: 'Gemini ga ikke tilgang til anleggene.',
  provider_rate_limited: 'Gemini mottar for mange forespørsler. Prøv senere.',
  timeout: 'Hentingen tok for lang tid.',
  request_aborted: 'Hentingen ble avbrutt.',
  upstream_failure: 'Gemini-tjenesten kunne ikke svare.',
  upstream_redirect: 'En videresending fra tjenesten ble avvist.',
  unsupported_upstream_mime: 'Tjenesten svarte med et format som ikke støttes.',
  invalid_upstream_response: 'Tjenesten returnerte et ugyldig svar.',
  response_too_large: 'Svaret er for stort. Velg et mindre innmålingslag.',
  unsupported_response_encoding: 'Svaret har en tegnkoding som ikke støttes.',
  gml_parser_error: 'Anleggsdataene kunne ikke leses.',
  display_projection_error: 'Anleggsdataene kunne ikke klargjøres for kart.',
  unexpected_feature_type: 'Tjenesten returnerte feil objekttype.',
  session_disposed: 'Gemini-økten er avsluttet.',
});

export class GeminiServiceError extends Error {
  constructor(code, { dimensions, parserCode } = {}) {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'proxy_request_failed';
    super(MESSAGES[safeCode]);
    this.name = 'GeminiServiceError';
    this.code = safeCode;
    if (dimensions && ['width', 'height', 'area'].every((key) => Number.isFinite(dimensions[key]) && dimensions[key] >= 0)) {
      this.dimensions = Object.freeze({ width: dimensions.width, height: dimensions.height, area: dimensions.area });
    }
    if (parserCode && new GeminiGmlError(parserCode).code === parserCode) this.parserCode = parserCode;
  }
}

export function safeGeminiError(error) {
  const safe = error instanceof GeminiServiceError
    ? new GeminiServiceError(error.code, error)
    : error instanceof GeminiGmlError
      ? new GeminiServiceError(error.code === 'invalid-display-projection' ? 'display_projection_error' : 'gml_parser_error', { parserCode: error.code })
      : new GeminiServiceError('proxy_request_failed');
  return Object.freeze({ code: safe.code, message: safe.message,
    ...(safe.dimensions ? { dimensions: safe.dimensions } : {}),
    ...(safe.parserCode ? { parserCode: safe.parserCode } : {}),
  });
}

// Always attach rejection handling, even when a transport ignores cancellation.
export function waitForGemini(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new GeminiServiceError('request_aborted')); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(
      (value) => { signal.removeEventListener('abort', abort); resolve(value); },
      (error) => { signal.removeEventListener('abort', abort); reject(error); },
    );
    if (signal.aborted) abort();
  });
}
