/**
 * Production start — binds Render's PORT (default 10000), not hardcoded 3000.
 */
import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const host = process.env.HOST || "0.0.0.0";

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "dev", "--host", host, "--port", String(port)],
  { stdio: "inherit", env: process.env, shell: process.platform === "win32" },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
