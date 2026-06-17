#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(THIS_DIR, "..");
const CLI_PATH = resolve(REPO_ROOT, "scripts", "agent-skill-cli.ts");

const child = spawn(
  process.execPath,
  ["--import", "tsx", CLI_PATH, ...process.argv.slice(2)],
  {
    cwd: REPO_ROOT,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
