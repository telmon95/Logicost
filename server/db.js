import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PROFILE = {
  company: "My Transport Co",
  owner: "",
  phone: "",
  email: "",
  vat: "",
};

let db;

export function initDb(dbPath = path.join(__dirname, "data", "logicost.db")) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);

  const row = db.prepare("SELECT data FROM profile WHERE id = 1").get();
  if (!row) {
    db.prepare("INSERT INTO profile (id, data) VALUES (1, ?)").run(
      JSON.stringify(DEFAULT_PROFILE)
    );
  }

  return db;
}

export function getBootstrap() {
  const profileRow = db.prepare("SELECT data FROM profile WHERE id = 1").get();
  const clients = db
    .prepare("SELECT data FROM clients ORDER BY created_at DESC")
    .all()
    .map(r => JSON.parse(r.data));
  const quotes = db
    .prepare("SELECT data FROM quotes ORDER BY created_at DESC")
    .all()
    .map(r => JSON.parse(r.data));

  return {
    profile: profileRow ? JSON.parse(profileRow.data) : DEFAULT_PROFILE,
    clients,
    quotes,
  };
}

export function replaceClients(clients) {
  const tx = db.transaction(items => {
    db.prepare("DELETE FROM clients").run();
    const insert = db.prepare(
      "INSERT INTO clients (id, data, created_at) VALUES (?, ?, ?)"
    );
    for (const c of items) {
      insert.run(c.id, JSON.stringify(c), c.createdAt || new Date().toISOString().slice(0, 10));
    }
  });
  tx(clients);
  return clients;
}

export function replaceQuotes(quotes) {
  const tx = db.transaction(items => {
    db.prepare("DELETE FROM quotes").run();
    const insert = db.prepare(
      "INSERT INTO quotes (id, data, status, created_at) VALUES (?, ?, ?, ?)"
    );
    for (const q of items) {
      insert.run(
        q.id,
        JSON.stringify(q),
        q.status || "Quoted",
        q.createdAt || new Date().toISOString().slice(0, 10)
      );
    }
  });
  tx(quotes);
  return quotes;
}

export function saveProfile(profile) {
  db.prepare("UPDATE profile SET data = ?, updated_at = datetime('now') WHERE id = 1").run(
    JSON.stringify(profile)
  );
  return profile;
}
