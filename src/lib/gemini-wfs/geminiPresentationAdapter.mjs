import { FCODE_COLORS } from '../map/semanticPresentation.mjs';
import { geminiFieldText } from './geminiPopupContent.mjs';

// Presentation input only. Numeric Gemini lookup IDs are not survey FCODEs.
// Recognize existing canonical codes or unambiguous Norwegian object titles;
// unknown titles remain unknown, rather than inferring a class from nettype.
export function getGeminiPresentationInput(record) {
  if (!record) return { S_FCODE: null, DIM: null };
  const raw = geminiFieldText(record, 'FCODE')?.trim().toUpperCase();
  let code = raw && (Object.hasOwn(FCODE_COLORS, raw) || ['AFO', 'SPO'].includes(raw)) ? raw : null;
  if (!code) {
    const title = geminiFieldText(record, 'FCODE_TITLE')?.trim().toUpperCase() ?? '';
    if (/^VANNLEDNING\b/u.test(title)) code = 'VL';
    else if (/^SPILLVANNS?LEDNING\b/u.test(title)) code = 'SP';
    else if (/^OVERVANNS?LEDNING\b/u.test(title)) code = 'OV';
    else if (/^DRENSLEDNING\b/u.test(title)) code = 'DR';
    else if (/^AVLØP FELLES\b/u.test(title)) code = 'AF';
    else if (/^(KUM|AVLØPSKUM|VANNKUM|SPILLVANNSKUM|OVERVANNSKUM)\b/u.test(title)) code = 'KUM';
    else if (title === 'KUMLOKK') code = 'LOK';
    else if (title === 'SLUK') code = 'SLU';
    else if (title === 'SANDFANG') code = 'SAN';
  }
  return { S_FCODE: code, DIM: geminiFieldText(record, 'DIM') };
}
