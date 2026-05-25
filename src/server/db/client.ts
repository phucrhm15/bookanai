import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof import("better-sqlite3").default;
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";

let sqlite: Database.Database | undefined;
let orm: ReturnType<typeof drizzle<typeof schema>> | undefined;

function appRoot(): string {
  return process.env.APP_ROOT?.trim() || process.cwd();
}

export function resolveDatabasePath(): string {
  const raw = process.env.DATABASE_URL?.trim() || "file:./data/bookanai.db";
  if (raw.startsWith("file:")) {
    const p = raw.slice("file:".length);
    return path.isAbsolute(p) ? p : path.resolve(appRoot(), p);
  }
  return path.resolve(appRoot(), raw);
}

function tableExists(database: Database.Database, name: string): boolean {
  const row = database
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { ok: number } | undefined;
  return Boolean(row);
}

function applyInitialSqlFile(database: Database.Database): void {
  const sqlPath = path.join(appRoot(), "drizzle", "0000_initial.sql");
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Missing migration SQL: ${sqlPath}`);
  }
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(/-->\s*statement-breakpoint\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    database.exec(stmt);
  }
}

/** Single migration file (`drizzle/0000_initial.sql`) — apply when DB is new (e.g. Render /tmp). */
function ensureMigrations(): void {
  const database = getSqlite();
  if (!tableExists(database, "users")) {
    applyInitialSqlFile(database);
  }
}

export function getSqlite(): Database.Database {
  if (!sqlite) {
    const dbPath = resolveDatabasePath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");
  }
  return sqlite;
}

export function getDb() {
  const database = getSqlite();
  if (!orm) {
    ensureMigrations();
    orm = drizzle(database, { schema });
  }
  return orm;
}

/**
 * BEGIN IMMEDIATE — acquires SQLite write lock before reads (serializes writers).
 * Inside the callback, balance reads + conditional UPDATE act as row-level guards.
 */
export function withImmediateTransaction<T>(fn: () => T): T {
  const database = getSqlite();
  const run = database.transaction(fn);
  return run.immediate();
}
