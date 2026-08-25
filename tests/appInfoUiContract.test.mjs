import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as phosphorIcons from '@phosphor-icons/react';

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [pageSource, modalSource, stateSource, catalogSource, globalCssSource, packageJsonSource] = await Promise.all([
  readSource('src/app/page.js'),
  readSource('src/components/AppInfoModal.js'),
  readSource('src/lib/appInfoState.mjs'),
  readSource('src/data/appReleases.mjs'),
  readSource('src/app/globals.css'),
  readSource('package.json'),
]);

test('persistent trigger and popup decision are independent of upload state', () => {
  const trigger = pageSource.indexOf('aria-label={`Om appen');
  const initialUpload = pageSource.indexOf("parsingStatus !== 'done'");
  const loadedApp = pageSource.indexOf("parsingStatus === 'done'");
  const decision = pageSource.indexOf('decideAutomaticAppInfo');
  const heartbeat = pageSource.indexOf('updateLastActive();');

  assert.ok(trigger > 0 && trigger < initialUpload);
  assert.ok(trigger < loadedApp);
  assert.ok(pageSource.includes('ref={appInfoTriggerRef}'));
  assert.match(pageSource, /CURRENT_APP_VERSION/);
  assert.doesNotMatch(pageSource, /Om appen[^\n]*1\.1\.0/);
  assert.match(pageSource, /setAppInfoInitialTab\('about'\)/);
  assert.match(pageSource, /setShowAppInfo\(true\)/);
  assert.ok(decision > 0 && decision < heartbeat);
  assert.match(pageSource, /appInfoAutoCheckedRef/);
});

test('modal source has a stable accessible dialog and tab shell', () => {
  const tabsStart = modalSource.indexOf('const TABS = [');
  const tabsEnd = modalSource.indexOf('];', tabsStart);
  const tabDefinitions = [...modalSource.slice(tabsStart, tabsEnd).matchAll(/\{ id: '([^']+)', label: '([^']+)' \}/g)]
    .map(([, id, label]) => ({ id, label }));
  assert.deepEqual(tabDefinitions, [
    { id: 'about', label: 'Om' },
    { id: 'news', label: 'Nytt' },
    { id: 'history', label: 'Versjonshistorikk' },
    { id: 'future', label: 'Fremtiden' },
    { id: 'contact', label: 'Kontakt' },
  ]);
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /aria-labelledby="app-info-title"/);
  assert.match(modalSource, /aria-label="Lukk"/);
  assert.match(modalSource, /event\.key === 'Escape'/);
  assert.match(modalSource, /event\.stopPropagation\(\)/);
  assert.match(modalSource, /document\.activeElement/);
  assert.match(modalSource, /querySelectorAll\(FOCUSABLE_SELECTOR\)/);
  assert.match(modalSource, /tabRefs\.current\[index\]\?\.focus\(\)/);
  assert.match(modalSource, /tabIndex=\{activeTab === tab\.id \? 0 : -1\}/);
  assert.match(modalSource, /role="tablist"/);
  assert.match(modalSource, /role="tab"/);
  assert.match(modalSource, /role="tabpanel"/);
  assert.match(modalSource, /id=\{`app-info-panel-\$\{activeTab\}`\}/);
  assert.match(modalSource, /aria-selected=\{activeTab === tab\.id\}/);
  assert.match(modalSource, /ArrowRight/);
  assert.match(modalSource, /ArrowLeft/);
  assert.match(modalSource, /event\.key === 'Home'/);
  assert.match(modalSource, /event\.key === 'End'/);
  assert.match(modalSource, /aria-expanded=\{expanded\}/);
  assert.match(modalSource, /aria-controls=\{changesId\}/);
  assert.match(modalSource, /app-info-dialog/);
  assert.match(modalSource, /app-info-inner focus-visible:outline/);
  assert.match(modalSource, /function AppInfoHero\(\{ title/);
  assert.equal((modalSource.match(/<AppInfoHero\b/g) || []).length, 5);
  assert.equal((modalSource.match(/relative overflow-hidden rounded-2xl bg-slate-950/g) || []).length, 1);
  assert.match(modalSource, /className="app-info-hero-title"/);
  assert.match(modalSource, /<main className="min-h-0 flex-1 overflow-y-auto/);
  assert.match(modalSource, /overflow-y-auto overscroll-contain app-info-scroll/);
  assert.match(globalCssSource, /\.app-info-scroll\s*\{[\s\S]*scrollbar-gutter:\s*stable;/);
  assert.match(modalSource, /<header className="flex shrink-0/);
  assert.match(modalSource, /className="flex shrink-0 gap-1 overflow-x-auto/);
  for (const label of ['Om', 'Nytt', 'Versjonshistorikk', 'Fremtiden', 'Kontakt']) {
    assert.match(modalSource, new RegExp(label));
  }
});

test('AppInfo uses verified Phosphor icons and one dependency', () => {
  for (const iconName of ['InfoIcon', 'GithubLogoIcon', 'ArrowSquareOutIcon', 'XIcon', 'CaretDownIcon']) {
    assert.ok(phosphorIcons[iconName], `${iconName} should resolve from the installed package`);
    assert.match(modalSource, new RegExp(`<${iconName}\\b`));
  }
  assert.match(pageSource, /<InfoIcon\b/);
  assert.match(modalSource, /weight="regular"/);
  assert.match(modalSource, /aria-hidden="true"/);
  assert.doesNotMatch(modalSource, /<svg\b/);
  assert.doesNotMatch(modalSource, /from ['"]lucide-react['"]/);
  assert.match(packageJsonSource, /"@phosphor-icons\/react": "\^2\.1\.10"/);
  assert.doesNotMatch(packageJsonSource, /lucide-react/);
});

test('Om follows the human-friendly five-section structure', () => {
  const aboutStart = modalSource.indexOf('function AboutContent');
  const futureStart = modalSource.indexOf('function FutureContent');
  const aboutSource = modalSource.slice(aboutStart, futureStart);

  for (const heading of [
    'Hva er dette?',
    'Hvorfor finnes det?',
    'Hva er dette ikke?',
    'Nysgjerrig eller bekymret?',
    'Hvem er du?',
  ]) {
    assert.match(aboutSource, new RegExp(heading));
  }
  assert.match(aboutSource, /sjekke, utforske og forstå VA-måle- og leveringsdata/);
  assert.match(aboutSource, /ikke-kommersielt/);
  assert.match(aboutSource, /ingen planer om abonnement, betalte funksjoner, reklame/);
  assert.match(aboutSource, /praktisk arbeid med GMI-filer og entreprenørleveranser/);
  assert.match(aboutSource, /repetitivt/);
  assert.match(aboutSource, /godkjennes eller avvises/);
  assert.match(aboutSource, /Automatiske kontroller støtter faglige vurderinger/);
  assert.match(aboutSource, /ikke utviklet av, for eller sammen med Invera/);
  assert.match(aboutSource, /VA\/GMI-fil åpnes i et nettleserbasert verktøy/);
  assert.match(aboutSource, /Kildekoden er offentlig/);
  assert.match(aboutSource, /\[Personlig tekst legges inn her\.\]/);
  assert.doesNotMatch(aboutSource, /sendes ikke|lastes ikke opp|aldri lagres|never leave the browser/i);
});

test('modal content keeps current branding and places source action on Om only', () => {
  assert.match(modalSource, /GMI Validator/);
  assert.doesNotMatch(modalSource, /GMI Validering/);
  assert.match(modalSource, /https:\/\/github\.com\/pb-bennett\/gmi-validering/);
  assert.match(modalSource, /GithubLogoIcon/);
  assert.match(modalSource, /Se kildekoden på GitHub/);
  assert.match(modalSource, /ArrowSquareOutIcon/);
  assert.match(modalSource, /rel="noopener noreferrer"/);
  const aboutStart = modalSource.indexOf('function AboutContent');
  const contactStart = modalSource.indexOf('function ContactContent');
  const contactEnd = modalSource.indexOf('function TabContent');
  assert.match(modalSource.slice(aboutStart, contactStart), /SourceCodeLink/);
  assert.doesNotMatch(modalSource.slice(contactStart, contactEnd), /GitHub|github|SourceCodeLink|Kildekode/);
});

test('release news presents the statistics feature and no fabricated release', () => {
  assert.match(modalSource, /Nyheter/);
  assert.match(modalSource, /Ny statistikkvisning/);
  assert.match(modalSource, /Statistikken er nå brutt ned per kommune/);
  assert.match(modalSource, /Du kan også se kommuneaktiviteten på kart/);
  assert.match(modalSource, /if \(activeTab === 'news'\) return <NewsContent \/>;/);
  assert.match(modalSource, /if \(activeTab === 'future'\) return <FutureContent \/>;/);
  assert.doesNotMatch(modalSource, /onHistory/);
  assert.match(catalogSource, /formell versjonshistorikk/);
  assert.match(modalSource, /eyebrow="Nyheter"/);
  assert.match(modalSource, /version=\{releaseEntry\?\.version \?\? CURRENT_APP_VERSION\}/);
  assert.doesNotMatch(modalSource, /releaseEntry\.highlights/);
  assert.doesNotMatch(modalSource, /Dette er nytt|Også nytt/);
  assert.doesNotMatch(modalSource, /Nøkkeltall på ett sted|Utvikling over tid|Sammenlign utvalg|Kart og fordeling/);
  assert.doesNotMatch(catalogSource, /1\.1\.0/);
  assert.match(catalogSource, /version: '1\.0\.0'/);
  assert.match(catalogSource, /title: 'Ny statistikkvisning'/);
  assert.match(catalogSource, /announce: true/);
  assert.match(modalSource, /APP_RELEASES\.map/);
});

test('future roadmap stays separate from released versions and has no date', () => {
  const aboutStart = modalSource.indexOf('function AboutContent');
  const futureStart = modalSource.indexOf('function FutureContent');
  const futureEnd = modalSource.indexOf('function ReleaseDetails', futureStart);
  const aboutSource = modalSource.slice(aboutStart, futureStart);
  const futureSource = modalSource.slice(futureStart, futureEnd);
  assert.doesNotMatch(aboutSource, /Videre utvikling|1\.1\.0|Validator 2\.0/);
  assert.match(futureSource, /<AppInfoHero title="Fremtiden – videre utvikling" \/>/);
  assert.doesNotMatch(futureSource, /app-info-roadmap-heading|<h3[^>]*>Videre utvikling<\/h3>/);

  const roadmapStart = futureSource.indexOf('v1.1.0');
  assert.ok(roadmapStart > 0);
  const roadmapSource = futureSource.slice(roadmapStart);

  assert.match(roadmapSource, /versjon 1\.1\.0/);
  assert.match(roadmapSource, /v1\.1\.0/);
  assert.match(roadmapSource, /Validator 2\.0 \(beta\)/);
  assert.match(roadmapSource, /Den nye valideringslogikken gir tydeligere kontroller/);
  assert.match(roadmapSource, /Planlagt/);
  assert.match(roadmapSource, /Planene kan endres etter hvert som funksjonene utvikles og testes/);
  assert.doesNotMatch(roadmapSource, /Senere:|Videre forbedringer av tabellvisning/);
  assert.doesNotMatch(roadmapSource, /202\d|releasedOn|januar|august/);
  assert.doesNotMatch(catalogSource, /1\.1\.0|Validator 2\.0/);
});

test('all tabs use the shared hero titles without redundant lower page headings', () => {
  for (const title of [
    'Et verktøy for kontroll og utforsking av VA-innmålingsleveranser',
    'Nyheter',
    'Versjonshistorikk',
    'Fremtiden – videre utvikling',
    'Kontakt',
  ]) {
    assert.match(modalSource, new RegExp(`title="${title}"`));
  }

  const historyStart = modalSource.indexOf('function HistoryContent');
  const contactStart = modalSource.indexOf('function ContactContent');
  const contactEnd = modalSource.indexOf('function TabContent');
  assert.doesNotMatch(modalSource.slice(historyStart, contactStart), /<h3[^>]*>Versjonshistorikk<\/h3>/);
  assert.doesNotMatch(modalSource.slice(contactStart, contactEnd), /<p[^>]*>Kontakt<\/p>/);
});

test('contact remains a placeholder and app-info adds no network or user-data persistence', () => {
  const contactStart = modalSource.indexOf('function ContactContent');
  const contactEnd = modalSource.indexOf('function TabContent');
  const contactSource = modalSource.slice(contactStart, contactEnd);
  const sourceLinkStart = modalSource.indexOf('function SourceCodeLink');
  const sourceLinkEnd = modalSource.indexOf('function AppInfoHero');
  const sourceLinkSource = modalSource.slice(sourceLinkStart, sourceLinkEnd);

  assert.match(contactSource, /Tilbakemeldinger/);
  assert.match(contactSource, /finner feil/);
  assert.match(contactSource, /kommentarer til hvordan/);
  assert.match(contactSource, /forslag til forbedringer/);
  assert.match(contactSource, /sende inn tilbakemeldinger direkte fra appen/);
  assert.doesNotMatch(contactSource, /GitHub|github|SourceCodeLink|Kildekode/);
  assert.doesNotMatch(contactSource, /<form|onSubmit|mailto:|Resend/i);
  assert.match(sourceLinkSource, /<GithubLogoIcon/);
  assert.match(sourceLinkSource, /<ArrowSquareOutIcon/);
  assert.doesNotMatch(sourceLinkSource, /<svg/);

  const featureSource = `${pageSource}\n${modalSource}\n${stateSource}\n${catalogSource}`;
  assert.doesNotMatch(featureSource, /fetch\s*\(|dangerouslySetInnerHTML|\/api\//i);
  assert.doesNotMatch(stateSource, /filename|fileName|coordinates|file-content|uploaded/i);
  assert.match(stateSource, /gmi-validator-storage/);
  assert.match(stateSource, /gmi-validering:app-info:v1/);
  assert.match(stateSource, /getItem\(key\)/);
  assert.match(stateSource, /setItem\(key, value\)/);
});
