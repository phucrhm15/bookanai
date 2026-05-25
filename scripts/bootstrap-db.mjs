/**
 * Apply SQLite schema before the worker bundle handles traffic (Render / Docker).
 * Drizzle migrate can fail when server code is bundled — this uses raw SQL + sqlite_master check.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(appRoot, "package.json"));
const Database = require("better-sqlite3");

function resolveDatabasePath() {
  const raw = process.env.DATABASE_URL?.trim() || "file:./data/bookanai.db";
  if (raw.startsWith("file:")) {
    const p = raw.slice("file:".length);
    return path.isAbsolute(p) ? p : path.resolve(appRoot, p);
  }
  return path.resolve(appRoot, raw);
}

function tableExists(db, name) {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return Boolean(row);
}

function applyInitialSql(db) {
  const sqlPath = path.join(appRoot, "drizzle", "0000_initial.sql");
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Missing migration SQL: ${sqlPath}`);
  }
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(/-->\s*statement-breakpoint\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    db.exec(stmt);
  }
}

/** Idempotent — safe on every container start (Render /tmp may be empty after redeploy). */
export function bootstrapDatabase() {
  const dbPath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  try {
    if (!tableExists(db, "users")) {
      applyInitialSql(db);
      console.log(`[bootstrap-db] schema created at ${dbPath}`);
    } else {
      console.log(`[bootstrap-db] schema ok at ${dbPath}`);
    }
  } finally {
    db.close();
  }
}
