import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadRepoEnv } from "../src/adapters/cmc/client.js";
import {
  normalizeCmcSkillProofBundle,
  REQUIRED_ONCHAIN_SKILL_IDS,
  validateCmcSkillProofBundle,
} from "../src/proofs/cmc-skill-proof.js";
import type { FourMemeDiscoverySnapshot } from "../src/adapters/fourmeme/client.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DISCOVERY_PATH = resolve(
  REPO_ROOT,
  "examples",
  "generated",
  "fourmeme-proposed",
  "fourmeme-discovery.snapshot.json",
);
const DEFAULT_OUTPUT_PATH = resolve(
  REPO_ROOT,
  "examples",
  "proofs",
  "cmc-skills",
  "fourmeme-onchain-proof.bundle.json",
);

async function main(): Promise<void> {
  loadRepoEnv();
  const args = parseArgs(process.argv.slice(2));
  const endpoint = process.env.CMC_SKILL_MARKETPLACE_ENDPOINT?.trim();
  if (!endpoint) {
    throw new Error("Missing CMC_SKILL_MARKETPLACE_ENDPOINT; live CMC skill proof cannot be claimed.");
  }

  const discovery = JSON.parse((await readFile(args.discoveryPath ?? DEFAULT_DISCOVERY_PATH, "utf8")).replace(/^\uFEFF/u, "")) as FourMemeDiscoverySnapshot;
  const selectedCandidates = discovery.selectedCandidates.map((candidate) => ({
    symbol: candidate.symbol,
    tokenAddress: candidate.tokenAddress,
  }));
  if (selectedCandidates.length === 0) {
    throw new Error("No selected Four.Meme candidates available for live CMC skill proof.");
  }

  const preflightCandidates = selectedCandidates.slice(0, 1);
  const preflightBundle = await fetchAndValidateLiveProofBundle(endpoint, preflightCandidates);
  if (args.preflightOnly) {
    const summary = {
      candidateCount: preflightCandidates.length,
      executionProofs: preflightBundle.executionProofs.length,
      mode: preflightBundle.routeProof.mode,
      status: preflightBundle.routeProof.status,
      wroteOutput: false,
    };
    if (args.plain) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log("CMC live skill proof preflight passed.");
    console.log(`Execution proofs: ${preflightBundle.executionProofs.length}`);
    return;
  }

  const bundle = args.skipPreflightFullCall
    ? preflightBundle
    : await fetchAndValidateLiveProofBundle(endpoint, selectedCandidates);

  validateCmcSkillProofBundle(bundle, {
    allowedTokenAddresses: selectedCandidates.map((candidate) => candidate.tokenAddress),
  });

  const outputPath = resolve(REPO_ROOT, args.output ?? DEFAULT_OUTPUT_PATH);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  const summary = {
    candidateCount: args.skipPreflightFullCall ? preflightCandidates.length : selectedCandidates.length,
    executionProofs: bundle.executionProofs.length,
    mode: bundle.routeProof.mode,
    outputPath,
    status: bundle.routeProof.status,
  };

  if (args.plain) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`Wrote live CMC skill proof bundle to ${outputPath}`);
  console.log(`Execution proofs: ${bundle.executionProofs.length}`);
}

async function fetchAndValidateLiveProofBundle(
  endpoint: string,
  candidates: Array<{
    symbol: string;
    tokenAddress: string;
  }>,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const apiKey = process.env.CMC_SKILL_MARKETPLACE_API_KEY?.trim();
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    body: JSON.stringify({
      candidates,
      query: "find_skill and execute CMC on-chain risk, DEX wallet activity, and DEX wallet PnL reviews for selected Four.Meme BNB contracts.",
      requiredSkills: REQUIRED_ONCHAIN_SKILL_IDS,
    }),
    headers,
    method: "POST",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`CMC live skill proof endpoint returned HTTP ${response.status}: ${sanitizeErrorMessage(await response.text())}`);
  }

  const remotePayload = await response.json() as unknown;
  const bundle = normalizeCmcSkillProofBundle(remotePayload, {
    forceMode: "live-execution",
  });
  validateCmcSkillProofBundle(bundle, {
    allowedTokenAddresses: candidates.map((candidate) => candidate.tokenAddress),
  });

  return bundle;
}

function parseArgs(args: string[]): {
  discoveryPath?: string;
  output?: string;
  plain: boolean;
  preflightOnly: boolean;
  skipPreflightFullCall: boolean;
} {
  const parsed = {
    discoveryPath: undefined as string | undefined,
    output: undefined as string | undefined,
    plain: false,
    preflightOnly: false,
    skipPreflightFullCall: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--plain") {
      parsed.plain = true;
      continue;
    }

    if (token === "--preflight-only") {
      parsed.preflightOnly = true;
      continue;
    }

    if (token === "--skip-preflight-full-call") {
      parsed.skipPreflightFullCall = true;
      continue;
    }

    if (token === "--discovery" || token === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${token}.`);
      }
      if (token === "--discovery") {
        parsed.discoveryPath = value;
      } else {
        parsed.output = value;
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return parsed;
}

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/(api[-_ ]?key|authorization|bearer|cookie|token|secret)\s*[:=]\s*[A-Za-z0-9_.:/+=-]+/giu, "$1=[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9_.:/+=-]+/gu, "Bearer [redacted]")
    .replace(/\b0x[a-fA-F0-9]{64}\b/gu, "0x[redacted-private-key]")
    .slice(0, 800);
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
