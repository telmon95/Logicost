import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { initDb, getBootstrap, replaceClients, replaceQuotes, saveProfile } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, "data", "logicost.db");

initDb(DATABASE_PATH);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "logicost-api" });
});

app.get("/api/bootstrap", (_req, res) => {
  res.json(getBootstrap());
});

app.put("/api/profile", (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ error: "Profile object required" });
  }
  res.json({ profile: saveProfile(req.body) });
});

app.put("/api/clients", (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: "Clients array required" });
  }
  res.json({ clients: replaceClients(req.body) });
});

app.put("/api/quotes", (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: "Quotes array required" });
  }
  res.json({ quotes: replaceQuotes(req.body) });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`LogiCost API listening on http://localhost:${PORT}`);
  console.log(`Database: ${DATABASE_PATH}`);
});
