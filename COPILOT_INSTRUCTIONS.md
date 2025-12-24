# GMI Validation Webapp – Overview & Aim

## Purpose

This project aims to provide a simple, web-based tool for **validating GMI files** delivered to Norwegian municipalities by contractors. These GMI files contain **as-built data** for water and wastewater (VA) infrastructure.

Before a municipality imports such files into its main VA database, the content must be checked to ensure:

- All **required fields** are present.
- The **values** follow expected formats and domains.
- No key information is missing for pipes, manholes (kummer), or related infrastructure.

This application will **automate** that checking process to reduce manual QA work.

## Core Features (Initial Scope)

- **Upload and parse GMI files** from contractors.
- **Automatically validate** the file structure and required fields.
- **Flag missing or invalid values** in a clear, user-friendly way.
- **Optional map view**: display the GMI geometry as vector data on a simple 2D map for visual inspection.

## Target Users

- Municipal engineers receiving as-built documentation.
- Contractors who want to pre-validate their GMI files before submission.

## Project Status

Planning stage — scope and requirements still being defined.

---

## Language & Terminology Rules

- **Development discussion language:** All coding conversation, design notes, and technical explanations must be in **English**.
- **Allowed Norwegian terms in dev chat:** You may freely use specific domain words interchangeably within English text, e.g. **“kommune”**, **“ledning”**, **“kum”**, **“kumbilde”**, **“VA”**.
- **User Interface language:** The application’s **entire UI must be in Norwegian (bokmål)** — no English strings, labels, tooltips, error messages, or placeholders in the UI.
  - Provide Norwegian bokmål text for all user-facing content.
  - Only use an English term if it is unavoidable (e.g., a proper noun or a technical name with no Norwegian equivalent).

---

## Design — Colour scheme

We will use the following palette consistently across the UI (except in the map section where local map standards apply):

- **Page background:** `#FAF3E1`
- **Cards / sections:** `#F5E7C6`
- **Primary actions:** `#CC4A09` (updated from `#FF6D1F` to meet WCAG AA for white text)
- **Text & icons:** `#222222`

> Note: The palette is chosen for a warm, high-contrast look. Map visuals should follow the mapping standards and may use different colors for layers and symbology.

**Decision log:**

- Updated primary color to **`#CC4A09`** on 2025-12-24 to ensure white button labels meet WCAG AA contrast requirements; previous primary was `#FF6D1F`.
- Tailwind now references CSS variables for colors (e.g., `--color-primary`) to allow runtime theming and easier review/changes.

---

## Design — Typography

We use a **dual-font system** to establish clear visual hierarchy while maintaining readability and professionalism for a municipal data-validation tool:

---

## Landing page — Onboarding & copy

When the app loads, the user must see a **clear, centered onboarding card** prompting them to upload a GMI file. All user-facing copy on this screen must be in **Norwegian (bokmål)**. Keep the UI minimal, modern, and accessible.

**Mandatory strings (Norwegian Bokmål):**

- **Title:** `Last opp en GMI-fil`
- **Instruction text:** `Dra og slipp en .gmi-fil her, eller klikk for å velge en fil.`
- **Primary action / file label:** `Velg fil`
- **Explanation summary:** `Om denne appen`
- **Short explanation (details):** `Denne applikasjonen sjekker at GMI-filer inneholder nødvendige felter og at verdier følger forventet format. Den flagger manglende eller ugyldige verdier før import til VA-databaser.`

**Behavioral notes:**

- The card should be centered vertically and horizontally on the page and use the project palette (`bg-card`, `text-text`, `bg-primary` for actions).
- The `Velg fil` control must be an accessible label for an actual `<input type="file">` (hidden input with visible label or button).
- Provide a brief, collapsible explanation using `<details><summary>` for quick access to the app purpose without leaving the page.
- Keep copy short and actionable — the goal is to get the user to upload a file quickly.

**Accessibility:**

- Use semantic elements (`section`, `h2`, `p`, `label`, `input`) and `aria-label` where appropriate.
- Ensure focus styles are visible for keyboard users (use `focus-visible` and ring utilities).
- Verify color contrast with current palette (primary button has white text on `#CC4A09` which meets WCAG AA).

**Implementation guidance:**

- Example: see `src/app/page.js` for a simple, copy-ready onboarding card and the exact Norwegian text to use.

---

### Font Stack

| Element              | Font         | Weight         | Usage                                        |
| -------------------- | ------------ | -------------- | -------------------------------------------- |
| **Body text**        | Roboto       | 400 (regular)  | Paragraph copy, form labels, table content   |
| **Body emphasis**    | Roboto       | 600 (semibold) | Strong emphasis within body text             |
| **Headings (h1–h3)** | Roboto Serif | 600–700        | Page titles, section headings, form sections |
| **UI elements**      | Roboto       | 600            | Button labels, badges, small caps            |

### Implementation Details

- **Google Fonts import:** Both fonts are loaded via Google Fonts with `display=swap` to prevent layout shift.
- **Font variables:** Configured in `src/app/layout.js` using Next.js's `next/font/google` module:
  - `--font-roboto` (Roboto weights 400, 600)
  - `--font-roboto-serif` (Roboto Serif weights 600, 700)
- **CSS class assignment:** Applied via Tailwind utility classes and `font-sans` / `font-serif` modifiers in component markup.
- **Language support:** Both fonts fully support Norwegian bokmål diacritics (æ, ø, å).

### Usage Examples

```jsx
// Heading example (h1)
<h1 className="font-serif font-bold text-3xl text-text">
  Validerings resultat
</h1>

// Body text example
<p className="font-sans font-normal text-base text-text">
  Dokumentasjonen er godkjent og klar for import.
</p>

// Button example
<button className="font-sans font-semibold px-4 py-2 bg-primary text-white">
  Last opp GMI-fil
</button>
```

### Rationale

- **Roboto (sans-serif)** for body: excellent readability at all sizes, clean and professional, optimal for forms and data display.
- **Roboto Serif (serif)** for headings: creates visual distinction and hierarchy; conveys authority appropriate for a municipal tool; pairs naturally with Roboto due to shared proportions.
- **Weight discipline:** 400 for reading, 600 for emphasis or headings, 700 only for major headings (h1). Avoids visual clutter.

---

## Data Handling, Security & Architecture Constraints

### Data Handling

- **No server-side persistence**: Do not store uploaded `.gmi` contents on the server. Process files **in-memory only**, during a single request.
- **Browser-side storage allowed**: Parsed data and validation results may be stored **locally in the user's browser** (e.g., `localStorage` or `IndexedDB`) so results can be revisited during the session.
- **Temporary objects**: All backend temporary objects must be discarded immediately after the response is sent.

### Users & Authentication

- **No users**: There is **no authentication** or user system in v1.
- **No sessions**: Do not implement login, cookies, or persistent server
