# LogiCost

A quoting and job management tool for South African transport operators. Built for owner-operators who run a bakkie, manage clients over WhatsApp, and need professional quotes backed by live DMRE fuel prices.

**Live demo:** [logicost-sandy.vercel.app](https://logicost-sandy.vercel.app)

## Features

- **Dashboard** — revenue stats, recent quotes, live fuel prices, price history chart, and full DMRE price table
- **New Quote** — client picker, vehicle types, distance slider, fuel/driver/toll/margin costs, live quote preview
- **Quotes** — status pipeline (Quoted → Accepted → In Progress → Delivered → Invoiced → Paid), PDF preview, WhatsApp sharing
- **Clients** — lightweight CRM with contact details and common routes
- **Settings** — business profile stamped on every quote PDF

Fuel data is sourced from the [SA Fuel API](https://sa-fuel-api.guerillagardeningkzn.workers.dev/docs) by Morney Deetlefs, aligned with the [SA Fuel Price Tracker](https://sa-fuel-tracker.pages.dev/) DMRE retail grades.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 6 |
| Charts | Recharts |
| Storage | `localStorage` (MVP — clients, quotes, profile) |
| Hosting | Vercel |
| Fuel API | [SA Fuel API](https://sa-fuel-api.guerillagardeningkzn.workers.dev) (free, no key for reads) |

## Getting started

### Prerequisites

- Node.js 18+
- npm

### Install and run locally

```bash
git clone <your-repo-url>
cd logicost
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Build for production

```bash
npm run build
npm run preview
```

## Deploy to Vercel

The project is configured for Vercel out of the box (Vite preset, `dist` output).

```bash
npx vercel deploy --prod
```

Or connect the GitHub repo in the [Vercel dashboard](https://vercel.com) for automatic deploys on push.

## Project structure

```
logicost/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx      # React entry point
    └── App.jsx       # Full application (single-file MVP)
```

## Fuel pricing

LogiCost displays the five DMRE retail grades published monthly:

| Product | Description |
|---------|-------------|
| 95 ULP Inland / Coastal | Unleaded petrol 95 |
| 93 ULP Inland | Inland only (no coastal 93 published by DMRE) |
| Diesel 0.05% Inland / Coastal | Standard retail diesel (500ppm) |

Fleet quotes can also use **Diesel 50ppm** (inland/coastal) for truck costing.

Prices refresh automatically from the SA Fuel API on load. Historical trends use the last 3, 6, or 12 months.

## Roadmap

- [ ] Node.js / Express backend
- [ ] PostgreSQL persistence (replace `localStorage`)
- [ ] JWT authentication
- [ ] Real PDF export (PDFKit or similar)
- [ ] Quote → Invoice conversion
- [ ] PayFast / Yoco billing

## License

Private — all rights reserved.
