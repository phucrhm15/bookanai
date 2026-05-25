import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/server/db/schema";

let sqlite: Database.Database | undefined;
let orm: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function resolveDatabasePath(): string {
  const raw = process.env.DATABASE_URL?.trim() || "file:./data/bookanai.db";
  if (raw.startsWith("file:")) {
    return path.resolve(process.cwd(), raw.slice("file:".length));
  }
  return path.resolve(process.cwd(), raw);
}

function ensureMigrations(): void {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  if (!fs.existsSync(migrationsFolder)) {
    throw new Error(`Missing migrations folder: ${migrationsFolder}`);
  }
  migrate(getDb(), { migrationsFolder });
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
  if (!orm) {
    orm = drizzle(getSqlite(), { schema });
    ensureMigrations();
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
