import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contentUrl = new URL('../src/components/validation-v2/ValidationV2FieldDetailContent.js', import.meta.url);
const modalUrl = new URL('../src/components/validation-v2/ValidationV2FieldInfoModal.js', import.meta.url);

test('shared field detail renders controlled Resultat and Regel tabs', async () => {
  const content = await readFile(contentUrl, 'utf8');
  assert.match(content, /export function ValidationV2FieldDetailContent\([\s\S]*?activeTab,[\s\S]*?onTabChange/);
  assert.match(content, /const selectTab = \(tab\) => onTabChange\?\.\(tab\)/);
  assert.match(content, /\[\[TABS\.RESULT, 'Resultat'\], \[TABS\.RULE, 'Regel'\]\]/);
  assert.match(content, /<DiagnosticResultPanel[\s\S]*?field=\{field\}/);
  assert.match(content, /<ModernRulePanel field=\{field\} rule=\{rule\} \/>/);
  assert.match(content, /role="tabpanel"/);
  assert.doesNotMatch(content, /useState\(TABS\.RESULT\)/);
});

test('fallback modal defaults to Resultat and retains its dialog and focus behavior', async () => {
  const modal = await readFile(modalUrl, 'utf8');
  assert.match(modal, /activeTab = 'result'/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby="validation-v2-field-info-title"/);
  assert.match(modal, /fixed inset-0 z-\[10003\].*bg-black\/40/);
  assert.match(modal, /max-h-\[720px\] w-full flex-col/);
  assert.match(modal, /maxWidth: VALIDATION_V2_FIELD_MODAL_MAX_WIDTH/);
  assert.match(modal, /event\.target === event\.currentTarget && onClose\(\)/);
  assert.match(modal, /aria-label="Lukk feltinformasjon"[\s\S]*?onClick=\{onClose\}/);
  assert.match(modal, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(modal, /event\.key === 'Escape'[\s\S]*?onCloseRef\.current\(\)/);
  assert.match(modal, /getFocusableElements\(dialog\)/);
  assert.match(modal, /first\.focus\(\)/);
  assert.match(modal, /last\.focus\(\)/);
  assert.match(modal, /activeTab=\{activeTab\}[\s\S]*?onTabChange=\{onTabChange\}/);
});

test('shared model and presentation retain diagnostics, qualifiers, details, and authoritative tables', async () => {
  const content = await readFile(contentUrl, 'utf8');
  assert.match(content, /getValidationV2FieldDataSummary/);
  assert.match(content, /buildFieldDiagnosticsForRules/);
  assert.match(content, /getValidationV2CoveragePresentation/);
  assert.match(content, /getValidationV2DiagnosticPresentation/);
  assert.match(content, /role="tooltip"/);
  assert.match(content, /onMouseEnter=.*setHovered/);
  assert.match(content, /onFocus=.*setFocused/);
  assert.match(content, /onClick=.*setClickedOpen/);
  assert.match(content, /<summary className="cursor-pointer px-2\.5 py-2 text-xs font-semibold text-gray-700">Detaljer<\/summary>/);
  assert.match(content, /Tolket verdi/);
  assert.match(content, /function SourceValueTable/);
  assert.match(content, /composeFieldRulePresentation\(\{ field, rule \}\)/);
});

test('modal wrapper contains no duplicate field model or Resultat/Regel implementation', async () => {
  const modal = await readFile(modalUrl, 'utf8');
  assert.doesNotMatch(modal, /getValidationV2FieldDataSummary|buildFieldDiagnosticsForRules|DiagnosticResultPanel|ModernRulePanel/);
  assert.equal((modal.match(/<ValidationV2FieldDetailContent/g) || []).length, 1);
});
