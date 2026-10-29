import { getLayerType } from '../layerPresentation.mjs';

export function getGeminiSurveySources(layers, layerOrder) {
  return layerOrder.flatMap((id) => {
    const layer = layers[id], type = getLayerType(layer);
    return layer?.data && ['GMI', 'SOSI', 'KOF'].includes(type)
      ? [{ id, name: layer.file?.name || layer.name || type }] : [];
  });
}

export function resolveGeminiSourceId(sources, preferredId) {
  return sources.some((source) => source.id === preferredId) ? preferredId : sources.length === 1 ? sources[0].id : '';
}

const MESSAGES = Object.freeze({
  authentication_failed: 'Kunne ikke logge inn i Gemini VA. Kontroller brukernavn og passord.',
  credentials_unavailable: 'Oppgi brukernavn og passord for Gemini VA på nytt.',
  invalid_credentials: 'Oppgi et gyldig brukernavn og passord. Fyll ut begge feltene.',
  permission_denied: 'Brukeren har ikke tilgang til denne Gemini VA-tjenesten.',
  no_survey_source: 'Velg en innmålingsfil i GMI-, SOSI- eller KOF-format.',
  no_source_geometry: 'Den valgte innmålingsfilen inneholder ingen geometri som kan brukes til oppslag.',
  unsupported_crs: 'Koordinatsystemet i den valgte filen kan ikke brukes til Gemini-oppslag.',
  invalid_survey_coordinate: 'Den valgte filen har ugyldige koordinater. Kontroller innmålingen.',
  extent_projection_failed: 'Koordinatene i den valgte filen kunne ikke transformeres for Gemini-oppslag.',
  invalid_bbox: 'Området i den valgte filen ligger utenfor støttet koordinatområde.',
  extent_too_large: 'Innmålingen dekker et for stort område for ett Gemini-oppslag. Velg en mindre innmålingsfil.',
  timeout: 'Hentingen tok for lang tid. Prøv igjen.',
  provider_rate_limited: 'Gemini VA mottar for mange forespørsler. Prøv igjen senere.',
  response_too_large: 'Svaret fra Gemini VA er for stort. Velg en mindre innmålingsfil.',
  unsupported_response_encoding: 'Svaret fra Gemini VA har en tegnkoding som ikke støttes.',
  gml_parser_error: 'Anleggsdataene fra Gemini VA kunne ikke leses. Prøv igjen eller kontakt tjenesteansvarlig.',
  display_projection_error: 'Anleggsdataene fra Gemini VA kunne ikke klargjøres for kartet.',
  unexpected_feature_type: 'Gemini VA returnerte en objekttype som ikke støttes.',
  unsupported_upstream_mime: 'Gemini VA svarte med et format som ikke støttes.',
  request_aborted: 'Hentingen ble avbrutt. Velg kilde på nytt hvis innmålingen er endret.',
  session_disposed: 'Gemini-økten er avsluttet. Åpne tilgangen på nytt.',
});

// Never display error.message, XML, provider bodies or arbitrary codes.
export function getGeminiUiError(error) {
  let message = Object.hasOwn(MESSAGES, error?.code) ? MESSAGES[error.code] : 'Henting fra Gemini VA mislyktes. Prøv igjen.';
  const dimensions = error?.dimensions;
  if (error?.code === 'extent_too_large' && dimensions && [dimensions.width, dimensions.height]
    .every((value) => Number.isFinite(value) && value >= 0 && value <= 10_000_000)) {
    message += ` Området med buffer er omtrent ${Math.ceil(dimensions.width)} × ${Math.ceil(dimensions.height)} m (maks. 2000 × 2000 m).`;
  }
  return message;
}
