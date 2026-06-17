import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateStrategyArtifacts } from "../src/pipelines/generate-strategy-artifacts.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES_DIR = resolve(REPO_ROOT, "examples", "generated");

async function main(): Promise<void> {
  const result = await generateStrategyArtifacts(EXAMPLES_DIR);

  console.log(`Wrote market context snapshot to ${result.paths.marketContext}`);
  console.log(`Wrote Four.Meme discovery snapshot to ${result.paths.fourMemeDiscovery}`);
  console.log(`Wrote strategy spec to ${result.paths.strategySpec}`);
  console.log(`Wrote demo summary to ${result.paths.demoSummary}`);
  console.log(`Strategy status: ${result.strategySpec.status}`);
  console.log(`Regime label: ${result.strategySpec.regime.label}`);
}

await main();
