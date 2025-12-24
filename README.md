# gmi-validering

A simple app to validate the content of .gmi files used for delivery of survey data to public sector databases in Norway

---

## Frontend (Next.js + Tailwind boilerplate)

This repository now contains a minimal, entry-level Next.js application using JavaScript (no TypeScript) and Tailwind CSS.

### Quick start

```bash
cd /c/GitHub/gmi-validering
npm install
npm run dev
# open http://localhost:3000
```

### What I changed

- Ensured Tailwind is set up with `tailwind.config.cjs` and `postcss.config.mjs`.
- Switched `src/app/globals.css` to use `@tailwind base; @tailwind components; @tailwind utilities;`.
- Added `autoprefixer` to `devDependencies` and changed lint script to `next lint`.
- Confirmed `.gitignore` contains `.next`, `node_modules`, and `.env`.

If you want the Next app relocated, a monorepo setup, or CI config, tell me and I'll add it.
