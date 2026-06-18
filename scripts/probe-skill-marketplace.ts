import { loadRepoEnv } from "../src/adapters/cmc/client.js";
import { routeSkill } from "../src/skills/marketplace-router.js";
import type { SkillExecution } from "../src/types/skill-execution.js";

const DEFAULT_QUERY = "Generate a BNB Chain Four.Meme meme-token strategy from CMC market context.";

async function main(): Promise<void> {
  loadRepoEnv();
  const parsed = parseArgs(process.argv.slice(2));
  const query = parsed.query ?? DEFAULT_QUERY;
  const route = await routeSkill(query);
  const skillExecution = await probeSkillMarketplace(query);
  const payload = {
    query,
    route,
    skillExecution,
  };

  if (parsed.plain) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log("CMC Skills Marketplace Probe");
  console.log(`Query: ${query}`);
  console.log(`Route status: ${route.routeStatus}`);
  console.log(`Selected skill: ${route.selectedSkill ?? "none"}`);
  console.log(`Execution mode: ${skillExecution.mode}`);
  console.log(`Execution status: ${skillExecution.status}`);
  console.log(`Reason: ${skillExecution.reason}`);
}

async function probeSkillMarketplace(query: string): Promise<SkillExecution> {
  const endpoint = process.env.CMC_SKILL_MARKETPLACE_ENDPOINT?.trim();
  if (!endpoint) {
    return {
      endpointName: "CMC_SKILL_MARKETPLACE_ENDPOINT",
      mode: "local-contract",
      reason: "Live CMC Skills Marketplace endpoint is not configured; using the repo's local marketplace-ready routing contract only.",
      sourceUrl: "https://coinmarketcap.com/api/skills-marketplace/",
      status: "unavailable",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const apiKey = process.env.CMC_SKILL_MARKETPLACE_API_KEY?.trim();
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      body: JSON.stringify({ query }),
      headers,
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        endpointName: "CMC_SKILL_MARKETPLACE_ENDPOINT",
        mode: "live-probe",
        reason: `Configured endpoint responded with HTTP ${response.status}; no remote Skills Marketplace execution is claimed.`,
        sourceUrl: endpoint,
        status: "failed",
      };
    }

    return {
      endpointName: "CMC_SKILL_MARKETPLACE_ENDPOINT",
      mode: "live-probe",
      reason: "Configured endpoint responded successfully to the live Skills Marketplace probe.",
      sourceUrl: endpoint,
      status: "matched",
    };
  } catch (error) {
    return {
      endpointName: "CMC_SKILL_MARKETPLACE_ENDPOINT",
      mode: "live-probe",
      reason: `Configured endpoint probe failed: ${sanitizeError(error)}.`,
      sourceUrl: endpoint,
      status: "failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[A-Za-z0-9_.:-]{24,}/gu, "[redacted]");
}

function parseArgs(args: string[]): {
  plain: boolean;
  query?: string;
} {
  let plain = false;
  let query: string | undefined;

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
