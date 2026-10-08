'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  GithubLogoIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  APP_RELEASES,
  CURRENT_APP_RELEASE,
  CURRENT_APP_VERSION,
} from '@/data/appReleases.mjs';
import ContactForm from './ContactForm';
import BrandWordmark from './BrandWordmark';

const PUBLIC_REPO_URL = 'https://github.com/pb-bennett/gmi-validering';
const APP_INFO_TAB_CONTENT_CLASS = 'space-y-7 [&>*:not(:first-child)]:mx-2';
const CONTACT_TAB_CONTENT_CLASS = 'space-y-4 [&>*:not(:first-child)]:mx-2';

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
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-gmi-text-subtle">
      <span className="rounded-md bg-gmi-navy px-2 py-1 font-semibold text-white">
        v{releaseEntry.version}
      </span>
      {releaseEntry.releasedOn && <span>{formatReleaseDate(releaseEntry.releasedOn)}</span>}
      {current && (
        <span className="rounded-full bg-gmi-cyan-soft px-2 py-1 text-[11px] font-semibold text-gmi-interactive">
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
      className="inline-flex min-h-11 items-center gap-2.5 rounded-lg border border-gmi-text bg-gmi-text px-4 text-sm font-semibold text-gmi-text-on-dark transition-colors hover:border-gmi-text-muted hover:bg-gmi-text-muted hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gmi-brand-cyan"
    >
      <GithubLogoIcon size={23} weight="regular" aria-hidden="true" />
      Se kildekoden på GitHub
      <ArrowSquareOutIcon size={15} weight="regular" aria-hidden="true" className="text-gmi-text-on-dark" />
    </a>
  );
}

function AppInfoHero({ title, eyebrow = 'GMI Validator', version = CURRENT_APP_VERSION }) {
  return (
      <section className="relative overflow-hidden rounded-t-2xl rounded-b-none bg-gmi-ink px-5 py-6 text-white shadow-sm sm:px-7 sm:py-5 app-info-hero">
      <div className="absolute right-0 top-0 h-32 w-32 translate-x-12 -translate-y-12 rounded-full border-[18px] border-gmi-brand-cyan/20" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gmi-brand-cyan">
          <span>{eyebrow}</span>
          <span className="h-1 w-1 rounded-full bg-gmi-brand-cyan" aria-hidden="true" />
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
        <h3 id="app-info-what-heading" className="text-xl font-bold tracking-[-0.01em] text-gmi-navy">Hva er dette?</h3>
        <div className="mt-4 max-w-[54rem] space-y-4 text-base leading-[1.6] text-gmi-text">
          <p>
            Dette er et verktøy for å utforske og validere VA-innmålingsfiler. Slike filer leveres typisk av entreprenører til kommuner i sluttfasen av infrastrukturprosjekter.
          </p>
          <p>
            Hovedfokuset er GMI. Validator V2 kontrollerer utvalgte GMI-krav med kildegrunnlag; verktøyet dekker ikke alle mulige krav. SOSI og KOF har mer begrenset støtte og inngår ikke i Validator V2.
          </p>
          <div>
            <p>Blant annet kan man:</p>
            <ul className="mt-2 list-disc space-y-2 pl-5 leading-[1.6]">
              <li>Laste inn flere filer i samme sesjon</li>
              <li>Visualisere innmålingsdata i både 2D og 3D</li>
              <li>Filtrere og fremheve objekter etter verdier i datafeltene</li>
              <li>Vise objektene i en tilpassbar datatabell</li>
              <li>Kontrollere og visualisere fall og estimert overdekning for ledninger i profil</li>
              <li>Se FEIL og SJEKK med felt- og regeldetaljer, og åpne berørte objekter i datatabellen</li>
              <li>Kontrollere utvalgte GMI-felt mot kildebaserte regler med veiledning om verdier der den finnes</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="relative border-t border-gmi-border pt-7 before:absolute before:left-0 before:-top-px before:h-px before:w-12 before:bg-gmi-brand-cyan before:content-['']" aria-labelledby="app-info-why-heading">
        <h3 id="app-info-why-heading" className="text-xl font-bold tracking-[-0.01em] text-gmi-navy">Hvorfor finnes det?</h3>
        <div className="mt-4 max-w-[54rem] space-y-4 text-base leading-[1.6] text-gmi-text">
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

      <section className="relative border-t border-gmi-border pt-7 before:absolute before:left-0 before:-top-px before:h-px before:w-12 before:bg-gmi-brand-cyan before:content-['']" aria-labelledby="app-info-not-heading">
        <h3 id="app-info-not-heading" className="text-xl font-bold tracking-[-0.01em] text-gmi-navy">Hva er dette ikke?</h3>
        <div className="mt-4 max-w-[54rem] space-y-4 text-base leading-[1.6] text-gmi-text">
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

      <section className="relative border-t border-gmi-border pt-7 before:absolute before:left-0 before:-top-px before:h-px before:w-12 before:bg-gmi-brand-cyan before:content-['']" aria-labelledby="app-info-who-am-heading">
        <h3 id="app-info-who-am-heading" className="text-xl font-bold tracking-[-0.01em] text-gmi-navy">Hvem er jeg?</h3>
        <div className="mt-4 max-w-[54rem] space-y-4 text-base leading-[1.6] text-gmi-text">
          <p>
            Jeg har jobbet med kommunalteknikk i over seks år, og har blant annet arbeidet med behandling og kontroll av VA-innmålinger i Gemini VA og Portal+. Den siste tiden har jeg også fått arbeide med Gemini Terrain, der jeg virkelig fikk erfare hvor nyttig en god 3D-visning kan være når man skal forstå og kontrollere innmålingsdata.
          </p>
          <p>
            På fritiden driver jeg også med utvikling, hovedsakelig webutvikling. Etter hvert som AI-verktøy for programmering har blitt stadig bedre, har det blitt mulig for meg å utvikle nyttige verktøy på en måte som tidligere ville vært altfor tidkrevende å kombinere med jobb og resten av livet.
          </p>
        </div>
      </section>

      <section className="relative min-h-32 border-t border-gmi-border pt-7 before:absolute before:left-0 before:-top-px before:h-px before:w-12 before:bg-gmi-brand-cyan before:content-['']" aria-labelledby="app-info-who-heading">
        <h3 id="app-info-who-heading" className="text-xl font-bold tracking-[-0.01em] text-gmi-navy">Hvem er du?</h3>
        <div className="mt-4 max-w-[54rem] space-y-4 text-base leading-[1.6] text-gmi-text">
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

      <section className="relative border-t border-gmi-border pt-7 before:absolute before:left-0 before:-top-px before:h-px before:w-12 before:bg-gmi-brand-cyan before:content-['']" aria-labelledby="app-info-transparency-heading">
        <h3 id="app-info-transparency-heading" className="text-xl font-bold tracking-[-0.01em] text-gmi-navy">Nysgjerrig eller bekymret?</h3>
        <div className="mt-4 max-w-[54rem] space-y-4 text-base leading-[1.6] text-gmi-text">
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
            Ved en vellykket innlasting utenfor Testmodus kan et avledet punkt brukes til kommuneoppslag. Statistikken lagres som aggregerte tellinger per dato, time og kommune når den kan bestemmes; ellers brukes et grovere område eller ukjent kategori. Filnavn, rå filinnhold, objektdata og koordinater lagres ikke i statistikkaggregatene.
          </p>
          <p>
            GMI Validator bruker også Vercel Web Analytics for overordnet besøks- og bruksstatistikk. Appen sender ikke egne rå fildata eller filattributter til denne tjenesten.
          </p>
          <p>
            Når du velger å sende tilbakemelding gjennom Kontakt, sendes skjemainnholdet via Resend til konfigurert mottaker når e-postlevering er satt opp. Navn og e-post tas bare med hvis du oppgir dem, og appversjonen legges til av serveren. Ingen innmålingsfil, koordinater, valideringsresultater eller annen fil- og applikasjonstilstand legges ved. Lagring hos e-postleverandør og mottaker avhenger av deres innstillinger.
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
        <div className="space-y-4">
          <div className="rounded-xl border border-gmi-border bg-gmi-surface-soft px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gmi-interactive">Planlagt</span>
            </div>
            <h4 className="mt-3 text-base font-bold text-gmi-navy">Full støtte for bilder</h4>
            <p className="mt-1.5 text-[15px] leading-[1.6] text-gmi-text-muted">
              Videre arbeid vil gi bedre støtte for bilder gjennom hele arbeidsflyten, fra import og kontroll av bildefiler til plassering, kobling mot VA-objekter og eksport. Målet er å støtte bildeintegrasjon både mot GMI- og GML-filer, slik at bilder og tilhørende objekter kan kontrolleres og håndteres samlet i GMI Validator.
            </p>
          </div>
          <div className="rounded-xl border border-gmi-border bg-gmi-surface-soft px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gmi-interactive">Mulig</span>
            </div>
            <h4 className="mt-3 text-base font-bold text-gmi-navy">Redigering av feltverdier i GMI-filer</h4>
            <p className="mt-1.5 text-[15px] leading-[1.6] text-gmi-text-muted">
              Det vurderes også støtte for å gjøre enkle endringer i feltverdier direkte i opplastede GMI-filer. Målet er å kunne korrigere eller supplere egenskaper uten å endre geometrien, med tydelig skille mellom originaldata og redigerte verdier før filen lastes ned på nytt.
            </p>
          </div>
          <div className="rounded-xl border border-gmi-border bg-gmi-surface-soft px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gmi-interactive">Mulig</span>
            </div>
            <h4 className="mt-3 text-base font-bold text-gmi-navy">Bedre tilbakemeldinger</h4>
            <p className="mt-1.5 text-[15px] leading-[1.6] text-gmi-text-muted">
              Mulig støtte for å legge ved skjermbilder i Kontakt-skjemaet, slik at feil og visuelle problemer blir enklere å beskrive.
            </p>
          </div>
        </div>
        <p className="mt-2 text-sm leading-6 text-gmi-text-subtle">Planene kan endres etter hvert som funksjonene utvikles og testes.</p>
      </section>
    </div>
  );
}

function ReleaseDetails({ release: releaseEntry }) {
  return (
    <div className="mt-6 border-t border-gmi-border pt-5">
      <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-gmi-text-subtle">Endringer</h3>
      <ul className="mt-3 space-y-3 text-[15px] leading-[1.6] text-gmi-text-muted">
        {releaseEntry.changes.map((change) => (
          <li key={change} className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gmi-brand-cyan" aria-hidden="true" />
            <span>{change}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewsContent() {
  return (
    <div className={APP_INFO_TAB_CONTENT_CLASS} data-app-info-news>
      <AppInfoHero title="Nytt" />
      <article className="rounded-xl border border-gmi-border bg-gmi-surface p-4 shadow-sm sm:p-6 app-info-news-article">
        <div className="max-w-[54rem] space-y-6 app-info-news-body">
          <div>
            <ReleaseMeta release={CURRENT_APP_RELEASE} />
            <h3 className="mt-3 text-xl font-bold tracking-[-0.01em] text-gmi-navy">Nytt og mer helhetlig grensesnitt</h3>
            <p className="mt-3 text-[15px] leading-[1.7] text-gmi-text-muted">
              Hele GMI Validator har fått et omfattende visuelt løft. Utseendet er gjennomgått på tvers av hele løsningen, med et mer konsekvent designspråk for farger, typografi, knapper, paneler og ikoner. Målet har vært å gjøre appen mer ryddig, sammenhengende og moderne, samtidig som det blir enklere å orientere seg og bruke de ulike funksjonene. GMI Validator har også fått en ny logo og en oppdatert visuell profil.
            </p>
          </div>

          <section aria-labelledby="app-info-news-validator" className="border-t border-gmi-border pt-5">
            <h4 id="app-info-news-validator" className="text-base font-bold text-gmi-navy">Validator V2</h4>
            <p className="mt-2 text-[15px] leading-[1.7] text-gmi-text-muted">
              Validator-modulen er bygget helt på nytt. Dette er en fullstendig overhaling av den tidligere løsningen, med ny logikk, tydeligere resultater og et oppsett som nå er praktisk anvendelig til kontroll av GMI-filer.
            </p>
            <p className="mt-3 text-[15px] leading-[1.7] text-gmi-text-muted">
              Valideringen bygger på kravene i den nye innmålingsinstruksen. I tillegg har jeg lagt inn enkelte kontroller og vurderinger basert på egne erfaringer fra mottak og kontroll av innmålingsdata.
            </p>
            <p className="mt-3 text-[15px] leading-[1.7] text-gmi-text-muted">
              Resultatene deles i to hovedkategorier:
            </p>
            <ul className="mt-3 space-y-3 text-[15px] leading-[1.7] text-gmi-text-muted">
              <li>
                <strong className="rounded-md bg-red-50 px-2 py-1 text-sm font-semibold text-red-800">FEIL</strong>
                {' – forhold som vurderes som klare avvik og normalt bør rettes.'}
              </li>
              <li>
                <strong className="rounded-md bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-800">SJEKK</strong>
                {' – forhold som ikke nødvendigvis er feil, men som bør vurderes nærmere.'}
              </li>
            </ul>
            <p className="mt-3 text-[15px] leading-[1.7] text-gmi-text-muted">
              For mange kontroller vises det også mer informasjon om hvilket felt eller krav som er berørt, og hvilke objekter funnet gjelder.
            </p>
            <p className="mt-3 text-[15px] leading-[1.7] text-gmi-text-muted">
              Validatoren er fortsatt under utvikling. Jeg tar derfor gjerne imot innspill til valideringsregler, tolkninger av instruksen eller situasjoner jeg ikke har fanget opp.
            </p>
            <Image
              src="/brand/images/appinfo/validator-v2.png"
              alt="GMI Validator med Validator V2-knappen markert i analyseverktøyene"
              width={1536}
              height={1024}
              unoptimized
              className="mt-5 block h-auto w-full max-w-full rounded-lg border border-gmi-border"
            />
          </section>

          <section aria-labelledby="app-info-news-sosi" className="border-t border-gmi-border pt-5">
            <h4 id="app-info-news-sosi" className="text-base font-bold text-gmi-navy">Bedre støtte for SOSI-filer</h4>
            <p className="mt-2 text-[15px] leading-[1.7] text-gmi-text-muted">
              Støtten for SOSI-filer er utvidet, med særlig fokus på filer eksportert fra Gemini VA. Flere egenskaper fra eksisterende VA-anlegg blir nå tolket og presentert på en mer nyttig måte i GMI Validator. Dette gjør det enklere å laste inn eksisterende ledningsdata sammen med innmålingsfiler og sammenligne det som allerede ligger i VA-databasen med det som leveres i nye innmålinger.
            </p>
            <p className="mt-3 text-[15px] leading-[1.7] text-gmi-text-muted">
              Det er også kommet en ny funksjon for lagmarkering, som gjør det enklere å skille ulike lag visuelt i kartet når flere datasett vises samtidig.
            </p>
            <p className="mt-3 text-[15px] leading-[1.7] text-gmi-text-muted">
              Målet er å gjøre SOSI-data mer nyttige som referansegrunnlag i kontrollarbeidet, slik at avvik, manglende objekter og forskjeller i egenskaper blir lettere å oppdage.
            </p>
          </section>

          <section aria-labelledby="app-info-news-other" className="border-t border-gmi-border pt-5">
            <h4 id="app-info-news-other" className="text-base font-bold text-gmi-navy">Mindre forbedringer og justeringer</h4>
            <p className="mt-2 text-[15px] leading-[1.7] text-gmi-text-muted">
              I tillegg er det gjort en rekke mindre forbedringer og feilrettinger gjennom hele løsningen. Flere kontroller og arbeidsflyter er justert for å være tydeligere og mer konsistente, og en del små irritasjonsmomenter i daglig bruk er ryddet opp i. Dette inkluderer blant annet justeringer i kartkontroller, visning av objektinformasjon, filtrering og generell håndtering av data.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}

function HistoryContent({ expandedVersion, onToggle }) {
  return (
    <div className={APP_INFO_TAB_CONTENT_CLASS}>
      <AppInfoHero title="Versjonshistorikk" />
      <div>
        <p className="text-[15px] leading-[1.6] text-gmi-text-muted">Nyeste versjon først. Dette er starten på den formelle historikken for GMI Validator.</p>
      </div>
      <ol className="relative space-y-3 border-l border-gmi-border pl-4 sm:pl-5">
        {APP_RELEASES.map((releaseEntry) => {
          const expanded = expandedVersion === releaseEntry.version;
          const changesId = `release-${releaseEntry.version.replaceAll('.', '-')}-changes`;

          return (
            <li key={releaseEntry.version} className="relative">
              <span className="absolute -left-[1.3rem] top-5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gmi-brand-cyan ring-1 ring-gmi-cyan-soft sm:-left-[1.4rem]" aria-hidden="true" />
              <article className="rounded-xl border border-gmi-border bg-gmi-surface shadow-sm">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={changesId}
                  onClick={() => onToggle(releaseEntry.version)}
                  className="flex min-h-20 w-full items-start justify-between gap-4 rounded-xl px-4 py-4 text-left transition-colors hover:bg-gmi-surface-soft focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gmi-interactive"
                >
                  <span className="min-w-0">
                    <ReleaseMeta release={releaseEntry} current={releaseEntry.version === CURRENT_APP_VERSION} />
                    <span className="mt-3 block font-bold text-gmi-navy">{releaseEntry.title}</span>
                    <span className="mt-1 block text-[15px] leading-[1.6] text-gmi-text-muted">{releaseEntry.summary}</span>
                  </span>
                  <CaretDownIcon
                    size={20}
                    weight="regular"
                    aria-hidden="true"
                    className={`mt-0.5 shrink-0 text-gmi-text-subtle transition-transform ${expanded ? 'rotate-180' : ''}`}
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
    <div className={CONTACT_TAB_CONTENT_CLASS}>
      <AppInfoHero title="Kontakt" />
      <section aria-labelledby="app-info-contact-heading">
        <h3 id="app-info-contact-heading" className="sr-only">Tilbakemeldinger</h3>
        <p className="max-w-[54rem] text-base leading-[1.6] text-gmi-text">
          Har du funnet en feil, har en kommentar, et forslag eller en idé til noe som kan gjøres bedre? Jeg vil gjerne høre fra deg.
        </p>
        <div className="flex max-w-[54rem] items-start gap-2.5 rounded-lg border border-gmi-cyan-soft bg-gmi-cyan-soft/40 px-3 py-2.5 text-sm leading-6 text-gmi-text">
          <p>
            <span className="mr-1.5 inline-flex rounded-md bg-gmi-cyan-soft px-1.5 py-0.5 text-xs font-semibold leading-5 text-gmi-interactive">Merk</span>
            Skjermbilder kan foreløpig ikke legges ved i skjemaet.
          </p>
        </div>
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
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-gmi-ink/60 p-2 backdrop-blur-sm sm:p-4"
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
        className="app-info-dialog relative flex w-full flex-col overflow-hidden rounded-2xl bg-gmi-surface shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gmi-border bg-gmi-surface px-5 pb-4 pt-14 sm:px-7 sm:pt-4 app-info-header">
          <div className="app-info-inner flex min-w-0 flex-col gap-3 sm:pr-14 lg:flex-row lg:items-center lg:gap-8">
            <h2 id="app-info-title" className="sr-only">GMI Validator</h2>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <BrandWordmark appInfo />
              <span className="rounded-full bg-gmi-cyan-soft px-2 py-1 text-[11px] font-bold text-gmi-interactive">v{CURRENT_APP_VERSION}</span>
            </div>
            <p className="min-w-0 text-sm leading-5 text-gmi-text-muted">Informasjon, nyheter og versjonshistorikk</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="absolute right-5 top-5 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gmi-text-subtle transition-colors hover:bg-gmi-surface-soft hover:text-gmi-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gmi-interactive sm:right-7"
          >
            <XIcon size={20} weight="regular" aria-hidden="true" />
          </button>
        </header>

        <div
          role="tablist"
          aria-label="Informasjonsseksjoner"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-gmi-border bg-gmi-surface-soft/80 px-5 py-2 sm:px-7 app-info-tab-bar"
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
                className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gmi-interactive sm:px-4 ${
                  activeTab === tab.id
                    ? 'gmi-selected-control shadow-sm'
                    : 'text-gmi-text-muted hover:bg-gmi-surface hover:text-gmi-navy'
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
            className="app-info-inner focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gmi-interactive"
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
