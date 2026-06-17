import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  createCmcDataProviderFromEnv,
  type CmcDataProvider,
  type CmcMarketContext,
} from "../adapters/cmc/client.js";
import {
  createFourMemeClient,
  type FourMemeCandidate,
  type FourMemeDiscoverySnapshot,
} from "../adapters/fourmeme/client.js";
import {
  appendFourMemeTokenInfoEvidence,
  applyStrategyBrainReview,
  resolveBrainRuntimeOptions,
} from "../brain/review-strategy.js";
import type { BrainRuntimeOptions } from "../brain/types.js";
import { fetchFourMemeTokenInfo } from "../adapters/token-info/client.js";
import { validateTokenInfoSnapshot } from "../output/validate-token-info-snapshot.js";
import { validateStrategySpec } from "../output/validate-strategy-spec.js";
import { generateCmcMarketStrategySpec } from "../strategy/generate-cmc-market-strategy.js";
import type { StrategySpec } from "../types/strategy-spec.js";
import type { FourMemeTokenInfoSnapshot } from "../types/token-info.js";

const MARKET_CONTEXT_FILENAME = "cmc-market-context.snapshot.json";
const FOUR_MEME_FILENAME = "fourmeme-discovery.snapshot.json";
const TOKEN_INFO_FILENAME = "token-info.snapshot.json";
const STRATEGY_FILENAME = "cmc-market-regime.strategy.json";
const SUMMARY_FILENAME = "demo.summary.md";

export interface StrategyArtifactPaths {
  artifactsDir: string;
  marketContext: string;
  fourMemeDiscovery: string;
  tokenInfo?: string;
  strategySpec: string;
  demoSummary: string;
}

export interface GenerateStrategyArtifactsResult {
  paths: StrategyArtifactPaths;
  marketContext: CmcMarketContext;
  fourMemeSnapshot: FourMemeDiscoverySnapshot;
  tokenInfo?: FourMemeTokenInfoSnapshot;
  strategySpec: StrategySpec;
  demoSummary: string;
}

export interface GenerateStrategyArtifactsOptions {
  brain?: Partial<BrainRuntimeOptions>;
  cmcProvider?: CmcDataProvider;
  onStep?: (message: string) => void | Promise<void>;
  tokenContract?: string;
}

export async function generateStrategyArtifacts(
  artifactsDir: string,
  options: GenerateStrategyArtifactsOptions = {},
): Promise<GenerateStrategyArtifactsResult> {
  const resolvedArtifactsDir = resolve(artifactsDir);
  const cmcProvider = options.cmcProvider ?? createCmcDataProviderFromEnv();
  const fourMemeClient = createFourMemeClient();

  await emitStep(options, "Fetching CMC market context...");
  await emitStep(options, "Scanning Four.Meme venue...");
  const [marketContext, fourMemeSnapshot] = await Promise.all([
    cmcProvider.fetchMarketContext(),
    fourMemeClient.fetchDiscoverySnapshot(),
  ]);
  const tokenInfo = options.tokenContract
    ? await fetchFourMemeTokenInfoWithStep(options.tokenContract, options)
    : undefined;

  await emitStep(options, "Generating strategy spec...");
  const generatedStrategySpec = generateCmcMarketStrategySpec(marketContext, fourMemeSnapshot);
  const baseStrategySpec = tokenInfo
    ? appendFourMemeTokenInfoEvidence(generatedStrategySpec, tokenInfo)
    : generatedStrategySpec;
  const brain = resolveBrainRuntimeOptions(options.brain);

  await emitStep(options, `Reviewing strategy with ${brain.mode} brain...`);
  const strategySpec = await applyStrategyBrainReview({
    fourMemeTokenInfo: tokenInfo,
    marketContext,
    fourMemeSnapshot,
    options: brain,
    strategySpec: baseStrategySpec,
  });

  await emitStep(options, "Validating schema...");
  await validateStrategySpec(strategySpec);

  await emitStep(options, "Writing demo artifacts...");
  await mkdir(resolvedArtifactsDir, { recursive: true });

  const paths: StrategyArtifactPaths = {
    artifactsDir: resolvedArtifactsDir,
    marketContext: resolve(resolvedArtifactsDir, MARKET_CONTEXT_FILENAME),
    fourMemeDiscovery: resolve(resolvedArtifactsDir, FOUR_MEME_FILENAME),
    tokenInfo: tokenInfo ? resolve(resolvedArtifactsDir, TOKEN_INFO_FILENAME) : undefined,
    strategySpec: resolve(resolvedArtifactsDir, STRATEGY_FILENAME),
    demoSummary: resolve(resolvedArtifactsDir, SUMMARY_FILENAME),
  };
  const demoSummary = renderDemoSummary(marketContext, fourMemeSnapshot, strategySpec, paths);

  await Promise.all([
    writeJsonFile(paths.marketContext, marketContext),
    writeJsonFile(paths.fourMemeDiscovery, fourMemeSnapshot),
    ...(paths.tokenInfo && tokenInfo ? [writeJsonFile(paths.tokenInfo, tokenInfo)] : []),
    writeJsonFile(paths.strategySpec, strategySpec),
    writeFile(paths.demoSummary, demoSummary, "utf8"),
  ]);

  return {
    paths,
    marketContext,
    fourMemeSnapshot,
    tokenInfo,
    strategySpec,
    demoSummary,
  };
}

async function emitStep(
  options: GenerateStrategyArtifactsOptions,
  message: string,
): Promise<void> {
  await options.onStep?.(message);
}

async function fetchFourMemeTokenInfoWithStep(
  contract: string,
  options: GenerateStrategyArtifactsOptions,
): Promise<FourMemeTokenInfoSnapshot> {
  await emitStep(options, "Fetching Four.Meme token info snapshot...");
  const tokenInfo = await fetchFourMemeTokenInfo(contract);
  await validateTokenInfoSnapshot(tokenInfo);
  return tokenInfo;
}

function renderDemoSummary(
  marketContext: CmcMarketContext,
  fourMemeSnapshot: FourMemeDiscoverySnapshot,
  strategySpec: StrategySpec,
  paths: StrategyArtifactPaths,
): string {
  const topCandidates = fourMemeSnapshot.selectedCandidates.slice(0, 5);
  const rejectionSection =
    strategySpec.rejectionReasons && strategySpec.rejectionReasons.length > 0
      ? [
          "## Rejection Signals",
          ...strategySpec.rejectionReasons.map(
            (reason) => `- ${reason.description}`,
          ),
          "",
        ]
      : [];

  return [
    "# Four.Meme Strategy Demo Summary",
    "",
    `Generated at: ${strategySpec.generatedAt}`,
    `Strategy ID: ${strategySpec.strategyId}`,
    `Status: ${strategySpec.status}`,
    `Regime: ${strategySpec.regime.label}`,
    `Confidence: ${formatConfidence(strategySpec.regime.confidence)}`,
    `Brain: ${strategySpec.brainReview.mode} / ${strategySpec.brainReview.provider}`,
    `Brain verdict: ${strategySpec.brainReview.finalVerdict}`,
    "",
    "## Inputs",
    `- CMC source: ${marketContext.source}`,
    `- CMC transport: ${marketContext.transport}`,
    `- CMC as-of: ${marketContext.asOf}`,
    `- Fear and Greed: ${marketContext.fearGreed.value} (${marketContext.fearGreed.classification})`,
    `- Total market cap 24h change: ${marketContext.global.totalMarketCapChange24hPct.toFixed(2)}%`,
    `- BTC dominance 24h change: ${marketContext.global.btcDominanceChange24hPct.toFixed(2)}%`,
    `- BNB 24h / 7d: ${marketContext.bnb.percentChange24h.toFixed(2)}% / ${marketContext.bnb.percentChange7d.toFixed(2)}%`,
    "",
    ...(paths.tokenInfo
      ? [
          "## Token Info",
          `- Token info: ${basename(paths.tokenInfo)}`,
          "",
        ]
      : []),
    "## Four.Meme Scan",
    `- Feed counts: new=${fourMemeSnapshot.feedCounts.newLaunches}, volume=${fourMemeSnapshot.feedCounts.volumeLeaders}, hot=${fourMemeSnapshot.feedCounts.hot}, dex=${fourMemeSnapshot.feedCounts.dexMigrated}`,
    `- Bucket counts: safe2ape=${fourMemeSnapshot.safe2apeCandidates.length}, mediumRisk=${fourMemeSnapshot.mediumRiskCandidates.length}, gemHunt=${fourMemeSnapshot.gemHuntCandidates.length}`,
    `- Featured candidates: ${topCandidates.length}`,
    ...renderCandidateLines(topCandidates),
    "",
    "## Strategy Rules",
    `- Thesis: ${strategySpec.strategyThesis}`,
    `- Entry rules: ${strategySpec.entryRules.length}`,
    `- Exit rules: ${strategySpec.exitRules.length}`,
    `- Risk controls: ${strategySpec.riskControls.length}`,
    `- Invalidation rules: ${strategySpec.invalidation.length}`,
    `- Brain agents: ${strategySpec.brainReview.agents.map((agent) => `${agent.role}:${agent.verdict}`).join(", ") || "none"}`,
    `- Learned lessons applied: ${strategySpec.brainReview.learning.appliedLessonIds.length}`,
    "",
    ...rejectionSection,
    "## Artifacts",
    `- Market context: ${basename(paths.marketContext)}`,
    `- Four.Meme discovery: ${basename(paths.fourMemeDiscovery)}`,
    ...(paths.tokenInfo ? [`- Token info: ${basename(paths.tokenInfo)}`] : []),
    `- Strategy spec: ${basename(paths.strategySpec)}`,
    `- Demo summary: ${basename(paths.demoSummary)}`,
    "",
    "## Demo Command",
    "```powershell",
    "npm run demo",
    "```",
    "",
  ].join("\n");
}

function renderCandidateLines(candidates: FourMemeCandidate[]): string[] {
  if (candidates.length === 0) {
    return ["- No featured candidates passed the current venue filters."];
  }

  return candidates.map((candidate) => {
    const volume = candidate.volume24hUsd > 0 ? `$${formatUsd(candidate.volume24hUsd)}` : "n/a";
    const marketCap = candidate.marketCapUsd > 0 ? `$${formatUsd(candidate.marketCapUsd)}` : "n/a";
    return `- ${candidate.symbol} | ${candidate.selectionBucket} | ${candidate.launchStage} | ${candidate.tokenAddress} | MC ${marketCap} | Vol ${volume}`;
  });
}

function formatConfidence(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(2);
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  return value.toFixed(2);
}

async function writeJsonFile(path: string, value: object): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
