# Styling-overhaul S1 foundations

Date: 2026-09-23. Scope: additive semantic palette and Tailwind 4 utility exposure only.

## Starting state

- Starting SHA: `700f0bb1fdfb0ea661479a024fae27f71d5d088c`
- Repository root: `C:/GitHub/gmi-validering-test`
- Branch: `feature/styling-overhaul-integrated`
- Working tree: clean before changes

## Files changed

- `src/app/globals.css` — added canonical `--gmi-*` declarations and a Tailwind 4 `@theme inline` colour bridge.
- `docs/agent-reports/20260923-styling-overhaul-s1-foundations.md` — this implementation record.

## Canonical declarations

| Token | Exact value | Reference role |
| --- | --- | --- |
| `--gmi-ink` | `#020618` | AppInfo slate-950; strongest dark and inverse foundation |
| `--gmi-navy` | `#0F172B` | AppInfo slate-900; brand structure, headings and dark controls |
| `--gmi-text` | `#314158` | AppInfo slate-700; main content |
| `--gmi-text-muted` | `#45556C` | AppInfo slate-600; supporting copy |
| `--gmi-text-subtle` | `#62748E` | AppInfo slate-500; metadata and help |
| `--gmi-text-on-dark` | `#CBD5E1` | AppInfo literal inverse supporting text |
| `--gmi-border-strong` | `#CAD5E2` | AppInfo slate-300; fields and stronger boundaries |
| `--gmi-border` | `#E2E8F0` | AppInfo slate-200; separators and neutral selection fill |
| `--gmi-surface-soft` | `#F8FAFC` | AppInfo slate-50; soft and inset surfaces |
| `--gmi-surface` | `#FFFFFF` | AppInfo white; base and elevated surface |
| `--gmi-brand-cyan` | `#53EAFD` | AppInfo cyan-300; brand and decorative accent |
| `--gmi-cyan-soft` | `#CEFAFE` | AppInfo cyan-100; soft accent surface |
| `--gmi-interactive` | `#007595` | AppInfo cyan-700; light-surface links, small actions and focus |

Bright `--gmi-brand-cyan` and legible `--gmi-interactive` are intentionally separate roles.

## Semantic exposure

`@theme inline` maps each canonical variable to Tailwind 4's colour namespace. Later scoped code can use semantic utility names such as `text-gmi-text`, `text-gmi-text-muted`, `bg-gmi-surface`, `bg-gmi-surface-soft`, `border-gmi-border`, `border-gmi-border-strong`, `bg-gmi-navy`, `text-gmi-brand-cyan`, `bg-gmi-cyan-soft`, `text-gmi-interactive`, `outline-gmi-interactive`, and `ring-gmi-interactive`, including Tailwind opacity modifiers where appropriate.

The inline bridge is the smallest project-native Tailwind 4 approach: it makes the semantic colour names available to generated utilities while retaining the canonical CSS custom properties for authored CSS. It adds no dependency, recipe library, selector, or consumer migration.

## Deliberately unmigrated

All existing `--color-*` theme variables and the five legacy themes remain unchanged. No existing component, page background, AppInfo source, Validator source, Stats source, GIS/domain/chart colour, typography, density, spacing, radius, geometry, logo, or behaviour was changed. AppInfo remains the visual reference and does not consume the new tokens until its S10 checkpoint.

## Deferred roles

No canonical role was invented for slate-100, slate-400, slate-800, cyan-50/200/400/500/600/800, blue focus, semantic error/success/warning/information, or pink promotion. Those values and semantic mappings remain for scoped later decisions. Success, warning, error, information, GIS/domain, and chart palettes were not converted to cyan.

## Verification

- `git diff --check` — passed.
- `npm run build` — passed through `npm.cmd run build`; production compilation and static-page generation completed. The initial `npm run build` invocation was blocked only by PowerShell's local `npm.ps1` execution policy.
- `node --test tests/statsUiContract.test.mjs` — passed, 1/1.
- `node --test tests/validationV2WorkspaceInspector.test.mjs` — passed, 7/7.

Browser checks remain required: verify the unchanged upload/default workspace and AppInfo's five tabs, expanded history, and Contact idle, invalid, submitting, success, rate-limited, unavailable, and error states at desktop, constrained-height, and 390px widths. Confirm generated semantic utility output in an actual scoped adoption; S1 deliberately has no consumer to render it.

## Final status

No commit, push, deploy, branch switch, Vercel change, dependency upgrade, or logo change was made. Final `git status --short`:

```text
 M src/app/globals.css
?? docs/agent-reports/20260923-styling-overhaul-s1-foundations.md
```
