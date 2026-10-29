import { DOMParser } from '@xmldom/xmldom';

// XML only: no HTML mode, script execution, resource/schema loader or recovery.
// M2 rejects DTD/ENTITY before this adapter is invoked. Never emit diagnostics:
// parser messages can contain provider data, and M2 sanitizes thrown errors.
export function parseNodeXml(xml) {
  const document = new DOMParser({
    onError() { throw new Error('Invalid XML'); },
  }).parseFromString(xml, 'application/xml');
  // xmldom validates declaration syntax/position but retains it as a PI.
  // Native DOMParser omits it. Remove only that validated leading declaration;
  // every actual processing instruction remains for M2's unsafe-XML check.
  const first = document.firstChild;
  if (first?.nodeType === 7 && first.target === 'xml') document.removeChild(first);
  return document;
}
