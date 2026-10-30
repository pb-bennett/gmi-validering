const MESSAGES = Object.freeze({
  map_extent_too_large: 'Kartutsnittet er for stort for én Gemini WFS-forespørsel. Zoom inn og prøv igjen.',
  map_unavailable: 'Kartet er ikke klart. Åpne kartet og prøv igjen.',
  connection_unavailable: 'Oppgi en Gemini WFS-tilkobling f?rst.',
  invalid_connection: 'Oppgi navn og en gyldig HTTPS-adresse til en Gemini Suite WFS-tjeneste uten parametere.',
  origin_rejected: 'Forespørselen ble avvist av appens sikkerhetskontroll. Last inn siden på nytt eller kontakt tjenesteansvarlig.',
  authentication_failed: 'Gemini WFS-tjenesten avviste autentiseringen. Årsaken er ikke avklart.',
  credentials_unavailable: 'Oppgi brukernavn og passord for Gemini WFS på nytt.',
  invalid_credentials: 'Oppgi et gyldig brukernavn og passord. Fyll ut begge feltene.',
  permission_denied: 'Brukeren har ikke tilgang til denne Gemini WFS-tjenesten.',
  no_survey_source: 'Innmålingslaget kan ikke brukes til Gemini-oppslag.',
  no_source_geometry: 'Innmålingslaget inneholder ingen geometri som kan brukes til oppslag.',
  unsupported_crs: 'Koordinatsystemet i innmålingslaget kan ikke brukes til Gemini-oppslag.',
  invalid_survey_coordinate: 'Innmålingslaget har ugyldige koordinater. Kontroller innmålingen.',
  extent_projection_failed: 'Koordinatene i innmålingslaget kunne ikke transformeres for Gemini-oppslag.',
  invalid_bbox: 'Området ligger utenfor støttet koordinatområde.',
  extent_too_large: 'Innmålingen dekker et for stort område for ett Gemini-oppslag. Bruk et mindre innmålingsområde.',
  timeout: 'Hentingen tok for lang tid. Prøv igjen.',
  provider_rate_limited: 'Gemini WFS mottar for mange forespørsler. Prøv igjen senere.',
  response_too_large: 'Svaret fra Gemini WFS er for stort. Bruk et mindre område.',
  unsupported_response_encoding: 'Svaret fra Gemini WFS har en tegnkoding som ikke støttes.',
  gml_parser_error: 'Anleggsdataene fra Gemini WFS kunne ikke leses. Prøv igjen eller kontakt tjenesteansvarlig.',
  display_projection_error: 'Anleggsdataene fra Gemini WFS kunne ikke klargjøres for kartet.',
  unexpected_feature_type: 'Gemini WFS returnerte en objekttype som ikke støttes.',
  unsupported_upstream_mime: 'Gemini WFS svarte med et format som ikke støttes.',
  request_aborted: 'Hentingen ble avbrutt. Bruk Oppdater for å prøve igjen.',
  session_disposed: 'Gemini-økten er avsluttet. Åpne tilgangen på nytt.',
});

// Never display error.message, XML, provider bodies or arbitrary codes.
export function getGeminiUiError(error) {
  let message = Object.hasOwn(MESSAGES, error?.code) ? MESSAGES[error.code] : 'Henting fra Gemini WFS mislyktes. Prøv igjen.';
  const dimensions = error?.dimensions;
  if (error?.code === 'extent_too_large' && dimensions && [dimensions.width, dimensions.height]
    .every((value) => Number.isFinite(value) && value >= 0 && value <= 10_000_000)) {
    message += ` Området med buffer er omtrent ${Math.ceil(dimensions.width)} × ${Math.ceil(dimensions.height)} m (maks. 2000 × 2000 m).`;
  }
  return message;
}
