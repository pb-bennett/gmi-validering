import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as phosphorIcons from '@phosphor-icons/react';

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [pageSource, modalSource, contactFormSource, stateSource, catalogSource, globalCssSource, packageJsonSource, sidebarSource, fieldValidationSidebarSource] = await Promise.all([
  readSource('src/app/page.js'),
  readSource('src/components/AppInfoModal.js'),
  readSource('src/components/ContactForm.js'),
  readSource('src/lib/appInfoState.mjs'),
  readSource('src/data/appReleases.mjs'),
  readSource('src/app/globals.css'),
  readSource('package.json'),
  readSource('src/components/Sidebar.js'),
  readSource('src/components/FieldValidationSidebar.js'),
]);

test('start-state AppInfo actions stay in the upload card while popup decision remains independent', () => {
  const initialUpload = pageSource.indexOf('/* Initial Upload Screen */');
  const decision = pageSource.indexOf('decideAutomaticAppInfo');
  const heartbeat = pageSource.indexOf('updateLastActive();');

  assert.ok(initialUpload > 0);
  assert.doesNotMatch(pageSource, /fixed bottom-4 left-4/);
  assert.match(pageSource.slice(initialUpload), /ref=\{appInfoTriggerRef\}/);
  assert.match(pageSource.slice(initialUpload), /openAppInfo\('about'\)/);
  assert.match(pageSource.slice(initialUpload), /openAppInfo\('contact'\)/);
  assert.match(pageSource.slice(initialUpload), /flex flex-wrap items-center justify-center gap-2/);
  assert.match(pageSource.slice(initialUpload), /Om appen · v\{CURRENT_APP_VERSION\}/);
  assert.match(pageSource.slice(initialUpload), /<EnvelopeSimpleIcon\b/);
  assert.match(pageSource, /onClick=\{\(\) => openAppInfo\('about'\)\}/);
  assert.ok(pageSource.includes('ref={appInfoTriggerRef}'));
  assert.match(pageSource, /CURRENT_APP_VERSION/);
  assert.doesNotMatch(pageSource, /Om appen[^\n]*1\.1\.0/);
  assert.match(pageSource, /openAppInfo\('about'\)/);
  assert.match(pageSource, /setShowAppInfo\(true\)/);
  assert.ok(decision > 0 && decision < heartbeat);
  assert.match(pageSource, /appInfoAutoCheckedRef/);
});

test('loaded-state AppInfo and persistent Kontakt actions use the existing modal', () => {
  assert.match(sidebarSource, /<InfoIcon\b/);
  assert.match(sidebarSource, /Om appen · v\{CURRENT_APP_VERSION\}/);
  assert.match(sidebarSource, /onClick=\{onOpenAppInfo\}/);
  assert.match(sidebarSource, /<EnvelopeSimpleIcon\b/);
  assert.match(sidebarSource, /Kontakt/);
  assert.match(sidebarSource, /onClick=\{onOpenContact\}/);
  assert.match(sidebarSource, /mt-auto border-t px-4 py-3/);
  assert.match(sidebarSource, /items-center justify-center gap-2 rounded-lg/);
  assert.match(pageSource, /onOpenAppInfo=\{\(\) => openAppInfo\('about'\)\}/);
  assert.match(pageSource, /onOpenContact=\{\(\) => openAppInfo\('contact'\)\}/);
  assert.match(pageSource, /initialTab=\{appInfoInitialTab\}/);
  assert.match(pageSource, /openAppInfo = \(tab = 'about'\)/);
  assert.match(pageSource, /setAppInfoInitialTab\(tab\)/);
  assert.match(fieldValidationSidebarSource, /<EnvelopeSimpleIcon\b/);
  assert.match(fieldValidationSidebarSource, /onClick=\{onOpenContact\}/);
  assert.match(pageSource, /<FieldValidationSidebar onOpenContact=\{\(\) => openAppInfo\('contact'\)\} \/>/);
  assert.match(pageSource, /<EnvelopeSimpleIcon\b/);
  assert.match(pageSource, /onClick=\{\(\) => openAppInfo\('contact'\)\}/);
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
  assert.match(modalSource, /function AppInfoHero\(\{ title, eyebrow = 'GMI Validator', version = CURRENT_APP_VERSION \}\)/);
  assert.match(modalSource, /bg-slate-950 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-5/);
  assert.doesNotMatch(modalSource, /compact/);
  assert.equal((modalSource.match(/<AppInfoHero\b/g) || []).length, 5);
  assert.equal((modalSource.match(/relative overflow-hidden rounded-t-2xl rounded-b-none bg-slate-950/g) || []).length, 1);
  assert.match(modalSource, /const APP_INFO_TAB_CONTENT_CLASS = 'space-y-7 \[&>\*:not\(:first-child\)\]:mx-2';/);
  assert.match(modalSource, /const CONTACT_TAB_CONTENT_CLASS = 'space-y-4 \[&>\*:not\(:first-child\)\]:mx-2';/);
  assert.equal((modalSource.match(/className=\{APP_INFO_TAB_CONTENT_CLASS\}/g) || []).length, 4);
  assert.match(modalSource, /className=\{CONTACT_TAB_CONTENT_CLASS\}/);
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

test('Om follows the human-friendly six-section structure', () => {
  const aboutStart = modalSource.indexOf('function AboutContent');
  const futureStart = modalSource.indexOf('function FutureContent');
  const aboutSource = modalSource.slice(aboutStart, futureStart);

  for (const heading of [
    'Hva er dette?',
    'Hvorfor finnes det?',
    'Hva er dette ikke?',
    'Hvem er jeg?',
    'Hvem er du?',
    'Nysgjerrig eller bekymret?',
  ]) {
    assert.match(aboutSource, new RegExp(heading));
  }
  const headingOrder = [
    'Hva er dette?',
    'Hvorfor finnes det?',
    'Hva er dette ikke?',
    'Hvem er jeg?',
    'Hvem er du?',
    'Nysgjerrig eller bekymret?',
  ].map((heading) => aboutSource.indexOf(`>${heading}</h3>`));
  assert.ok(headingOrder.every((index, position) => index > (headingOrder[position - 1] ?? -1)));
  assert.match(aboutSource, /utforske og validere VA-innmålingsfiler/);
  assert.match(aboutSource, /entreprenører til kommuner i sluttfasen av infrastrukturprosjekter/);
  assert.match(aboutSource, /full støtte for Geminis eget GMI-format/);
  assert.match(aboutSource, /begrenset støtte for SOSI- og KOF-formatene/);
  assert.match(aboutSource, /<ul className="mt-2 list-disc space-y-2 pl-5 leading-\[1\.6\]">/);
  for (const feature of [
    'Laste inn flere filer i samme sesjon',
    'Visualisere innmålingsdata i både 2D og 3D',
    'Filtrere og fremheve objekter etter verdier i datafeltene',
    'Vise objektene i en tilpassbar datatabell',
    'Kontrollere og visualisere fall og estimert overdekning for ledninger i profil',
    'Validere datafeltene mot kravene i innmålingsinstruksen',
  ]) {
    assert.match(aboutSource, new RegExp(feature));
  }
  assert.match(aboutSource, /Det finnes allerede gode og omfattende verktøy i bransjen/);
  assert.match(aboutSource, /Mye av dette gjentas for hver nye leveranse/);
  assert.match(aboutSource, /redusere det repetitive kontrollarbeidet/);
  assert.match(aboutSource, /Automatiske kontroller kan finne mangler/);
  assert.match(aboutSource, /Gemini VA, Gemini Terrain eller andre komplette fag- og GIS-systemer/);
  assert.match(aboutSource, /ikke utviklet av, for eller i samarbeid med Invera/);
  assert.match(aboutSource, /Jeg har jobbet med kommunalteknikk i over seks år/);
  assert.match(aboutSource, /Gemini VA og Portal\+/);
  assert.match(aboutSource, /hvor nyttig en god 3D-visning kan være/);
  assert.match(aboutSource, /GMI Validator er først og fremst laget for deg/);
  assert.match(aboutSource, /private VA-tilknytninger/);
  assert.match(aboutSource, /Entreprenører kan på sin side bruke GMI Validator/);
  assert.match(aboutSource, /Det er sunt å ta sikkerhet og personvern på alvor/);
  assert.match(aboutSource, /Det meste skjer lokalt i nettleseren på din egen PC/);
  assert.match(aboutSource, /GMI-, SOSI- eller KOF-filen lastes ikke opp til serveren/);
  assert.match(aboutSource, /koordinatpunkter langs ledningene automatisk til Kartverket/);
  assert.match(aboutSource, /punkt- og kommuneoppslag/);
  assert.match(aboutSource, /aggregerte tellinger per kommune, dato og time/);
  assert.match(aboutSource, /Vercel Web Analytics/);
  assert.match(aboutSource, /Appen sender ikke filinnhold eller filrelaterte data/);
  assert.match(aboutSource, /Når du velger å sende tilbakemelding gjennom Kontakt/);
  assert.match(aboutSource, /appversjonen legges til av serveren/);
  assert.match(aboutSource, /Ingen innmålingsfil, koordinater, valideringsresultater/);
  assert.match(aboutSource, /gjennom Resend til mottakerens postkasse/);
  assert.match(aboutSource, /30 dagers datalagring/);
  assert.match(aboutSource, /mottakerens postkasse kan lagre meldingen lenger/);
  assert.match(aboutSource, /Kildekoden til GMI Validator er offentlig tilgjengelig/);
  assert.match(aboutSource, /Jeg ønsker at GMI Validator skal være så åpent og transparent som mulig/);
  assert.doesNotMatch(aboutSource, /\[Personlig tekst legges inn her\.\]/);
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

test('Nytt presents the two newest feature highlights with restrained mockups', () => {
  const newsStart = modalSource.indexOf('function NewsContent');
  const historyStart = modalSource.indexOf('function HistoryContent');
  const newsSource = modalSource.slice(newsStart, historyStart);

  assert.match(newsSource, /<AppInfoHero title="Nytt" \/>/);
  assert.match(newsSource, /NEWS_HIGHLIGHTS\.map/);
  assert.match(newsSource, /<article/);
  assert.match(newsSource, /<ReleaseMeta release=\{highlight\.release\} \/>/);
  assert.match(newsSource, /<NewsHighlightMockup type=\{highlight\.mockup\} \/>/);
  assert.doesNotMatch(newsSource, /releaseEntry\.news\.map|ReleaseDetails/);

  assert.match(modalSource, /version === '1\.1\.0'/);
  assert.match(modalSource, /title: 'Informasjon, nyheter og versjonshistorikk'/);
  assert.match(modalSource, /Om, Nytt, Versjonshistorikk, Fremtiden og Kontakt/);
  assert.match(modalSource, /version === '1\.0\.0'/);
  assert.match(modalSource, /title: 'Ny statistikkvisning'/);
  assert.match(modalSource, /fordeling per kommune/);
  assert.match(modalSource, /mockup: 'info'/);
  assert.match(modalSource, /mockup: 'statistics'/);
  assert.match(modalSource, /function InfoModalMockup/);
  assert.match(modalSource, /function StatisticsMockup/);
  assert.match(modalSource, /Utvikling over tid/);
  assert.match(modalSource, /if \(activeTab === 'news'\) return <NewsContent \/>;/);
  assert.match(modalSource, /if \(activeTab === 'future'\) return <FutureContent \/>;/);
  assert.doesNotMatch(modalSource, /onHistory/);
  assert.match(catalogSource, /Informasjon, nyheter og versjonshistorikk/);
  assert.match(catalogSource, /Ny statistikkvisning/);
  assert.match(catalogSource, /version: '1\.1\.0'/);
  assert.match(catalogSource, /version: '1\.0\.2'/);
  assert.match(catalogSource, /version: '1\.0\.1'/);
  assert.match(catalogSource, /version: '1\.0\.0'/);
  assert.match(catalogSource, /announce: true/);
  assert.match(modalSource, /CURRENT_APP_VERSION/);
  assert.match(modalSource, /APP_RELEASES\.map/);
});

test('future roadmap stays separate from released versions and has no date', () => {
  const aboutStart = modalSource.indexOf('function AboutContent');
  const futureStart = modalSource.indexOf('function FutureContent');
  const futureEnd = modalSource.indexOf('function ReleaseDetails', futureStart);
  const aboutSource = modalSource.slice(aboutStart, futureStart);
  const futureSource = modalSource.slice(futureStart, futureEnd);
  assert.doesNotMatch(aboutSource, /Videre utvikling|1\.2\.0|Validator 2\.0/);
  assert.match(futureSource, /<AppInfoHero title="Fremtiden – videre utvikling" \/>/);
  assert.doesNotMatch(futureSource, /app-info-roadmap-heading|<h3[^>]*>Videre utvikling<\/h3>/);

  const screenshotRoadmapStart = futureSource.indexOf('Bedre tilbakemeldinger');
  const validatorRoadmapStart = futureSource.indexOf('Validator 2.0 (beta)');
  assert.ok(screenshotRoadmapStart > 0 && validatorRoadmapStart > screenshotRoadmapStart);
  const roadmapStart = screenshotRoadmapStart;
  assert.ok(roadmapStart > 0);
  const roadmapSource = futureSource.slice(roadmapStart);

  assert.match(roadmapSource, /versjon 1\.2\.0/);
  assert.match(roadmapSource, /v1\.2\.0/);
  assert.match(roadmapSource, /Validator 2\.0 \(beta\)/);
  assert.match(roadmapSource, /Bedre tilbakemeldinger/);
  assert.match(roadmapSource, /Planlagt støtte for å legge ved skjermbilder i Kontakt-skjemaet, slik at feil og visuelle problemer blir enklere å beskrive\./);
  assert.match(roadmapSource, /Den nye valideringslogikken gir tydeligere kontroller/);
  assert.match(roadmapSource, /Planlagt/);
  assert.match(roadmapSource, /Planene kan endres etter hvert som funksjonene utvikles og testes/);
  assert.doesNotMatch(roadmapSource, /Senere:|Videre forbedringer av tabellvisning/);
  assert.doesNotMatch(roadmapSource, /202\d|releasedOn|januar|august/);
  assert.doesNotMatch(catalogSource, /1\.2\.0|Validator 2\.0/);
});

test('all tabs use the shared hero titles without redundant lower page headings', () => {
  for (const title of [
    'Et verktøy for kontroll og utforsking av VA-innmålingsleveranser',
    'Nytt',
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

test('contact form keeps the C1 payload boundary and accessible form contract', () => {
  const contactStart = modalSource.indexOf('function ContactContent');
  const contactEnd = modalSource.indexOf('function TabContent');
  const contactSource = modalSource.slice(contactStart, contactEnd);
  const sourceLinkStart = modalSource.indexOf('function SourceCodeLink');
  const sourceLinkEnd = modalSource.indexOf('function AppInfoHero');
  const sourceLinkSource = modalSource.slice(sourceLinkStart, sourceLinkEnd);

  assert.match(contactSource, /<ContactForm \/>/);
  assert.match(contactSource, /<AppInfoHero title="Kontakt" \/>/);
  assert.match(contactSource, /Har du funnet en feil/);
  assert.match(contactSource, /flex max-w-\[54rem\] items-start gap-2\.5 rounded-lg border border-cyan-100 bg-cyan-50\/70 px-3 py-2\.5/);
  assert.doesNotMatch(contactSource, /<InfoIcon size=\{17\} weight="regular" aria-hidden="true"/);
  assert.match(contactSource, /<span className="mr-1\.5 inline-flex rounded-md bg-cyan-100 px-1\.5 py-0\.5 text-xs font-semibold leading-5 text-cyan-800">Planlagt<\/span>/);
  assert.match(contactSource, /Mulighet for å legge ved skjermbilder kommer i en senere versjon\./);
  assert.doesNotMatch(contactSource, /GitHub|github|SourceCodeLink|Kildekode/);
  assert.match(contactFormSource, /<form/);
  assert.match(contactFormSource, /<select/);
  for (const category of [
    "value: 'bug', label: 'Feil'",
    "value: 'suggestion', label: 'Forslag'",
    "value: 'comment', label: 'Kommentar'",
    "value: 'other', label: 'Annet'",
  ]) {
    assert.match(contactFormSource, new RegExp(category));
  }
  assert.match(contactFormSource, /name="category"/);
  assert.match(contactFormSource, /required/);
  assert.match(contactFormSource, /type="email"/);
  assert.match(contactFormSource, /autoComplete="email"/);
  assert.match(contactFormSource, /E-post[\s\S]*valgfritt/);
  assert.match(contactFormSource, /<textarea/);
  assert.match(contactFormSource, /name="message"/);
  assert.match(contactFormSource, /maxLength=\{4000\}/);
  assert.match(contactFormSource, /name="website"/);
  assert.match(contactFormSource, /tabIndex=\{-1\}/);
  assert.match(contactFormSource, /aria-hidden="true"/);
  assert.match(contactFormSource, /buildContactPayload = \(\{ category, message, name, email, website \}\) => \(\{/);
  assert.match(contactFormSource, /fetch\('\/api\/contact'/);
  assert.match(contactFormSource, /method: 'POST'/);
  assert.match(contactFormSource, /Content-Type.*application\/json/);
  assert.match(contactFormSource, /aria-busy=\{isSubmitting\}/);
  assert.match(contactFormSource, /disabled=\{isSubmitting\}/);
  assert.match(contactFormSource, /role="status"/);
  assert.match(contactFormSource, /aria-live="polite"/);
  assert.match(contactFormSource, /const successActionRef = useRef\(null\)/);
  assert.match(contactFormSource, /const previousStatusRef = useRef\(status\)/);
  assert.match(contactFormSource, /status === 'success'[\s\S]*successActionRef\.current\?\.focus\(\)/);
  assert.match(contactFormSource, /status === 'idle' && previousStatusRef\.current === 'success'[\s\S]*fieldRefs\.current\.category\?\.focus\(\)/);
  assert.match(contactFormSource, /ref=\{successActionRef\}/);
  assert.match(contactFormSource, /Bare det du skriver her/);
  assert.match(contactFormSource, /via Resend til mottakerens postkasse/);
  assert.match(contactFormSource, /Ingen fil- eller valideringsdata legges ved/);
  assert.match(contactFormSource, /Takk! Tilbakemeldingen er sendt/);
  assert.match(contactFormSource, /name="name"/);
  assert.match(contactFormSource, /autoComplete="name"/);
  assert.match(contactFormSource, /gmi-validering:contact-profile:v1/);
  assert.doesNotMatch(contactFormSource, /type="file"|attachment|screenshot/i);
  assert.doesNotMatch(contactFormSource, /zustand|useStore|coordinates|municipality|WMS|telemetry|parser|file upload/i);
  assert.doesNotMatch(contactFormSource, /dangerouslySetInnerHTML|from ['"]lucide-react['"]|<svg\b/);
  assert.doesNotMatch(contactFormSource, /NEXT_PUBLIC_RESEND|RESEND_API_KEY|CONTACT_TO_EMAIL|CONTACT_FROM_EMAIL|api\.resend\.com/i);
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
