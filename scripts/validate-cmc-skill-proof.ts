import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { FourMemeDiscoverySnapshot } from "../src/adapters/fourmeme/client.js";
import {
  validateCmcSkillProofBundle,
} from "../src/proofs/cmc-skill-proof.js";
import type { CmcSkillProofBundle } from "../src/types/cmc-skill-proof.js";
import type { FourMemeOnchainEnrichmentSnapshot } from "../src/types/fourmeme-onchain-enrichment.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BUNDLE_PATH = resolve(
  REPO_ROOT,
  "examples",
  "proofs",
  "cmc-skills",
  "fourmeme-onchain-proof.bundle.json",
);
const PROPOSED_DISCOVERY_PATH = resolve(
  REPO_ROOT,
  "examples",
  "generated",
  "fourmeme-proposed",
  "fourmeme-discovery.snapshot.json",
);
const PROPOSED_ONCHAIN_PATH = resolve(
  REPO_ROOT,
  "examples",
  "generated",
  "fourmeme-proposed",
  "fourmeme-onchain-enrichment.snapshot.json",
);
const REAL_MANIFEST_PATH = resolve(
  REPO_ROOT,
  "examples",
  "real-snapshots",
  "fourmeme",
  "manifest.json",
);

interface RealSnapshotManifest {
  snapshots?: Array<{
    selectedTokenAddresses?: string[];
  }>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const bundlePath = resolve(REPO_ROOT, args.bundle ?? DEFAULT_BUNDLE_PATH);
  if (!(await exists(bundlePath))) {
    throw new Error(`Missing CMC skill proof bundle at ${bundlePath}. Import recorded-remote proof with npm run skill:proof:import -- --input <private-redacted-json> or run npm run skill:proof:live with a real CMC endpoint.`);
  }
  const bundle = await readJson<CmcSkillProofBundle>(bundlePath);
  const allowedTokenAddresses = await collectSelectedTokenAddresses();

  if (allowedTokenAddresses.length === 0) {
    throw new Error("No selected Four.Meme token addresses found; generate proposed or real snapshots before validating CMC proof.");
  }

  validateCmcSkillProofBundle(bundle, { allowedTokenAddresses });

  const summary = {
    allowedTokenAddresses: allowedTokenAddresses.length,
    bundlePath,
    executionProofs: bundle.executionProofs.length,
    mode: bundle.routeProof.mode,
    routeStatus: bundle.routeProof.status,
  };

  if (args.plain) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("CMC skill proof validation passed.");
  console.log(`Bundle: ${bundlePath}`);
  console.log(`Mode: ${bundle.routeProof.mode}`);
}

async function collectSelectedTokenAddresses(): Promise<string[]> {
  const addresses = new Set<string>();

  const discovery = await readJsonIfExists<FourMemeDiscoverySnapshot>(PROPOSED_DISCOVERY_PATH);
  for (const candidate of discovery?.selectedCandidates ?? []) {
    addresses.add(candidate.tokenAddress.toLowerCase());
  }

  const onchain = await readJsonIfExists<FourMemeOnchainEnrichmentSnapshot>(PROPOSED_ONCHAIN_PATH);
  for (const candidate of onchain?.candidates ?? []) {
    addresses.add(candidate.tokenAddress.toLowerCase());
  }

  const manifest = await readJsonIfExists<RealSnapshotManifest>(REAL_MANIFEST_PATH);
  for (const snapshot of manifest?.snapshots ?? []) {
    for (const address of snapshot.selectedTokenAddresses ?? []) {
      addresses.add(address.toLowerCase());
    }
  }

  return [...addresses];
}

function parseArgs(args: string[]): {
  bundle?: string;
  plain: boolean;
} {
  const parsed = {
    bundle: undefined as string | undefined,
    plain: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--plain") {
      parsed.plain = true;
      continue;
    }

    if (token === "--bundle") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --bundle.");
      }
      parsed.bundle = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return parsed;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/u, "")) as T;
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  try {
    if (!(await exists(path))) {
      return undefined;
    }
    return await readJson<T>(path);
  } catch {
    return undefined;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
