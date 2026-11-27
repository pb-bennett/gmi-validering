// Which survey files the importer accepts, by name, before any reading or parsing. Shared by the file picker path
// (FileUpload) and the drop filter (fileDragState), so the two cannot disagree. `.txt` is accepted and sniffed for
// GMI or SOSI content; every other extension is refused with its own message instead of failing as a malformed GMI.
export const SURVEY_FILE_EXTENSIONS = Object.freeze(['gmi', 'sos', 'sosi', 'kof', 'txt']);

const SUPPORTED_TEXT = 'Velg en .gmi-, .sos-, .sosi- eller .kof-fil.';

/** The lower-case extension after the last dot of the base name, or '' when there is none. */
export function surveyFileExtension(name) {
  const base = String(name ?? '').split(/[/\\]/).at(-1);
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : '';
}

export const isSupportedSurveyFileName = (name) => SURVEY_FILE_EXTENSIONS.includes(surveyFileExtension(name));

/** The import error for a refused file type. */
export function unsupportedSurveyFileMessage(name) {
  const extension = surveyFileExtension(name);
  return extension
    ? `Filtypen .${extension} støttes ikke. ${SUPPORTED_TEXT}`
    : `Filtypen støttes ikke: filen har ingen filendelse. ${SUPPORTED_TEXT}`;
}

/** A .txt file whose content is neither GMI nor SOSI: not reported as a malformed GMI. */
export const UNRECOGNISED_TEXT_FILE_MESSAGE = 'Innholdet i tekstfilen ble ikke gjenkjent som GMI eller SOSI. Kontroller at filen er en GMI- eller SOSI-fil, eller velg en .gmi-, .sos-, .sosi- eller .kof-fil.';
