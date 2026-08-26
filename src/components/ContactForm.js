'use client';

import { useEffect, useRef, useState } from 'react';

export const CONTACT_PROFILE_STORAGE_KEY = 'gmi-validering:contact-profile:v1';

const INITIAL_FORM = Object.freeze({
  category: 'bug',
  message: '',
  name: '',
  email: '',
  website: '',
});

const CATEGORIES = Object.freeze([
  { value: 'bug', label: 'Feil' },
  { value: 'suggestion', label: 'Forslag' },
  { value: 'comment', label: 'Kommentar' },
  { value: 'other', label: 'Annet' },
]);

const FIELD_CLASS =
  'mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100';
const ERROR_CLASS = 'mt-1 text-sm text-rose-700';

const ERROR_MESSAGES = Object.freeze({
  invalid_request: 'Kontroller feltene og prøv igjen.',
  request_not_allowed: 'Forespørselen kunne ikke godkjennes. Prøv igjen.',
  request_too_large: 'Meldingen er for lang. Kort den ned og prøv igjen.',
  unsupported_media_type: 'Kontroller feltene og prøv igjen.',
  rate_limited:
    'Det er sendt mange tilbakemeldinger på kort tid. Prøv igjen litt senere.',
  contact_unavailable: 'Kontaktskjemaet er ikke tilgjengelig akkurat nå.',
  send_failed: 'Noe gikk galt under sending. Prøv igjen senere.',
});

const ERROR_STATUSES = Object.freeze({
  invalid_request: 'validation',
  request_not_allowed: 'error',
  request_too_large: 'validation',
  unsupported_media_type: 'validation',
  rate_limited: 'rate_limited',
  contact_unavailable: 'unavailable',
  send_failed: 'error',
});

const validateForm = (form) => {
  const errors = {};
  if (!CATEGORIES.some((category) => category.value === form.category)) {
    errors.category = 'Velg en kategori.';
  }
  if (!form.message.trim()) errors.message = 'Skriv en melding før du sender.';
  if (
    form.email.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(form.email.trim())
  ) {
    errors.email =
      'Skriv inn en gyldig e-postadresse, eller la feltet stå tomt.';
  }
  return errors;
};

export const buildContactPayload = ({ category, message, name, email, website }) => ({
  category,
  message,
  name,
  email,
  website,
});

const getErrorMessage = (code) =>
  ERROR_MESSAGES[code] || ERROR_MESSAGES.send_failed;

export default function ContactForm() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState('idle');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const fieldRefs = useRef({});
  const isSubmitting = status === 'submitting';

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CONTACT_PROFILE_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      const savedKeys = saved && typeof saved === 'object' ? Object.keys(saved) : [];
      if (
        savedKeys.length === 3 &&
        savedKeys.every((key) => ['schema', 'name', 'email'].includes(key)) &&
        saved.schema === 1 &&
        typeof saved.name === 'string' &&
        typeof saved.email === 'string'
      ) {
        // Hydrate the controlled fields from the optional browser profile.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm((current) => ({ ...current, name: saved.name, email: saved.email }));
      }
    } catch {
      // Local storage is optional and may be unavailable or malformed.
    }
  }, []);

  const persistProfile = (next) => {
    try {
      window.localStorage.setItem(CONTACT_PROFILE_STORAGE_KEY, JSON.stringify({ schema: 1, name: next.name, email: next.email }));
    } catch {
      // Local storage is optional and may be unavailable.
    }
  };

  const updateField = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'name' || field === 'email') persistProfile(next);
      return next;
    });
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
    if (formError) setFormError('');
    if (status !== 'idle') setStatus('idle');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const errors = validateForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatus('validation');
      const firstInvalidField = ['category', 'name', 'email', 'message'].find(
        (field) => errors[field],
      );
      fieldRefs.current[firstInvalidField]?.focus();
      return;
    }

    setFieldErrors({});
    setFormError('');
    setStatus('submitting');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildContactPayload(form)),
      });

      let result = null;
      try {
        result = await response.json();
      } catch {
        // Use the stable generic send failure below for non-JSON responses.
      }

      if (!response.ok || result?.ok !== true) {
        setFormError(getErrorMessage(result?.code));
        setStatus(ERROR_STATUSES[result?.code] || 'error');
        return;
      }

      setForm((current) => ({ ...INITIAL_FORM, name: current.name, email: current.email }));
      setStatus('success');
    } catch {
      setFormError(ERROR_MESSAGES.send_failed);
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="mt-6 rounded-xl border border-cyan-200 bg-cyan-50 p-5">
        <p role="status" aria-live="polite" className="text-sm font-semibold text-slate-900">
          Takk! Tilbakemeldingen er sendt.
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700"
        >
          Send en ny tilbakemelding
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isSubmitting}
      className="mt-6 space-y-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-category" className="text-sm font-semibold text-slate-800">
            Kategori <span className="font-normal text-slate-500">(påkrevd)</span>
          </label>
          <select
            id="contact-category"
            name="category"
            ref={(node) => {
              fieldRefs.current.category = node;
            }}
            value={form.category}
            onChange={updateField('category')}
            required
            disabled={isSubmitting}
            aria-invalid={fieldErrors.category ? 'true' : undefined}
            aria-describedby={fieldErrors.category ? 'contact-category-error' : undefined}
            className={FIELD_CLASS}
          >
            {CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
          {fieldErrors.category && (
            <p id="contact-category-error" className={ERROR_CLASS}>
              {fieldErrors.category}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="text-sm font-semibold text-slate-800">
            Navn <span className="font-normal text-slate-500">(valgfritt)</span>
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={100}
            ref={(node) => { fieldRefs.current.name = node; }}
            value={form.name}
            onChange={updateField('name')}
            disabled={isSubmitting}
            aria-invalid={fieldErrors.name ? 'true' : undefined}
            aria-describedby={fieldErrors.name ? 'contact-name-error' : undefined}
            className={FIELD_CLASS}
          />
          {fieldErrors.name && <p id="contact-name-error" className={ERROR_CLASS}>{fieldErrors.name}</p>}
        </div>

        <div>
          <label htmlFor="contact-email" className="text-sm font-semibold text-slate-800">
            E-post <span className="font-normal text-slate-500">(valgfritt)</span>
          </label>
          <input
            id="contact-email"
            name="email"
            ref={(node) => {
              fieldRefs.current.email = node;
            }}
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={updateField('email')}
            disabled={isSubmitting}
            aria-invalid={fieldErrors.email ? 'true' : undefined}
            aria-describedby={
              fieldErrors.email
                ? 'contact-email-help contact-email-error'
                : 'contact-email-help'
            }
            className={FIELD_CLASS}
          />
          <p id="contact-email-help" className="mt-1 text-xs text-slate-500">
            Bare nødvendig hvis du ønsker svar.
          </p>
          {fieldErrors.email && (
            <p id="contact-email-error" className={ERROR_CLASS}>
              {fieldErrors.email}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="contact-message" className="text-sm font-semibold text-slate-800">
          Melding <span className="font-normal text-slate-500">(påkrevd)</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          ref={(node) => {
            fieldRefs.current.message = node;
          }}
          value={form.message}
          onChange={updateField('message')}
          required
          maxLength={4000}
          rows={7}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.message ? 'true' : undefined}
          aria-describedby={fieldErrors.message ? 'contact-message-error' : undefined}
          className={`${FIELD_CLASS} resize-y min-h-36`}
        />
        {fieldErrors.message && (
          <p id="contact-message-error" className={ERROR_CLASS}>
            {fieldErrors.message}
          </p>
        )}
      </div>

      <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={updateField('website')}
          disabled={isSubmitting}
        />
      </div>

      <p className="max-w-[54rem] text-xs leading-5 text-slate-500">
        Navn og e-post huskes lokalt i nettleseren for enkelhets skyld. Bare det du skriver her, og appversjonen som vises over, sendes på e-post via Resend til mottakerens postkasse. E-postadressen er valgfri og brukes bare hvis du ønsker svar. Ingen fil- eller valideringsdata legges ved.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? 'Sender …' : 'Send tilbakemelding'}
        </button>
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="min-h-5 text-sm"
        >
          {formError && <span className="text-rose-700">{formError}</span>}
        </div>
      </div>
    </form>
  );
}
