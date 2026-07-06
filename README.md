# LogiCost

A quoting and job management tool for South African transport operators. Built for owner-operators who run a bakkie, manage clients over WhatsApp, and need professional quotes backed by live DMRE fuel prices.

**Live demo:** [https://logicost-sandy.vercel.app/](https://logicost-sandy.vercel.app/)

**Repository:** [github.com/telmon95/Logicost](https://github.com/telmon95/Logicost)

## Features

- **Dashboard** — revenue stats, recent quotes, live fuel prices, price history chart, and full DMRE price table
- **New Quote** — multi-stop routing (OSRM), inland/coastal fuel zone split (Turf.js), return-empty costing, manual distance override, live quote preview
- **Quotes** — status pipeline (Quoted → Accepted → In Progress → Delivered → Invoiced → Paid), PDF preview, WhatsApp sharing
- **Clients** — lightweight CRM with contact details and common routes
- **Settings** — business profile stamped on every quote PDF

Fuel data is sourced from the [SA Fuel API](https://sa-fuel-api.guerillagardeningkzn.workers.dev/docs) by Morney Deetlefs, aligned with the [SA Fuel Price Tracker](https://sa-fuel-tracker.pages.dev/) DMRE retail grades.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 6 |
| Backend | Node.js, Express |
| Database | SQLite (local dev) — PostgreSQL-ready path on roadmap |
| Charts | Recharts |
| Hosting | Vercel (frontend) |
| Fuel API | [SA Fuel API](https://sa-fuel-api.guerillagardeningkzn.workers.dev) (free, no key for reads) |
| Routing | [Nominatim](https://nominatim.openstreetmap.org) + [OSRM](https://router.project-osrm.org) (free) |
| Zone split | [Turf.js](https://turfjs.org) + approximate SA coastal GeoJSON |

## Getting started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
git clone https://github.com/telmon95/Logicost.git
cd Logicost
npm install
npm install --prefix server
cp .env.example .env
```

### Run locally (frontend + API)

```bash
npm run dev
```

- **App:** http://localhost:5173  
- **API:** http://localhost:3001  

Vite proxies `/api` to the backend in dev. On first load, existing browser `localStorage` data is migrated to the server automatically.

### Run frontend only

```bash
npm run dev:client
```

Falls back to `localStorage` if the API is not running.

### API only

```bash
npm run start:api
```

### Build for production

```bash
npm run build
npm run preview
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/bootstrap` | Load profile, clients, quotes |
| PUT | `/api/profile` | Save business profile |
| PUT | `/api/clients` | Replace all clients |
| PUT | `/api/quotes` | Replace all quotes |

Database file: `server/data/logicost.db` (SQLite, gitignored).

## Project structure

```
logicost/
├── index.html
├── package.json
├── vite.config.js
├── server/
│   ├── index.js          # Express API
│   ├── db.js             # SQLite layer
│   ├── schema.sql
│   └── data/             # SQLite database (local)
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── api.js            # Frontend API client
    └── data/
        └── coastal-zone.json
```

## Deploy to Vercel

**Production:** [https://logicost-sandy.vercel.app/](https://logicost-sandy.vercel.app/)

The frontend deploys to Vercel out of the box (Vite → `dist`). Pushes to `main` on GitHub trigger automatic deploys when the repo is connected in Vercel.

```bash
npx vercel deploy --prod
```

The API (`server/`) is not deployed on Vercel — host it separately (Railway, Render, Fly.io, etc.) and set:

```
VITE_API_URL=https://your-api.example.com
```

On Vercel without a backend URL, the app uses **browser localStorage** for clients, quotes, and profile.

## Fuel pricing

LogiCost displays the five DMRE retail grades published monthly:

| Product | Description |
|---------|-------------|
| 95 ULP Inland / Coastal | Unleaded petrol 95 |
| 93 ULP Inland | Inland only (no coastal 93 published by DMRE) |
| Diesel 0.05% Inland / Coastal | Standard retail diesel (500ppm) |

Fleet quotes can also use **Diesel 50ppm** (inland/coastal) for truck costing.

Prices refresh automatically from the SA Fuel API on load. Historical trends use the last 3, 6, or 12 months.

## Route quoting

Long-haul quotes support:

- **Multi-stop legs** — add intermediate stops; OSRM calculates per-leg distance
- **Return empty** — outbound at loaded consumption, return at configurable empty rate
- **Inland/coastal split** — route geometry is checked against an approximate coastal polygon; fuel cost uses DMRE inland and coastal rates per segment (not official depot boundaries)

All routing uses free OpenStreetMap / OSRM services with no API keys.

## Roadmap

- [x] Node.js / Express backend
- [x] SQLite persistence (replace `localStorage` when API is running)
- [ ] PostgreSQL for production
- [ ] JWT authentication
- [ ] Real PDF export (PDFKit or similar)
- [ ] Quote → Invoice conversion
- [ ] PayFast / Yoco billing

## License

Private — all rights reserved.
