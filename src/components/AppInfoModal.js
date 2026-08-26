'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  ChartBarIcon,
  GithubLogoIcon,
  InfoIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  APP_RELEASES,
  CURRENT_APP_VERSION,
} from '@/data/appReleases.mjs';
import ContactForm from './ContactForm';

const PUBLIC_REPO_URL = 'https://github.com/pb-bennett/gmi-validering';
const APP_INFO_TAB_CONTENT_CLASS = 'space-y-7 [&>*:not(:first-child)]:mx-2';

const TABS = [
  { id: 'about', label: 'Om' },
  { id: 'news', label: 'Nytt' },
  { id: 'history', label: 'Versjonshistorikk' },
  { id: 'future', label: 'Fremtiden' },
  { id: 'contact', label: 'Kontakt' },
];

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const formatReleaseDate = (releasedOn) => {
  if (!releasedOn) return null;

  return new Date(`${releasedOn}T12:00:00Z`).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const isTabId = (value) => TABS.some((tab) => tab.id === value);

function ReleaseMeta({ release: releaseEntry, current = false, announced = false }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-slate-500">
      <span className="rounded-md bg-slate-900 px-2 py-1 font-semibold text-white">
        v{releaseEntry.version}
      </span>
      {releaseEntry.releasedOn && <span>{formatReleaseDate(releaseEntry.releasedOn)}</span>}
      {current && (
        <span className="rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-semibold text-cyan-800">
          Gjeldende versjon
        </span>
      )}
      {announced && (
        <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-800">
          Ny
        </span>
      )}
    </div>
  );
}

function SourceCodeLink() {
  return (
    <a
      href={PUBLIC_REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-2.5 rounded-lg border border-slate-700 bg-slate-700 px-4 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-600 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
    >
      <GithubLogoIcon size={23} weight="regular" aria-hidden="true" />
      Se kildekoden på GitHub
      <ArrowSquareOutIcon size={15} weight="regular" aria-hidden="true" className="text-slate-400" />
    </a>
  );
}

function AppInfoHero({ title, eyebrow = 'GMI Validator', version = CURRENT_APP_VERSION }) {
  return (
      <section className="relative overflow-hidden rounded-t-2xl rounded-b-none bg-slate-950 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-8">
      <div className="absolute right-0 top-0 h-32 w-32 translate-x-12 -translate-y-12 rounded-full border-[18px] border-cyan-400/20" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
          <span>{eyebrow}</span>
          <span className="h-1 w-1 rounded-full bg-cyan-300" aria-hidden="true" />
          <span>v{version}</span>
        </div>
        <h3 className="app-info-hero-title">{title}</h3>
      </div>
    </section>
  );
}

function AboutContent() {
  return (
    <div className={APP_INFO_TAB_CONTENT_CLASS}>
      <AppInfoHero title="Et verktøy for kontroll og utforsking av VA-innmålingsleveranser" />

      <section aria-labelledby="app-info-what-heading">
        <h3 id="app-info-what-heading" className="text-xl font-bold tracking-[-0.01em] text-slate-900">Hva er dette?</h3>
        <div className="mt-4 max-w-[54rem] space-y-4 text-base leading-[1.6] text-slate-700">
          <p>
            Dette er et verktøy for å utforske og validere VA-innmålingsfiler. Slike filer leveres typisk av entreprenører til kommuner i sluttfasen av infrastrukturprosjekter.
          </p>
          <p>
            Hovedfokuset er full støtte for Geminis eget GMI-format, men verktøyet har også begrenset støtte for SOSI- og KOF-formatene.
          </p>
          <div>
            <p>Blant annet kan man:</p>
            <ul className="mt-2 list-disc space-y-2 pl-5 leading-[1.6]">
              <li>Laste inn flere filer i samme sesjon</li>
              <li>Visualisere innmålingsdata i både 2D og 3D</li>
              <li>Filtrere og fremheve objekter etter verdier i datafeltene</li>
              <li>Vise objektene i en tilpassbar datatabell</li>
              <li>Kontrollere og visualisere fall og estimert overdekning for ledninger i profil</li>
              <li>Validere datafeltene mot kravene i innmålingsinstruksen</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="relative border-t border-slate-200 pt-7 before:absolute before:left-0 before:-top-px before:h-px before:w-12 before:bg-cyan-300 before:content-['']" aria-labelledby="app-info-why-heading">
        <h3 id="app-info-why-heading" className="text-xl font-bold tracking-[-0.01em] text-slate-900">Hvorfor finnes det?</h3>
        <div className="mt-4 max-w-[54rem] space-y-4 text-base leading-[1.6] text-slate-700">
          <p>
            Det finnes allerede gode og omfattende verktøy i bransjen, men de er ikke nødvendigvis laget for den konkrete oppgaven med å gå gjennom og kontrollere en innmålingsleveranse. Noen krever mye erfaring og opplæring, andre er kostbare og utviklet for langt flere oppgaver enn dette.
          </p>
          <p>
            Selve kontrollarbeidet innebærer ofte mange manuelle steg. Filer må åpnes og visninger tilpasses, man må klikke seg frem og tilbake mellom objekter og egenskaper, og krav og tillatte verdier må gjerne slås opp i innmålingsinstruksen underveis. Mye av dette gjentas for hver nye leveranse.
          </p>
          <p>
            I utgangspunktet var planen bare å lage et enkelt verktøy for meg selv, tilpasset måten jeg faktisk jobbet med disse leveransene på. Etter hvert ble det tydelig at mange andre kunne ha nytte av det samme, særlig hvis verktøyet kunne gjøres enkelt å bruke og tilgjengelig uten en høy terskel for å komme i gang.
          </p>
          <p>
            Målet ble derfor å lage et enklere og mer målrettet verktøy som kan redusere det repetitive kontrollarbeidet, samle relevant informasjon på ett sted og gjøre det lettere å finne det som faktisk bør undersøkes nærmere.
          </p>
        </div>
      </section>

      <section className="relative border-t border-slate-200 pt-7 before:absolute before:left-0 before:-top-px before:h-px before:w-12 before:bg-cyan-300 before:content-['']" aria-labelledby="app-info-not-heading">
        <h3 id="app-info-not-heading" className="text-xl font-bold tracking-[-0.01em] text-slate-900">Hva er dette ikke?</h3>
        <div className="mt-4 max-w-[54rem] space-y-4 text-base leading-[1.6] text-slate-700">
          <p>
            GMI Validator er ikke ment å være en fasit på om en leveranse skal godkjennes eller avvises. Automatiske kontroller kan finne mangler, uventede verdier og andre forhold som bør undersøkes nærmere, men resultatene må fortsatt vurderes sammen med fagkunnskap, prosjektkrav og øvrig dokumentasjon.
          </p>
          <p>
            Verktøyet er heller ikke ment som en erstatning for Gemini VA, Gemini Terrain eller andre komplette fag- og GIS-systemer. Det er laget for en langt smalere oppgave: å gjøre det enklere å undersøke og kontrollere innmålingsleveranser.
          </p>
          <p>
            GMI Validator er et selvstendig og ikke-kommersielt prosjekt. Det er ikke utviklet av, for eller i samarbeid med Invera, som eier Gemini-produktene. Det er heller ingen planer om reklame, abonnementer eller betalte funksjoner.
          </p>
        </div>
      </section>

      <section className="relative border-t border-slate-200 pt-7 before:absolute before:left-0 before:-top-px before:h-px before:w-12 before:bg-cyan-300 before:content-['']" aria-labelledby="app-info-who-am-heading">
        <h3 id="app-info-who-am-heading" className="text-xl font-bold tracking-[-0.01em] text-slate-900">Hvem er jeg?</h3>
        <div className="mt-4 max-w-[54rem] space-y-4 text-base leading-[1.6] text-slate-700">
          <p>
            Jeg har jobbet med kommunalteknikk i over seks år, og har blant annet arbeidet med behandling og kontroll av VA-innmålinger i Gemini VA og Portal+. Den siste tiden har jeg også fått arbeide med Gemini Terrain, der jeg virkelig fikk erfare hvor nyttig en god 3D-visning kan være når man skal forstå og kontrollere innmålingsdata.
          </p>
          <p>
            På fritiden driver jeg også med utvikling, hovedsakelig webutvikling. Etter hvert som AI-verktøy for programmering har blitt stadig bedre, har det blitt mulig for meg å utvikle nyttige verktøy på en måte som tidligere ville vært altfor tidkrevende å kombinere med jobb og resten av livet.
          </p>
        </div>
      </section>

      <section className="relative min-h-32 border-t border-slate-200 pt-7 before:absolute before:left-0 before:-top-px before:h-px before:w-12 before:bg-cyan-300 before:content-['']" aria-labelledby="app-info-who-heading">
        <h3 id="app-info-who-heading" className="text-xl font-bold tracking-[-0.01em] text-slate-900">Hvem er du?</h3>
        <div className="mt-4 max-w-[54rem] space-y-4 text-base leading-[1.6] text-slate-700">
          <p>
            GMI Validator er først og fremst laget for deg som arbeider med innmålingsleveranser innen VA. Det kan være større leveranser fra entreprenører i forbindelse med kommunale infrastrukturprosjekter, der du allerede har god erfaring med Gemini VA eller andre GIS-verktøy og ønsker en raskere måte å få oversikt over og kontrollere dataene på.
          </p>
          <p>
            Verktøyet er også ment for saksbehandlere som mottar innmålinger av for eksempel private VA-tilknytninger, og som har behov for en enkel måte å åpne og visualisere dataene selv uten å måtte sette opp et større fag- eller GIS-system.
          </p>
          <p>
            Entreprenører kan på sin side bruke GMI Validator til raske kontroller før en leveranse sendes inn, eller som en enkel måte å vise og dele innholdet i en innmålingsfil med andre i bransjen.
          </p>
        </div>
      </section>

      <section className="relative border-t border-slate-200 pt-7 before:absolute before:left-0 before:-top-px before:h-px before:w-12 before:bg-cyan-300 before:content-['']" aria-labelledby="app-info-transparency-heading">
        <h3 id="app-info-transparency-heading" className="text-xl font-bold tracking-[-0.01em] text-slate-900">Nysgjerrig eller bekymret?</h3>
        <div className="mt-4 max-w-[54rem] space-y-4 text-base leading-[1.6] text-slate-700">
          <p>
            Det er sunt å ta sikkerhet og personvern på alvor, særlig i dagens digitale hverdag. Det er derfor helt naturlig å være nysgjerrig på, eller litt skeptisk til, hva som skjer når man åpner en innmålingsfil i et nettbasert verktøy.
          </p>
          <p>
            Det meste skjer lokalt i nettleseren på din egen PC. Selve GMI-, SOSI- eller KOF-filen lastes ikke opp til serveren, og innholdet leses, kontrolleres og visualiseres lokalt.
          </p>
          <p>
            Enkelte funksjoner trenger eksterne data. For terrengprofiler og beregning av overdekning sendes koordinatpunkter langs ledningene automatisk til Kartverket. Kartverket brukes også til enkelte punkt- og kommuneoppslag, og karttjenestene mottar informasjon om området som vises på kartet. Selve innmålingsfilen sendes ikke med disse forespørslene.
          </p>
          <p>
            Ved en vellykket innlasting beregnes også et punkt som brukes til å finne hvilken kommune leveransen ligger i. Statistikken lagres som aggregerte tellinger per kommune, dato og time, ikke som enkeltleveranser. Filnavn, rå filinnhold, objektdata og koordinater lagres ikke i statistikkdatabasen.
          </p>
          <p>
            GMI Validator bruker også Vercel Web Analytics til anonym statistikk over sidevisninger og vanlig informasjon om bruken av nettstedet. Appen sender ikke filinnhold eller filrelaterte data til denne tjenesten.
          </p>
          <p>
            Når du velger å sende tilbakemelding gjennom Kontakt, sendes bare det du skriver i skjemaet gjennom Resend til mottakerens postkasse. En eventuell e-postadresse tas bare med hvis du fyller den ut, og appversjonen legges til av serveren. Ingen innmålingsfil, koordinater, valideringsresultater eller annen fil- og applikasjonstilstand legges ved. Resend oppgir for tiden 30 dagers datalagring, mens mottakerens postkasse kan lagre meldingen lenger. Endelig bekreftelse av innstillinger og lagring gjøres før produksjonssetting.
          </p>
          <p>
            Kildekoden til GMI Validator er offentlig tilgjengelig. Hvis du ønsker det, kan du selv se hvordan filer behandles, hvilke eksterne tjenester som brukes, hvordan kontrollene fungerer og hvordan verktøyet er bygget.
          </p>
          <p>
            Jeg ønsker at GMI Validator skal være så åpent og transparent som mulig. Finner du noe du reagerer på, har spørsmål om hvordan noe fungerer, eller mener noe burde gjøres annerledes, vil jeg gjerne høre om det.
          </p>
        </div>
        <div className="mt-4">
          <SourceCodeLink />
        </div>
      </section>
    </div>
  );
}

function FutureContent() {
  return (
    <div className={APP_INFO_TAB_CONTENT_CLASS}>
      <AppInfoHero title="Fremtiden – videre utvikling" />
      <section>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white">v1.2.0</span>
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">Planlagt</span>
          </div>
          <h4 className="mt-3 text-base font-bold text-slate-900">Validator 2.0 (beta)</h4>
          <p className="mt-1.5 text-[15px] leading-[1.6] text-slate-600">
            Neste større steg er planlagt til versjon 1.2.0, der Validator 2.0 introduseres som beta. Den nye valideringslogikken gir tydeligere kontroller, bedre resultatvisning og mer detaljert informasjon om feltene som kontrolleres.
          </p>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">Planene kan endres etter hvert som funksjonene utvikles og testes.</p>
      </section>
    </div>
  );
}

function ReleaseDetails({ release: releaseEntry }) {
  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500">Endringer</h3>
      <ul className="mt-3 space-y-3 text-[15px] leading-[1.6] text-slate-600">
        {releaseEntry.changes.map((change) => (
          <li key={change} className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" aria-hidden="true" />
            <span>{change}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const NEWS_HIGHLIGHTS = [
  {
    id: 'app-info',
    release: APP_RELEASES.find((entry) => entry.version === '1.1.0'),
    title: 'Informasjon, nyheter og versjonshistorikk',
    body: 'Appen har fått et innebygd informasjonsområde med Om, Nytt, Versjonshistorikk, Fremtiden og Kontakt. Det gjør det enklere å forstå hva verktøyet er, hva som har endret seg, hva som er planlagt, og hvordan data og personvern håndteres.',
    mockup: 'info',
  },
  {
    id: 'statistics',
    release: APP_RELEASES.find((entry) => entry.version === '1.0.0'),
    title: 'Ny statistikkvisning',
    body: 'Statistikkdelen gir en tydeligere oversikt over bruk og aktivitet, med fordeling per kommune og enklere inspeksjon av utviklingen over tid. Det gjør statistikken lettere å lese og sammenligne.',
    mockup: 'statistics',
  },
].filter((highlight) => highlight.release);

function InfoModalMockup() {
  return (
    <div
      className="rounded-xl border border-slate-300 bg-slate-100 p-2 shadow-sm"
      aria-hidden="true"
    >
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-cyan-100 text-cyan-700">
            <InfoIcon size={12} weight="regular" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[10px] font-bold text-slate-900">
                GMI Validator
              </span>
              <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[8px] font-bold text-cyan-800">
                v1.1.0
              </span>
            </div>
            <span className="block truncate text-[8px] text-slate-500">
              Informasjon, nyheter og versjonshistorikk
            </span>
          </div>
        </div>
        <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[8px] font-semibold text-slate-500">
          <span className="rounded bg-slate-200 px-1.5 py-1 text-slate-900">Om</span>
          <span className="rounded px-1.5 py-1">Nytt</span>
          <span className="rounded px-1.5 py-1">Versjonshistorikk</span>
        </div>
        <div className="bg-slate-950 px-3 py-3 text-white">
          <div className="h-1 w-8 rounded-full bg-cyan-300" />
          <div className="mt-2 h-2 w-3/4 rounded bg-white/90" />
          <div className="mt-1.5 h-1.5 w-full rounded bg-white/25" />
          <div className="mt-1 h-1.5 w-5/6 rounded bg-white/15" />
        </div>
        <div className="space-y-2 px-3 py-3">
          <div className="h-2 w-2/3 rounded bg-slate-200" />
          <div className="h-1.5 w-full rounded bg-slate-100" />
          <div className="h-1.5 w-5/6 rounded bg-slate-100" />
          <div className="h-1.5 w-1/2 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function StatisticsMockup() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="flex justify-end">
        <div className="inline-flex items-center gap-2 rounded-xl border border-pink-700 bg-pink-600 px-3 py-2 text-[10px] font-medium text-white shadow-md shadow-pink-900/20">
          <ChartBarIcon size={14} weight="regular" aria-hidden="true" />
          <span className="flex items-center gap-1.5">
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[8px] font-bold text-white">
              Ny
            </span>
            <span>Statistikk</span>
          </span>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
            Utvikling over tid
          </span>
          <span className="text-[9px] text-slate-400">Måned</span>
        </div>
        <div className="relative h-20 w-full overflow-hidden">
          <div className="absolute inset-x-0 top-1/4 border-t border-slate-100" />
          <div className="absolute inset-x-0 top-1/2 border-t border-slate-100" />
          <div className="absolute inset-x-0 top-3/4 border-t border-slate-100" />
          <div
            className="absolute inset-0 bg-cyan-600"
            style={{
              clipPath:
                'polygon(0% 73%, 16% 60%, 32% 66%, 48% 39%, 64% 47%, 80% 24%, 100% 31%, 100% 34%, 80% 28%, 64% 50%, 48% 42%, 32% 69%, 16% 63%, 0% 76%)',
            }}
          />
          <div
            className="absolute inset-0 bg-slate-500"
            style={{
              clipPath:
                'polygon(0% 85%, 16% 74%, 32% 80%, 48% 62%, 64% 68%, 80% 47%, 100% 53%, 100% 56%, 80% 51%, 64% 71%, 48% 65%, 32% 83%, 16% 77%, 0% 88%)',
            }}
          />
          <div
            className="absolute inset-0 bg-slate-300"
            style={{
              clipPath:
                'polygon(0% 92%, 16% 88%, 32% 90%, 48% 78%, 64% 83%, 80% 68%, 100% 73%, 100% 76%, 80% 72%, 64% 86%, 48% 81%, 32% 93%, 16% 91%, 0% 95%)',
            }}
          />
        </div>
        <div className="mt-1 flex gap-3 text-[9px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-cyan-600" />Totalt</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-500" />Kommune</span>
        </div>
      </div>
    </div>
  );
}

function NewsHighlightMockup({ type }) {
  return type === 'info' ? <InfoModalMockup /> : <StatisticsMockup />;
}

function NewsContent() {
  return (
    <div className={APP_INFO_TAB_CONTENT_CLASS}>
      <AppInfoHero title="Nytt" />

      <div className="space-y-5">
        {NEWS_HIGHLIGHTS.map((highlight) => (
          <article
            key={highlight.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-center">
              <div>
                <ReleaseMeta release={highlight.release} />
                <h3 className="mt-3 text-lg font-bold tracking-[-0.01em] text-slate-900">
                  {highlight.title}
                </h3>
                <p className="mt-2 max-w-[54rem] text-[15px] leading-[1.6] text-slate-600">
                  {highlight.body}
                </p>
              </div>
              <NewsHighlightMockup type={highlight.mockup} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function HistoryContent({ expandedVersion, onToggle }) {
  return (
    <div className={APP_INFO_TAB_CONTENT_CLASS}>
      <AppInfoHero title="Versjonshistorikk" />
      <div>
        <p className="text-[15px] leading-[1.6] text-slate-600">Nyeste versjon først. Dette er starten på den formelle historikken for GMI Validator.</p>
      </div>
      <ol className="relative space-y-3 border-l border-slate-200 pl-4 sm:pl-5">
        {APP_RELEASES.map((releaseEntry) => {
          const expanded = expandedVersion === releaseEntry.version;
          const changesId = `release-${releaseEntry.version.replaceAll('.', '-')}-changes`;

          return (
            <li key={releaseEntry.version} className="relative">
              <span className="absolute -left-[1.3rem] top-5 h-2.5 w-2.5 rounded-full border-2 border-white bg-cyan-500 ring-1 ring-cyan-200 sm:-left-[1.4rem]" aria-hidden="true" />
              <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={changesId}
                  onClick={() => onToggle(releaseEntry.version)}
                  className="flex min-h-20 w-full items-start justify-between gap-4 rounded-xl px-4 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600"
                >
                  <span className="min-w-0">
                    <ReleaseMeta release={releaseEntry} current={releaseEntry.version === CURRENT_APP_VERSION} />
                    <span className="mt-3 block font-bold text-slate-900">{releaseEntry.title}</span>
                    <span className="mt-1 block text-[15px] leading-[1.6] text-slate-600">{releaseEntry.summary}</span>
                  </span>
                  <CaretDownIcon
                    size={20}
                    weight="regular"
                    aria-hidden="true"
                    className={`mt-0.5 shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>
                <div id={changesId} hidden={!expanded} className="px-4 pb-4">
                  {expanded && <ReleaseDetails release={releaseEntry} />}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ContactContent() {
  return (
    <div className={APP_INFO_TAB_CONTENT_CLASS}>
      <AppInfoHero title="Kontakt" />
      <section aria-labelledby="app-info-contact-heading">
        <h3 id="app-info-contact-heading" className="sr-only">Tilbakemeldinger</h3>
        <p className="max-w-[54rem] text-base leading-[1.6] text-slate-700">
          Har du funnet en feil, har en kommentar, et forslag eller en idé til noe som kan gjøres bedre? Jeg vil gjerne høre fra deg.
        </p>
        <ContactForm />
      </section>
    </div>
  );
}

function TabContent({ activeTab }) {
  if (activeTab === 'news') return <NewsContent />;
  if (activeTab === 'history') return null;
  if (activeTab === 'future') return <FutureContent />;
  if (activeTab === 'contact') return <ContactContent />;
  return <AboutContent />;
}

export default function AppInfoModal({
  isOpen,
  initialTab = 'about',
  onClose,
  openerRef,
}) {
  const [activeTab, setActiveTab] = useState(isTabId(initialTab) ? initialTab : 'about');
  const [expandedVersion, setExpandedVersion] = useState(CURRENT_APP_VERSION);
  const dialogRef = useRef(null);
  const tabRefs = useRef([]);
  const wasOpenRef = useRef(false);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      if (wasOpenRef.current) {
        const opener = openerRef?.current;
        const previous = restoreFocusRef.current;
        const target =
          previous && previous !== document.body && document.contains(previous)
            ? previous
            : opener && document.contains(opener)
              ? opener
              : null;
        target?.focus?.();
        wasOpenRef.current = false;
      }
      return;
    }

    if (!wasOpenRef.current) {
      restoreFocusRef.current = document.activeElement;
      wasOpenRef.current = true;
    }
    startTransition(() => {
      setActiveTab(isTabId(initialTab) ? initialTab : 'about');
    });
  }, [initialTab, isOpen, openerRef]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const index = TABS.findIndex((tab) => tab.id === activeTab);
      tabRefs.current[index]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, isOpen]);

  const handleTabKeyDown = (event, index) => {
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    setActiveTab(TABS[nextIndex].id);
  };

  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.stopPropagation();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-info-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
        className="app-info-dialog relative flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
          <div className="app-info-inner pr-14">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center">
                <InfoIcon size={32} weight="regular" aria-hidden="true" className="text-cyan-700" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h2 id="app-info-title" className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">GMI Validator</h2>
                  <span className="rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-bold text-cyan-800">v{CURRENT_APP_VERSION}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">Informasjon, nyheter og versjonshistorikk</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="absolute right-5 top-5 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:right-7"
          >
            <XIcon size={20} weight="regular" aria-hidden="true" />
          </button>
        </header>

        <div
          role="tablist"
          aria-label="Informasjonsseksjoner"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/80 px-5 py-2 sm:px-7"
        >
          <div className="app-info-inner flex gap-1 overflow-x-auto">
            {TABS.map((tab, index) => (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`app-info-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`app-info-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:px-4 ${
                  activeTab === tab.id
                    ? 'bg-slate-200 text-slate-900 shadow-sm ring-1 ring-slate-300'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain app-info-scroll px-5 py-6 sm:px-7 sm:py-7">
          <div
            id={`app-info-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`app-info-tab-${activeTab}`}
            tabIndex={0}
            className="app-info-inner focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {activeTab === 'history' ? (
              <HistoryContent
                expandedVersion={expandedVersion}
                onToggle={(version) =>
                  setExpandedVersion((current) => (current === version ? null : version))
                }
              />
            ) : (
              <TabContent activeTab={activeTab} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
