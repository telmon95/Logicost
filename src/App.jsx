import { useState, useEffect, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { booleanPointInPolygon, distance, point } from "@turf/turf";
import COASTAL_ZONE from "./data/coastal-zone.json";
import { checkApiHealth, fetchBootstrap, saveProfileApi, saveClientsApi, saveQuotesApi } from "./api.js";

const API_BASE = "https://sa-fuel-api.guerillagardeningkzn.workers.dev";

// DMRE retail grades — matches sa-fuel-tracker.pages.dev (Morney Deetlefs)
const TRACKER_PRODUCTS = [
  { id: "p95i",  title: "95 ULP",       region: "Inland",      color: "#F5A623", chart: "95 Inland" },
  { id: "p95c",  title: "95 ULP",       region: "Coastal",     color: "#FF8C00", chart: "95 Coastal" },
  { id: "p93i",  title: "93 ULP",       region: "Inland only", color: "#FFB347", chart: "93 Inland" },
  { id: "d500i", title: "Diesel 0.05%", region: "Inland",      color: "#3DD68C", chart: "Diesel Inland" },
  { id: "d500c", title: "Diesel 0.05%", region: "Coastal",     color: "#2BB87A", chart: "Diesel Coastal" },
];

// Fleet 50ppm diesel — higher-sulphur pump grade many trucks use (API field: d50)
const FLEET_DIESEL = [
  { id: "d50i", label: "Diesel 50ppm · Inland" },
  { id: "d50c", label: "Diesel 50ppm · Coastal" },
];

function fuelFromApiEntry(entry) {
  const p = entry?.prices;
  if (!p) return { ...FUEL, month: entry?.monthLabel || FUEL.month };
  return {
    p95i:  p.petrol?.p95Inland  ?? FUEL.p95i,
    p95c:  p.petrol?.p95Coastal ?? FUEL.p95c,
    p93i:  p.petrol?.p93Inland  ?? FUEL.p93i,
    d500i: p.diesel?.d500Inland ?? FUEL.d500i,
    d500c: p.diesel?.d500Coastal ?? FUEL.d500c,
    d50i:  p.diesel?.d50Inland  ?? FUEL.d50i,
    d50c:  p.diesel?.d50Coastal ?? FUEL.d50c,
    month: entry.monthLabel || FUEL.month,
  };
}

function historyRowFromApi(entry) {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mo = parseInt(entry.month.slice(5, 7), 10);
  const prices = fuelFromApiEntry(entry);
  const row = { month: `${names[mo - 1]} '${entry.month.slice(2, 4)}`, monthLabel: entry.monthLabel };
  TRACKER_PRODUCTS.forEach(({ id }) => { row[id] = prices[id]; });
  return row;
}

// ─── 12-month baked history (DMRE via SA Fuel API — tracker fields) ───────
const HISTORY = [
  { month:"Jul '25", monthLabel:"Jul 2025", p95i:21.87, p95c:21.04, p93i:21.79, d500i:19.35, d500c:18.52 },
  { month:"Aug '25", monthLabel:"Aug 2025", p95i:21.59, p95c:20.76, p93i:21.51, d500i:20.00, d500c:19.17 },
  { month:"Sep '25", monthLabel:"Sep 2025", p95i:21.55, p95c:20.72, p93i:21.47, d500i:19.44, d500c:18.61 },
  { month:"Oct '25", monthLabel:"Oct 2025", p95i:21.63, p95c:20.80, p93i:21.48, d500i:19.34, d500c:18.51 },
  { month:"Nov '25", monthLabel:"Nov 2025", p95i:21.12, p95c:20.29, p93i:20.97, d500i:19.13, d500c:18.30 },
  { month:"Dec '25", monthLabel:"Dec 2025", p95i:21.41, p95c:20.58, p93i:21.26, d500i:19.79, d500c:18.96 },
  { month:"Jan '26", monthLabel:"Jan 2026", p95i:20.75, p95c:19.92, p93i:20.64, d500i:18.42, d500c:17.59 },
  { month:"Feb '26", monthLabel:"Feb 2026", p95i:20.10, p95c:19.27, p93i:19.99, d500i:17.92, d500c:17.09 },
  { month:"Mar '26", monthLabel:"Mar 2026", p95i:20.30, p95c:19.47, p93i:20.19, d500i:18.54, d500c:17.71 },
  { month:"Apr '26", monthLabel:"Apr 2026", p95i:23.36, p95c:22.49, p93i:23.25, d500i:25.91, d500c:25.04 },
  { month:"May '26", monthLabel:"May 2026", p95i:26.63, p95c:25.76, p93i:26.52, d500i:31.18, d500c:30.30 },
  { month:"Jun '26", monthLabel:"Jun 2026", p95i:28.06, p95c:27.19, p93i:27.95, d500i:27.92, d500c:27.05 },
];


// ─── Persistent storage (API backend with localStorage fallback) ──────────
const localStore = {
  async get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  async set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  },
};

let useBackend = false;

async function initDataStore() {
  useBackend = await checkApiHealth();
  return useBackend;
}

async function loadAppData() {
  if (useBackend) {
    try {
      const data = await fetchBootstrap();
      const localClients = await localStore.get("lc_clients");
      const localQuotes = await localStore.get("lc_quotes");
      const localProfile = await localStore.get("lc_profile");
      const hasLocal = (localClients?.length || localQuotes?.length || localProfile?.company);

      if (hasLocal && !data.clients?.length && !data.quotes?.length) {
        const clients = localClients || [];
        const quotes = localQuotes || [];
        const profile = localProfile || data.profile;
        await saveClientsApi(clients);
        await saveQuotesApi(quotes);
        await saveProfileApi(profile);
        return { clients, quotes, profile, migrated: true };
      }

      return { clients: data.clients || [], quotes: data.quotes || [], profile: data.profile, migrated: false };
    } catch {
      useBackend = false;
    }
  }

  const [clients, quotes, profile] = await Promise.all([
    localStore.get("lc_clients"),
    localStore.get("lc_quotes"),
    localStore.get("lc_profile"),
  ]);
  return {
    clients: clients || [],
    quotes: quotes || [],
    profile: profile || { company: "My Transport Co", owner: "", phone: "", email: "", vat: "" },
    migrated: false,
  };
}

async function persistClients(clients) {
  if (useBackend) {
    try {
      await saveClientsApi(clients);
      return;
    } catch {
      useBackend = false;
    }
  }
  await localStore.set("lc_clients", clients);
}

async function persistQuotes(quotes) {
  if (useBackend) {
    try {
      await saveQuotesApi(quotes);
      return;
    } catch {
      useBackend = false;
    }
  }
  await localStore.set("lc_quotes", quotes);
}

async function persistProfile(profile) {
  if (useBackend) {
    try {
      await saveProfileApi(profile);
      return;
    } catch {
      useBackend = false;
    }
  }
  await localStore.set("lc_profile", profile);
}

// ─── Live fuel prices (Jun 2026 DMRE fallback, refreshed from SA Fuel API) ─
const FUEL = {
  p95i: 28.06, p95c: 27.19, p93i: 27.95,
  d500i: 27.92, d500c: 27.05,
  d50i: 29.26, d50c: 28.00,
  month: "Jun 2026",
};

// ─── Helpers ──────────────────────────────────────────────────────────────
const R = n => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "R0.00";
  return "R" + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
const uid = () => Math.random().toString(36).slice(2, 9).toUpperCase();
const pad = n => String(n).padStart(5, "0");
const today = () => new Date().toISOString().slice(0, 10);

const VEHICLES = [
  { label: "Sedan / Bakkie", l: 8,  emptyL: 6,  fuel: "petrol" },
  { label: "Minibus / LDV",  l: 12, emptyL: 9,  fuel: "petrol" },
  { label: "1–3 Ton Truck",  l: 14, emptyL: 10, fuel: "diesel" },
  { label: "Semi / Artic",   l: 22, emptyL: 15, fuel: "diesel" },
];

const FUEL_QUOTE_GROUPS = [
  {
    label: "DMRE retail — published monthly",
    options: TRACKER_PRODUCTS.map(p => ({ id: p.id, label: `${p.title} · ${p.region}` })),
  },
  {
    label: "Fleet diesel 50ppm — pump grade",
    options: FLEET_DIESEL,
  },
];

const FUEL_QUOTE_OPTS = FUEL_QUOTE_GROUPS.flatMap(g => g.options);

const FUEL_LABELS = Object.fromEntries(FUEL_QUOTE_OPTS.map(o => [o.id, o.label]));

function getFuelPrice(fuel, id) {
  const n = Number(fuel?.[id]);
  if (Number.isFinite(n)) return n;
  const fallback = Number(FUEL[id]);
  return Number.isFinite(fallback) ? fallback : 0;
}

function fuelLabel(id) {
  return FUEL_LABELS[id] || id;
}

function defaultFuelKeyForVehicle(vehicleFuel) {
  return vehicleFuel === "diesel" ? "d500i" : "p93i";
}

function dieselFuelHint(fuelKey) {
  if (fuelKey.startsWith("d500")) {
    return "DMRE retail diesel (0.05% sulphur) — matches the official fuel price tracker.";
  }
  if (fuelKey.startsWith("d50")) {
    return "Fleet 50ppm pump grade — what many trucks actually pay; usually priced above DMRE 0.05%.";
  }
  return null;
}

// ─── Routing (Nominatim geocoding + OSRM — free, no API key) ─────────────
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OSRM_BASE = "https://router.project-osrm.org";
const GEO_CACHE_KEY = "lc_geocode_v1";

function readGeocodeCache() {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function cacheGeocode(query, result) {
  try {
    const cache = readGeocodeCache();
    cache[query.toLowerCase()] = result;
    const keys = Object.keys(cache);
    if (keys.length > 200) {
      keys.slice(0, keys.length - 200).forEach(k => delete cache[k]);
    }
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

async function geocodePlace(query) {
  const q = query.trim();
  if (!q) return null;

  const cacheKey = q.toLowerCase();
  const cached = readGeocodeCache()[cacheKey];
  if (cached) return cached;

  const searchQ = /\bsouth africa\b/i.test(q) ? q : `${q}, South Africa`;
  const url = `${NOMINATIM_BASE}/search?${new URLSearchParams({
    q: searchQ,
    countrycodes: "za",
    format: "json",
    limit: "1",
  })}`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Geocoding service unavailable");

  const data = await res.json();
  if (!data?.length) return null;

  const hit = data[0];
  const result = {
    lat: parseFloat(hit.lat),
    lon: parseFloat(hit.lon),
    displayName: hit.display_name,
  };
  cacheGeocode(q, result);
  return result;
}

async function osrmDrivingRoute(waypoints) {
  if (waypoints.length < 2) throw new Error("Need at least 2 locations");

  const coords = waypoints.map(w => `${w.lon},${w.lat}`).join(";");
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Routing service unavailable");

  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error("No driving route found between these locations");
  }

  const route = data.routes[0];
  const legs = route.legs.map((leg, i) => ({
    index: i + 1,
    fromLabel: waypoints[i].label || waypoints[i].displayName?.split(",")[0] || `Stop ${i + 1}`,
    toLabel: waypoints[i + 1].label || waypoints[i + 1].displayName?.split(",")[0] || `Stop ${i + 2}`,
    distanceKm: leg.distance / 1000,
    durationMin: Math.round(leg.duration / 60),
  }));

  return {
    distanceKm: route.distance / 1000,
    durationMin: Math.round(route.duration / 60),
    geometry: route.geometry,
    legs,
    waypoints,
  };
}

async function geocodeAll(locationTexts) {
  const geocoded = [];
  for (const text of locationTexts) {
    const trimmed = text.trim();
    const place = await geocodePlace(trimmed);
    if (!place) throw new Error(`Could not find “${trimmed}”`);
    geocoded.push({ ...place, label: trimmed });
    if (!readGeocodeCache()[trimmed.toLowerCase()]) {
      await new Promise(r => setTimeout(r, 1100));
    }
  }
  return geocoded;
}

function splitRouteByZone(geometry) {
  if (!geometry?.coordinates?.length) return null;

  let inlandKm = 0;
  let coastalKm = 0;
  const coords = geometry.coordinates;

  for (let i = 0; i < coords.length - 1; i++) {
    const segKm = distance(point(coords[i]), point(coords[i + 1]), { units: "kilometers" });
    const mid = point([
      (coords[i][0] + coords[i + 1][0]) / 2,
      (coords[i][1] + coords[i + 1][1]) / 2,
    ]);
    if (booleanPointInPolygon(mid, COASTAL_ZONE)) coastalKm += segKm;
    else inlandKm += segKm;
  }

  return {
    inlandKm: Math.round(inlandKm),
    coastalKm: Math.round(coastalKm),
    totalKm: Math.round(inlandKm + coastalKm),
  };
}

async function calculateRoute(locationTexts) {
  const texts = locationTexts.map(t => t.trim()).filter(Boolean);
  if (texts.length < 2) throw new Error("Enter at least a start and end location");

  const waypoints = await geocodeAll(texts);
  const route = await osrmDrivingRoute(waypoints);
  const zoneSplit = splitRouteByZone(route.geometry);

  return {
    ...route,
    from: waypoints[0],
    to: waypoints[waypoints.length - 1],
    zoneSplit,
  };
}

function fuelProductBase(fuelKey) {
  if (fuelKey.endsWith("i") || fuelKey.endsWith("c")) return fuelKey.slice(0, -1);
  return fuelKey;
}

function zoneFuelPrices(fuel, fuelKey) {
  const base = fuelProductBase(fuelKey);
  const inland = getFuelPrice(fuel, `${base}i`);
  const hasCoastal = Number.isFinite(Number(fuel?.[`${base}c`]));
  const coastal = hasCoastal ? getFuelPrice(fuel, `${base}c`) : inland;
  return { base, inland, coastal, hasCoastal };
}

function computeTripFuelCost({
  fuel,
  fuelKey,
  loadedL,
  emptyL,
  outboundKm,
  returnKm = 0,
  returnEmpty = false,
  zoneSplit = null,
  useZoneSplit = true,
}) {
  const prices = zoneFuelPrices(fuel, fuelKey);
  const singlePrice = getFuelPrice(fuel, fuelKey);

  const fuelForKm = (km, lPer100) => {
    if (km <= 0) return 0;
    if (useZoneSplit && zoneSplit && zoneSplit.inlandKm + zoneSplit.coastalKm > 0) {
      const ratioInland = zoneSplit.inlandKm / (zoneSplit.inlandKm + zoneSplit.coastalKm);
      const ratioCoastal = zoneSplit.coastalKm / (zoneSplit.inlandKm + zoneSplit.coastalKm);
      const iKm = km * ratioInland;
      const cKm = km * ratioCoastal;
      return (iKm / 100) * lPer100 * prices.inland + (cKm / 100) * lPer100 * prices.coastal;
    }
    return (km / 100) * lPer100 * singlePrice;
  };

  let fuelCost = fuelForKm(outboundKm, loadedL);
  if (returnEmpty && returnKm > 0) {
    fuelCost += fuelForKm(returnKm, emptyL);
  }

  return { fuelCost, prices, blendedPrice: singlePrice };
}

function buildRouteLocations(from, stops, to) {
  return [from, ...stops.map(s => s.trim()).filter(Boolean), to]
    .map(s => s.trim())
    .filter(Boolean);
}

// ─── Styles ───────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#0F1923;color:#F0F4F8;font-family:'Inter',sans-serif;min-height:100vh}
  :root{
    --bg:#0F1923;--card:#162230;--card2:#1E2F3E;--amber:#F5A623;--amber2:#e09418;
    --white:#F0F4F8;--muted:#7A93A8;--border:#243447;--green:#3DD68C;--red:#F5564A;
  }
  .app{display:flex;min-height:100vh}
  /* SIDEBAR */
  .sidebar{width:220px;background:#0d1820;border-right:1px solid var(--border);
    display:flex;flex-direction:column;padding:24px 0;flex-shrink:0;position:sticky;top:0;height:100vh}
  .sidebar-logo{padding:0 20px 24px;border-bottom:1px solid var(--border);margin-bottom:16px}
  .sidebar-logo span{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800}
  .sidebar-logo em{color:var(--amber);font-style:normal}
  .sidebar-logo small{display:block;font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-top:2px}
  .nav-item{display:flex;align-items:center;gap:10px;padding:10px 20px;cursor:pointer;
    font-size:13px;font-weight:500;color:var(--muted);border-left:3px solid transparent;transition:all .15s}
  .nav-item:hover{color:var(--white);background:rgba(255,255,255,0.03)}
  .nav-item.active{color:var(--amber);border-left-color:var(--amber);background:rgba(245,166,35,0.06)}
  .nav-icon{font-size:16px;width:20px;text-align:center}
  .sidebar-fuel{margin-top:auto;padding:16px 20px;border-top:1px solid var(--border);max-height:320px;overflow-y:auto}
  .fuel-badge{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px}
  .fuel-row{display:flex;justify-content:space-between;font-size:11px;color:var(--white);margin-bottom:4px;gap:8px}
  .fuel-row span{color:var(--amber);font-weight:600;white-space:nowrap}
  .fuel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
  .tracker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
  .tracker-card{background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:18px 14px;text-align:center}
  .tracker-card-type{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;font-weight:600}
  .tracker-card-region{font-size:12px;color:var(--white);font-weight:600;margin-top:3px;margin-bottom:12px}
  .tracker-card-price{font-family:'Barlow Condensed',sans-serif;font-size:34px;font-weight:800;line-height:1}
  .tracker-card-unit{font-size:10px;color:var(--muted);margin-top:10px;line-height:1.45}
  .fuel-price-cell{background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:14px}
  .fuel-price-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px}
  .fuel-price-val{font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:700;color:var(--amber)}
  .fuel-price-val span{font-size:12px;color:var(--muted);font-weight:400;margin-left:2px}
  /* MAIN */
  .main{flex:1;padding:32px;overflow-y:auto;max-width:1100px}
  .page-header{margin-bottom:28px}
  .page-title{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;letter-spacing:.3px}
  .page-sub{color:var(--muted);font-size:13px;margin-top:4px}
  /* CARDS */
  .card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:16px}
  .card-title{font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:16px}
  /* GRID */
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
  /* FORM */
  .field{margin-bottom:14px}
  .label{display:block;font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px}
  .input{width:100%;background:var(--card2);border:1.5px solid var(--border);border-radius:9px;
    padding:10px 13px;color:var(--white);font-size:14px;font-family:'Inter',sans-serif;outline:none;transition:border-color .15s}
  .input:focus{border-color:var(--amber)}
  .select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%237A93A8' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
    background-repeat:no-repeat;background-position:right 12px center}
  textarea.input{resize:vertical;min-height:70px}
  /* BUTTONS */
  .btn{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border-radius:9px;
    font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:'Inter',sans-serif;transition:all .15s}
  .btn-primary{background:var(--amber);color:#0F1923}
  .btn-primary:hover{background:var(--amber2)}
  .btn-ghost{background:var(--card2);color:var(--muted);border:1px solid var(--border)}
  .btn-ghost:hover{color:var(--white);border-color:var(--muted)}
  .btn-green{background:rgba(61,214,140,.15);color:var(--green);border:1px solid rgba(61,214,140,.3)}
  .btn-green:hover{background:rgba(61,214,140,.25)}
  .btn-red{background:rgba(245,86,74,.1);color:var(--red);border:1px solid rgba(245,86,74,.25)}
  .btn-sm{padding:7px 13px;font-size:12px}
  .btn-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
  /* VEHICLE PICKER */
  .v-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  .v-btn{background:var(--card2);border:1.5px solid var(--border);border-radius:10px;
    padding:12px 8px;cursor:pointer;text-align:center;transition:all .15s;color:var(--white)}
  .v-btn:hover{border-color:var(--amber2)}
  .v-btn.active{border-color:var(--amber);background:rgba(245,166,35,.08)}
  .v-icon{font-size:20px;display:block;margin-bottom:4px}
  .v-name{font-size:11px;font-weight:600;display:block}
  .v-stat{font-size:10px;color:var(--muted);margin-top:2px}
  /* STATS ROW */
  .stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .stat-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px}
  .stat-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
  .stat-value{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:700;color:var(--amber)}
  .stat-sub{font-size:11px;color:var(--muted);margin-top:3px}
  /* TABLE */
  .table{width:100%;border-collapse:collapse}
  .table th{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;
    padding:8px 12px;text-align:left;border-bottom:1px solid var(--border)}
  .table td{padding:11px 12px;font-size:13px;border-bottom:1px solid rgba(36,52,71,.5)}
  .table tr:last-child td{border-bottom:none}
  .table tr:hover td{background:rgba(255,255,255,.02)}
  /* BADGE */
  .badge{display:inline-block;padding:3px 9px;border-radius:100px;font-size:11px;font-weight:600}
  .badge-amber{background:rgba(245,166,35,.15);color:var(--amber)}
  .badge-green{background:rgba(61,214,140,.15);color:var(--green)}
  .badge-muted{background:rgba(122,147,168,.1);color:var(--muted)}
  .badge-red{background:rgba(245,86,74,.1);color:var(--red)}
  /* QUOTE PREVIEW */
  .quote-preview{background:#fff;color:#111;border-radius:12px;padding:28px;font-family:'Inter',sans-serif}
  .qp-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #F5A623}
  .qp-logo{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:#0F1923}
  .qp-logo em{color:#F5A623;font-style:normal}
  .qp-meta{text-align:right;font-size:11px;color:#666}
  .qp-meta strong{display:block;font-size:15px;color:#111;font-weight:700}
  .qp-section{margin-bottom:20px}
  .qp-section h4{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:8px}
  .qp-row{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-bottom:1px solid #f0f0f0}
  .qp-total{display:flex;justify-content:space-between;font-size:18px;font-weight:700;
    padding:12px 0;border-top:2px solid #111;margin-top:8px;color:#111}
  .qp-total span:last-child{color:#F5A623}
  .qp-footer{font-size:10px;color:#999;text-align:center;margin-top:20px;padding-top:12px;border-top:1px solid #eee}
  /* METER */
  .meter{text-align:center;padding:20px 0}
  .meter-val{font-family:'Barlow Condensed',sans-serif;font-size:52px;font-weight:800;color:var(--amber);line-height:1}
  .meter-label{font-size:12px;color:var(--muted);margin-top:6px}
  /* SLIDER */
  .slider{-webkit-appearance:none;width:100%;height:4px;background:var(--border);border-radius:4px;outline:none;cursor:pointer;margin:8px 0}
  .slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;background:var(--amber);border-radius:50%;box-shadow:0 0 0 4px rgba(245,166,35,.2)}
  /* DIST DISPLAY */
  .dist-val{font-family:'Barlow Condensed',sans-serif;font-size:36px;font-weight:700;color:var(--amber);line-height:1}
  .dist-val span{font-size:16px;color:var(--muted);font-weight:400;margin-left:4px}
  .dist-mode-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;flex-wrap:wrap}
  .dist-meta{font-size:11px;color:var(--muted);line-height:1.5;margin-top:10px}
  .dist-meta a{color:var(--amber);text-decoration:none;cursor:pointer}
  .dist-meta a:hover{text-decoration:underline}
  .route-loading{color:var(--amber);font-size:12px}
  .stop-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
  .stop-row .input{flex:1}
  .stop-num{font-size:11px;color:var(--muted);min-width:52px;font-weight:600}
  .check-row{display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;margin-bottom:12px;color:var(--white)}
  .check-row input{width:16px;height:16px;accent-color:var(--amber);cursor:pointer}
  .leg-list{margin-top:12px;border-top:1px solid var(--border);padding-top:12px}
  .leg-item{font-size:12px;color:var(--muted);padding:7px 0;border-bottom:1px solid rgba(36,52,71,.35)}
  .leg-item:last-child{border-bottom:none}
  .leg-item strong{color:var(--white);font-weight:600}
  .zone-split{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
  .zone-pill{font-size:11px;padding:4px 10px;border-radius:100px;background:var(--card2);border:1px solid var(--border);color:var(--muted)}
  .zone-pill em{font-style:normal;color:var(--amber);font-weight:600}
  /* MODAL */
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px}
  .modal{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:28px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto}
  .modal-title{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;margin-bottom:20px}
  /* TOAST */
  .toast{position:fixed;bottom:24px;right:24px;background:var(--green);color:#0F1923;
    padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:200;
    animation:slideUp .3s ease}
  @keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
  /* MOBILE */
  .bottom-nav{display:none}
  @media(max-width:768px){
    .sidebar{display:none}
    .bottom-nav{display:flex;position:fixed;bottom:0;left:0;right:0;background:#0d1820;
      border-top:1px solid var(--border);z-index:50}
    .bn-item{flex:1;display:flex;flex-direction:column;align-items:center;padding:10px 4px;
      cursor:pointer;font-size:10px;color:var(--muted);gap:3px;transition:color .15s}
    .bn-item.active{color:var(--amber)}
    .bn-icon{font-size:18px}
    .main{padding:20px 16px 80px}
    .stats-row{grid-template-columns:1fr 1fr}
    .v-grid{grid-template-columns:1fr 1fr}
    .grid2{grid-template-columns:1fr}
    .grid3{grid-template-columns:1fr}
    .app{flex-direction:column}
  }
  .empty{text-align:center;padding:40px 20px;color:var(--muted)}
  .empty-icon{font-size:40px;margin-bottom:12px}
  .empty p{font-size:14px}
  .divider{border:none;border-top:1px solid var(--border);margin:16px 0}
`;

// ─── MAIN APP ─────────────────────────────────────────────────────────────
export default function LogiCostApp() {
  const [page, setPage]         = useState("dashboard");
  const [clients, setClients]   = useState([]);
  const [quotes, setQuotes]     = useState([]);
  const [profile, setProfile]   = useState({ company: "My Transport Co", owner: "", phone: "", email: "", vat: "" });
  const [toast, setToast]       = useState(null);
  const [modal, setModal]       = useState(null); // { type, data }
  const [fuel, setFuel]         = useState(FUEL);
  const [dataSource, setDataSource] = useState("loading");

  // Load from API or localStorage
  useEffect(() => {
    (async () => {
      await initDataStore();
      const data = await loadAppData();
      setClients(data.clients);
      setQuotes(data.quotes);
      setProfile(data.profile);
      setDataSource(useBackend ? "api" : "local");
      if (data.migrated) {
        setToast("Local data migrated to server ✓");
        setTimeout(() => setToast(null), 3000);
      }
    })();
    fetch(`${API_BASE}/v1/prices/latest`)
      .then(r => r.json())
      .then(j => {
        if (j.success && j.data) setFuel({ ...FUEL, ...fuelFromApiEntry(j.data) });
      })
      .catch(() => {});
  }, []);

  const saveClients = async c => { setClients(c); await persistClients(c); };
  const saveQuotes  = async q => { setQuotes(q);  await persistQuotes(q);  };
  const saveProfile = async p => { setProfile(p); await persistProfile(p); };

  const showToast = msg => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const addClient = client => {
    const updated = [{ ...client, id: uid(), createdAt: today() }, ...clients];
    saveClients(updated); showToast("Client saved ✓"); setModal(null);
  };

  const addQuote = q => {
    const num = pad(quotes.length + 1);
    const updated = [{ ...q, id: uid(), number: num, status: "Quoted", createdAt: today() }, ...quotes];
    saveQuotes(updated); showToast(`Quote #${num} saved ✓`); setModal(null);
  };

  const updateQuoteStatus = (id, status) => {
    const updated = quotes.map(q => q.id === id ? { ...q, status } : q);
    saveQuotes(updated); showToast("Status updated ✓");
  };

  const deleteQuote = id => {
    saveQuotes(quotes.filter(q => q.id !== id)); showToast("Quote deleted");
  };

  const deleteClient = id => {
    saveClients(clients.filter(c => c.id !== id)); showToast("Client removed");
  };

  const nav = [
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "newquote",  icon: "✏️",  label: "New Quote" },
    { id: "quotes",    icon: "📋", label: "Quotes" },
    { id: "clients",   icon: "👥", label: "Clients" },
    { id: "settings",  icon: "⚙️",  label: "Settings" },
  ];

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div><span>Logi<em>Cost</em></span></div>
            <small>Transport OS</small>
          </div>
          {nav.map(n => (
            <div key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
              <span className="nav-icon">{n.icon}</span> {n.label}
            </div>
          ))}
          <div style={{ marginTop: "auto", padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".8px" }}>
              Data · {dataSource === "api" ? "Server" : dataSource === "local" ? "Browser" : "…"}
            </div>
          </div>
          {page !== "dashboard" && (
            <div className="sidebar-fuel">
              <div className="fuel-badge">DMRE · {fuel.month}</div>
              {TRACKER_PRODUCTS.filter(p => ["p95i", "p93i", "d500i"].includes(p.id)).map(p => (
                <div key={p.id} className="fuel-row">
                  {p.chart} <span>{R(getFuelPrice(fuel, p.id))}</span>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* MAIN CONTENT */}
        <main className="main">
          {page === "dashboard" && <Dashboard quotes={quotes} clients={clients} setPage={setPage} fuel={fuel} />}
          {page === "newquote"  && <NewQuote  clients={clients} fuel={fuel} addQuote={addQuote} profile={profile} showToast={showToast} />}
          {page === "quotes"    && <QuotesList quotes={quotes} clients={clients} updateStatus={updateQuoteStatus} deleteQuote={deleteQuote} profile={profile} fuel={fuel} showToast={showToast} />}
          {page === "clients"   && <ClientsList clients={clients} quotes={quotes} addClient={addClient} deleteClient={deleteClient} setModal={setModal} />}
          {page === "settings"  && <Settings profile={profile} saveProfile={saveProfile} showToast={showToast} dataSource={dataSource} />}
        </main>

        {/* BOTTOM NAV MOBILE */}
        <nav className="bottom-nav">
          {nav.map(n => (
            <div key={n.id} className={`bn-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
              <span className="bn-icon">{n.icon}</span>{n.label}
            </div>
          ))}
        </nav>

        {/* MODALS */}
        {modal?.type === "addClient" && (
          <AddClientModal onSave={addClient} onClose={() => setModal(null)} prefill={modal.data} />
        )}

        {/* TOAST */}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────
function Dashboard({ quotes, clients, setPage, fuel }) {
  const totalRevenue = quotes.filter(q => q.status === "Paid").reduce((s, q) => s + q.total, 0);
  const pending      = quotes.filter(q => ["Quoted","Accepted"].includes(q.status)).length;
  const thisMonth    = quotes.filter(q => q.createdAt?.startsWith(new Date().toISOString().slice(0,7)));
  const recent       = quotes.slice(0, 5);

  const statusColor = s => ({ Quoted:"badge-amber", Accepted:"badge-green", "In Progress":"badge-green",
    Delivered:"badge-muted", Invoiced:"badge-amber", Paid:"badge-green" }[s] || "badge-muted");

  return (
    <>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-sub">Your transport business at a glance</div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value">{R(totalRevenue)}</div>
          <div className="stat-sub">Paid jobs</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">This Month</div>
          <div className="stat-value">{thisMonth.length}</div>
          <div className="stat-sub">Quotes created</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{color:"#F5A623"}}>{pending}</div>
          <div className="stat-sub">Awaiting response</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Clients</div>
          <div className="stat-value">{clients.length}</div>
          <div className="stat-sub">Saved contacts</div>
        </div>
      </div>

      <div className="card">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div className="card-title" style={{margin:0}}>Recent Quotes</div>
          <button className="btn btn-primary btn-sm" onClick={() => setPage("newquote")}>+ New Quote</button>
        </div>
        {recent.length === 0 ? (
          <div className="empty"><div className="empty-icon">📋</div><p>No quotes yet. Create your first quote to get started.</p></div>
        ) : (
          <table className="table">
            <thead><tr>
              <th>Quote #</th><th>Client</th><th>Route</th><th>Total</th><th>Status</th>
            </tr></thead>
            <tbody>
              {recent.map(q => (
                <tr key={q.id}>
                  <td style={{color:"var(--amber)",fontWeight:600}}>#{q.number}</td>
                  <td>{q.clientName || "—"}</td>
                  <td style={{color:"var(--muted)",fontSize:12}}>{q.from && q.to ? `${q.from} → ${q.to}` : "—"}</td>
                  <td style={{fontWeight:600}}>{R(q.total)}</td>
                  <td><span className={`badge ${statusColor(q.status)}`}>{q.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <FuelPrices fuel={fuel} />
      <FuelTrends />
      <FuelHistoryTable />
    </>
  );
}

// ─── FUEL PRICES (DMRE retail — matches SA Fuel Tracker) ─────────────────
function FuelPrices({ fuel }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="card-title" style={{ margin: 0 }}>Current Prices · {fuel.month}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
            Monthly retail prices published by DMRE · inland &amp; coastal
          </div>
        </div>
        <span className="badge badge-green">Live · SA Fuel API</span>
      </div>
      <div className="tracker-grid">
        {TRACKER_PRODUCTS.map(p => (
          <div key={p.id} className="tracker-card" style={{ borderColor: `${p.color}44` }}>
            <div className="tracker-card-type">{p.title}</div>
            <div className="tracker-card-region">{p.region}</div>
            <div className="tracker-card-price" style={{ color: p.color }}>{R(getFuelPrice(fuel, p.id))}</div>
            <div className="tracker-card-unit">
              {p.id.startsWith("d500")
                ? "per litre · 0.05% sulphur"
                : "per litre · incl. levies & taxes"}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 14, lineHeight: 1.5 }}>
        Same 5 DMRE grades as{" "}
        <a href="https://sa-fuel-tracker.pages.dev/" target="_blank" rel="noreferrer" style={{ color: "var(--amber)" }}>
          SA Fuel Price Tracker
        </a>
        {" "}· data via{" "}
        <a href="https://sa-fuel-api.guerillagardeningkzn.workers.dev/docs" target="_blank" rel="noreferrer" style={{ color: "var(--amber)" }}>
          SA Fuel API
        </a>
      </div>
    </div>
  );
}

// ─── FUEL TRENDS ─────────────────────────────────────────────────────────
function FuelTrends() {
  const defaultActive = Object.fromEntries(
    TRACKER_PRODUCTS.map(p => [p.id, ["p95i", "p95c", "p93i", "d500i"].includes(p.id)])
  );
  const [active, setActive] = useState(defaultActive);
  const [interval, setInterval] = useState(12);
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/v1/prices?limit=${interval}`)
      .then(r => r.json())
      .then(j => {
        if (j.success && j.data?.length) {
          setLiveData([...j.data].reverse().map(historyRowFromApi));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [interval]);

  const chartData = liveData || HISTORY.slice(-interval);
  const first = chartData[0];
  const last  = chartData[chartData.length - 1];
  const delta = key => first && last ? (last[key] - first[key]) : 0;
  const pct   = key => first?.[key] ? ((delta(key) / first[key]) * 100).toFixed(1) : "0.0";

  const SERIES = TRACKER_PRODUCTS;

  const CustomTooltip = ({ active: a, payload, label }) => {
    if (!a || !payload?.length) return null;
    return (
      <div style={{background:"#162230",border:"1px solid #243447",borderRadius:10,padding:"12px 16px",fontSize:12}}>
        <div style={{fontWeight:700,marginBottom:8,color:"#F0F4F8"}}>{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{display:"flex",justifyContent:"space-between",gap:20,color:p.color,marginBottom:3}}>
            <span>{p.name}</span><span style={{fontWeight:700}}>R{Number(p.value).toFixed(2)}/L</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="card">
      {/* Header row */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <div className="card-title" style={{margin:0}}>Price History</div>
          <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>
            {loading ? "Fetching live data…" : liveData ? "🟢 Live · DMRE monthly gazette" : "✅ DMRE cached data"}
          </div>
        </div>
        {/* Interval selector */}
        <div style={{display:"flex",gap:6}}>
          {[3,6,12].map(n => (
            <button key={n} onClick={() => setInterval(n)} style={{
              padding:"5px 12px",borderRadius:7,border:"1.5px solid",fontSize:12,fontWeight:600,cursor:"pointer",
              borderColor: interval===n ? "var(--amber)" : "var(--border)",
              background:  interval===n ? "rgba(245,166,35,.12)" : "var(--card2)",
              color:       interval===n ? "var(--amber)" : "var(--muted)"
            }}>{n}M</button>
          ))}
        </div>
      </div>

      {/* Delta chips */}
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        {SERIES.map(s => {
          const d = delta(s.id);
          const p = pct(s.id);
          const up = d >= 0;
          return (
            <div key={s.id} onClick={() => setActive(a => ({...a, [s.id]: !a[s.id]}))}
              style={{
                background: active[s.id] ? `${s.color}18` : "var(--card2)",
                border: `1.5px solid ${active[s.id] ? s.color : "var(--border)"}`,
                borderRadius:10, padding:"10px 14px", cursor:"pointer", flex:1, minWidth:130,
                opacity: active[s.id] ? 1 : 0.5, transition:"all .15s"
              }}>
              <div style={{fontSize:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".7px",marginBottom:6}}>{s.chart}</div>
              <div style={{fontSize:11,marginTop:2,color: up ? "#F5564A" : "#3DD68C",fontWeight:600}}>
                {up ? "▲" : "▼"} R{Math.abs(d).toFixed(2)} ({up?"+":""}{p}%) over {interval} months
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{top:4,right:8,left:0,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#243447" />
          <XAxis dataKey="month" tick={{fill:"#7A93A8",fontSize:11}} tickLine={false} axisLine={{stroke:"#243447"}} />
          <YAxis
            tickFormatter={v => `R${v}`}
            tick={{fill:"#7A93A8",fontSize:11}}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={["auto","auto"]}
          />
          <Tooltip content={<CustomTooltip />} />
          {SERIES.map(s => active[s.id] && (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.chart}
              stroke={s.color}
              strokeWidth={2.5}
              dot={{ r:3, fill:s.color, strokeWidth:0 }}
              activeDot={{ r:5, strokeWidth:0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 14, textAlign: "right" }}>
        Price per litre in ZAR · Source: DMRE monthly gazette · click a chip to toggle series
      </div>
    </div>
  );
}

// ─── FULL PRICE HISTORY TABLE (tracker layout) ───────────────────────────
function FuelHistoryTable() {
  const [rows, setRows] = useState([...HISTORY].reverse());

  useEffect(() => {
    fetch(`${API_BASE}/v1/prices?limit=12`)
      .then(r => r.json())
      .then(j => {
        if (j.success && j.data?.length) {
          setRows(j.data.map(historyRowFromApi));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="card">
      <div className="card-title">Full Price History</div>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Month</th>
              <th>95 Inland</th>
              <th>95 Coastal</th>
              <th>93 Inland</th>
              <th>Diesel Inland</th>
              <th>Diesel Coastal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.monthLabel || r.month}>
                <td style={{ fontWeight: 600 }}>{r.monthLabel || r.month}</td>
                <td>{R(r.p95i)}</td>
                <td>{R(r.p95c)}</td>
                <td>{R(r.p93i)}</td>
                <td>{R(r.d500i)}</td>
                <td>{R(r.d500c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 12 }}>
        Price per litre in ZAR · Source: DMRE monthly gazette
      </div>
    </div>
  );
}

// ─── NEW QUOTE ────────────────────────────────────────────────────────────
function NewQuote({ clients, fuel, addQuote, profile, showToast }) {
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [from, setFrom]         = useState("");
  const [stops, setStops]       = useState([]);
  const [to, setTo]             = useState("");
  const [manualDist, setManualDist] = useState(100);
  const [routedKm, setRoutedKm] = useState(null);
  const [distMode, setDistMode] = useState("manual");
  const [routeStatus, setRouteStatus] = useState("idle");
  const [routeError, setRouteError] = useState("");
  const [routeInfo, setRouteInfo] = useState(null);
  const [returnEmpty, setReturnEmpty] = useState(false);
  const [emptyL, setEmptyL]     = useState(null);
  const [veh, setVeh]           = useState(0);
  const [fuelKey, setFuelKey]   = useState("p93i");
  const [tolls, setTolls]       = useState(0);
  const [driverRate, setDriverRate] = useState(80);
  const [avgSpeed, setAvgSpeed] = useState(90);
  const [margin, setMargin]     = useState(20);
  const [notes, setNotes]       = useState("");
  const [preview, setPreview]   = useState(false);

  const routeRequestRef = useRef(0);
  const manualOverrideRef = useRef(false);

  const vehicle = VEHICLES[veh];
  const loadedL = vehicle.l;
  const effectiveEmptyL = emptyL ?? vehicle.emptyL;

  const outboundKm = distMode === "auto" && routedKm != null ? routedKm : manualDist;
  const returnKm = returnEmpty ? outboundKm : 0;
  const dist = outboundKm + returnKm;

  const routeLocations = useMemo(
    () => buildRouteLocations(from, stops, to),
    [from, stops, to]
  );

  const runRouteCalculation = async (reqId, locations) => {
    setRouteStatus("loading");
    setRouteError("");
    try {
      const result = await calculateRoute(locations);
      if (reqId !== routeRequestRef.current) return null;

      const km = Math.max(5, Math.round(result.distanceKm));
      setRoutedKm(km);
      setRouteInfo({
        durationMin: result.durationMin,
        fromLabel: result.from.displayName,
        toLabel: result.to.displayName,
        legs: result.legs,
        zoneSplit: result.zoneSplit,
      });
      setRouteStatus("ok");
      if (!manualOverrideRef.current) setDistMode("auto");
      return km;
    } catch (err) {
      if (reqId !== routeRequestRef.current) return null;
      setRouteStatus("error");
      setRouteError(err.message || "Could not calculate route");
      return null;
    }
  };

  useEffect(() => {
    manualOverrideRef.current = false;
    setRoutedKm(null);
    setRouteInfo(null);
    setRouteError("");
    setRouteStatus("idle");

    if (routeLocations.length < 2) return;

    const reqId = ++routeRequestRef.current;
    const timer = setTimeout(() => runRouteCalculation(reqId, routeLocations), 900);
    return () => clearTimeout(timer);
  }, [routeLocations.join("|")]);

  const applyRouteDistance = () => {
    if (routedKm == null) return;
    manualOverrideRef.current = false;
    setDistMode("auto");
    showToast(`Route distance applied · ${routedKm} km`);
  };

  const recalculateRoute = async () => {
    if (routeLocations.length < 2) {
      showToast("Enter From and To locations first");
      return;
    }
    const reqId = ++routeRequestRef.current;
    manualOverrideRef.current = false;
    const km = await runRouteCalculation(reqId, routeLocations);
    if (km != null) showToast(`Route calculated · ${km} km`);
  };

  const handleSliderChange = value => {
    manualOverrideRef.current = true;
    setDistMode("manual");
    setManualDist(value);
  };

  const addStop = () => setStops(prev => [...prev, ""]);
  const updateStop = (i, val) => setStops(prev => prev.map((s, idx) => idx === i ? val : s));
  const removeStop = i => setStops(prev => prev.filter((_, idx) => idx !== i));

  const zoneSplit = routeInfo?.zoneSplit;
  const useZoneSplit = distMode === "auto" && routeStatus === "ok" && zoneSplit != null;
  const zonePrices = zoneFuelPrices(fuel, fuelKey);

  const { fuelCost } = computeTripFuelCost({
    fuel,
    fuelKey,
    loadedL,
    emptyL: effectiveEmptyL,
    outboundKm,
    returnKm,
    returnEmpty,
    zoneSplit,
    useZoneSplit,
  });

  const driverCost = (dist / avgSpeed) * driverRate;
  const subtotal   = fuelCost + tolls + driverCost;
  const total      = subtotal * (1 + margin / 100);
  const dieselHint = dieselFuelHint(fuelKey);
  const displayFuelPrice = useZoneSplit
    ? `${R(zonePrices.inland)}/L inland · ${R(zonePrices.coastal)}/L coastal`
    : `${R(getFuelPrice(fuel, fuelKey))}/L`;

  const selectedClient = clients.find(c => c.id === clientId);
  const displayName    = selectedClient?.name || clientName || "Client Name";
  const routeLabel     = routeLocations.length > 2
    ? routeLocations.join(" → ")
    : `${from} → ${to}`;

  const handleClientSelect = e => {
    const id = e.target.value;
    setClientId(id);
    const c = clients.find(c => c.id === id);
    if (c) { setClientName(c.name); }
  };

  const handleSave = () => {
    if (!displayName || displayName === "Client Name") { showToast("Add a client name first"); return; }
    addQuote({
      clientId, clientName: displayName, from, to, stops: stops.filter(s => s.trim()),
      dist, outboundKm, returnKm, returnEmpty, emptyL: effectiveEmptyL, distMode, routedKm,
      routeInfo: routeInfo ? { legs: routeInfo.legs, zoneSplit: routeInfo.zoneSplit } : null,
      vehicle: vehicle.label, fuelKey,
      fuelPrice: getFuelPrice(fuel, fuelKey), zoneSplit: useZoneSplit ? zoneSplit : null,
      fuelCost, driverCost, tolls, subtotal, margin, total, notes,
    });
  };

  const handleWhatsApp = () => {
    const legsNote = routeInfo?.legs?.length > 1
      ? `\nLegs: ${routeInfo.legs.map(l => `${l.fromLabel}→${l.toLabel} (${Math.round(l.distanceKm)}km)`).join(", ")}`
      : "";
    const zoneNote = useZoneSplit
      ? `\nZone split: ${zoneSplit.inlandKm}km inland @ ${R(zonePrices.inland)}/L · ${zoneSplit.coastalKm}km coastal @ ${R(zonePrices.coastal)}/L`
      : "";
    const returnNote = returnEmpty ? `\nReturn empty: ${returnKm}km @ ${effectiveEmptyL}L/100km` : "";
    const distNote = distMode === "auto" ? `${dist}km (OSRM)` : `${dist}km (manual)`;
    const msg = encodeURIComponent(
      `*LOGICOST QUOTE*\n\nClient: ${displayName}\nRoute: ${routeLabel} (${distNote})${legsNote}${zoneNote}${returnNote}\n\nFuel: ${R(fuelCost)}\nDriver: ${R(driverCost)}\nTolls: ${R(tolls)}\nMargin: ${margin}%\n\n*TOTAL: ${R(total)}*\n\nGenerated via LogiCost`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const sliderValue = distMode === "auto" && routedKm != null ? routedKm : manualDist;

  const previewQuote = {
    number: "00001",
    clientName: displayName,
    from, to, stops: stops.filter(s => s.trim()), dist, outboundKm, returnKm, returnEmpty,
    distMode, routeInfo, zoneSplit: useZoneSplit ? zoneSplit : null,
    vehicle: vehicle.label, fuelKey, fuelPrice: getFuelPrice(fuel, fuelKey),
    fuelCost, driverCost, tolls, margin, total, subtotal, notes, createdAt: today(),
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">New Quote</div>
        <div className="page-sub">Multi-stop routing · inland/coastal fuel split · return-empty costing</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:16,alignItems:"start"}}>
        <div>
          {/* CLIENT & ROUTE */}
          <div className="card">
            <div className="card-title">Route</div>
            <div className="field">
              <label className="label">Select Saved Client</label>
              <select className="input select" value={clientId} onChange={handleClientSelect}>
                <option value="">— New / one-off client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {!clientId && (
              <div className="field">
                <label className="label">Client Name</label>
                <input className="input" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="ABC Furniture" />
              </div>
            )}
            <div className="field">
              <label className="label">From</label>
              <input className="input" value={from} onChange={e => setFrom(e.target.value)} placeholder="Johannesburg" />
            </div>
            {stops.map((stop, i) => (
              <div key={i} className="stop-row">
                <span className="stop-num">Stop {i + 1}</span>
                <input className="input" value={stop} onChange={e => updateStop(i, e.target.value)} placeholder="Bloemfontein" />
                <button type="button" className="btn btn-red btn-sm" onClick={() => removeStop(i)} aria-label="Remove stop">✕</button>
              </div>
            ))}
            <div className="field">
              <label className="label">To</label>
              <input className="input" value={to} onChange={e => setTo(e.target.value)} placeholder="Cape Town" />
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addStop}>+ Add stop</button>
          </div>

          {/* VEHICLE */}
          <div className="card">
            <div className="card-title">Vehicle & Fuel</div>
            <div className="v-grid" style={{marginBottom:14}}>
              {VEHICLES.map((v, i) => (
                <button key={i} type="button" className={`v-btn ${veh===i?"active":""}`} onClick={() => {
                  setVeh(i);
                  setFuelKey(defaultFuelKeyForVehicle(v.fuel));
                  setEmptyL(null);
                }}>
                  <span className="v-name">{v.label}</span>
                  <span className="v-stat">{v.l}L loaded · {v.emptyL}L empty</span>
                </button>
              ))}
            </div>
            <label className="check-row">
              <input type="checkbox" checked={returnEmpty} onChange={e => setReturnEmpty(e.target.checked)} />
              Return empty — add return leg at lower consumption
            </label>
            {returnEmpty && (
              <div className="field">
                <label className="label">Empty consumption (L/100km)</label>
                <input type="number" className="input" value={effectiveEmptyL} min={1} max={40}
                  onChange={e => setEmptyL(+e.target.value)} />
              </div>
            )}
            <div className="field">
              <label className="label">Fuel Type</label>
              <select className="input select" value={fuelKey} onChange={e => setFuelKey(e.target.value)}>
                {FUEL_QUOTE_GROUPS.map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label} — {R(getFuelPrice(fuel, o.id))}/L
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                {useZoneSplit
                  ? `Auto zone split · ${displayFuelPrice} · ${fuel.month} DMRE`
                  : `Selected: ${fuelLabel(fuelKey)} @ ${displayFuelPrice} · ${fuel.month} DMRE`}
              </div>
              {dieselHint && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}>
                  {dieselHint}
                </div>
              )}
            </div>
          </div>

          {/* DISTANCE */}
          <div className="card">
            <div className="dist-mode-row">
              <div className="card-title" style={{ margin: 0 }}>Distance</div>
              {distMode === "auto" && routeStatus === "ok" ? (
                <span className="badge badge-green">OSRM route</span>
              ) : (
                <span className="badge badge-amber">Manual override</span>
              )}
            </div>
            <div className="dist-val">
              {routeStatus === "loading" ? "…" : dist}
              <span>km</span>
            </div>
            {returnEmpty && routeStatus !== "loading" && (
              <div className="dist-meta">
                Outbound {outboundKm} km (loaded {loadedL}L/100) + return {returnKm} km (empty {effectiveEmptyL}L/100)
              </div>
            )}
            {routeStatus === "loading" && (
              <div className="route-loading">Calculating route via OpenStreetMap…</div>
            )}
            {routeStatus === "ok" && routeInfo && distMode === "auto" && (
              <div className="dist-meta">
                ~{routeInfo.durationMin} min driving{returnEmpty ? " one-way" : ""} · road distance via OSRM
              </div>
            )}
            {routeStatus === "ok" && routedKm != null && distMode === "manual" && (
              <div className="dist-meta">
                Route suggests {routedKm} km
                {" · "}
                <a role="button" tabIndex={0} onClick={applyRouteDistance} onKeyDown={e => e.key === "Enter" && applyRouteDistance()}>
                  Use route distance
                </a>
              </div>
            )}
            {routeStatus === "error" && (
              <div className="dist-meta" style={{ color: "var(--red)" }}>
                {routeError}
                {" · "}
                <a role="button" tabIndex={0} onClick={recalculateRoute} onKeyDown={e => e.key === "Enter" && recalculateRoute()}>
                  Retry
                </a>
                {" · use slider below"}
              </div>
            )}
            {routeStatus === "ok" && routeInfo?.legs?.length > 1 && (
              <div className="leg-list">
                {routeInfo.legs.map(leg => (
                  <div key={leg.index} className="leg-item">
                    Leg {leg.index}: <strong>{leg.fromLabel}</strong> → <strong>{leg.toLabel}</strong>
                    {" · "}{Math.round(leg.distanceKm)} km · ~{leg.durationMin} min
                  </div>
                ))}
              </div>
            )}
            {useZoneSplit && zoneSplit && (
              <div className="zone-split">
                <span className="zone-pill"><em>{zoneSplit.inlandKm} km</em> inland @ {R(zonePrices.inland)}/L</span>
                <span className="zone-pill"><em>{zoneSplit.coastalKm} km</em> coastal @ {R(zonePrices.coastal)}/L</span>
              </div>
            )}
            {useZoneSplit && (
              <div className="dist-meta" style={{ marginTop: 8 }}>
                Zone split is approximate — not official DMRE depot boundaries
              </div>
            )}
            <input
              type="range"
              className="slider"
              min={10}
              max={1500}
              step={5}
              value={sliderValue}
              onChange={e => handleSliderChange(+e.target.value)}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              <span>10 km</span><span>750 km</span><span>1 500 km</span>
            </div>
            <div className="btn-row" style={{ marginTop: 12, marginBottom: 0 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={recalculateRoute} disabled={routeStatus === "loading"}>
                {routeStatus === "loading" ? "Calculating…" : "Recalculate route"}
              </button>
            </div>
          </div>

          {/* COSTS */}
          <div className="card">
            <div className="card-title">Additional Costs</div>
            <div className="grid2">
              <div className="field"><label className="label">Tolls (R)</label><input type="number" className="input" value={tolls} min={0} onChange={e => setTolls(+e.target.value)} /></div>
              <div className="field"><label className="label">Driver Rate (R/hr)</label><input type="number" className="input" value={driverRate} min={0} onChange={e => setDriverRate(+e.target.value)} /></div>
              <div className="field"><label className="label">Avg Speed (km/h)</label><input type="number" className="input" value={avgSpeed} min={40} max={120} onChange={e => setAvgSpeed(+e.target.value)} /></div>
              <div className="field"><label className="label">Margin (%)</label><input type="number" className="input" value={margin} min={0} max={200} onChange={e => setMargin(+e.target.value)} /></div>
            </div>
            <div className="field"><label className="label">Notes</label><textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special requirements..." /></div>
          </div>
        </div>

        {/* QUOTE PREVIEW PANEL */}
        <div style={{position:"sticky",top:16}}>
          <div className="card" style={{marginBottom:12}}>
            <div className="meter">
              <div style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:6}}>Suggested Quote</div>
              <div className="meter-val">{R(total)}</div>
              <div className="meter-label">
                {dist}km · {vehicle.label} · {displayFuelPrice}
                {distMode === "auto" && routeStatus === "ok" ? " · OSRM" : ""}
                {returnEmpty ? " · return empty" : ""}
              </div>
            </div>
            <hr className="divider" />
            <div style={{fontSize:13}}>
              {[["Fuel",R(fuelCost)],["Driver",R(driverCost)],["Tolls",R(tolls)],["Subtotal",R(subtotal)],[`Margin (${margin}%)`,R(total-subtotal)]].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
                  <span style={{color:"var(--muted)"}}>{l}</span><span style={{fontWeight:600}}>{v}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",fontWeight:700,fontSize:15}}>
                <span>Total</span><span style={{color:"var(--amber)"}}>{R(total)}</span>
              </div>
            </div>
          </div>

          <button className="btn btn-primary" style={{width:"100%",marginBottom:8,justifyContent:"center"}} onClick={handleSave}>Save Quote</button>
          <button className="btn btn-green" style={{width:"100%",marginBottom:8,justifyContent:"center"}} onClick={handleWhatsApp}>Share on WhatsApp</button>
          <button className="btn btn-ghost" style={{width:"100%",justifyContent:"center"}} onClick={() => setPreview(true)}>Preview PDF Quote</button>
        </div>
      </div>

      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(false)}>
          <div style={{background:"var(--card)",borderRadius:16,padding:24,maxWidth:560,width:"100%",maxHeight:"90vh",overflow:"auto"}} onClick={e => e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:700}}>Quote Preview</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreview(false)}>✕ Close</button>
            </div>
            <QuotePDF q={previewQuote} profile={profile} fuelMonth={fuel.month} zonePrices={zonePrices} />
            <div className="btn-row" style={{marginTop:16}}>
              <button className="btn btn-green" style={{flex:1,justifyContent:"center"}} onClick={handleWhatsApp}>Send via WhatsApp</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── QUOTE PDF TEMPLATE ───────────────────────────────────────────────────
function QuotePDF({ q, profile, fuelMonth, zonePrices }) {
  const routeDisplay = q.stops?.length
    ? [q.from, ...q.stops, q.to].filter(Boolean).join(" → ")
    : `${q.from} → ${q.to}`;

  return (
    <div className="quote-preview">
      <div className="qp-header">
        <div>
          <div className="qp-logo">Logi<em>Cost</em></div>
          <div style={{fontSize:12,color:"#333",marginTop:2}}>{profile.company}</div>
          {profile.vat && <div style={{fontSize:11,color:"#999"}}>VAT: {profile.vat}</div>}
        </div>
        <div className="qp-meta">
          <strong>QUOTE #{q.number}</strong>
          <div>{q.createdAt}</div>
          {profile.phone && <div>{profile.phone}</div>}
          {profile.email && <div>{profile.email}</div>}
        </div>
      </div>

      <div className="qp-section">
        <h4>Prepared for</h4>
        <div style={{fontSize:16,fontWeight:700,color:"#111"}}>{q.clientName}</div>
      </div>

      <div className="qp-section">
        <h4>Trip Details</h4>
        <div className="qp-row"><span>Route</span><span>{routeDisplay}</span></div>
        <div className="qp-row">
          <span>Distance</span>
          <span>
            {q.dist} km{q.distMode === "auto" ? " (OSRM)" : ""}
            {q.returnEmpty ? " · incl. return empty" : ""}
          </span>
        </div>
        {q.returnEmpty && (
          <div className="qp-row">
            <span>Legs</span>
            <span>{q.outboundKm} km loaded + {q.returnKm} km empty</span>
          </div>
        )}
        {q.routeInfo?.legs?.length > 1 && q.routeInfo.legs.map(leg => (
          <div key={leg.index} className="qp-row">
            <span>Leg {leg.index}</span>
            <span>{leg.fromLabel} → {leg.toLabel} · {Math.round(leg.distanceKm)} km</span>
          </div>
        ))}
        <div className="qp-row"><span>Vehicle</span><span>{q.vehicle}</span></div>
        {q.fuelKey && (
          <div className="qp-row">
            <span>Fuel</span>
            <span>
              {q.zoneSplit && zonePrices
                ? `${fuelLabel(q.fuelKey)} · ${R(zonePrices.inland)}/L inland · ${R(zonePrices.coastal)}/L coastal`
                : `${fuelLabel(q.fuelKey)} @ ${R(q.fuelPrice)}/L`}
            </span>
          </div>
        )}
        {q.zoneSplit && (
          <div className="qp-row">
            <span>Zone split</span>
            <span>{q.zoneSplit.inlandKm} km inland · {q.zoneSplit.coastalKm} km coastal (approx.)</span>
          </div>
        )}
      </div>

      <div className="qp-section">
        <h4>Cost Breakdown</h4>
        <div className="qp-row"><span>Fuel Cost</span><span>{R(q.fuelCost)}</span></div>
        <div className="qp-row"><span>Driver Cost</span><span>{R(q.driverCost)}</span></div>
        <div className="qp-row"><span>Tolls</span><span>{R(q.tolls)}</span></div>
        <div className="qp-row"><span>Subtotal</span><span>{R(q.subtotal)}</span></div>
        <div className="qp-row"><span>Margin ({q.margin}%)</span><span>{R(q.total - q.subtotal)}</span></div>
        <div className="qp-total"><span>TOTAL QUOTE</span><span>{R(q.total)}</span></div>
      </div>

      {q.notes && <div className="qp-section"><h4>Notes</h4><div style={{fontSize:13,color:"#444"}}>{q.notes}</div></div>}

      <div className="qp-footer">
        Quote valid for 7 days · Prices based on {fuelMonth} DMRE fuel prices · Generated by LogiCost Transport OS
      </div>
    </div>
  );
}

// ─── QUOTES LIST ──────────────────────────────────────────────────────────
function QuotesList({ quotes, clients, updateStatus, deleteQuote, profile, fuel, showToast }) {
  const [selected, setSelected] = useState(null);
  const STATUSES = ["Quoted","Accepted","In Progress","Delivered","Invoiced","Paid"];
  const statusColor = s => ({ Quoted:"badge-amber", Accepted:"badge-green", "In Progress":"badge-green",
    Delivered:"badge-muted", Invoiced:"badge-amber", Paid:"badge-green" }[s] || "badge-muted");

  const handleWhatsApp = q => {
    const msg = encodeURIComponent(
      `*LOGICOST QUOTE #${q.number}*\n\nClient: ${q.clientName}\nRoute: ${q.from} → ${q.to} (${q.dist}km)\n\nFuel: ${R(q.fuelCost)}\nDriver: ${R(q.driverCost)}\nTolls: ${R(q.tolls)}\n\n*TOTAL: ${R(q.total)}*\n\nGenerated via LogiCost`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">Quotes</div>
        <div className="page-sub">{quotes.length} quote{quotes.length !== 1 ? "s" : ""} total</div>
      </div>

      {quotes.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-icon">📋</div><p>No quotes yet. Create your first quote from the New Quote page.</p></div></div>
      ) : (
        <div className="card">
          <table className="table">
            <thead><tr>
              <th>Quote #</th><th>Client</th><th>Route</th><th>Total</th><th>Date</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {quotes.map(q => (
                <tr key={q.id}>
                  <td><span style={{color:"var(--amber)",fontWeight:600,cursor:"pointer"}} onClick={() => setSelected(q)}>#{q.number}</span></td>
                  <td style={{fontWeight:500}}>{q.clientName || "—"}</td>
                  <td style={{color:"var(--muted)",fontSize:12}}>{q.from && q.to ? `${q.from} → ${q.to}` : "—"}</td>
                  <td style={{fontWeight:600}}>{R(q.total)}</td>
                  <td style={{color:"var(--muted)",fontSize:12}}>{q.createdAt}</td>
                  <td>
                    <select className="input" style={{padding:"4px 8px",fontSize:11,width:"auto"}}
                      value={q.status} onChange={e => updateStatus(q.id, e.target.value)}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <div style={{display:"flex",gap:6}}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelected(q)}>View</button>
                      <button className="btn btn-green btn-sm" onClick={() => handleWhatsApp(q)}>WhatsApp</button>
                      <button className="btn btn-red btn-sm" onClick={() => deleteQuote(q.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div style={{background:"var(--card)",borderRadius:16,padding:24,maxWidth:560,width:"100%",maxHeight:"90vh",overflow:"auto"}} onClick={e => e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:700}}>Quote #{selected.number}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
            </div>
            <QuotePDF q={selected} profile={profile} fuelMonth={fuel.month}
              zonePrices={selected.zoneSplit ? zoneFuelPrices(fuel, selected.fuelKey) : null} />
            <div className="btn-row" style={{marginTop:16}}>
              <button className="btn btn-green" style={{flex:1,justifyContent:"center"}} onClick={() => handleWhatsApp(selected)}>Send via WhatsApp</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── CLIENTS ──────────────────────────────────────────────────────────────
function ClientsList({ clients, quotes, addClient, deleteClient, setModal }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:"", phone:"", email:"", company:"", notes:"" });

  const handleSave = () => {
    if (!form.name) return;
    addClient(form);
    setForm({ name:"", phone:"", email:"", company:"", notes:"" });
    setShowForm(false);
  };

  return (
    <>
      <div className="page-header">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div className="page-title">Clients</div>
            <div className="page-sub">{clients.length} saved client{clients.length !== 1 ? "s" : ""}</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>+ Add Client</button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{borderColor:"var(--amber)"}}>
          <div className="card-title">New Client</div>
          <div className="grid2">
            <div className="field"><label className="label">Name *</label><input className="input" value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="John Mokoena" /></div>
            <div className="field"><label className="label">Company</label><input className="input" value={form.company} onChange={e => setForm({...form,company:e.target.value})} placeholder="Mokoena Supplies" /></div>
            <div className="field"><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({...form,phone:e.target.value})} placeholder="082 123 4567" /></div>
            <div className="field"><label className="label">Email</label><input className="input" value={form.email} onChange={e => setForm({...form,email:e.target.value})} placeholder="john@example.com" /></div>
          </div>
          <div className="field"><label className="label">Notes / Common Routes</label><textarea className="input" value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} placeholder="JHB → Pretoria weekly, prefers morning pickups..." /></div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={handleSave}>Save Client</button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {clients.length === 0 && !showForm ? (
        <div className="card"><div className="empty"><div className="empty-icon">👥</div><p>No clients saved yet. Add your regular customers to speed up quoting.</p></div></div>
      ) : (
        <div className="card">
          <table className="table">
            <thead><tr><th>Name</th><th>Company</th><th>Phone</th><th>Quotes</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {clients.map(c => {
                const cQuotes = quotes.filter(q => q.clientId === c.id);
                return (
                  <tr key={c.id}>
                    <td style={{fontWeight:600}}>{c.name}</td>
                    <td style={{color:"var(--muted)"}}>{c.company || "—"}</td>
                    <td><a href={`tel:${c.phone}`} style={{color:"var(--amber)",textDecoration:"none"}}>{c.phone || "—"}</a></td>
                    <td><span className="badge badge-amber">{cQuotes.length}</span></td>
                    <td style={{color:"var(--muted)",fontSize:12,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.notes || "—"}</td>
                    <td><button className="btn btn-red btn-sm" onClick={() => deleteClient(c.id)}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────
function Settings({ profile, saveProfile, showToast, dataSource }) {
  const [form, setForm] = useState(profile);

  useEffect(() => { setForm(profile); }, [profile]);

  const handleSave = () => {
    saveProfile(form);
    showToast("Settings saved ✓");
  };

  return (
    <>
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-sub">Your business profile appears on all quotes</div>
      </div>
      <div className="card">
        <div className="card-title">Data Storage</div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
          {dataSource === "api" ? (
            <>Clients, quotes, and profile are saved to the <strong style={{ color: "var(--green)" }}>LogiCost API</strong> (SQLite).</>
          ) : dataSource === "local" ? (
            <>API unavailable — data is stored in <strong style={{ color: "var(--amber)" }}>browser localStorage</strong>. Run <code style={{ color: "var(--white)" }}>npm run dev</code> to start the server.</>
          ) : (
            <>Checking storage…</>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-title">Business Profile</div>
        <div className="grid2">
          <div className="field"><label className="label">Company Name</label><input className="input" value={form.company} onChange={e => setForm({...form,company:e.target.value})} placeholder="My Transport Co" /></div>
          <div className="field"><label className="label">Owner Name</label><input className="input" value={form.owner} onChange={e => setForm({...form,owner:e.target.value})} placeholder="Telmon Maluleka" /></div>
          <div className="field"><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({...form,phone:e.target.value})} placeholder="082 000 0000" /></div>
          <div className="field"><label className="label">Email</label><input className="input" value={form.email} onChange={e => setForm({...form,email:e.target.value})} placeholder="info@mytransport.co.za" /></div>
          <div className="field"><label className="label">VAT Number</label><input className="input" value={form.vat} onChange={e => setForm({...form,vat:e.target.value})} placeholder="4123456789" /></div>
        </div>
        <div className="btn-row"><button className="btn btn-primary" onClick={handleSave}>Save Settings</button></div>
      </div>

      <div className="card">
        <div className="card-title">Plan</div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          {[
            {name:"Free",price:"R0",features:"5 quotes/month, no PDF",current:true},
            {name:"Solo",price:"R99/mo",features:"Unlimited + PDF + WhatsApp"},
            {name:"Business",price:"R299/mo",features:"CRM + Invoices + Job tracking"},
          ].map(p => (
            <div key={p.name} style={{flex:1,minWidth:160,background:"var(--card2)",border:`1.5px solid ${p.current?"var(--amber)":"var(--border)"}`,
              borderRadius:12,padding:18}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:700,color:p.current?"var(--amber)":"var(--white)"}}>{p.name}</div>
              <div style={{fontSize:20,fontWeight:700,margin:"6px 0"}}>{p.price}</div>
              <div style={{fontSize:12,color:"var(--muted)"}}>{p.features}</div>
              {p.current && <div className="badge badge-amber" style={{marginTop:10}}>Current plan</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">About</div>
        <div style={{fontSize:13,color:"var(--muted)",lineHeight:1.7}}>
          <strong style={{color:"var(--white)"}}>LogiCost Transport OS</strong> — built for South African owner-operators.<br/>
          Fuel prices sourced from DMRE via <a href="https://sa-fuel-api.guerillagardeningkzn.workers.dev/docs" target="_blank" style={{color:"var(--amber)"}}>SA Fuel API</a> by Morney Deetlefs.<br/>
          Built with React · Persistent storage · WhatsApp-ready
        </div>
      </div>
    </>
  );
}
