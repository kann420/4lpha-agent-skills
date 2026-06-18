import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { FourMemeCandidate, FourMemeDiscoverySnapshot } from "../src/adapters/fourmeme/client.js";
import { validateStrategySpec } from "../src/output/validate-strategy-spec.js";
import type { Rule, StrategySpec } from "../src/types/strategy-spec.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = resolve(REPO_ROOT, "examples", "generated", "fourmeme-proposed");
const REPLAY_DIR = resolve(REPO_ROOT, "examples", "replay");
const STRATEGY_PATH = resolve(FIXTURE_DIR, "cmc-market-regime.strategy.json");
const DISCOVERY_PATH = resolve(FIXTURE_DIR, "fourmeme-discovery.snapshot.json");
const REPLAY_JSON_PATH = resolve(REPLAY_DIR, "fourmeme-fixture-replay.summary.json");
const REPLAY_MD_PATH = resolve(REPLAY_DIR, "fourmeme-fixture-replay.summary.md");

interface ReplaySummary {
  baseline: {
    method: "volume-only";
    selected: ReplayCandidate[];
  };
  generatedAt: string;
  methodologyNote: string;
  overlapCount: number;
  sourceFixture: string;
  strategy: {
    allowedBuckets: string[];
    onchainSkills: string[];
    selected: ReplayCandidate[];
    status: StrategySpec["status"];
  };
}

interface ReplayCandidate {
  bucket: string;
  categoryScore: number;
  onchainEligible?: boolean;
  onchainRisk?: string;
  positionSizeMultiplier?: number;
  symbol: string;
  tokenAddress: string;
  volume24hUsd: number;
}

async function main(): Promise<void> {
  const [strategySpec, discoverySnapshot] = await Promise.all([
    readJson<StrategySpec>(STRATEGY_PATH),
    readJson<FourMemeDiscoverySnapshot>(DISCOVERY_PATH),
  ]);

  await validateStrategySpec(strategySpec);

  const allowedBuckets = resolveAllowedBuckets(strategySpec);
  const fullUniverse = uniqueCandidates([
    ...discoverySnapshot.safe2apeCandidates,
    ...discoverySnapshot.mediumRiskCandidates,
    ...discoverySnapshot.gemHuntCandidates,
  ]);
  const strategySelected = fullUniverse
    .filter((candidate) => isStrategyEligible(candidate, strategySpec, allowedBuckets))
    .sort(compareStrategyRank);
  const baselineSelected = [...fullUniverse]
    .sort((left, right) => right.volume24hUsd - left.volume24hUsd)
    .slice(0, Math.max(strategySelected.length, 1));
  const summary: ReplaySummary = {
    baseline: {
      method: "volume-only",
      selected: baselineSelected.map((candidate) => toReplayCandidate(candidate, strategySpec)),
    },
    generatedAt: strategySpec.inputWindow.asOf,
    methodologyNote:
      "Fixture replay checks deterministic strategy selection against a simple volume-only baseline. It is methodology evidence, not profitability proof.",
    overlapCount: countOverlap(strategySelected, baselineSelected),
    sourceFixture: "examples/generated/fourmeme-proposed",
    strategy: {
      allowedBuckets,
      onchainSkills: strategySpec.onchainEnrichment?.skills ?? [],
      selected: strategySelected.map((candidate) => toReplayCandidate(candidate, strategySpec)),
      status: strategySpec.status,
    },
  };

  await mkdir(REPLAY_DIR, { recursive: true });
  await Promise.all([
    writeFile(REPLAY_JSON_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    writeFile(REPLAY_MD_PATH, renderMarkdown(summary), "utf8"),
  ]);

  console.log(`Wrote replay JSON to ${REPLAY_JSON_PATH}`);
  console.log(`Wrote replay summary to ${REPLAY_MD_PATH}`);
  console.log(`Strategy selected ${summary.strategy.selected.length}; baseline overlap ${summary.overlapCount}.`);
}

function resolveAllowedBuckets(strategySpec: StrategySpec): string[] {
  const bucketRule = strategySpec.entryRules.find((rule) => rule.id === "fourmeme-discovery-bucket-gate");
  return Array.isArray(bucketRule?.value) ? bucketRule.value.map(String) : [];
}

function isStrategyEligible(
  candidate: FourMemeCandidate,
  strategySpec: StrategySpec,
  allowedBuckets: string[],
): boolean {
  return (
    allowedBuckets.includes(candidate.selectionBucket) &&
    passesOnchainGate(candidate, strategySpec) &&
    passesNumericRule(candidate.volume24hUsd, strategySpec.entryRules, "fourmeme-volume-floor") &&
    (candidate.launchStage === "migrated" ||
      passesNumericRule(candidate.bondingProgress ?? 0, strategySpec.entryRules, "fourmeme-bonding-progress-floor"))
  );
}

function passesOnchainGate(candidate: FourMemeCandidate, strategySpec: StrategySpec): boolean {
  const review = findOnchainReview(candidate, strategySpec);
  return !review || review.eligibleForEntry;
}

function passesNumericRule(value: number, rules: Rule[], id: string): boolean {
  const rule = rules.find((entryRule) => entryRule.id === id);
  if (!rule || typeof rule.value !== "number") {
    return true;
  }

  if (rule.operator === ">=") {
    return value >= rule.value;
  }

  if (rule.operator === ">") {
    return value > rule.value;
  }

  if (rule.operator === "<=") {
    return value <= rule.value;
  }

  if (rule.operator === "<") {
    return value < rule.value;
  }

  return true;
}

function uniqueCandidates(candidates: FourMemeCandidate[]): FourMemeCandidate[] {
  const byAddress = new Map<string, FourMemeCandidate>();
  for (const candidate of candidates) {
    byAddress.set(candidate.tokenAddress.toLowerCase(), candidate);
  }
  return [...byAddress.values()];
}

function compareStrategyRank(left: FourMemeCandidate, right: FourMemeCandidate): number {
  if (right.categoryScore !== left.categoryScore) {
    return right.categoryScore - left.categoryScore;
  }

  return right.volume24hUsd - left.volume24hUsd;
}

function countOverlap(left: FourMemeCandidate[], right: FourMemeCandidate[]): number {
  const rightAddresses = new Set(right.map((candidate) => candidate.tokenAddress.toLowerCase()));
  return left.filter((candidate) => rightAddresses.has(candidate.tokenAddress.toLowerCase())).length;
}

function toReplayCandidate(candidate: FourMemeCandidate, strategySpec: StrategySpec): ReplayCandidate {
  const onchainReview = findOnchainReview(candidate, strategySpec);
  return {
    bucket: candidate.selectionBucket,
    categoryScore: candidate.categoryScore,
    onchainEligible: onchainReview?.eligibleForEntry,
    onchainRisk: onchainReview?.aggregateRisk,
    positionSizeMultiplier: onchainReview?.positionSizeMultiplier,
    symbol: candidate.symbol,
    tokenAddress: candidate.tokenAddress,
    volume24hUsd: candidate.volume24hUsd,
  };
}

function findOnchainReview(candidate: FourMemeCandidate, strategySpec: StrategySpec) {
  return strategySpec.onchainEnrichment?.candidates.find(
    (review) => review.tokenAddress.toLowerCase() === candidate.tokenAddress.toLowerCase(),
  );
}

function renderMarkdown(summary: ReplaySummary): string {
  return [
    "# Four.Meme Fixture Replay Summary",
    "",
    `Generated at: ${summary.generatedAt}`,
    `Source fixture: ${summary.sourceFixture}`,
    "",
    "## Methodology",
    summary.methodologyNote,
    "",
    "## Strategy Selection",
    `- Status: ${summary.strategy.status}`,
    `- Allowed buckets: ${summary.strategy.allowedBuckets.join(", ")}`,
    `- On-chain skills: ${summary.strategy.onchainSkills.join(", ") || "none"}`,
    `- Selected candidates: ${summary.strategy.selected.length}`,
    ...summary.strategy.selected.map(
      (candidate) =>
        `- ${candidate.symbol} | ${candidate.bucket} | on-chain ${candidate.onchainRisk ?? "n/a"} | size ${candidate.positionSizeMultiplier ?? "n/a"} | score ${candidate.categoryScore} | volume ${formatUsd(candidate.volume24hUsd)} | ${candidate.tokenAddress}`,
    ),
    "",
    "## Baseline",
    `- Method: ${summary.baseline.method}`,
    `- Overlap with strategy selection: ${summary.overlapCount}`,
    ...summary.baseline.selected.map(
      (candidate) =>
        `- ${candidate.symbol} | ${candidate.bucket} | on-chain eligible ${candidate.onchainEligible ?? "n/a"} | score ${candidate.categoryScore} | volume ${formatUsd(candidate.volume24hUsd)} | ${candidate.tokenAddress}`,
    ),
    "",
    "## Caveat",
    "This replay is deterministic methodology evidence only. It does not claim profitability, safety, or future performance.",
    "",
  ].join("\n");
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

await main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
