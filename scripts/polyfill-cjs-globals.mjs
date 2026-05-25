/**
 * CJS deps (better-sqlite3) expect __filename / __dirname when run from ESM on Render.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgJson = path.join(appRoot, "package.json");

globalThis.__filename = pkgJson;
globalThis.__dirname = appRoot;
globalThis.require = createRequire(pkgJson);
