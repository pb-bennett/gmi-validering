import { assertDeliveryPlan, recordDeliveryDownload } from './deliveryPlan.mjs';
import { buildDeliveryPackage } from './deliveryPackage.mjs';
import { photoExportDiagnosticLabel } from '../photos/export/photoExportDiagnostics.mjs';
import { describeExportNameCharacter, exportNameUncommonCharacters, EXPORT_PACKAGE_PATH_NOTICE_LENGTH } from '../photos/export/photoExportNaming.mjs';
import { describeGmiObject, gmiEditMessage } from '../gmiEditView.mjs';
import { isGmiFieldEditReservedColumn } from '../gmi-edit/changeSet.mjs';
import { activeGmiHyperlinkTransferSet, isGmiHyperlinkTransferSet } from '../gmi-edit/session.mjs';

export const DELIVERY_CHOICES = Object.freeze([
  { mode: 'gmi-only', title: 'Kun GMI', text: 'Revidert GMI med feltrettinger fra Rettinger. Eksisterende bildelenker beholdes.' },
  { mode: 'photos-only', title: 'Kun GML med bilder', text: 'GML med bildeplasseringer, retning og metadata, sammen med originalbildene i en ZIP-fil. GMI endres ikke.' },
  { mode: 'split', title: 'Delt levering (GMI + GML)', text: 'GMI + GML + bilder. Bildelenker som er overført til GML eller valgt Ikke med, fjernes fra eksportert GMI. Feltrettinger fra Rettinger utelates.' },
  { mode: 'combined', title: 'Samlet levering (GMI + GML)', text: 'GMI med feltrettinger + GML + bilder. Bildelenker som er overført til GML eller valgt Ikke med, fjernes fra eksportert GMI.' },
]);
export const DELIVERY_STEPS = Object.freeze([{ key: 'content', label: 'Innhold' }, { key: 'review', label: 'Kontroll' }, { key: 'package', label: 'Pakke / Last ned' }]);
export const DELIVERY_WIZARD_START = Object.freeze({ step: 'content', run: 0, phase: 'idle', review: null, error: null, recorded: true });

export function deliverySurveySelection({ sources, explicit, stored, isSelectable, isAvailable, isLive }) {
  if (explicit === '' || (explicit && isSelectable(explicit))) return explicit;
  const ids = new Set();
  for (const source of sources || []) {
    const binding = source.loadedBinding;
    if (source.kind === 'gmi' && binding?.live === true && isLive(binding)) ids.add(binding.layerId);
  }
  if (ids.size === 1) return ids.values().next().value;
  return stored && isAvailable(stored) ? stored : '';
}

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
  'loaded-gmi-binding-required': 'Koble fotolaget til den samme GMI-filen lastet inn som kartlag. Velg et tilknyttet fotolag, eller bruk Kun GMI / Kun GML med bilder.',
  'field-exclusion-required': 'Bekreft i Innhold at feltrettingene skal utelates, eller velg Samlet levering.',
  'retained-photo-unresolved': 'En bildelenke som beholdes i GMI mangler en entydig originalfil. Last inn riktig bilde og kontroller koblingen i FOTO.',
  'missing-attachment': 'En nødvendig originalfil mangler eller er tom. Last inn bildet på nytt i FOTO.',
  'unreadable-attachment': 'En originalfil kan ikke leses. Last inn filen på nytt og gjenta kontrollen.',
  'attachment-size-mismatch': 'En originalfil kunne ikke leses i sin helhet. Last inn filen på nytt.',
  'attachment-changed': 'En originalfil er endret etter kontrollen. Gå tilbake og kontroller leveransen på nytt.',
  'stale-plan': 'Data eller valg er endret etter kontrollen. Gå tilbake til Innhold og kontroller leveransen på nytt.',
  // Batch 1B.3A: active hyperlink transfers are composed into the delivery; these are its fail-closed reasons.
  'hyperlink-transfer-photo-unverified': 'Flyttede bildelenker kan ikke bekreftes mot FOTO. Angre eller forkast flyttingen i Rettinger, eller kontroller FOTO-kilden, før du lager leveransen.',
  // Only Kun GML med bilder can reach this: several GMI files bound to the photo layer each hold moved links. Any number of
  // moved photographs within one GMI file is supported.
  'hyperlink-transfer-multiple': 'Flere GMI-filer koblet til fotolaget har flyttede bildelenker. Kun GML med bilder kan bare ta med flyttinger fra én GMI-fil. Angre flyttingene i de andre GMI-filene i Rettinger.',
  'hyperlink-transfer-unplaced-withheld': 'Bildet var uplassert før bildelenken ble flyttet, og er ikke tatt med i GML. Bekreft i Innhold at det skal plasseres på mottakerens GMI-posisjon, eller plasser det i FOTO.',
  'hyperlink-transfer-other-gmi': 'Bildelenkene er flyttet i en annen GMI-fil enn den valgte. Velg den GMI-filen, eller angre flyttingen i Rettinger.',
  'hyperlink-transfer-other-photo-layer': 'Bildelenkene er flyttet for et annet fotolag. Velg det fotolaget for leveransen, eller angre flyttingen i Rettinger.',
  'removal-overlaps-transfer': 'Et leveringsvalg gjelder en bildelenke som er flyttet til et annet punktobjekt. Flyttingen beholder lenken i GMI.',
  'transfer-replan-mismatch': 'Flyttingen av bildelenker kan ikke gjenskapes mot originalfilen. Angre flyttingen i Rettinger og gjør den på nytt.',
  'revised-gmi-association-mismatch': 'Den reviderte GMI-filen gir ikke de forventede bildekoblingene. Ingen fil ble laget.',
  'revised-gmi-attachment-mismatch': 'Bildelenkene i den reviderte GMI-filen samsvarer ikke med vedleggene i pakken. Ingen fil ble laget.',
  'blocked-plan': 'Leveransen har blokkerende feil. Rett feilene og kontroller på nytt.',
  'foreign-exclusion-source': 'En utelatt plassering gjelder en annen GMI-kilde. Avklar leveringsvalget i FOTO eller lag en egen leveranse for kilden.',
  'multi-link-wrapper': 'Bildelenken kan ikke fjernes sikkert: samme omslag inneholder flere lenker. Behold plasseringen i GMI eller avklar kildefilen.',
  'unsupported-wrapper-separator': 'Bildelenken kan ikke fjernes sikkert: skilletegnet mellom lenkene støttes ikke. Behold plasseringen i GMI eller avklar kildefilen.',
  'unresolved-decisions': 'Et leveransevalg krever gjennomgang. Kontroller Samlet levering for den aktuelle plasseringen i FOTO.',
  'foreign-transfer-source': 'En overføring gjelder en annen GMI-kilde. Behold den lenken eller lag en egen leveranse for kilden.',
  'multiple-gmi-sources': 'Leveringsvalgene gjelder flere GMI-kilder. Én leveranse kan bare inneholde én GMI-kilde.',
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
  'download-failed': 'Nedlastingen kunne ikke startes. Ingen rettinger er merket som lastet ned. Prøv igjen.',
};
export function deliveryMessage(item) {
  const code = typeof item === 'string' ? item : item?.code;
  if (messages[code]) return messages[code];
  if (typeof item?.message === 'string' && photoExportDiagnosticLabel(code) !== code) return item.message;
  return gmiEditMessage(code, 'Leveransen kunne ikke kontrolleres sikkert. Kontroller kildefilen, koblingene og fotoopplysningene, og prøv igjen.');
}
// C1.5: accepted filename-derived, estimated and technically completed capture times are the user's decisions: Informasjon.
const informational = new Set(['experimental-mapping', 'compatibility-import', 'compatibility-z', 'compatibility-time', 'compatibility-metadata',
  'associations-omitted', 'shared-attachments', 'retained-path-outside-attachments',
  'capture-time-filename', 'capture-time-estimated', 'capture-time-technical']);
export function deliveryDiagnostics(plan) {
  const groups = { errors: [], warnings: [], info: [] };
  for (const item of plan.errors) groups.errors.push({ ...item, text: deliveryMessage(item) });
  for (const item of plan.warnings) groups[informational.has(item.code) ? 'info' : 'warnings'].push({ ...item, text: deliveryMessage(item) });
  groups.warnings.push(...deliveryNameCompatibility(plan));
  return groups;
}
/**
 * Batch 2C: advisory checks of the package's names, derived from the plan. They never change the plan, a name, an
 * identifier or a byte, and never block. The descriptive filename is checked where it is typed (the filename editor);
 * here: attachment names, which come from the photographs (and GMI links) and are kept as they are, and the longest
 * path after extraction. Where the package is extracted is unknown to the application.
 */
export function deliveryNameCompatibility(plan) {
  const items = [];
  if (!plan?.naming) return items;
  const attachments = (plan.attachments || []).filter((item) => exportNameUncommonCharacters(item.path).length);
  if (attachments.length) {
    const characters = [...new Set(attachments.flatMap((item) => exportNameUncommonCharacters(item.path)))];
    const examples = attachments.slice(0, 3).map((item) => item.filename || item.path.split('/').at(-1));
    items.push({ code: 'package-name-characters', text: `${attachments.length} bildenavn i leveransen har tegn som ikke alle programmer håndterer i filnavn: `
      + `${characters.map(describeExportNameCharacter).join(', ')} (${examples.join(', ')}${attachments.length > examples.length ? ' …' : ''}). `
      + 'Navnene kommer fra bildefilene og eventuelle GMI-lenker og endres ikke. Kontroller at mottakerens program kan åpne dem.' });
  }
  const zip = plan.mode !== 'gmi-only';
  const paths = deliveryContents(plan).map((path) => zip ? `${plan.naming.basename}/${path}` : path);
  const longest = Math.max(0, ...paths.map((path) => [...path].length));
  if (longest > EXPORT_PACKAGE_PATH_NOTICE_LENGTH) {
    items.push({ code: 'package-path-length', text: `Den lengste stien i leveransen er ${longest} tegn${zip ? ', regnet fra mappen ZIP-filen pakkes ut i' : ''}. `
      + 'Hvor filene pakkes ut, vet ikke appen, og den plasseringen kommer i tillegg. Enkelte Windows-programmer kan ikke åpne filer med svært lange stier: '
      + 'pakk ut nær roten av disken, eller bruk et kortere filnavn.' });
  }
  return items;
}
export function deliveryContents(plan) {
  return [...(plan.mode !== 'photos-only' ? [plan.naming.gmiFilename] : []), ...(plan.photoPlan ? [plan.naming.gmlFilename] : []), ...plan.attachments.map((item) => item.path)];
}
/**
 * Field corrections counted apart from hyperlink transfers. A «Flytt til punktobjekt» transfer set is a history entry,
 * and its S_HYPERLINK cells are changed cells, but it is not a field correction: Delt levering leaves out field
 * corrections only, and always delivers the moved links. `view` is the useGmiEditLayer view; `status` the fallback.
 */
export function deliveryCorrectionCounts(view, status = null) {
  if (!view?.session) return Object.freeze({ fieldChangeSets: status?.changeSetCount ?? 0, fieldCells: status?.changedCells ?? 0, movedPhotos: 0, movedReferences: 0 });
  const transfer = activeGmiHyperlinkTransferSet(view.session);
  return Object.freeze({
    fieldChangeSets: view.session.changeSets.filter((entry) => !isGmiHyperlinkTransferSet(entry)).length,
    fieldCells: view.changedCells.filter((cell) => !cell.hyperlinkTransfer).length,
    movedPhotos: transfer ? new Set(transfer.transfers.map((item) => item.assetId)).size : 0,
    movedReferences: transfer ? transfer.transfers.reduce((sum, item) => sum + item.referenceIds.length, 0) : 0,
  });
}
/**
 * Field corrections in the exported GMI, never the S_HYPERLINK cells of a moved photo link (Batch 1B.4B). The
 * composition and removal paths report `fieldEditCount`; the Kun GMI export reports the transfer's own count, and
 * otherwise only its diff, whose reserved S_HYPERLINK changes are not field corrections.
 */
export function deliveryFieldCorrectionCount(plan) {
  const summary = plan?.gmiSummary;
  if (!summary) return 0;
  if (Number.isInteger(summary.fieldEditCount)) return summary.fieldEditCount;
  if (Number.isInteger(summary.hyperlinkTransfer?.fieldEditCount)) return summary.hyperlinkTransfer.fieldEditCount;
  const changes = summary.diff?.changes ?? summary.changes;
  return Array.isArray(changes) ? changes.filter((item) => !isGmiFieldEditReservedColumn(item.field)).length : summary.changedCells ?? 0;
}
export function deliverySummary({ plan, fieldCount = 0 }) {
  const count = (value, one, many) => `${value} ${value === 1 ? one : many}`;
  const fields = deliveryFieldCorrectionCount(plan);
  const corrections = plan.mode === 'split' ? fieldCount ? `${count(fieldCount, 'feltretting', 'feltrettinger')} utelates (uttrykkelig valgt)` : 'Ingen feltrettinger'
    : plan.mode === 'photos-only' ? 'Ingen GMI-eksport; rettingene beholdes i Rettinger'
      : fields ? `${count(fields, 'feltretting', 'feltrettinger')} tas med` : 'Ingen feltrettinger';
  const counts = plan.counts, coordinated = ['combined', 'split'].includes(plan.mode);
  const kept = counts.retainedReferences;
  return [
    ['Leveranse', DELIVERY_CHOICES.find((item) => item.mode === plan.mode).title], ['Rettinger', corrections],
    ['Bildelenker', plan.mode === 'photos-only' ? 'GMI endres ikke' : plan.status !== 'ready' ? 'Ingen endringer kan leveres før feilene er rettet'
      : !coordinated ? `${kept ?? 'Alle'} beholdes i GMI`
        : `${kept} beholdes i GMI · ${counts.transferredReferences} overføres til GML · ${counts.excludedReferences} fjernet (ikke med)`],
    ['Bilder', plan.mode === 'gmi-only' ? 'Ingen bildefiler legges ved; eksisterende bildelenker beholdes' : count(counts.includedAssets, 'bilde i leveransen', 'bilder i leveransen')],
    ...(coordinated ? [['Plasseringer', `${counts.gmiPlacements ?? 0} i GMI · ${counts.gmlPlacements} i GML`]] : []),
    // Batch 1B.3A: photographs (assets) and hyperlink references moved to another point object, counted apart.
    // Delt levering leaves out field corrections but always includes the moved links; the row says so.
    ...(counts.hyperlinkTransfers ? [['Flyttede bildelenker', plan.mode === 'photos-only'
      ? [...(counts.hyperlinkTransferGmlAssets || !counts.hyperlinkTransferWithheldAssets ? [`${count(counts.hyperlinkTransferGmlAssets, 'bilde', 'bilder')} plassert på mottakerens GMI-posisjon i GML`] : []),
        ...(counts.hyperlinkTransferWithheldAssets ? [`${count(counts.hyperlinkTransferWithheldAssets, 'bilde', 'bilder')} ikke tatt med (uplassert før flyttingen, ikke bekreftet)`] : [])].join(' · ')
      : `${plan.mode === 'split' ? 'Inkluderes: ' : ''}${count(counts.hyperlinkTransferAssets, 'bilde', 'bilder')} · ${count(counts.movedReferences, 'bildereferanse', 'bildereferanser')} flyttet til et annet punktobjekt i GMI`]] : []),
    ['GML', `${count(plan.counts.features, 'post', 'poster')} i GML`], ['Vedlegg', count(plan.counts.attachments, 'fil', 'filer')],
    ...(counts.excludedOccurrences ? [['Ikke med', `${count(counts.excludedOccurrences, 'plassering', 'plasseringer')} valgt · ${count(counts.excludedEntirelyAssets, 'bilde', 'bilder')} helt ute · ${count(counts.partialAssets, 'bilde', 'bilder')} delvis med`]] : []),
    ...(counts.notNeededAssets ? [['Ikke valgt', `${count(counts.notNeededAssets, 'bilde', 'bilder')} ikke valgt og ikke påkrevd av GMI`]] : []),
    ...(counts.unresolvedOccurrences || counts.blockedOccurrences ? [['Krever gjennomgang', `${counts.unresolvedOccurrences} uavklarte · ${counts.blockedOccurrences} blokkerte plasseringer`]] : []),
    ['Filnavn', plan.filename],
  ];
}
/** Kontroll summary: the report summary without the filename, which Pakke shows. */
export const deliveryReviewSummary = (review) => deliverySummary(review).filter(([label]) => label !== 'Filnavn');

export function deliveryExclusionNote(mode, count) {
  if (!count || !['gmi-only', 'photos-only'].includes(mode)) return null;
  return `${count} ${count === 1 ? 'plassering har' : 'plasseringer har'} leveringsvalget Ikke med. ${mode === 'gmi-only'
    ? 'Kun GMI bruker ikke disse valgene; alle eksisterende bildelenker beholdes, og ingen bildefiler legges ved.'
    : 'Kun GML med bilder bruker ikke disse valgene; alle godkjente, plasserte forekomster vurderes etter den uavhengige fotoeksporten. GMI endres ikke.'}`;
}

/** The UI and TXT share exactly the same artifact facts. Never claim a blocked removal happened. */
export function deliveryExclusionLines(plan) {
  return (plan.photoDelivery?.exclusions || []).map((row) => `${row.filename} · ${row.objectLabel}: ${plan.photoDelivery.applied
    ? `bildelenke fjernet (${row.removedReferences}) · ${row.deliveredElsewhere
      ? `bildefilen er fortsatt med via ${row.remaining.join('; ')}` : 'bildefilen er ikke med i leveransen'}`
    : 'bildelenke ikke fjernet; leveransen er blokkert'}`);
}
/** Pakke: one compact line about the package (files, photos, GML records). */
export function deliveryPackageFacts(plan) {
  const count = (value, one, many) => `${value} ${value === 1 ? one : many}`;
  return [count(deliveryContents(plan).length, 'fil', 'filer'),
    ...(plan.counts.includedAssets > 0 ? [count(plan.counts.includedAssets, 'bilde', 'bilder')] : []),
    ...(plan.photoPlan ? [`${count(plan.counts.features, 'post', 'poster')} i GML`] : [])];
}
/**
 * Pakke: one status line pointing back to Kontroll. Notes are the «Bør
 * kontrolleres» items plus any photo readiness warning shown there;
 * informational items are not counted.
 */
export function deliveryReviewStatus(plan, extraNotes = 0) {
  const notes = deliveryDiagnostics(plan).warnings.length + extraNotes;
  return `Kontroll fullført · ${notes === 0 ? 'ingen merknader' : `${notes} ${notes === 1 ? 'merknad' : 'merknader'}`}`;
}

/**
 * Report lines for the exported GMI changes, named by the parser's object
 * number (never the array position) plus GUID. S_HYPERLINK changes come from
 * photo-link transfer or exclusion (M7), and are listed apart from field corrections.
 */
export function deliveryReportChanges(plan) {
  const changes = plan.gmiSummary?.diff?.changes ?? plan.gmiSummary?.changes ?? [];
  const line = (item) => `${describeGmiObject(item.scope, item.sourceIndex, item.objectId)}${item.guid ? ` (GUID ${item.guid})` : ''}`
    + ` · ${item.field}: ${item.original} → ${item.proposed}`;
  return { fields: changes.filter((item) => !isGmiFieldEditReservedColumn(item.field)).map(line),
    hyperlinks: changes.filter((item) => isGmiFieldEditReservedColumn(item.field)).map(line) };
}
export function deliveryReport(review) {
  const { plan } = review, groups = deliveryDiagnostics(plan), changes = deliveryReportChanges(plan);
  const note = deliveryExclusionNote(plan.mode, plan.photoDelivery?.ignoredExclusions);
  const exclusions = deliveryExclusionLines(plan);
  return ['Leveranserapport', ...deliverySummary(review).map(([label, value]) => `${label}: ${value}`),
    `Eksportkontroll: ${plan.status === 'ready' ? 'Eksportkontroll fullført – kan genereres' : 'Blokkert'}`,
    'Eksportkontroll er ikke en ny Validator-kjøring eller full XSD-sertifisering. Originalfilen endres ikke.',
    'Leveranserapporten lastes ned separat og er ikke med i ZIP-filen.', '', 'Innhold:', ...deliveryContents(plan), '',
    ...(note ? [note, ''] : []),
    ...Object.entries(groups).flatMap(([key, items]) => [({ errors: 'Feil', warnings: 'Advarsler', info: 'Informasjon' })[key],
      ...items.map((item) => `- ${[item.filename, item.objectLabel].filter(Boolean).join(' · ')}${item.filename || item.objectLabel ? ': ' : ''}${item.text}`), '']),
    ...(plan.photoDelivery?.transfers.length ? ['Overført til GML:', ...plan.photoDelivery.transfers.map((row) =>
      `${row.filename} · ${row.objectLabel}: ${plan.photoDelivery.applied ? `bildelenke fjernet for overføring til GML (${row.removedReferences})` : 'overføring blokkert; bildelenke ikke fjernet'}`), ''] : []),
    ...(exclusions.length ? ['Ikke med i leveransen:', ...exclusions, ''] : []),
    ...(plan.photoDelivery?.hyperlinkTransfers?.length ? ['Flyttet til et annet punktobjekt:', ...plan.photoDelivery.hyperlinkTransfers.map((row) =>
      `${row.filename} · ${row.fromLabel} → ${row.toLabel}: ${!plan.photoDelivery.hyperlinkTransfersApplied ? 'flytting ikke levert; leveransen er blokkert'
        : row.withheld ? 'ikke tatt med i GML (uplassert før flyttingen, ikke bekreftet)'
          : `${row.referenceCount} ${row.referenceCount === 1 ? 'bildereferanse' : 'bildereferanser'}${plan.mode === 'photos-only' ? ' · plassert på mottakerens GMI-posisjon i GML' : ''}`}`), ''] : []),
    'Feltendringer:', ...changes.fields,
    ...(changes.hyperlinks.length ? ['', 'Bildelenker endret:', ...changes.hyperlinks] : []),
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
