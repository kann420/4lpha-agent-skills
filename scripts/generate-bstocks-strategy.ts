import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateBstocksStrategyArtifacts } from "../src/pipelines/generate-bstocks-strategy-artifacts.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES_DIR = resolve(REPO_ROOT, "examples", "generated", "bstocks");

async function main(): Promise<void> {
  const result = await generateBstocksStrategyArtifacts(EXAMPLES_DIR);

  console.log(`Wrote market context snapshot to ${result.paths.marketContext}`);
  console.log(`Wrote bStocks universe snapshot to ${result.paths.bstocksUniverse}`);
  console.log(`Wrote draft strategy spec to ${result.paths.draftStrategySpec}`);
  console.log(`Wrote reviewed strategy spec to ${result.paths.reviewedStrategySpec}`);
  console.log(`Wrote demo summary to ${result.paths.demoSummary}`);
  console.log(`Draft status: ${result.draftStrategySpec.status}`);
  console.log(`Reviewed status: ${result.reviewedStrategySpec.status}`);
  console.log(`Regime label: ${result.reviewedStrategySpec.regime.label}`);
}

await main();
