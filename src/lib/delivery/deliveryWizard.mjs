import { assertDeliveryPlan, recordDeliveryDownload } from './deliveryPlan.mjs';
import { buildDeliveryPackage } from './deliveryPackage.mjs';
import { photoExportDiagnosticLabel } from '../photos/export/photoExportDiagnostics.mjs';
import { gmiEditMessage } from '../gmiEditView.mjs';

export const DELIVERY_CHOICES = Object.freeze([
  { mode: 'gmi-only', title: 'Kun GMI', text: 'Revidert GMI med rettinger fra Rettinger. Alle bildelenker beholdes.' },
  { mode: 'photos-only', title: 'Kun FOTO', text: 'GML og originalbilder for alle godkjente plasseringer. GMI og valgene om overføring endres ikke.' },
  { mode: 'split', title: 'Delt levering', text: 'GMI, valgt FOTO-leveranse og vedlegg. Bare uttrykkelig overførte bildelenker fjernes. Feltrettinger utelates.' },
  { mode: 'combined', title: 'Samlet levering', text: 'GMI med feltrettinger, valgt FOTO-leveranse og vedlegg. Bare uttrykkelig overførte bildelenker fjernes.' },
]);
export const DELIVERY_STEPS = Object.freeze([{ key: 'content', label: 'Innhold' }, { key: 'review', label: 'Kontroll' }, { key: 'package', label: 'Pakke / Last ned' }]);
export const DELIVERY_WIZARD_START = Object.freeze({ step: 'content', run: 0, phase: 'idle', review: null, error: null, recorded: true });

export function deliveryWizardReducer(state, action) {
  if (action.type === 'build') return action.run > state.run && state.phase !== 'packaging'
    ? { ...DELIVERY_WIZARD_START, step: 'review', phase: 'building', run: action.run } : state;
  if (action.type === 'back') return state.phase === 'packaging' ? state
    : { ...DELIVERY_WIZARD_START, run: state.run + 1 };
  if (action.run !== state.run) return state;
  switch (action.type) {
    case 'built': return state.phase === 'building' ? { ...state, phase: 'reviewed', review: action.review } : state;
    case 'build-failed': return state.phase === 'building' ? { ...state, phase: 'failed', error: action.error } : state;
    case 'package': return deliveryWizardStatus(state) === 'ready' ? { ...state, step: 'package' } : state;
    case 'review': return state.step === 'package' && ['ready', 'done', 'download-failed'].includes(deliveryWizardStatus(state))
      ? { ...state, step: 'review', phase: 'reviewed', error: null } : state;
    case 'download': return state.step === 'package' && ['ready', 'done', 'download-failed'].includes(deliveryWizardStatus(state))
      ? { ...state, phase: 'packaging', error: null } : state;
    case 'downloaded': return state.phase === 'packaging' ? { ...state, phase: 'done', recorded: action.recorded } : state;
    case 'download-failed': return state.phase === 'packaging' ? { ...state, phase: 'download-failed', error: action.error } : state;
    case 'invalidate': return state.review ? { ...state, phase: 'stale', error: null } : state;
    default: return state;
  }
}
export function deliveryWizardStatus(state) {
  if (state.phase === 'stale') return 'stale';
  if (state.phase === 'building' || state.phase === 'packaging') return state.phase;
  if (!state.review) return state.phase;
  if (!state.review.plan.isLive()) return 'stale';
  if (state.review.plan.status !== 'ready') return 'blocked';
  return ['done', 'download-failed'].includes(state.phase) ? state.phase : 'ready';
}

const messages = {
  'loaded-gmi-binding-required': 'Koble fotolaget til den samme GMI-filen lastet inn som kartlag. Velg et tilknyttet fotolag, eller bruk Kun GMI / Kun FOTO.',
  'field-exclusion-required': 'Bekreft i Innhold at feltrettingene skal utelates, eller velg Samlet levering.',
  'retained-photo-unresolved': 'En bildelenke som beholdes i GMI mangler en entydig originalfil. Last inn riktig bilde og kontroller koblingen i FOTO.',
  'missing-attachment': 'En nødvendig originalfil mangler eller er tom. Last inn bildet på nytt i FOTO.',
  'unreadable-attachment': 'En originalfil kan ikke leses. Last inn filen på nytt og gjenta kontrollen.',
  'attachment-size-mismatch': 'En originalfil kunne ikke leses i sin helhet. Last inn filen på nytt.',
  'attachment-changed': 'En originalfil er endret etter kontrollen. Gå tilbake og kontroller leveransen på nytt.',
  'stale-plan': 'Data eller valg er endret etter kontrollen. Gå tilbake til Innhold og kontroller leveransen på nytt.',
  'blocked-plan': 'Leveransen har blokkerende feil. Rett feilene og kontroller på nytt.',
  'unresolved-decisions': 'Et leveransevalg krever gjennomgang. Kontroller Samlet levering for den aktuelle plasseringen i FOTO.',
  'foreign-transfer-source': 'En overføring gjelder en annen GMI-kilde. Behold den lenken eller lag en egen leveranse for kilden.',
  'multiple-gmi-sources': 'Overføringene gjelder flere GMI-kilder. Én leveranse kan bare inneholde én GMI-kilde.',
  'gmi-source-not-live': 'GMI-kilden er ikke lenger tilgjengelig. Last inn og koble riktig kartlag på nytt.',
  'included-photo-ambiguously-referenced': 'Et valgt bilde har en uavklart GMI-kobling. Avklar koblingen før samlet levering.',
  'selected-photo-not-exported': 'En valgt plassering kunne ikke tas med i GML. Godkjenn plassering og opplysninger i FOTO, eller endre leveransevalget.',
  'photo-record-count-mismatch': 'Valgte plasseringer og GML-poster samsvarer ikke. Kontroller leveransevalgene i FOTO.',
  'invalid-gml': 'GML-kontrollen mislyktes. Ingen bildelenker fjernes. Kontroller fotoopplysningene og prøv igjen.',
  'unsafe-retained-path': 'En beholdt bildelenke har en filsti som ikke kan pakkes sikkert. Bruk Kun GMI eller avklar kilden; lenken omskrives ikke automatisk.',
  'reserved-path-collision': 'Beholdte bildelenker har kolliderende filstier. Avklar filene og koblingene før pakking.',
  'attachment-path-conflict': 'En vedleggssti kolliderer med en mappe. Avklar kilden før pakking.',
  'shared-path-not-gml-compatible': 'Et delt bilde har ingen beholdt sti som passer GML-leveransen. Avklar bildelenken før samlet levering.',
  'retained-path-outside-attachments': 'En beholdt bildelenke ligger utenfor Attachments/. Filen legges ved på sin opprinnelige relative sti.',
  'photo-linked-elsewhere': 'Samme bilde er fortsatt lenket fra et annet objekt. Den lenken og den nødvendige originalfilen beholdes.',
  'gemini-g4-unverified': 'Fjerning og omnummerering av bildelenker i revidert GMI er ikke akseptansetestet i Gemini VA. Kontroller leveransen før videre bruk.',
  'download-failed': 'Nedlastingen kunne ikke startes. Ingen rettinger er merket som lastet ned. Prøv igjen.',
};
export function deliveryMessage(item) {
  const code = typeof item === 'string' ? item : item?.code;
  if (messages[code]) return messages[code];
  if (typeof item?.message === 'string' && photoExportDiagnosticLabel(code) !== code) return item.message;
  return gmiEditMessage(code, 'Leveransen kunne ikke kontrolleres sikkert. Kontroller kildefilen, koblingene og fotoopplysningene, og prøv igjen.');
}
const informational = new Set(['experimental-mapping', 'compatibility-import', 'compatibility-z', 'compatibility-time', 'compatibility-metadata',
  'associations-omitted', 'shared-attachments', 'path-convention', 'retained-path-outside-attachments']);
export function deliveryDiagnostics(plan) {
  const groups = { errors: [], warnings: [], info: [] };
  for (const item of plan.errors) groups.errors.push({ ...item, text: deliveryMessage(item) });
  for (const item of plan.warnings) groups[informational.has(item.code) ? 'info' : 'warnings'].push({ ...item, text: deliveryMessage(item) });
  return groups;
}
export function deliveryContents(plan) {
  return [...(plan.mode !== 'photos-only' ? [plan.naming.gmiFilename] : []), ...(plan.photoPlan ? [plan.naming.gmlFilename] : []), ...plan.attachments.map((item) => item.path)];
}
export function deliverySummary({ plan, snapshot, fieldCount = 0 }) {
  const count = (value, one, many) => `${value} ${value === 1 ? one : many}`;
  const fields = plan.gmiSummary?.fieldEditCount ?? plan.gmiSummary?.changedCells ?? 0;
  const corrections = plan.mode === 'split' ? `${count(fieldCount, 'feltretting', 'feltrettinger')} utelates (uttrykkelig valgt)`
    : plan.mode === 'photos-only' ? 'Ingen GMI-eksport; rettingene beholdes i Rettinger'
      : `${count(fields, 'feltretting', 'feltrettinger')} tas med`;
  const removed = plan.gmiSummary?.removalCounts?.removedReferences ?? 0;
  const kept = snapshot.source?.references.filter((item) => item.targetValid).length;
  return [
    ['Leveranse', DELIVERY_CHOICES.find((item) => item.mode === plan.mode).title], ['Rettinger', corrections],
    ['Bildelenker', plan.mode === 'photos-only' ? 'GMI endres ikke' : kept === undefined ? 'Alle beholdes i GMI'
      : `${kept - removed} beholdes i GMI · ${removed} overføres`],
    ['FOTO', `${count(plan.counts.features, 'post', 'poster')} i GML`], ['Vedlegg', count(plan.counts.attachments, 'fil', 'filer')],
    ['Filnavn', plan.filename],
  ];
}
export function deliveryReport(review) {
  const { plan } = review, groups = deliveryDiagnostics(plan);
  const changes = plan.gmiSummary?.diff?.changes ?? plan.gmiSummary?.changes ?? [];
  return ['Leveranserapport', ...deliverySummary(review).map(([label, value]) => `${label}: ${value}`),
    `Eksportkontroll: ${plan.status === 'ready' ? 'Godkjent for pakking' : 'Blokkert'}`,
    'Eksportkontroll er ikke en ny Validator-kjøring eller Gemini-akseptanse. Originalfilen endres ikke.',
    '', 'Innhold:', ...deliveryContents(plan), '',
    ...Object.entries(groups).flatMap(([key, items]) => [({ errors: 'Feil', warnings: 'Advarsler', info: 'Informasjon' })[key], ...items.map((item) => `- ${item.text}`), '']),
    'Feltendringer:', ...changes.map((item) => `${item.scope === 'line' ? 'Ledning' : 'Punkt'} ${item.sourceIndex + 1} · ${item.field}: ${item.original} → ${item.proposed}`),
  ].join('\r\n');
}

/** The UI owns initiation; the M9 service owns every generated byte. */
export async function initiateDeliveryDownload(plan, { save, isActive = () => true, buildPackage = buildDeliveryPackage, recordDownload = recordDeliveryDownload } = {}) {
  assertDeliveryPlan(plan);
  const blob = await buildPackage(plan);
  if (!isActive()) return { started: false, recorded: false };
  assertDeliveryPlan(plan);
  await save(blob, plan.filename);
  // A synchronous source/session change triggered by the browser handoff must
  // leave the new state unsaved, while accurately reporting the initiated file.
  let recorded = false;
  try { recorded = recordDownload(plan).ok; } catch { /* Retain unsaved guard. */ }
  return { started: true, recorded };
}
