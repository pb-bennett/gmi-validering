'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  GithubLogoIcon,
  InfoIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  APP_RELEASES,
  CURRENT_APP_VERSION,
  LATEST_ANNOUNCED_RELEASE,
} from '@/data/appReleases.mjs';

const PUBLIC_REPO_URL = 'https://github.com/pb-bennett/gmi-validering';

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

const formatReleaseDate = (releasedOn) =>
  new Date(`${releasedOn}T12:00:00Z`).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

const isTabId = (value) => TABS.some((tab) => tab.id === value);

function ReleaseMeta({ release: releaseEntry, current = false, announced = false }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-slate-500">
      <span className="rounded-md bg-slate-900 px-2 py-1 font-semibold text-white">
        v{releaseEntry.version}
      </span>
      <span>{formatReleaseDate(releaseEntry.releasedOn)}</span>
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
    <section className="relative overflow-hidden rounded-2xl bg-slate-950 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-8">
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
    <div className="space-y-6">
      <AppInfoHero title="Et verktøy for kontroll og utforsking av VA-innmålingsleveranser" />

      <section aria-labelledby="app-info-what-heading">
        <h3 id="app-info-what-heading" className="text-lg font-bold text-slate-900">Hva er dette?</h3>
        <p className="mt-3 text-[15px] leading-[1.6] text-slate-600">
          GMI Validator er et verktøy for å sjekke, utforske og forstå VA-måle- og leveringsdata. Et ikke-kommersielt prosjekt uten profittformål, laget for å være nyttig. Det er foreløpig ingen planer om abonnement, betalte funksjoner, reklame eller annen inntektsføring.
        </p>
      </section>

      <section className="border-t border-slate-200 pt-6" aria-labelledby="app-info-why-heading">
        <h3 id="app-info-why-heading" className="text-lg font-bold text-slate-900">Hvorfor finnes det?</h3>
        <p className="mt-3 text-[15px] leading-[1.6] text-slate-600">
          Prosjektet vokste fram fra praktisk arbeid med GMI-filer og entreprenørleveranser. Kontrollarbeidet ble ofte repetitivt, og det var ønskelig med en praktisk måte å finne ting som er verdt å undersøke nærmere.
        </p>
      </section>

      <section className="border-t border-slate-200 pt-6" aria-labelledby="app-info-not-heading">
        <h3 id="app-info-not-heading" className="text-lg font-bold text-slate-900">Hva er dette ikke?</h3>
        <p className="mt-3 text-[15px] leading-[1.6] text-slate-600">
          Dette er ikke et absolutt svar på om en leveranse skal godkjennes eller avvises. Automatiske kontroller støtter faglige vurderinger. GMI Validator er et selvstendig prosjekt, ikke utviklet av, for eller sammen med Invera.
        </p>
      </section>

      <section className="border-t border-slate-200 pt-6" aria-labelledby="app-info-transparency-heading">
        <h3 id="app-info-transparency-heading" className="text-lg font-bold text-slate-900">Nysgjerrig eller bekymret?</h3>
        <p className="mt-3 text-[15px] leading-[1.6] text-slate-600">
          Det er rimelig å lure på hva som skjer når en VA/GMI-fil åpnes i et nettleserbasert verktøy. Kildekoden er offentlig, slik at du kan undersøke hvordan applikasjonen fungerer.
        </p>
        <div className="mt-4">
          <SourceCodeLink />
        </div>
      </section>

      <section className="min-h-32 border-t border-slate-200 pt-6" aria-labelledby="app-info-who-heading">
        <h3 id="app-info-who-heading" className="text-lg font-bold text-slate-900">Hvem er du?</h3>
        <p className="mt-3 text-[15px] leading-[1.6] text-slate-600">[Personlig tekst legges inn her.]</p>
      </section>
    </div>
  );
}

function FutureContent() {
  return (
    <div className="space-y-7">
      <AppInfoHero title="Fremtiden – videre utvikling" />
      <section>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white">v1.1.0</span>
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">Planlagt</span>
          </div>
          <h4 className="mt-3 text-base font-bold text-slate-900">Validator 2.0 (beta)</h4>
          <p className="mt-1.5 text-[15px] leading-[1.6] text-slate-600">
            Neste større steg er planlagt til versjon 1.1.0, der Validator 2.0 introduseres som beta. Den nye valideringslogikken gir tydeligere kontroller, bedre resultatvisning og mer detaljert informasjon om feltene som kontrolleres.
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

function NewsContent() {
  const releaseEntry = LATEST_ANNOUNCED_RELEASE;

  return (
    <div className="space-y-7">
      <AppInfoHero
        title="Nyheter"
        eyebrow="Nyheter"
        version={releaseEntry?.version ?? CURRENT_APP_VERSION}
      />

      {releaseEntry ? (
        <section aria-labelledby="app-info-news-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="app-info-news-heading" className="text-lg font-bold text-slate-900">Ny statistikkvisning</h3>
            <span className="text-xs font-medium text-slate-400">v{releaseEntry.version} · {formatReleaseDate(releaseEntry.releasedOn)}</span>
          </div>
          <div className="mt-3 space-y-3 text-[15px] leading-[1.6] text-slate-600">
            <p>Statistikken er nå brutt ned per kommune, slik at det er enklere å se hvor aktiviteten kommer fra og sammenligne kommuner.</p>
            <p>Du kan også se kommuneaktiviteten på kart og i en rangert oversikt.</p>
          </div>
        </section>
      ) : (
        <p className="text-[15px] leading-[1.6] text-slate-600">Det er ingen annonserte nyheter ennå.</p>
      )}
    </div>
  );
}

function HistoryContent({ expandedVersion, onToggle }) {
  return (
    <div className="space-y-7">
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
    <div className="space-y-7">
      <AppInfoHero title="Kontakt" />
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm ring-1 ring-slate-200">
            <InfoIcon size={20} weight="regular" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-xl font-bold text-slate-950">Tilbakemeldinger</h3>
            <p className="mt-2 text-[15px] leading-[1.6] text-slate-600">
              Jeg vil gjerne høre fra deg dersom du finner feil, har kommentarer til hvordan GMI Validator fungerer, eller har forslag til forbedringer og nye funksjoner.
            </p>
            <p className="mt-3 text-[15px] leading-[1.6] text-slate-600">
              Det kommer etter hvert en enkel måte å sende inn tilbakemeldinger direkte fra appen.
            </p>
          </div>
        </div>
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
      onClick={onClose}
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
            className="absolute right-5 top-5 min-h-11 min-w-11 shrink-0 rounded-lg text-2xl leading-none text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:right-7"
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
