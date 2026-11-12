// View helpers for the Rettinger workspace (GMI editing M4).
//
// Pure functions over the M2/M3 values the UI already holds: statuses from
// `state.gmiEditStatus`, ChangeSets from the registry, cells from M1
// `listGmiObjectCells`. Nothing here edits, patches or verifies; every
// correction still goes through `createGmiObjectCorrection` and the registry.
// User-facing text is Norwegian and never includes raw exception text.
import { checkGmiFieldDraft, gmiEditColumnPolicy } from './gmiEditFields.mjs';

export const GMI_EDIT_TABLE_VIEWS = Object.freeze({
  ORIGINAL: 'original',
  PROPOSED: 'proposed',
  CHANGED: 'changed',
});

export const GMI_EDIT_TABLE_VIEW_LABELS = Object.freeze([
  Object.freeze({ key: GMI_EDIT_TABLE_VIEWS.ORIGINAL, label: 'Original', description: 'Den innleverte GMI-filen, uendret' }),
  Object.freeze({ key: GMI_EDIT_TABLE_VIEWS.PROPOSED, label: 'Foreslått', description: 'Verdier fra den kontrollerte, foreslåtte kopien' }),
  Object.freeze({ key: GMI_EDIT_TABLE_VIEWS.CHANGED, label: 'Kun endrede', description: 'Bare objekter og felt som har rettinger' }),
]);

/** U4: presentation only; never rewrite the stored preference or its user/auto intent. */
export function gmiTableViewControls({ status, view, inRettinger = false, isInspection = false, allowIdenticalProposed = false }) {
  const available = !isInspection && ['editable', 'read-only'].includes(status?.state);
  const hasCorrections = available && status.changeSetCount > 0;
  const identicalProposed = available && inRettinger && allowIdenticalProposed;
  const effectiveView = (hasCorrections || identicalProposed && view === GMI_EDIT_TABLE_VIEWS.PROPOSED)
    && Object.values(GMI_EDIT_TABLE_VIEWS).includes(view) ? view : GMI_EDIT_TABLE_VIEWS.ORIGINAL;
  return {
    visible: available && (inRettinger || hasCorrections),
    effectiveView,
    modes: GMI_EDIT_TABLE_VIEW_LABELS.map((mode) => {
      const disabled = !available || (mode.key !== GMI_EDIT_TABLE_VIEWS.ORIGINAL && !hasCorrections
        && !(identicalProposed && mode.key === GMI_EDIT_TABLE_VIEWS.PROPOSED));
      return { ...mode, disabled, description: disabled && available
        ? 'Legg til en retting for å vise Foreslått eller Kun endrede.' : mode.description };
    }),
  };
}

/** Who set a layer's Data Table view: the user (toolbar, «Vis i Foreslått») or the workspace (handoff, staging). */
export const GMI_EDIT_TABLE_VIEW_BY = Object.freeze({ USER: 'user', AUTO: 'auto' });

/** Focus intent is independent of checkbox membership; soft requests never discard a draft. */
export function gmiObjectFocusIntent({ soft = false, batchInspector = false, dirty = false, sameObject = false }) {
  if (batchInspector) return 'inspect';
  if (sameObject) return 'focus';
  if (soft) return dirty ? 'retain' : 'focus';
  return 'guard';
}

/**
 * S5/T2: the Data Table view after a successful stage. Original (also the
 * unset default) becomes Foreslått unless the user explicitly chose Original;
 * every other view, and any explicit choice, is kept.
 */
export function gmiTableViewAfterStage(view, chosenBy) {
  const current = view || GMI_EDIT_TABLE_VIEWS.ORIGINAL;
  return current === GMI_EDIT_TABLE_VIEWS.ORIGINAL && chosenBy !== GMI_EDIT_TABLE_VIEW_BY.USER ? GMI_EDIT_TABLE_VIEWS.PROPOSED : current;
}

// ------------------------------------------------------------ messages

const MESSAGES = Object.freeze({
  // Layer / session states and open failures (M3).
  'unsupported-layer': 'Laget er ikke en GMI-fil som kan rettes.',
  'source-unavailable': 'Originalfilen er ikke tilgjengelig i denne økten. Last GMI-filen inn på nytt for å rette den.',
  'source-unreadable': 'Originalfilen kunne ikke leses på nytt. Last GMI-filen inn på nytt.',
  'loaded-gmi-unreadable': 'Originalfilen kunne ikke leses på nytt. Den kan ha blitt flyttet eller endret på disken. Last GMI-filen inn på nytt.',
  'source-fingerprint-mismatch': 'Originalfilen på disken er ikke lenger den samme som ble lastet inn. Last GMI-filen inn på nytt.',
  'layer-data-mismatch': 'Originalfilen samsvarer ikke med det innlastede laget. Last GMI-filen inn på nytt.',
  'source-stale': 'Kildefilen til laget er ikke lenger aktiv.',
  'source-bytes-mutated': 'Den interne kopien av originalfilen ble endret. Rettingene ble forkastet av sikkerhetshensyn.',
  'source-identity-mismatch': 'Rettingsøkten hører til en annen innlasting av filen.',
  'fingerprint-mismatch': 'Rettingsøkten hører til en annen versjon av filen.',
  'invalid-handle': 'Rettingsøkten er ikke lenger gyldig. Åpne Rettinger på nytt.',
  'session-disposed': 'Rettingsøkten er avsluttet. Åpne Rettinger på nytt.',
  'stale-session': 'Rettingsøkten er erstattet av en nyere. Åpne Rettinger på nytt.',
  // Read-only document reasons (M1).
  'too-large': 'Filen er for stor til å rettes i nettleseren.',
  'decoded-length-mismatch': 'Filens tegn kunne ikke avstemmes byte for byte.',
  'parser-throws': 'Filen kunne ikke tolkes.',
  'parser-errors': 'Filen har tolkingsfeil.',
  'reconciliation-failed': 'Filens struktur kunne ikke avstemmes nøyaktig med tolkingen.',
  'parser-warnings': 'Filen har tolkingsadvarsler som ikke kan forklares sikkert.',
  bom: 'Filen starter med et BOM-merke.',
  'mixed-eol': 'Filen har blandede linjeskift.',
  'cr-only-eol': 'Filen bruker bare CR som linjeskift.',
  'encoding-not-editable': 'Filens tegnkoding støttes ikke for retting.',
  'nonstandard-signature-line': 'Første linje er ikke en standard GMI-signatur.',
  'numeric-index-header': 'Filen har en numerisk _INDEX-verdi som ikke er støttet.',
  'repeated-section': 'Filen har gjentatte seksjoner.',
  'repeated-fieldnames': 'Filen har gjentatte _FIELDNAMES-linjer.',
  // Cell reasons (M1 targets).
  'document-not-editable': 'Filen kan bare vises, ikke rettes.',
  'object-not-editable': 'Objektet har uregelmessig struktur i filen og kan ikke rettes.',
  'unnamed-field': 'Kolonnen har ikke noe navn.',
  'duplicate-field-name': 'Kolonnenavnet finnes flere ganger i filen.',
  'no-value-separator': 'Verdilinjen mangler skilletegn for denne kolonnen.',
  'no-value': 'Objektet har ingen verdiplass for denne kolonnen i filen. Nye verdiplasser kan ikke legges til.',
  'field-absent': 'Kolonnen finnes ikke i filen. Nye kolonner kan ikke legges til her.',
  'field-owned-by-photo-delivery': 'Bildelenker (S_HYPERLINK) styres av bildeleveransen og kan ikke rettes her.',
  'identifier-column': 'Identifikatorer kan ikke rettes.',
  'cell-not-indexed': 'Verdien kunne ikke plasseres sikkert i filen.',
  // Lexeme validation (M1 encoding policy).
  'lexeme-semicolon': 'Semikolon (;) kan ikke brukes i en GMI-verdi.',
  'lexeme-line-break': 'Linjeskift kan ikke brukes i en GMI-verdi.',
  'lexeme-control-character': 'Verdien inneholder et kontrolltegn, for eksempel tabulator.',
  'lexeme-c1-control': 'Verdien inneholder et ugyldig kontrolltegn.',
  'lexeme-unrepresentable': 'Verdien inneholder et tegn som ikke kan lagres i filens tegnkoding.',
  'lexeme-non-ascii-in-utf8': 'Denne filen er UTF-8-kodet. Bare tegn uten æ, ø, å og andre spesialtegn kan skrives inn.',
  'lexeme-not-string': 'Verdien er ugyldig.',
  'decoder-not-single-byte': 'Nettleseren tolker ikke filens tegnkoding sikkert.',
  // ChangeSet build / stage (M2).
  'no-requests': 'Ingen felt er endret.',
  'object-not-found': 'Objektet finnes ikke i filen.',
  'object-identity-mismatch': 'Objektets nummer eller GUID stemmer ikke med filen.',
  'duplicate-target': 'Samme felt er oppgitt flere ganger.',
  'stale-change-set': 'Rettingene ble endret i mellomtiden. Se gjennom endringen på nytt.',
  'foreign-change-set': 'Endringen hører til en annen rettingsøkt.',
  'document-mismatch': 'Endringen hører til en annen fil.',
  'already-staged': 'Endringen er allerede lagt til.',
  'not-a-change-set': 'Endringen er ugyldig.',
  'nothing-to-undo': 'Det er ingenting å angre.',
  'nothing-to-redo': 'Det er ingenting å gjøre om.',
  'change-set-not-found': 'Rettingen finnes ikke lenger.',
  // Export (M3).
  'document-read-only': 'Filen kan bare vises. En revidert GMI kan ikke lages fordi strukturen ikke kan bevares sikkert.',
  'verification-failed': 'Den foreslåtte kopien kunne ikke kontrolleres. Ingen fil ble laget.',
  'structural-difference': 'Kontrollen fant endringer utenfor feltverdiene. Ingen fil ble laget.',
  'state-changed': 'Rettingene ble endret mens filen ble laget. Prøv igjen.',
  'output-integrity': 'Kontrollen av den reviderte filen feilet. Ingen fil ble laget.',
  'invalid-date': 'Tidspunktet for filnavnet er ugyldig.',
  'export-stale': 'Rettingene er endret siden filen ble laget. Last ned på nytt.',
  'not-an-export': 'Nedlastingen er ugyldig.',
  'unsaved-changes': 'Laget har rettinger som ikke er lastet ned.',
});

const SKIP_REASONS = Object.freeze({
  conflict: 'Allerede endret av en tidligere retting',
  populated: 'Har allerede en verdi i leveransen',
  'object-not-editable': 'Objektet kan ikke rettes',
  'not-applicable': 'Gjelder ikke objektet',
  unresolved: 'Kan ikke avgjøres sikkert',
  'out-of-scope': 'Utenfor utvalget',
});

/** A Norwegian message for a machine-readable code (never raw text). */
export function gmiEditMessage(code, fallback = 'Handlingen kunne ikke fullføres.') {
  return (typeof code === 'string' && MESSAGES[code]) || fallback;
}

export const gmiSkipReasonLabel = (reason) => SKIP_REASONS[reason] || 'Hoppet over';

/** Message for a lexeme rejection from validateGmiFieldLexeme. */
export function gmiLexemeProblem(result, lexeme = '') {
  if (!result || result.ok) return null;
  if (result.code === 'lexeme-unrepresentable' || result.code === 'lexeme-c1-control') {
    const char = typeof lexeme === 'string' && Number.isInteger(result.index) ? String.fromCodePoint(lexeme.codePointAt(result.index)) : '';
    const base = char && /\S/.test(char) ? `Tegnet «${char}» kan ikke lagres i filens tegnkoding.` : gmiEditMessage(result.code);
    return result.nfcRepresentable ? `${base} Tegnet er satt sammen av flere deler. Skriv det inn på nytt som ett tegn.` : base;
  }
  return gmiEditMessage(result.code);
}

// -------------------------------------------------------------- status

/**
 * Presentation of a layer's editing status for the workspace header.
 * `{tone: 'ok'|'info'|'warning'|'error', label, message}`.
 */
export function describeGmiEditStatus(status) {
  const state = status?.state;
  if (!state) return Object.freeze({ tone: 'info', label: 'Ikke åpnet', message: null, editable: false });
  if (state === 'loading') return Object.freeze({ tone: 'info', label: 'Klargjør…', message: 'Leser og kontrollerer originalfilen.', editable: false });
  if (state === 'editable') return Object.freeze({ tone: 'ok', label: 'Redigerbar', message: null, editable: true });
  if (state === 'read-only') {
    const reasons = (status.reasons || []).map((reason) => gmiEditMessage(reason, null)).filter(Boolean);
    return Object.freeze({ tone: 'warning', label: 'Kun visning', message: `Filen kan vises, men ikke rettes. ${reasons.join(' ') || 'Strukturen kan ikke bevares sikkert.'}`, editable: false });
  }
  if (state === 'unavailable') return Object.freeze({ tone: 'warning', label: 'Kun visning', message: gmiEditMessage('source-unavailable'), editable: false });
  if (state === 'unsupported') return Object.freeze({ tone: 'warning', label: 'Ikke støttet', message: gmiEditMessage('unsupported-layer'), editable: false });
  if (state === 'invalidated') {
    const count = status.discardedChangeSets || 0;
    const discarded = count ? ` ${count} ${count === 1 ? 'retting' : 'rettinger'} ble forkastet${status.discardedUnsaved ? ' uten å være lastet ned' : ''}.` : '';
    return Object.freeze({ tone: 'error', label: 'Forkastet', message: `Kildefilen til laget ble erstattet, så rettingsøkten ble avsluttet.${discarded}`, editable: false });
  }
  if (state === 'error') return Object.freeze({ tone: 'error', label: 'Feil', message: gmiEditMessage(status.error, 'Originalfilen kunne ikke åpnes for retting.'), editable: false });
  return Object.freeze({ tone: 'info', label: state, message: null, editable: false });
}

/** "2 rettinger · 3 felt i 2 objekter" (or null when nothing is staged). */
export function summarizeGmiEditCounts(status) {
  if (!status?.changeSetCount) return null;
  const sets = `${status.changeSetCount} ${status.changeSetCount === 1 ? 'retting' : 'rettinger'}`;
  const cells = `${status.changedCells} felt i ${status.changedObjects} ${status.changedObjects === 1 ? 'objekt' : 'objekter'}`;
  return `${sets} · ${cells}`;
}

/** 'unsaved' | 'downloaded' | 'none'. */
export function gmiEditDownloadState(status) {
  if (status?.unsaved) return 'unsaved';
  if (status?.downloaded) return 'downloaded';
  return 'none';
}

// -------------------------------------------------------------- objects

export const GMI_SCOPE_LABEL = Object.freeze({ point: 'Punkt', line: 'Ledning' });
export const tableTabToScope = (tab) => (tab === 'ledninger' ? 'line' : 'point');
export const scopeToTableTab = (scope) => (scope === 'line' ? 'ledninger' : 'punkter');
export const gmiObjectKey = (scope, sourceIndex) => `${scope}:${sourceIndex}`;

/** "Ledning 3" (parser id) or "Ledning nr. 4 i filen" (no id). */
export function describeGmiObject(scope, sourceIndex, objectId = null) {
  const kind = GMI_SCOPE_LABEL[scope] || 'Objekt';
  return Number.isFinite(objectId) ? `${kind} ${objectId}` : `${kind} nr. ${sourceIndex + 1} i filen`;
}

/**
 * Compact Data Table identity, derived from the same source object number as
 * describeGmiObject: "38" for "Ledning 38", or "(5)" (file position) when the
 * file has no object number. Never derived from a sorted/virtual row position.
 */
export function gmiObjectNumber(scope, sourceIndex, objectId = null) {
  const numbered = Number.isFinite(objectId);
  return Object.freeze({ text: numbered ? String(objectId) : `(${sourceIndex + 1})`, numbered,
    label: describeGmiObject(scope, sourceIndex, objectId), sortValue: numbered ? objectId : sourceIndex + 1 });
}

/**
 * Whether a normalized table search names this object exactly: "38", "#38",
 * "nr 38", "l38"/"ledning 38" for lines and "p5"/"punkt 5" for points.
 * Partial numbers never match, so ordinary attribute search is unchanged.
 */
export function gmiObjectMatchesQuery(normalizedQuery, scope, sourceIndex, objectId = null) {
  const match = /^(?:#|nr\.?\s*|(ledning|l|punkt|p)\s*)?(\d+)$/.exec(String(normalizedQuery || ''));
  if (!match) return false;
  if (match[1] && (match[1].startsWith('l') ? 'line' : 'point') !== scope) return false;
  return gmiObjectNumber(scope, sourceIndex, objectId).sortValue === Number(match[2]);
}

/** Secondary text for an object row: S_FCODE · Tema/Type · Material. */
export function gmiObjectContext(attributes = {}) {
  const parts = [attributes.S_FCODE, attributes.Tema ?? attributes.Type, attributes.Material]
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '').map(String);
  return parts.join(' · ');
}

/**
 * UI editing policy for one M1 cell (`listGmiObjectCells` entry). Returns
 * `{editable, reason}`; the reason is a code for gmiEditMessage. The engine's
 * own reasons always win; the UI only adds restrictions.
 */
export function gmiEditFieldPolicy(cell) {
  return gmiEditColumnPolicy(cell);
}

/** Parser-equivalent missing (the parser trims, then maps '' to null). */
export const gmiLexemeMissing = (lexeme) => typeof lexeme !== 'string' || lexeme.trim() === '';

/**
 * Segments of a lexeme with leading/trailing whitespace made visible, for
 * exact display. `[{text, whitespace: boolean}]`. Inner text is unchanged.
 */
export function gmiLexemeSegments(lexeme) {
  if (lexeme === null || lexeme === undefined) return [];
  const text = String(lexeme);
  const lead = /^\s*/.exec(text)[0];
  if (lead.length === text.length) return text.length ? [{ text, whitespace: true }] : [];
  const trail = /\s*$/.exec(text)[0];
  const out = [];
  if (lead) out.push({ text: lead, whitespace: true });
  out.push({ text: text.slice(lead.length, text.length - trail.length), whitespace: false });
  if (trail) out.push({ text: trail, whitespace: true });
  return out;
}

/**
 * Plan of an object form against the current state.
 * @param {Array<{field, original, proposed, touched}>} rows editable cell views
 * @param {Record<string,string>} drafts field -> typed value (only edited fields)
 * @param {string} encodingClass document encoding class
 * @returns {{values, edited, problems, needsOverwrite, needsReplace, valid}}
 *   `values` only holds fields whose draft differs from the current proposed
 *   value. `needsOverwrite`: fields whose delivered value is populated (M2
 *   'overwrite' mode required). `needsReplace`: fields already changed by an
 *   earlier ChangeSet (M2 'replace' conflict policy required).
 */
export function planGmiObjectForm(rows, drafts, encodingClass) {
  const values = {}, problems = {}, edited = [], needsOverwrite = [], needsReplace = [];
  for (const row of rows) {
    if (!Object.hasOwn(drafts, row.field)) continue;
    const draft = drafts[row.field];
    if (draft === row.proposed) continue;
    edited.push(row.field);
    const check = checkGmiFieldDraft(row, draft, encodingClass, { restrictEnumeration: false, normalizeCase: false });
    if (!check.ok) { problems[row.field] = gmiLexemeProblem(check.problem, draft); continue; }
    values[row.field] = draft;
    if (!gmiLexemeMissing(row.original)) needsOverwrite.push(row.field);
    if (row.touched) needsReplace.push(row.field);
  }
  return Object.freeze({
    values: Object.freeze(values),
    edited: Object.freeze(edited),
    problems: Object.freeze(problems),
    needsOverwrite: Object.freeze(needsOverwrite),
    needsReplace: Object.freeze(needsReplace),
    valid: edited.length > 0 && Object.keys(problems).length === 0,
  });
}

/** "Material, SDR · Ledning 3". */
export function gmiObjectCorrectionLabel(fields, scope, sourceIndex, objectId) {
  const list = fields.length > 3 ? `${fields.slice(0, 3).join(', ')} +${fields.length - 3}` : fields.join(', ');
  return `${list} · ${describeGmiObject(scope, sourceIndex, objectId)}`;
}

// ---------------------------------------------------------- change list

const objectsOf = (changeSet) => new Set([...changeSet.cells, ...changeSet.skipped].filter((cell) => Number.isInteger(cell.sourceIndex))
  .map((cell) => gmiObjectKey(cell.scope, cell.sourceIndex)));

/**
 * Later active ChangeSets whose assumptions may depend on `changeSetId`:
 * - they touch an object this set changed (a Material correction can change
 *   whether a later SDR correction on the same object makes sense);
 * - their conflict decisions referred to this set;
 * - they were built from batch eligibility after it (eligibility is
 *   evaluated on the proposed state that included this set).
 * Discarding never removes them; the UI warns instead.
 */
export function gmiChangeSetDependents(changeSets, changeSetId) {
  const index = changeSets.findIndex((changeSet) => changeSet.id === changeSetId);
  if (index < 0) return Object.freeze([]);
  const target = changeSets[index];
  const objects = objectsOf(target);
  const out = [];
  for (const later of changeSets.slice(index + 1)) {
    const reasons = [];
    if ([...objectsOf(later)].some((key) => objects.has(key))) reasons.push('same-object');
    if (later.conflicts.some((conflict) => conflict.with.includes(changeSetId))) reasons.push('conflict');
    if (later.eligibility) reasons.push('eligibility');
    if (reasons.length) out.push(Object.freeze({ id: later.id, label: later.label, reasons: Object.freeze(reasons) }));
  }
  return Object.freeze(out);
}

/**
 * Cells of one ChangeSet with whether each is still the effective value
 * (a later set may have replaced it).
 */
export function gmiChangeSetCellViews(changeSet, effectiveByKey) {
  return Object.freeze(changeSet.cells.map((cell) => {
    const effective = effectiveByKey?.get(cell.key);
    return Object.freeze({
      ...cell,
      object: describeGmiObject(cell.scope, cell.sourceIndex, cell.objectId),
      superseded: Boolean(effective && effective.changeSetId !== changeSet.id),
    });
  }));
}

/** "1 ledning", "2 ledninger", "3 punkter", "2 objekter" (mixed or unknown scope). */
export function gmiObjectCountLabel(count, scope = null) {
  const [one, many] = { line: ['ledning', 'ledninger'], point: ['punkt', 'punkter'] }[scope] || ['objekt', 'objekter'];
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Readable summary of one staged ChangeSet: "Fyll SDR · 11" for a uniform batch
 * correction, otherwise its history label. Read only from the ChangeSet itself.
 */
export function summarizeGmiChangeSet(changeSet) {
  const cells = changeSet?.cells || [];
  const scopes = new Set(cells.map((cell) => cell.scope));
  const objects = new Set(cells.map((cell) => gmiObjectKey(cell.scope, cell.sourceIndex))).size;
  const fields = [...new Set(cells.map((cell) => cell.field))];
  const values = [...new Set(cells.map((cell) => cell.next))];
  const uniform = fields.length === 1 && values.length === 1;
  const title = changeSet?.origin === 'batch' && uniform
    ? `${changeSet.mode === 'overwrite' ? 'Sett' : 'Fyll'} ${fields[0]} · ${values[0]}` : (changeSet?.label || changeSet?.id || '');
  return Object.freeze({ title, fields: Object.freeze(fields), objects, scope: scopes.size === 1 ? [...scopes][0] : null,
    objectsLabel: gmiObjectCountLabel(objects, scopes.size === 1 ? [...scopes][0] : null), uniform, value: uniform ? values[0] : null });
}

/** Map<cellKey, changed cell> from registry.inspect(handle).cells.changed. */
export function indexGmiChangedCells(changed = []) {
  const byKey = new Map(), byObject = new Map();
  for (const cell of changed) {
    byKey.set(cell.key, cell);
    const objectKey = gmiObjectKey(cell.scope, cell.sourceIndex);
    if (!byObject.has(objectKey)) byObject.set(objectKey, new Map());
    byObject.get(objectKey).set(cell.field, cell);
  }
  return Object.freeze({ byKey, byObject });
}

/** "9. nov. 2026, 14:05" in Norwegian, or '' for invalid input. */
export function formatGmiChangeTime(iso) {
  const date = typeof iso === 'string' ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).format(date);
}

// --------------------------------------------------- proposed view memo

const proposedViews = new WeakMap();   // status object -> view

/**
 * The verified proposed view for exactly one published status (one editing
 * revision). Statuses are new frozen objects on every registry publish, so
 * the M2 getter and the change index run once per revision, never per render.
 * `{ok, identical, dataset, changed}` or `{ok: false, code}`.
 */
export function gmiProposedViewForStatus(registry, status) {
  if (!status || (status.state !== 'editable' && status.state !== 'read-only')) return null;
  const cached = proposedViews.get(status);
  if (cached) return cached;
  const handle = registry.getHandle(status.layerId);
  let view;
  if (!handle || handle.sessionId !== status.sessionId) view = Object.freeze({ ok: false, code: 'stale-session' });
  else {
    const proposed = registry.proposed(handle);
    const inspected = registry.inspect(handle);
    if (!proposed?.ok) view = Object.freeze({ ok: false, code: proposed?.code || 'verification-failed' });
    else if (!inspected?.ok) view = Object.freeze({ ok: false, code: inspected?.code || 'stale-session' });
    else view = Object.freeze({ ok: true, identical: proposed.identical, dataset: proposed.dataset, changed: indexGmiChangedCells(inspected.cells.changed), effectiveKey: proposed.effectiveKey });
  }
  proposedViews.set(status, view);
  return view;
}
