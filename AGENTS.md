# Development instructions

## Scope and conventions

- Read only documentation and planning/completion reports relevant to the assigned task, including `docs/development.md` and reports in `docs/agent-reports/` as needed. Avoid unnecessary repository exploration. Plans describe decisions and proposals; check implementation and follow-up reports for superseding decisions. Do not implement later milestones without task authorization.
- Keep changes focused. Reuse existing components, state owners, validation policies and helpers; avoid parallel mechanisms, unrelated refactors and dependency changes unless needed for the task.
- Follow nearby code conventions. Use existing design tokens, Phosphor icons and Norwegian user-facing terminology. Preserve keyboard access, accessible names, draft guards and usable scrolling/layout at laptop sizes. Any change that touches UI appearance must follow "UI design and styling standards" below.
- Active GMI Validator V2 lives under `src/lib/validation-v2/`; legacy JSON rules are not its rule owner. Keep feature-specific architecture and acceptance decisions in their reports, not here.
- **Language:** Use English for all AI-agent communication, progress updates, terminal summaries, planning documents, and completion reports. Use Norwegian for application UI text and other end-user-facing content. Preserve established Norwegian field names and technical terminology where appropriate.

## Source and data safety

- Treat contractor files and private/reference corpora as read-only. Use synthetic fixtures for tracked tests; do not copy private file contents, identifying values or secrets into code, fixtures, logs or reports. See `SECURITY.md` and `docs/privacy.md`.
- Preserve immutable original GMI bytes and source identity. Use the existing source-preserving patch/verification/export path for revised copies; never reconstruct an export by serializing the parsed display model. No-op output must be byte-identical; bytes outside intended patches must remain unchanged, including encoding, line endings, geometry and unknown sections.
- Preserve editability, stale-source, preview, approval and export verification gates. Fail closed with an explanation when safety cannot be verified; never silently repair or normalize source data.
- A wizard is one transaction: intermediate steps stage choices in a draft; only the final confirmation writes accepted data, atomically (validated, then applied with rollback, published once), and the wizard then shows what was saved; cancel/close discards the draft. Task hubs and single-step dialogs with their own save are not wizards and must state their save semantics. Contract: `tests/wizardTransactionContract.test.mjs`.
- Respect `.gitattributes`, byte-exact fixtures and manifests. Do not regenerate fixtures, alter expected hashes or relax safety assertions merely to make tests pass. Explain deliberate contract changes and retain equivalent safety coverage.
- Keep file processing local under existing privacy contracts. Keep server secrets server-side and render untrusted attributes as text, not interpolated HTML.

## UI design and styling standards

These rules apply to every module: shell, Validator, Rettinger, FOTO, Data Table, import/export wizards and dialogs. Evidence, history and the open decisions are recorded in `docs/agent-reports/20261114-130507-ui-styling-policy-consolidation.md`. Items marked **Open** are not settled: follow the stated interim rule and do not settle them inside a feature task.

### Tokens and colour

- The source of truth is the `--gmi-*` custom properties in `src/app/globals.css`, exposed as Tailwind utilities (`text-gmi-text`, `bg-gmi-surface-soft`, `border-gmi-border-strong`, `accent-gmi-interactive`, ...). Use them for all chrome. Do not add hex literals, raw Tailwind `blue-*`/`gray-*`/`slate-*` utilities or the legacy `--color-*` theme variables to new or touched chrome.
- Project teal is `--gmi-interactive` (`#007595`): links, focus indicators, checked controls, selected-state edges and teal actions. `--gmi-brand-cyan` (`#53EAFD`) is brand decoration only, never text or a control colour on light surfaces. `--gmi-cyan-soft` is the soft accent/selection surface.
- Neutrals: `--gmi-ink`, `--gmi-navy` (headings, dark controls), `--gmi-text`, `--gmi-text-muted`, `--gmi-text-subtle`, `--gmi-border`, `--gmi-border-strong`, `--gmi-surface`, `--gmi-surface-soft`.
- Status colours are the shared validation palette `--gmi-validation-{error,warning,success}-{bg,text,border,icon,dot}`, applied through `data-validation-tone` with `.gmi-validation-panel`, `.gmi-validation-accent` and `.gmi-validation-dot`. FEIL is red, SJEKK is warning, OK is green. Never recolour status to teal or cyan, and never use a status colour for selection or branding.
- Warning must stay visibly distinct from red. Compact SJEKK text and icons use `--gmi-validation-compact-warning-text` (yellow-700). Do not introduce further warning shades.
- FOTO delivery colours (approved 2026-11-16): one palette for map markers, pills, inspector controls and legends in every workspace: GMI `--gmi-delivery-gmi` (`#60A5FA`), GML `--gmi-delivery-gml` (`#4ADE80`), Ikke `--gmi-delivery-excluded` (`#CBD5E1`), always with dark ink `--gmi-delivery-ink` (`#0F172A`); edges derive from fill and ink with `color-mix`. Map markers default to delivery colours everywhere; only FOTO offers "Plasseringskilde" (provenance). The values are mirrored in `PHOTO_DELIVERY_COLOURS` (`src/lib/photos/photoMarkerPresentation.mjs`); keep the parity test in `tests/photoDeliveryPlanning.test.mjs` passing.
- Information colours are not chrome and must not be normalised to the palette: GIS/FCODE symbology, layer highlights, photo provenance colours, the Gemini WFS indigo, chart series, 3D materials, the logo and QR imagery.
- Derive hover and pressed shades from existing tokens with `color-mix` (see `src/components/photos/photoTheme.css`) rather than adding colours.

### Branding and typography

- The product name is "GMI Validator". `src/components/BrandWordmark.js` renders the approved logo as the G followed by "MI Validator" and the "Innmålingskontroll" subtitle, with the accessible name "GMI Validator". Reuse it; do not redraw, recolour or trace `public/brand/gmi-validator-logo.svg`, and do not add logos to feature panels.
- Roboto is the only UI typeface (`--font-roboto`; weights 300, 400, 500 and 700 are loaded). Use monospace for raw values and coordinates, and tabular numerals for aligned counts. Do not change the root font size.
- Keep the three densities separate: reading (AppInfo/Om), compact workspace (sidebars, inspectors, wizards) and dense table. Do not copy reading-size controls, hero blocks or 44px targets into workspace or table surfaces.
- Radius vocabulary for new work: 8px controls, 12px cards, 16px dialogs, full radius for pills. Existing compact controls keep their footprint.

### Buttons

- Show hierarchy; do not highlight every action equally. Use at most one primary action per view or wizard step (`.gmi-primary-control`). Secondary and neutral actions use `.gmi-compact-button`, with a `--gmi-border-strong` border where they sit in a toolbar (`.gmi-bar-button` in the Rettinger table bar). Navigation and low-emphasis actions are text or link styled. Destructive actions use the red treatment (`.gmi-edit-destructive`), are never styled as the primary action, and need confirmation when they discard work.
- **Open: primary colour.** The global `.gmi-primary-control` is navy; FOTO, Rettinger and the delivery wizard override it to teal within their own scope. Until this is decided, match the host module and do not add a third primary variant.
- Every enabled button, including icon-only and close controls, must have visible hover feedback, a `:focus-visible` indicator (`.gmi-focus-ring`) and a distinct disabled state (reduced opacity, no hover change, `cursor: not-allowed` or `default`). A bare `<button>` carrying only `.gmi-focus-ring` is not acceptable.
- Busy actions set `aria-busy`, disable the control and state progress in text (for example "Sender ...") or with a Phosphor `CircleNotchIcon`; do not change layout while busy.
- Icon-only controls use `src/components/photos/PhotoIconButton.js`: `aria-label`, tooltip after hover delay and immediately on keyboard focus, no native `title`. Unavailable controls stay focusable with `aria-disabled` so the tooltip can explain why.
- Close controls use Phosphor `XIcon` (regular) at the top right of the header, with a specific accessible name ("Lukk eksport", not only "Lukk") and hover feedback. **Open:** one shared size and shape for module close controls.
- Leading icon, then label, with a 4-6px gap. Keep one height per toolbar or footer row. Verify button rows at 1280×720 and 1366×768.

### Form controls

- Checkboxes, radios and range inputs must render in project teal: add `accent-gmi-interactive`, or a module-scoped `accent-color: var(--gmi-interactive)`, to every new or touched native control and confirm the computed colour. Native browser-blue controls must never ship. There is no global rule yet, so an unstyled `<input type="checkbox">` is a defect.
- Text inputs, selects and textareas use `.gmi-compact-field` or the module's equivalent: `--gmi-border-strong` border, `--gmi-surface` background and a teal focus indicator. Disabled fields look disabled.
- All form controls share the same hover, focus, checked and disabled treatment within a module. Confirmation and risk-approval checkboxes follow the same rule.
- Prefer native elements. Every control needs a visible `<label>` or an `aria-label`; validation errors use `aria-invalid` and `aria-describedby` and are stated in text.

### Icons

- Use `@phosphor-icons/react` with `weight="regular"` and `aria-hidden="true"` next to a named control. Do not add another icon library, hand-drawn SVG for ordinary actions, text glyphs (`▼`, `✕`) or emoji.
- Reuse the established icon for a concept (close `XIcon`, disclosure `CaretDownIcon`, external link `ArrowSquareOutIcon`) and the established sizes: 12-14px in table and toolbar rows, 16px for standard icon buttons, 20-22px for dialog close controls.
- Exceptions that keep their own graphics: the logo, GIS and legend marks, chart marks, QR codes, 3D markers and meaning-bearing domain symbols.

### Data Table

- `src/components/LayerDataTable.js` owns the table. Preserve 28px virtual rows, the 32px selection column, 10px cell text, column sizing, sticky offsets, opaque sticky cells and horizontal scrolling.
- Three row states are separate and each needs a non-colour cue: selected (checked membership: `aria-selected`, checked checkbox, row fill), active object (the object shown in the inspector and on the map: `aria-current`, leading teal inset bar) and keyboard cursor (2px teal outline). Hover is transient and must not hide the other states.
- A row's state fill must be painted on every cell in the row, including the sticky selection, zoom, identity and pinned cells. Sticky cells stay opaque, so they must carry the state colour themselves rather than a fixed surface colour.
- **Open:** the exact fills that distinguish a selected row from the active row (both currently use `--gmi-cyan-soft`). Do not add further row tints before this is decided.
- Status cell fills and status text inside the table keep the validation palette and must remain readable on selected and active rows.

### Accessibility

- Keyboard focus is always visible; never remove an outline without replacing it.
- Text and meaningful icons meet 4.5:1 contrast against their actual background, including selected, hover and status surfaces.
- Colour is never the only state indicator: pair it with text, an icon, a shape or an ARIA state (`aria-pressed`, `aria-selected`, `aria-current`, `aria-expanded`, `aria-checked`).
- Interactive elements have meaningful Norwegian accessible names. Dialogs keep Escape, focus containment and focus restoration. Respect `prefers-reduced-motion`.

### Implementation

- Do not add helper text, explanatory paragraphs, placeholders or summary lines that restate information already visible (counts, labels, status, tooltips). State each fact once, where it applies. Required safety, blocking and fail-closed explanations are exempt.

- Before adding a colour, size or visual variant, check the tokens, the shared recipes in `globals.css` (`.gmi-elevated-surface`, `.gmi-compact-button`, `.gmi-focus-ring`, `.gmi-compact-field`, `.gmi-selected-control`, `.gmi-primary-control`) and existing components. A new colour or variant is a design decision: propose it in the task report and wait for approval.
- Prefer shared recipes and components over local CSS that restates the same rule. Module differences belong in scoped custom properties, as in `photoTheme.css`.
- Scope module CSS under the module root class (`.photo-*`, `.gmi-edit-*`, `.delivery-wizard`). Do not write selectors that can restyle controls in other modules, such as bare `button`, `input` or `select` selectors outside a module root. Changes to global base styles need explicit task authorization.
- Styling work must not change behaviour, DOM ownership, refs, scroll owners or protected geometry. Tests that assert computed colours or token parity are contracts: update them only for an approved design change.
- Fix inconsistencies only in surfaces the task already owns; record others for the styling audit instead of widening scope.

## Verification

- Keep verification proportional to the change. For code changes, run focused behavior/regression tests with `node --test <test-files>` and lint affected JS/MJS files with `npx --no-install eslint <files>`. Require broader regression tests and `npm run build` for consequential application changes, especially shared editing, validation and source-safety logic, and when the task's acceptance gates require them. Use appropriately scoped checks for small or documentation-only changes; the full serial command is `node --test --test-concurrency=1 "tests/*.test.mjs"`.
- **Risk-based regression levels.** Choose the level from the change's actual risk, not its size, and always verify the directly affected critical behaviour.
  1. **Focused:** documentation, styling-only changes and small isolated fixes. Run the relevant targeted checks; do not run full regression suites unnecessarily.
  2. **Expanded:** changes to shared UI components, application state or integrated workflows. Run the affected tests together with the relevant integration tests.
  3. **Full regression:** broad architectural changes, high-risk shared behaviour and pre-release verification. Run the complete relevant suites; do not automatically require both the full Node and full browser suites when the risk affects only one domain.
- Never weaken assertions, remove tests or skip necessary safety checks merely to reduce execution time. Escalate to a higher level when targeted tests reveal regressions or the implementation scope expands.
- For UI changes, scope browser and visual checks to the affected behavior. For consequential workflow or layout changes, use the existing browser harness and inspect screenshots at relevant sizes, including 1280×720 and 1366×768. Use a fresh production build for production-workflow tests; configure required harness variables and run shared-server browser tests serially. Use a free port and stop only processes you started.
- Report passed, failed and skipped checks separately. Establish evidence before calling a failure pre-existing; historical counts are not an exemption. Do not equate skipped/private-corpus tests or synthetic automation with real-file/manual acceptance. Record blocked checks and remaining acceptance work. In substantive implementation completion reports, state the selected testing level, commands executed, results, suites deliberately omitted and residual risks.
- Run `git diff --check`. Documentation-only work needs relevant content/link checks, not application builds.

## Completion and Git

- At the start, verify repository, branch, HEAD and working-tree status. Preserve existing changes and concurrent agents' files. Avoid shared build output or servers in use by another task; use an isolated workspace when necessary.
- Do not automatically synchronize or change branches. Do not reset, clean, stash, restore or overwrite others' changes. Commit, push, merge, rebase, deploy or change Git refs only when authorized by the user. When a commit is authorized, stage only this task's files.
- Save a concise, uniquely timestamped report in `docs/agent-reports/`; mark planning drafts clearly. Include scope/outcome, changed files, commands/results, deviations, remaining risks/manual acceptance, and Git status/publication actions. Separate observed facts from recommendations and unverified assumptions. Keep detailed feature decisions there rather than expanding this file.
