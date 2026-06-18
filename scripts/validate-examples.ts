import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateBstocksDraftStrategySpec,
  validateBstocksReviewedStrategySpec,
} from "../src/output/validate-bstocks-strategy-spec.js";
import { validateStrategySpec } from "../src/output/validate-strategy-spec.js";
import type {
  BstocksDraftStrategySpec,
  BstocksReviewedStrategySpec,
} from "../src/types/bstocks-strategy-spec.js";
import type { StrategySpec } from "../src/types/strategy-spec.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const FOURMEME_STRATEGY_PATHS = [
  "examples/generated/cmc-market-regime.strategy.json",
  "examples/generated-agenthub/fourmeme/cmc-market-regime.strategy.json",
  "examples/generated/fourmeme-proposed/cmc-market-regime.strategy.json",
];

const BSTOCKS_DRAFT_PATHS = [
  "examples/generated/bstocks/bstocks-draft.strategy.json",
  "examples/generated-agenthub/bstocks/bstocks-draft.strategy.json",
];

const BSTOCKS_REVIEWED_PATHS = [
  "examples/generated/bstocks/bstocks-reviewed.strategy.json",
  "examples/generated-agenthub/bstocks/bstocks-reviewed.strategy.json",
];

async function main(): Promise<void> {
  for (const path of FOURMEME_STRATEGY_PATHS) {
    if (await exists(path)) {
      await validateStrategySpec(await readJson<StrategySpec>(path));
      console.log(`PASS Four.Meme strategy: ${path}`);
    }
  }

  for (const path of BSTOCKS_DRAFT_PATHS) {
    if (await exists(path)) {
      await validateBstocksDraftStrategySpec(await readJson<BstocksDraftStrategySpec>(path));
      console.log(`PASS bStocks draft: ${path}`);
    }
  }

  for (const path of BSTOCKS_REVIEWED_PATHS) {
    if (await exists(path)) {
      await validateBstocksReviewedStrategySpec(await readJson<BstocksReviewedStrategySpec>(path));
      console.log(`PASS bStocks reviewed: ${path}`);
    }
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(REPO_ROOT, path), "utf8")) as T;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(resolve(REPO_ROOT, path));
    return true;
  } catch {
    return false;
  }
}

await main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
