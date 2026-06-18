import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { routeSkill } from "../src/skills/marketplace-router.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_QUERY = "Generate a BNB Chain Four.Meme meme-token strategy from CMC market context.";

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const query = parsed.query ?? DEFAULT_QUERY;
  const route = await routeSkill(query, {
    catalogPath: resolve(REPO_ROOT, "skills", "marketplace", "catalog.json"),
  });

  if (parsed.plain) {
    console.log(JSON.stringify(route, null, 2));
    return;
  }

  console.log("CMC Skills Marketplace Route");
  console.log(`Query: ${route.query}`);
  console.log(`Route status: ${route.routeStatus}`);
  console.log(`Selected skill: ${route.selectedSkill ?? "none"}`);
  console.log(`Reason: ${route.routingReason}`);
  console.log(`Execution mode: ${route.skillExecution.mode}`);
  console.log(`Execution status: ${route.skillExecution.status}`);
  console.log(`Required inputs: ${route.requiredInputs.join(", ")}`);
  console.log(`Optional enrichments: ${route.optionalEnrichments.join(", ") || "none"}`);
  console.log("Rejected skills:");
  for (const rejected of route.rejectedSkills) {
    console.log(`- ${rejected.skillId}: ${rejected.reason}`);
  }
}

function parseArgs(args: string[]): {
  plain: boolean;
  query?: string;
} {
  let query: string | undefined;
  let plain = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "--plain") {
      plain = true;
      continue;
    }

    if (token === "--query") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --query.");
      }

      query = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return { plain, query };
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
