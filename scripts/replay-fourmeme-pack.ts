import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACK_PATH = resolve(REPO_ROOT, "examples", "replay-pack", "fourmeme", "snapshots.json");
const REPLAY_DIR = resolve(REPO_ROOT, "examples", "replay");
const REPLAY_JSON_PATH = resolve(REPLAY_DIR, "fourmeme-pack-replay.summary.json");
const REPLAY_MD_PATH = resolve(REPLAY_DIR, "fourmeme-pack-replay.summary.md");

interface ReplayPack {
  methodologyNote: string;
  snapshots: ReplayPackSnapshot[];
  version: string;
}

interface ReplayPackSnapshot {
  allowedBuckets: string[];
  asOf: string;
  candidates: ReplayPackCandidate[];
  id: string;
}

interface ReplayPackCandidate {
  addressProvenance: "deterministic-fixture-address" | "live-fourmeme-contract" | "recorded-fourmeme-contract";
  bondingProgress: number;
  bucket: "gemHunt" | "mediumRisk" | "safe2ape";
  categoryScore: number;
  launchStage: "migrated" | "new";
  onchainEligible: boolean;
  onchainRisk: "critical" | "high" | "low" | "medium" | "unknown";
  positionSizeMultiplier: number;
  symbol: string;
  tokenAddress: string;
  volume24hUsd: number;
}

interface ReplayPackSummary {
  baselineSelectedCount: number;
  generatedAt: string;
  highRiskCandidatesAvoided: number;
  methodologyNote: string;
  overlapDistribution: Record<string, number>;
  snapshotCount: number;
  snapshots: Array<{
    baselineSelected: ReplayPackCandidate[];
    highRiskAvoided: number;
    id: string;
    overlapCount: number;
    strategySelected: ReplayPackCandidate[];
  }>;
  sourcePack: string;
  strategySelectedCount: number;
  volumeOnlyHighRiskSelectionRate: number;
}

async function main(): Promise<void> {
  const pack = JSON.parse(await readFile(PACK_PATH, "utf8")) as ReplayPack;
  if (pack.snapshots.length < 10) {
    throw new Error(`Replay pack must contain at least 10 snapshots; found ${pack.snapshots.length}.`);
  }

  const snapshotSummaries = pack.snapshots.map(replaySnapshot);
  const strategySelectedCount = snapshotSummaries.reduce(
    (sum, snapshot) => sum + snapshot.strategySelected.length,
    0,
  );
  const baselineSelectedCount = snapshotSummaries.reduce(
    (sum, snapshot) => sum + snapshot.baselineSelected.length,
    0,
  );
  const highRiskCandidatesAvoided = snapshotSummaries.reduce(
    (sum, snapshot) => sum + snapshot.highRiskAvoided,
    0,
  );
  const baselineHighRiskCount = snapshotSummaries.reduce(
    (sum, snapshot) =>
      sum + snapshot.baselineSelected.filter((candidate) => isHighRisk(candidate)).length,
    0,
  );
  const summary: ReplayPackSummary = {
    baselineSelectedCount,
    generatedAt: new Date().toISOString(),
    highRiskCandidatesAvoided,
    methodologyNote: pack.methodologyNote,
    overlapDistribution: buildOverlapDistribution(snapshotSummaries),
    snapshotCount: pack.snapshots.length,
    snapshots: snapshotSummaries,
    sourcePack: "examples/replay-pack/fourmeme/snapshots.json",
    strategySelectedCount,
    volumeOnlyHighRiskSelectionRate: baselineSelectedCount > 0
      ? Number((baselineHighRiskCount / baselineSelectedCount).toFixed(4))
      : 0,
  };

  await mkdir(REPLAY_DIR, { recursive: true });
  await Promise.all([
    writeFile(REPLAY_JSON_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    writeFile(REPLAY_MD_PATH, renderMarkdown(summary), "utf8"),
  ]);

  console.log(`Wrote replay-pack JSON to ${REPLAY_JSON_PATH}`);
  console.log(`Wrote replay-pack summary to ${REPLAY_MD_PATH}`);
  console.log(`Snapshots ${summary.snapshotCount}; avoided high-risk baseline selections ${summary.highRiskCandidatesAvoided}.`);
}

function replaySnapshot(snapshot: ReplayPackSnapshot): ReplayPackSummary["snapshots"][number] {
  const strategySelected = snapshot.candidates
    .filter((candidate) => isStrategyEligible(candidate, snapshot.allowedBuckets))
    .sort(compareStrategyRank);
  const baselineSelected = [...snapshot.candidates]
    .sort((left, right) => right.volume24hUsd - left.volume24hUsd)
    .slice(0, Math.max(strategySelected.length, 1));
  const strategyAddresses = new Set(strategySelected.map((candidate) => candidate.tokenAddress.toLowerCase()));
  const baselineHighRiskNotSelected = baselineSelected.filter(
    (candidate) => isHighRisk(candidate) && !strategyAddresses.has(candidate.tokenAddress.toLowerCase()),
  );

  return {
    baselineSelected,
    highRiskAvoided: baselineHighRiskNotSelected.length,
    id: snapshot.id,
    overlapCount: countOverlap(strategySelected, baselineSelected),
    strategySelected,
  };
}

function isStrategyEligible(candidate: ReplayPackCandidate, allowedBuckets: string[]): boolean {
  return (
    allowedBuckets.includes(candidate.bucket) &&
    candidate.onchainEligible &&
    candidate.volume24hUsd >= 50000 &&
    (candidate.launchStage === "migrated" || candidate.bondingProgress >= 50)
  );
}

function isHighRisk(candidate: ReplayPackCandidate): boolean {
  return candidate.onchainRisk === "high" || candidate.onchainRisk === "critical";
}

function compareStrategyRank(left: ReplayPackCandidate, right: ReplayPackCandidate): number {
  if (right.categoryScore !== left.categoryScore) {
    return right.categoryScore - left.categoryScore;
  }

  return right.volume24hUsd - left.volume24hUsd;
}

function countOverlap(left: ReplayPackCandidate[], right: ReplayPackCandidate[]): number {
  const rightAddresses = new Set(right.map((candidate) => candidate.tokenAddress.toLowerCase()));
  return left.filter((candidate) => rightAddresses.has(candidate.tokenAddress.toLowerCase())).length;
}

function buildOverlapDistribution(
  snapshots: ReplayPackSummary["snapshots"],
): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const snapshot of snapshots) {
    const key = String(snapshot.overlapCount);
    distribution[key] = (distribution[key] ?? 0) + 1;
  }
  return distribution;
}

function renderMarkdown(summary: ReplayPackSummary): string {
  return [
    "# Four.Meme Replay Pack Summary",
    "",
    `Generated at: ${summary.generatedAt}`,
    `Source pack: ${summary.sourcePack}`,
    "",
    "## Methodology",
    summary.methodologyNote,
    "",
    "## Aggregate Metrics",
    `- Snapshots: ${summary.snapshotCount}`,
    `- Strategy selected candidates: ${summary.strategySelectedCount}`,
    `- Volume-only baseline selected candidates: ${summary.baselineSelectedCount}`,
    `- High-risk baseline selections avoided: ${summary.highRiskCandidatesAvoided}`,
    `- Volume-only high-risk selection rate: ${(summary.volumeOnlyHighRiskSelectionRate * 100).toFixed(2)}%`,
    `- Overlap distribution: ${JSON.stringify(summary.overlapDistribution)}`,
    "",
    "## Snapshot Results",
    ...summary.snapshots.map(
      (snapshot) =>
        `- ${snapshot.id}: strategy=${snapshot.strategySelected.map((candidate) => candidate.symbol).join(", ") || "none"} | baseline=${snapshot.baselineSelected.map((candidate) => candidate.symbol).join(", ") || "none"} | high-risk avoided=${snapshot.highRiskAvoided} | overlap=${snapshot.overlapCount}`,
    ),
    "",
    "## Caveat",
    "This replay pack is deterministic methodology evidence only. It does not claim profitability, safety, or future performance.",
    "",
  ].join("\n");
}

await main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
