import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import {
  createCmcDataProviderFromEnv,
  loadRepoEnv,
  type CmcDataTransport,
} from "../src/adapters/cmc/client.js";
import { createFourMemeClient } from "../src/adapters/fourmeme/client.js";
import type { CmcSkillProofBundle } from "../src/types/cmc-skill-proof.js";
import type {
  FourMemeRealSnapshot,
  FourMemeRealSnapshotManifest,
  FourMemeRealSnapshotManifestEntry,
} from "../src/types/fourmeme-real-snapshot.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = resolve(REPO_ROOT, "examples", "real-snapshots", "fourmeme");
const DEFAULT_PROOF_PATH = resolve(REPO_ROOT, "examples", "proofs", "cmc-skills", "fourmeme-onchain-proof.bundle.json");
const DEFAULT_CAPTURE_TARGET_COUNT = 36;
const DEFAULT_INTERVAL_MINUTES = 30;
const MIN_REQUIRED_SNAPSHOT_COUNT = 30;
const MIN_REQUIRED_SPAN_HOURS = 12;

async function main(): Promise<void> {
  loadRepoEnv();
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(REPO_ROOT, args.outDir ?? DEFAULT_OUT_DIR);
  const cmcProvider = createCmcDataProviderFromEnv({ provider: args.cmcProvider });
  const fourMemeClient = createFourMemeClient();
  const proofBundle = await readJsonIfExists<CmcSkillProofBundle>(resolve(REPO_ROOT, args.proofBundle ?? DEFAULT_PROOF_PATH));

  await mkdir(outDir, { recursive: true });
  let manifest = await buildManifest(outDir, args.resume ? await loadExistingEntries(outDir) : []);
  await writeManifest(outDir, manifest);

  if (manifest.snapshotCount >= args.count) {
    console.log(`Real snapshot manifest already has ${manifest.snapshotCount}/${args.count} snapshots; nothing to capture.`);
    console.log(`Manifest: ${resolve(outDir, "manifest.json")}`);
    return;
  }

  while (manifest.snapshotCount < args.count) {
    const capturedAt = new Date().toISOString();
    const id = await buildUniqueSnapshotId(outDir, capturedAt);
    const snapshotDir = resolve(outDir, id);
    const snapshotPath = resolve(snapshotDir, "snapshot.json");

    const [cmcMarketContext, fourMemeDiscovery] = await Promise.all([
      cmcProvider.fetchMarketContext(),
      fourMemeClient.fetchDiscoverySnapshot(),
    ]);

    const snapshot: FourMemeRealSnapshot = {
      captureKind: "real-fourmeme-cmc",
      capturedAt,
      cmcMarketContext,
      fourMemeDiscovery,
      id,
      ...(proofBundle
        ? {
            proofBundle: {
              executionProofCount: proofBundle.executionProofs.length,
              mode: proofBundle.routeProof.mode,
              routeSha256: proofBundle.routeProof.sha256,
              skills: proofBundle.executionProofs.map((proof) => proof.skillId),
            },
          }
        : {}),
      source: "live-capture",
      version: "1.0.0",
    };

    await mkdir(snapshotDir, { recursive: true });
    await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    manifest = await buildManifest(outDir, [
      ...manifest.snapshots,
      manifestEntryFromSnapshot(outDir, snapshotPath, snapshot),
    ]);
    await writeManifest(outDir, manifest);
    console.log(`Captured real Four.Meme snapshot ${manifest.snapshotCount}/${args.count}: ${snapshotPath}`);
    console.log(`Manifest updated: snapshots=${manifest.snapshotCount}, spanHours=${manifest.spanHours.toFixed(2)}, uniqueContracts=${manifest.uniqueContractCount}`);

    if (manifest.snapshotCount < args.count && args.intervalMinutes > 0) {
      await sleep(args.intervalMinutes * 60_000);
    }
  }

  console.log(`Updated real snapshot manifest: ${resolve(outDir, "manifest.json")}`);
  console.log(`Snapshots: ${manifest.snapshotCount}; span hours: ${manifest.spanHours.toFixed(2)}; unique contracts: ${manifest.uniqueContractCount}.`);
}

function manifestEntryFromSnapshot(
  outDir: string,
  snapshotPath: string,
  snapshot: FourMemeRealSnapshot,
): FourMemeRealSnapshotManifestEntry {
  const selectedTokenAddresses = snapshot.fourMemeDiscovery.selectedCandidates.map(
    (candidate) => candidate.tokenAddress.toLowerCase(),
  );
  return {
    candidateCount: snapshot.fourMemeDiscovery.selectedCandidates.length,
    captureKind: snapshot.captureKind,
    capturedAt: snapshot.capturedAt,
    cmcAsOf: snapshot.cmcMarketContext.asOf,
    dataQualityStatus: combineQuality(
      snapshot.cmcMarketContext.dataQuality.status,
      snapshot.fourMemeDiscovery.dataQuality.status,
    ),
    fourMemeAsOf: snapshot.fourMemeDiscovery.asOf,
    id: snapshot.id,
    path: normalizeRelativePath(relative(outDir, snapshotPath)),
    selectedTokenAddresses,
    source: snapshot.source,
  };
}

async function loadExistingEntries(outDir: string): Promise<FourMemeRealSnapshotManifestEntry[]> {
  const entries = new Map<string, FourMemeRealSnapshotManifestEntry>();
  const current = await readJsonIfExists<FourMemeRealSnapshotManifest>(resolve(outDir, "manifest.json"));
  for (const entry of current?.snapshots ?? []) {
    entries.set(entry.id, entry);
  }

  for (const entry of await listSnapshotFiles(outDir)) {
    const snapshot = await readJsonIfExists<FourMemeRealSnapshot>(entry);
    if (!snapshot) {
      continue;
    }
    entries.set(snapshot.id, manifestEntryFromSnapshot(outDir, entry, snapshot));
  }

  return [...entries.values()];
}

async function listSnapshotFiles(outDir: string): Promise<string[]> {
  try {
    const entries = await readdir(outDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(outDir, entry.name, "snapshot.json"));
  } catch {
    return [];
  }
}

async function buildManifest(
  _outDir: string,
  entries: FourMemeRealSnapshotManifestEntry[],
): Promise<FourMemeRealSnapshotManifest> {
  const byId = new Map<string, FourMemeRealSnapshotManifestEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }

  const snapshots = [...byId.values()].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  const uniqueContracts = new Set(snapshots.flatMap((snapshot) => snapshot.selectedTokenAddresses));
  return {
    generatedAt: new Date().toISOString(),
    minRequiredSnapshotCount: MIN_REQUIRED_SNAPSHOT_COUNT,
    minRequiredSpanHours: MIN_REQUIRED_SPAN_HOURS,
    snapshotCount: snapshots.length,
    snapshots,
    source: "live-fourmeme-cmc-capture",
    spanHours: calculateSpanHours(snapshots.map((snapshot) => snapshot.capturedAt)),
    uniqueContractCount: uniqueContracts.size,
    version: "1.0.0",
  };
}

async function writeManifest(outDir: string, manifest: FourMemeRealSnapshotManifest): Promise<void> {
  await writeFile(resolve(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function calculateSpanHours(timestamps: string[]): number {
  if (timestamps.length < 2) {
    return 0;
  }
  const parsed = timestamps.map((timestamp) => new Date(timestamp).getTime()).filter(Number.isFinite);
  return parsed.length < 2 ? 0 : Number(((Math.max(...parsed) - Math.min(...parsed)) / 3_600_000).toFixed(4));
}

function combineQuality(left: string, right: string): string {
  if (left === "failed" || right === "failed") {
    return "failed";
  }
  if (left === "degraded" || right === "degraded") {
    return "degraded";
  }
  if (left === "partial" || right === "partial") {
    return "partial";
  }
  return "complete";
}

function parseArgs(args: string[]): {
  cmcProvider?: CmcDataTransport;
  count: number;
  intervalMinutes: number;
  outDir?: string;
  proofBundle?: string;
  resume: boolean;
} {
  const parsed = {
    cmcProvider: undefined as CmcDataTransport | undefined,
    count: DEFAULT_CAPTURE_TARGET_COUNT,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    outDir: undefined as string | undefined,
    proofBundle: undefined as string | undefined,
    resume: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--no-resume") {
      parsed.resume = false;
      continue;
    }

    if (["--cmc-provider", "--count", "--interval-minutes", "--out-dir", "--proof-bundle"].includes(token)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${token}.`);
      }
      if (token === "--cmc-provider") {
        if (value !== "agent-hub-mcp" && value !== "rest") {
          throw new Error("Use --cmc-provider rest or agent-hub-mcp.");
        }
        parsed.cmcProvider = value;
      } else if (token === "--count") {
        parsed.count = parsePositiveInteger(value, token);
      } else if (token === "--interval-minutes") {
        parsed.intervalMinutes = parseNonNegativeNumber(value, token);
      } else if (token === "--out-dir") {
        parsed.outDir = value;
      } else {
        parsed.proofBundle = value;
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return parsed;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return parsed;
}

function formatSnapshotId(value: string): string {
  return value.replace(/[:.]/gu, "-");
}

async function buildUniqueSnapshotId(outDir: string, value: string): Promise<string> {
  const base = formatSnapshotId(value);
  let candidate = base;
  let suffix = 1;
  while (await exists(resolve(outDir, candidate, "snapshot.json"))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/gu, "/");
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  try {
    await access(path);
    return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/u, "")) as T;
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
