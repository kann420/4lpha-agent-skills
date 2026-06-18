import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { FourMemeCandidate } from "../src/adapters/fourmeme/client.js";
import type { CmcSkillProofBundle } from "../src/types/cmc-skill-proof.js";
import type {
  FourMemeRealSnapshot,
  FourMemeRealSnapshotManifest,
} from "../src/types/fourmeme-real-snapshot.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REAL_DIR = resolve(REPO_ROOT, "examples", "real-snapshots", "fourmeme");
const DEFAULT_REPLAY_DIR = resolve(REPO_ROOT, "examples", "replay");
const DEFAULT_PROOF_PATH = resolve(REPO_ROOT, "examples", "proofs", "cmc-skills", "fourmeme-onchain-proof.bundle.json");
const DEFAULT_MIN_SNAPSHOTS = 30;
const DEFAULT_MIN_SPAN_HOURS = 12;

interface ProofByAddress {
  aggregateRisk: "critical" | "high" | "low" | "medium" | "unknown";
  eligibleForEntry: boolean;
  proofCount: number;
}

interface ReplaySummary {
  baselineSelectedCount: number;
  categoryScoreOnlySelectedCount: number;
  generatedAt: string;
  highRiskCandidatesAvoided: number;
  manifestPath: string;
  methodologyNote: string;
  noOnchainFilterSelectedCount: number;
  onchainProofCoverageRate: number;
  overlapDistribution: Record<string, number>;
  realSnapshotCount: number;
  snapshotSpanHours: number;
  snapshots: Array<{
    categoryScoreOnlySelected: string[];
    highRiskAvoided: number;
    id: string;
    noOnchainFilterSelected: string[];
    onchainProofCovered: number;
    overlapCount: number;
    strategySelected: string[];
    volumeOnlySelected: string[];
  }>;
  strategySelectedCount: number;
  uniqueContractCount: number;
  volumeOnlyHighRiskSelectionRate: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const realDir = resolve(REPO_ROOT, args.realDir ?? DEFAULT_REAL_DIR);
  const replayDir = resolve(REPO_ROOT, args.replayDir ?? DEFAULT_REPLAY_DIR);
  const manifestPath = resolve(realDir, "manifest.json");
  const manifest = await readJson<FourMemeRealSnapshotManifest>(manifestPath);

  assertManifestReady(manifest, args.minSnapshots, args.minSpanHours);

  const proofByAddress = buildProofByAddress(
    await readJsonIfExists<CmcSkillProofBundle>(resolve(REPO_ROOT, args.proofBundle ?? DEFAULT_PROOF_PATH)),
  );
  const snapshots = await Promise.all(
    manifest.snapshots.map((entry) => readJson<FourMemeRealSnapshot>(resolve(realDir, entry.path))),
  );
  for (const snapshot of snapshots) {
    assertRealSnapshot(snapshot);
  }

  const snapshotResults = snapshots.map((snapshot) => replaySnapshot(snapshot, proofByAddress));
  const strategySelectedCount = sum(snapshotResults.map((snapshot) => snapshot.strategySelected.length));
  const baselineSelectedCount = sum(snapshotResults.map((snapshot) => snapshot.volumeOnlySelected.length));
  const baselineHighRiskCount = sum(
    snapshotResults.map((snapshot) =>
      snapshot.volumeOnlySelected.filter((address) => isHighRisk(proofByAddress.get(address))).length,
    ),
  );
  const onchainProofCovered = sum(snapshotResults.map((snapshot) => snapshot.onchainProofCovered));
  const noOnchainFilterSelectedCount = sum(snapshotResults.map((snapshot) => snapshot.noOnchainFilterSelected.length));

  const summary: ReplaySummary = {
    baselineSelectedCount,
    categoryScoreOnlySelectedCount: sum(snapshotResults.map((snapshot) => snapshot.categoryScoreOnlySelected.length)),
    generatedAt: new Date().toISOString(),
    highRiskCandidatesAvoided: sum(snapshotResults.map((snapshot) => snapshot.highRiskAvoided)),
    manifestPath: normalizeRelativePath(relativeFromRepo(manifestPath)),
    methodologyNote: "Empirical replay over live-captured Four.Meme + CMC snapshots. This is selection and risk-filter evidence; it is not a profitability claim.",
    noOnchainFilterSelectedCount,
    onchainProofCoverageRate: noOnchainFilterSelectedCount > 0
      ? Number((onchainProofCovered / noOnchainFilterSelectedCount).toFixed(4))
      : 0,
    overlapDistribution: buildOverlapDistribution(snapshotResults),
    realSnapshotCount: snapshots.length,
    snapshotSpanHours: manifest.spanHours,
    snapshots: snapshotResults,
    strategySelectedCount,
    uniqueContractCount: manifest.uniqueContractCount,
    volumeOnlyHighRiskSelectionRate: baselineSelectedCount > 0
      ? Number((baselineHighRiskCount / baselineSelectedCount).toFixed(4))
      : 0,
  };

  await mkdir(replayDir, { recursive: true });
  const jsonPath = resolve(replayDir, "fourmeme-real-replay.summary.json");
  const mdPath = resolve(replayDir, "fourmeme-real-replay.summary.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    writeFile(mdPath, renderMarkdown(summary), "utf8"),
  ]);

  if (args.plain) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`Wrote real replay JSON to ${jsonPath}`);
  console.log(`Wrote real replay summary to ${mdPath}`);
  console.log(`Real snapshots ${summary.realSnapshotCount}; high-risk baseline selections avoided ${summary.highRiskCandidatesAvoided}.`);
}

function replaySnapshot(
  snapshot: FourMemeRealSnapshot,
  proofByAddress: Map<string, ProofByAddress>,
): ReplaySummary["snapshots"][number] {
  const candidates = uniqueCandidates(snapshot);
  const noOnchainFilterSelected = snapshot.fourMemeDiscovery.selectedCandidates.map((candidate) => candidate.tokenAddress.toLowerCase());
  const strategySelected = noOnchainFilterSelected.filter((address) => {
    const proof = proofByAddress.get(address);
    return !proof || (proof.eligibleForEntry && !isHighRisk(proof));
  });
  const selectionSize = Math.max(noOnchainFilterSelected.length, 1);
  const volumeOnlySelected = [...candidates]
    .sort((left, right) => right.volume24hUsd - left.volume24hUsd)
    .slice(0, selectionSize)
    .map((candidate) => candidate.tokenAddress.toLowerCase());
  const categoryScoreOnlySelected = [...candidates]
    .sort(compareCategoryScore)
    .slice(0, selectionSize)
    .map((candidate) => candidate.tokenAddress.toLowerCase());
  const strategySet = new Set(strategySelected);
  const highRiskAvoided = volumeOnlySelected.filter((address) =>
    isHighRisk(proofByAddress.get(address)) && !strategySet.has(address),
  ).length;

  return {
    categoryScoreOnlySelected,
    highRiskAvoided,
    id: snapshot.id,
    noOnchainFilterSelected,
    onchainProofCovered: noOnchainFilterSelected.filter((address) => proofByAddress.has(address)).length,
    overlapCount: volumeOnlySelected.filter((address) => strategySet.has(address)).length,
    strategySelected,
    volumeOnlySelected,
  };
}

function uniqueCandidates(snapshot: FourMemeRealSnapshot): FourMemeCandidate[] {
  const byAddress = new Map<string, FourMemeCandidate>();
  for (const candidate of [
    ...snapshot.fourMemeDiscovery.safe2apeCandidates,
    ...snapshot.fourMemeDiscovery.mediumRiskCandidates,
    ...snapshot.fourMemeDiscovery.gemHuntCandidates,
  ]) {
    byAddress.set(candidate.tokenAddress.toLowerCase(), candidate);
  }
  return [...byAddress.values()];
}

function buildProofByAddress(bundle?: CmcSkillProofBundle): Map<string, ProofByAddress> {
  const byAddress = new Map<string, ProofByAddress>();
  for (const proof of bundle?.executionProofs ?? []) {
    const address = proof.tokenAddress.toLowerCase();
    const current = byAddress.get(address);
    byAddress.set(address, {
      aggregateRisk: strongestRisk(current?.aggregateRisk, proof.normalizedOutput.aggregateRisk ?? "unknown"),
      eligibleForEntry: (current?.eligibleForEntry ?? true) && proof.normalizedOutput.eligibleForEntry !== false,
      proofCount: (current?.proofCount ?? 0) + 1,
    });
  }
  return byAddress;
}

function strongestRisk(
  left: ProofByAddress["aggregateRisk"] | undefined,
  right: ProofByAddress["aggregateRisk"],
): ProofByAddress["aggregateRisk"] {
  const order = ["unknown", "low", "medium", "high", "critical"];
  return order.indexOf(right) > order.indexOf(left ?? "unknown") ? right : left ?? "unknown";
}

function isHighRisk(proof?: ProofByAddress): boolean {
  return proof?.aggregateRisk === "high" || proof?.aggregateRisk === "critical" || proof?.eligibleForEntry === false;
}

function compareCategoryScore(left: FourMemeCandidate, right: FourMemeCandidate): number {
  if (right.categoryScore !== left.categoryScore) {
    return right.categoryScore - left.categoryScore;
  }
  return right.volume24hUsd - left.volume24hUsd;
}

function assertManifestReady(
  manifest: FourMemeRealSnapshotManifest,
  minSnapshots: number,
  minSpanHours: number,
): void {
  if (manifest.source !== "live-fourmeme-cmc-capture") {
    throw new Error(`Real replay manifest has unsupported source ${manifest.source}.`);
  }
  if (manifest.snapshotCount < minSnapshots) {
    throw new Error(`Real replay needs at least ${minSnapshots} snapshots; found ${manifest.snapshotCount}.`);
  }
  if (manifest.spanHours < minSpanHours) {
    throw new Error(`Real replay needs at least ${minSpanHours}h span; found ${manifest.spanHours.toFixed(2)}h.`);
  }
}

function assertRealSnapshot(snapshot: FourMemeRealSnapshot): void {
  if (snapshot.captureKind !== "real-fourmeme-cmc" || snapshot.source !== "live-capture") {
    throw new Error(`Snapshot ${snapshot.id} is not a live real Four.Meme capture.`);
  }
  const serialized = JSON.stringify(snapshot).toLowerCase();
  if (serialized.includes("synthetic") || serialized.includes("deterministic-fixture") || serialized.includes("methodologynote")) {
    throw new Error(`Snapshot ${snapshot.id} contains synthetic/fixture methodology labels.`);
  }
}

function buildOverlapDistribution(snapshots: ReplaySummary["snapshots"]): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const snapshot of snapshots) {
    const key = String(snapshot.overlapCount);
    distribution[key] = (distribution[key] ?? 0) + 1;
  }
  return distribution;
}

function renderMarkdown(summary: ReplaySummary): string {
  return [
    "# Four.Meme Real Snapshot Replay Summary",
    "",
    `Generated at: ${summary.generatedAt}`,
    `Manifest: ${summary.manifestPath}`,
    "",
    "## Methodology",
    summary.methodologyNote,
    "",
    "## Aggregate Metrics",
    `- Real snapshots: ${summary.realSnapshotCount}`,
    `- Snapshot span hours: ${summary.snapshotSpanHours.toFixed(2)}`,
    `- Unique contracts: ${summary.uniqueContractCount}`,
    `- Strategy selected candidates: ${summary.strategySelectedCount}`,
    `- No-onchain-filter selected candidates: ${summary.noOnchainFilterSelectedCount}`,
    `- Volume-only baseline selected candidates: ${summary.baselineSelectedCount}`,
    `- Category-score-only selected candidates: ${summary.categoryScoreOnlySelectedCount}`,
    `- High-risk baseline selections avoided: ${summary.highRiskCandidatesAvoided}`,
    `- Volume-only high-risk selection rate: ${(summary.volumeOnlyHighRiskSelectionRate * 100).toFixed(2)}%`,
    `- On-chain proof coverage rate: ${(summary.onchainProofCoverageRate * 100).toFixed(2)}%`,
    `- Overlap distribution: ${JSON.stringify(summary.overlapDistribution)}`,
    "",
    "## Caveat",
    "This replay uses real captured snapshots, but it is selection and risk-methodology evidence only. It does not claim profitability, safety, or future performance.",
    "",
  ].join("\n");
}

function parseArgs(args: string[]): {
  minSnapshots: number;
  minSpanHours: number;
  plain: boolean;
  proofBundle?: string;
  realDir?: string;
  replayDir?: string;
} {
  const parsed = {
    minSnapshots: DEFAULT_MIN_SNAPSHOTS,
    minSpanHours: DEFAULT_MIN_SPAN_HOURS,
    plain: false,
    proofBundle: undefined as string | undefined,
    realDir: undefined as string | undefined,
    replayDir: undefined as string | undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--plain") {
      parsed.plain = true;
      continue;
    }
    if (["--min-snapshots", "--min-span-hours", "--proof-bundle", "--real-dir", "--replay-dir"].includes(token)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${token}.`);
      }
      if (token === "--min-snapshots") {
        parsed.minSnapshots = parsePositiveNumber(value, token);
      } else if (token === "--min-span-hours") {
        parsed.minSpanHours = parsePositiveNumber(value, token);
      } else if (token === "--proof-bundle") {
        parsed.proofBundle = value;
      } else if (token === "--real-dir") {
        parsed.realDir = value;
      } else {
        parsed.replayDir = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return parsed;
}

function parsePositiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function relativeFromRepo(path: string): string {
  return normalizeRelativePath(path.replace(`${REPO_ROOT}\\`, "").replace(`${REPO_ROOT}/`, ""));
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/gu, "/");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  try {
    await access(path);
    return await readJson<T>(path);
  } catch {
    return undefined;
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
