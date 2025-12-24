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

## Data Handling, Security & Architecture Constraints

### Data Handling

- **No server-side persistence**: Do not store uploaded `.gmi` or `.zip` contents on the server. Process files **in-memory only**, during a single request.
- **Browser-side storage allowed**: Parsed data and validation results may be stored **locally in the user's browser** (e.g., `localStorage` or `IndexedDB`) so results can be revisited during the session.
- **Temporary objects**: All backend temporary objects must be discarded immediately after the response is sent.

### Users & Authentication

- **No users**: There is **no authentication** or user system in v1.
- **No sessions**: Do not implement login, cookies, or persistent server
