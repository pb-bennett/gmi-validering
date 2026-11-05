import { evidenceValuesConflict } from './photoEvidenceAdoption.mjs';

export const photoSourceLabel = (kind) => ({ gml: 'GML', exif: 'EXIF', manual: 'Manuell', gmi: 'GMI' })[kind] || kind || 'Ukjent';
export function photoCurrentSource(photo) {
  const current = photo.spatial.current;
  const basis = photo.spatial.candidates.find((candidate) => candidate.id === current?.basis?.candidateId);
  return current ? photoSourceLabel(basis?.kind || current.basis.kind) : null;
}
export function photoCaptureTime(photo) {
  return photo.captureMetadata?.captureTime?.value.iso || null;
}
// Accepted values decide export. "I kilde" only says a source has one that is not accepted yet.
export function photoCaptureTimeStatus(photo) {
  if (photo.captureMetadata?.captureTime) return 'Opptakstid kjent';
  return photo.metadataEvidence?.some((item) => item.field === 'captureTime' && item.value) ? 'Opptakstid i kilde' : 'Uten opptakstid';
}
export const formatPhotoMoveDistance = (metres) => `ca. ${metres.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} m`;

export const formatPhotoCoordinates = (position) => position
  ? `${Math.abs(position.latitude).toFixed(7)}° ${position.latitude < 0 ? 'S' : 'N'}, ${Math.abs(position.longitude).toFixed(7)}° ${position.longitude < 0 ? 'V' : 'Ø'} (WGS84)`
  : 'Ingen posisjon';

// Shown exactly as recorded: no conversion through the host timezone and no invented offset.
export function formatPhotoCaptureTime(value) {
  const match = value?.iso?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction, zone] = match;
  const time = hour === undefined ? '' : ` ${hour}:${minute}${second === undefined ? '' : `:${second}${fraction ? fraction.replace('.', ',') : ''}`}`;
  const notes = [];
  if (value.precision === 'date') notes.push('bare dato');
  else if (value.precision === 'minute') notes.push('uten sekunder');
  if (hour !== undefined && !zone) notes.push('tidssone ukjent');
  return { text: `${day}.${month}.${year}${time}${zone === 'Z' ? ' UTC' : zone ? ` (${zone})` : ''}`, notes };
}

export function photoMetadataSourceLabel(field, provenance) {
  if (!provenance) return null;
  if (provenance.kind === 'manual') return provenance.mode === 'bulk' ? 'Manuell (samme verdi for flere)' : 'Manuell';
  if (provenance.kind === 'exif') return field === 'captureTime' ? 'EXIF DateTimeOriginal' : 'EXIF Artist';
  if (provenance.kind === 'gml') return `GML${provenance.sourceFilename ? ` · ${provenance.sourceFilename}` : ''}`;
  return photoSourceLabel(provenance.kind);
}

export function photoDirectionSourceLabel(direction) {
  if (!direction) return null;
  if (direction.acceptance === 'staged') return 'Endret – ikke lagret';
  if (direction.basis?.kind === 'manual') return direction.basis.mode === 'bulk' ? 'Manuell (samme verdi for flere)' : 'Manuell';
  if (direction.basis?.kind === 'exif') return 'EXIF bilderetning (sann nord)';
  if (direction.basis?.kind === 'gml') return `GML${direction.basis.sourceFilename ? ` · ${direction.basis.sourceFilename}` : ''}`;
  return photoSourceLabel(direction.basis?.kind);
}

// "Grunnlag" for the accepted position. Import placement and the source workflow both record an explicit
// candidate choice, so the label names the evidence rather than claiming one particular tool.
export function photoPlacementBasisLabel(current) {
  if (!current) return null;
  if (current.acceptance === 'staged') return 'Endret – ikke lagret';
  if (current.acceptance === 'manual' || current.basis?.kind === 'manual') return 'Manuelt plassert';
  if (current.acceptance === 'explicit-candidate') return 'Valgt fra kildeposisjon';
  return 'Fra import';
}

// Usable evidence values for one field that disagree with each other.
export function photoMetadataConflict(photo, field) {
  return evidenceValuesConflict((photo.metadataEvidence || []).filter((item) => item.field === field && item.value), field);
}

// One line per source value, so a GML heading can never read as if it came from the image.
export function photoDirectionEvidenceText(item) {
  const source = `${photoSourceLabel(item.kind)}${item.sourceFilename ? ` · ${item.sourceFilename}` : ''}`;
  if (item.status === 'usable') return `${source}: ${item.value}° fra geografisk nord`;
  if (item.status === 'usable-zero') return `${source}: 0° kan bety at retningen mangler i kildesystemet.`;
  if (item.status !== 'unsupported-reference') return `${source}: Ugyldig retningsverdi.`;
  return `${source}: ${item.kind === 'gml' ? 'Ukjent enhet eller referanse' : 'Ukjent eller magnetisk referanse'}; krever gjennomgang.`;
}
