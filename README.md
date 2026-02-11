# GMI Validator

A web-based validation tool for **GMI**, **SOSI**, and **KOF** files used in Norwegian water and wastewater (VA) infrastructure. It helps municipal engineers and contractors verify as-built data before import into VA databases.

**Live app:** Hosted on [Vercel](https://vercel.com)

---

## What It Does

Upload a file and the app instantly parses, validates, and visualises the data — all in the browser.

| Capability               | Description                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Multi-format parsing** | GMI, SOSI (via [sosijs](https://github.com/nicwaller/sosijs)), and KOF survey files                                           |
| **Field validation**     | Checks required fields, acceptable values, and custom domain rules for points and lines                                       |
| **Incline analysis**     | Detects backfall, flat pipes, and low incline on gravity sewer lines                                                          |
| **Z-value validation**   | Flags missing or zero Z coordinates across all geometry                                                                       |
| **Terrain comparison**   | Fetches ground elevation from [Geonorge Høydedata API](https://ws.geonorge.no/hoydedata/v1/) and compares against pipe depths |
| **Topplokk check**       | Verifies that manholes (KUM, SLU, SLS, SAN) have a matching lid (LOK)                                                         |
| **Outlier detection**    | Statistical identification of objects far from the main data cluster                                                          |
| **2D map**               | Interactive Leaflet map with layer management, WMS overlay support, and legend                                                |
| **3D viewer**            | Three.js-based pipe network visualisation with terrain context                                                                |
| **Multi-layer**          | Load multiple files simultaneously and compare layers side-by-side                                                            |

The entire UI is in **Norwegian (bokmål)**.

---

## Tech Stack

|                           |                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Framework**             | [Next.js 16](https://nextjs.org) with React 19 and the React Compiler                                                                |
| **Styling**               | [Tailwind CSS 4](https://tailwindcss.com)                                                                                            |
| **State**                 | [Zustand](https://zustand-demo.pmnd.rs/) — single store with logical slices                                                          |
| **Map**                   | [Leaflet](https://leafletjs.com) / [React Leaflet](https://react-leaflet.js.org)                                                     |
| **3D**                    | [Three.js](https://threejs.org) via [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) & [Drei](https://drei.docs.pmnd.rs/) |
| **Coordinate transforms** | [proj4js](http://proj4js.org/)                                                                                                       |
| **Virtualised tables**    | [TanStack Table](https://tanstack.com/table) + [TanStack Virtual](https://tanstack.com/virtual)                                      |
| **Hosting**               | [Vercel](https://vercel.com)                                                                                                         |
| **Analytics**             | [Vercel Analytics](https://vercel.com/analytics) (anonymous, cookie-free)                                                            |

---

## Project Structure

```
src/
├── app/                  # Next.js App Router (pages, API routes)
│   └── api/
│       ├── track/        # Anonymous usage tracking endpoint
│       └── wms-proxy/    # Server-side WMS proxy to avoid CORS
├── components/           # UI components (Sidebar, MapView, FileUpload, 3D/, …)
├── data/                 # Validation rules (JSON) & reference documents
│   └── rules/            # Point/line field rules + custom logic
├── features/             # Feature modules (user-tracking docs & SQL)
└── lib/
    ├── parsing/          # Parsers: gmiParser, sosiParser, kofParser
    ├── validation/       # Rule engine (validator, fieldValidation)
    ├── analysis/         # incline, zValidation, terrain, outliers, topplok
    ├── tracking/         # Kommune lookup, Supabase client, geo helpers
    ├── 3d/               # Data transforms & colour mapping for 3D view
    └── store.js          # Zustand global store
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** (or your preferred package manager)

### Install & Run

```bash
git clone https://github.com/<your-org>/gmi-validering.git
cd gmi-validering
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables (optional)

| Variable                    | Purpose                                 |
| --------------------------- | --------------------------------------- |
| `SUPABASE_URL`              | Supabase project URL for usage tracking |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key               |

The app works fully without these — tracking is simply skipped.

---

## Security & Privacy

This application was designed with a **privacy-first** approach:

- **No file data leaves the browser.** All parsing, validation, and analysis runs entirely client-side. Uploaded files are never sent to or stored on the server.
- **No personal data is collected.** There are no user accounts, cookies, or tracking pixels.
- **Minimal anonymous usage tracking.** The only data persisted server-side is the dataset kommune (derived from file coordinates via the [Geonorge API](https://ws.geonorge.no/)). This is stored as an aggregate counter in Supabase and is used solely to understand geographic adoption. No IP addresses, filenames, or file contents are stored.
- **WMS proxy is stateless.** The server-side WMS proxy forwards map tile requests without caching or logging credentials.
- **SSRF protection.** The WMS proxy validates target URLs and restricts protocols to HTTP/HTTPS.

---

## Development

This project has been developed iteratively with the assistance of **GitHub Copilot** (AI pair-programming). Developer-facing notes are in [docs/DEVELOPER_NOTES.md](docs/DEVELOPER_NOTES.md), and historic Copilot prompts/specs/reviews are archived under [docs/archive/](docs/archive/).

### Key Design Decisions

- **Client-side processing** — keeps infrastructure costs minimal and avoids handling sensitive data on the server.
- **Zustand over Redux/Context** — chosen for small bundle size, selective subscriptions, and simplicity.
- **React Compiler** — enabled via Next.js 16 for automatic memoisation.
- **Rule-driven validation** — field rules are defined in JSON (`src/data/rules/`) making them easy to update without code changes.
- **Norwegian UI / English codebase** — all user-facing text is in Norwegian bokmål; all code, comments, and documentation are in English.

### Scripts

| Command         | Action                   |
| --------------- | ------------------------ |
| `npm run dev`   | Start development server |
| `npm run build` | Production build         |
| `npm run start` | Serve production build   |
| `npm run lint`  | Run ESLint               |

---

## License

[MIT](LICENSE) — Copyright © 2025 Paul Bennett
