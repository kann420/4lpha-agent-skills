import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { createBstocksClient, type BstocksUniverseSnapshot } from "../adapters/bstocks/client.js";
import { fetchBstocksTokenInfo } from "../adapters/token-info/client.js";
import {
  createCmcDataProviderFromEnv,
  type CmcDataProvider,
  type CmcMarketContext,
} from "../adapters/cmc/client.js";
import {
  appendBstocksTokenInfoEvidence,
  applyBstocksStrategyBrainReview,
  resolveBstocksBrainRuntimeOptions,
} from "../brain/review-bstocks-strategy.js";
import type { BrainRuntimeOptions } from "../brain/types.js";
import { validateTokenInfoSnapshot } from "../output/validate-token-info-snapshot.js";
import {
  validateBstocksDraftStrategySpec,
  validateBstocksReviewedStrategySpec,
} from "../output/validate-bstocks-strategy-spec.js";
import { generateBstocksDraftStrategySpec } from "../strategy/bstocks/generate-bstocks-strategy.js";
import type {
  BstocksDraftStrategySpec,
  BstocksReviewedStrategySpec,
} from "../types/bstocks-strategy-spec.js";
import type { BstocksTokenInfoSnapshot } from "../types/token-info.js";

const MARKET_CONTEXT_FILENAME = "cmc-market-context.snapshot.json";
const BSTOCKS_FILENAME = "bstocks-universe.snapshot.json";
const TOKEN_INFO_FILENAME = "token-info.snapshot.json";
const DRAFT_STRATEGY_FILENAME = "bstocks-draft.strategy.json";
const REVIEWED_STRATEGY_FILENAME = "bstocks-reviewed.strategy.json";
const SUMMARY_FILENAME = "demo.summary.md";

export interface BstocksArtifactPaths {
  artifactsDir: string;
  marketContext: string;
  bstocksUniverse: string;
  tokenInfo?: string;
  draftStrategySpec: string;
  reviewedStrategySpec: string;
  demoSummary: string;
}

export interface GenerateBstocksStrategyArtifactsResult {
  paths: BstocksArtifactPaths;
  marketContext: CmcMarketContext;
  bstocksSnapshot: BstocksUniverseSnapshot;
  tokenInfo?: BstocksTokenInfoSnapshot;
  draftStrategySpec: BstocksDraftStrategySpec;
  reviewedStrategySpec: BstocksReviewedStrategySpec;
  demoSummary: string;
}

export interface GenerateBstocksStrategyArtifactsOptions {
  brain?: Partial<BrainRuntimeOptions>;
  cmcProvider?: CmcDataProvider;
  onStep?: (message: string) => void | Promise<void>;
  tokenContract?: string;
}

export async function generateBstocksStrategyArtifacts(
  artifactsDir: string,
  options: GenerateBstocksStrategyArtifactsOptions = {},
): Promise<GenerateBstocksStrategyArtifactsResult> {
  const resolvedArtifactsDir = resolve(artifactsDir);
  const cmcProvider = options.cmcProvider ?? createCmcDataProviderFromEnv();
  const bstocksClient = createBstocksClient(cmcProvider);

  await emitStep(options, "Fetching CMC market context...");
  await emitStep(options, "Fetching bStocks universe snapshot...");
  const [marketContext, bstocksSnapshot] = await Promise.all([
    cmcProvider.fetchMarketContext(),
    bstocksClient.fetchUniverseSnapshot(),
  ]);
  const tokenInfo = options.tokenContract
    ? await fetchBstocksTokenInfoWithStep(options.tokenContract, options)
    : undefined;
  await emitStep(options, "Generating bStocks draft strategy spec...");
  const generatedDraftStrategySpec = generateBstocksDraftStrategySpec(marketContext, bstocksSnapshot);
  const draftStrategySpec = tokenInfo
    ? appendBstocksTokenInfoEvidence(generatedDraftStrategySpec, tokenInfo)
    : generatedDraftStrategySpec;
  const brain = resolveBstocksBrainRuntimeOptions(options.brain);

  await emitStep(options, `Reviewing bStocks draft with ${brain.mode} brain...`);
  const reviewedStrategySpec = await applyBstocksStrategyBrainReview({
    bstocksSnapshot,
    bstocksTokenInfo: tokenInfo,
    draftStrategySpec,
    marketContext,
    options: brain,
  });

  await emitStep(options, "Validating bStocks draft schema...");
  await validateBstocksDraftStrategySpec(draftStrategySpec);
  await emitStep(options, "Validating bStocks reviewed schema...");
  await validateBstocksReviewedStrategySpec(reviewedStrategySpec);
  await mkdir(resolvedArtifactsDir, { recursive: true });

  const paths: BstocksArtifactPaths = {
    artifactsDir: resolvedArtifactsDir,
    marketContext: resolve(resolvedArtifactsDir, MARKET_CONTEXT_FILENAME),
    bstocksUniverse: resolve(resolvedArtifactsDir, BSTOCKS_FILENAME),
    tokenInfo: tokenInfo ? resolve(resolvedArtifactsDir, TOKEN_INFO_FILENAME) : undefined,
    draftStrategySpec: resolve(resolvedArtifactsDir, DRAFT_STRATEGY_FILENAME),
    reviewedStrategySpec: resolve(resolvedArtifactsDir, REVIEWED_STRATEGY_FILENAME),
    demoSummary: resolve(resolvedArtifactsDir, SUMMARY_FILENAME),
  };
  const demoSummary = renderDemoSummary(
    marketContext,
    bstocksSnapshot,
    draftStrategySpec,
    reviewedStrategySpec,
    paths,
  );

  await Promise.all([
    writeJsonFile(paths.marketContext, marketContext),
    writeJsonFile(paths.bstocksUniverse, bstocksSnapshot),
    ...(paths.tokenInfo && tokenInfo ? [writeJsonFile(paths.tokenInfo, tokenInfo)] : []),
    writeJsonFile(paths.draftStrategySpec, draftStrategySpec),
    writeJsonFile(paths.reviewedStrategySpec, reviewedStrategySpec),
    writeFile(paths.demoSummary, demoSummary, "utf8"),
  ]);

  return {
    paths,
    marketContext,
    bstocksSnapshot,
    tokenInfo,
    draftStrategySpec,
    reviewedStrategySpec,
    demoSummary,
  };
}

async function emitStep(
  options: GenerateBstocksStrategyArtifactsOptions,
  message: string,
): Promise<void> {
  await options.onStep?.(message);
}

async function fetchBstocksTokenInfoWithStep(
  contract: string,
  options: GenerateBstocksStrategyArtifactsOptions,
): Promise<BstocksTokenInfoSnapshot> {
  await emitStep(options, "Fetching bStocks token info snapshot...");
  const tokenInfo = await fetchBstocksTokenInfo(contract);
  await validateTokenInfoSnapshot(tokenInfo);
  return tokenInfo;
}

function renderDemoSummary(
  marketContext: CmcMarketContext,
  bstocksSnapshot: BstocksUniverseSnapshot,
  draftStrategySpec: BstocksDraftStrategySpec,
  reviewedStrategySpec: BstocksReviewedStrategySpec,
  paths: BstocksArtifactPaths,
): string {
  const topCandidates = bstocksSnapshot.candidates.slice(0, 5);
  const rejectionSection =
    reviewedStrategySpec.rejectionReasons && reviewedStrategySpec.rejectionReasons.length > 0
      ? [
          "## Rejection Signals",
          ...reviewedStrategySpec.rejectionReasons.map((reason) => `- ${reason.description}`),
          "",
        ]
      : [];

  return [
    "# bStocks Strategy Demo Summary",
    "",
    `Generated at: ${reviewedStrategySpec.generatedAt}`,
    `Strategy ID: ${reviewedStrategySpec.strategyId}`,
    `Draft status: ${draftStrategySpec.status}`,
    `Reviewed status: ${reviewedStrategySpec.status}`,
    `Regime: ${reviewedStrategySpec.regime.label}`,
    `Confidence: ${formatConfidence(reviewedStrategySpec.regime.confidence)}`,
    `Brain: ${reviewedStrategySpec.brainReview.mode} / ${reviewedStrategySpec.brainReview.provider}`,
    `Brain verdict: ${reviewedStrategySpec.brainReview.finalVerdict}`,
    "",
    "## Inputs",
    `- CMC as-of: ${marketContext.asOf}`,
    `- CMC transport: ${marketContext.transport}`,
    `- Fear and Greed: ${marketContext.fearGreed.value} (${marketContext.fearGreed.classification})`,
    `- Total market cap 24h change: ${marketContext.global.totalMarketCapChange24hPct.toFixed(2)}%`,
    `- BNB 24h: ${marketContext.bnb.percentChange24h.toFixed(2)}%`,
    "",
    ...(paths.tokenInfo
      ? [
          "## Token Info",
          `- Token info: ${basename(paths.tokenInfo)}`,
          "",
        ]
      : []),
    "## bStocks Universe",
    `- Issuer: ${bstocksSnapshot.issuer}`,
    `- Venue: ${bstocksSnapshot.venue}`,
    `- Quote transport: ${bstocksSnapshot.transport}`,
    `- Quoteable symbols: ${bstocksSnapshot.candidateCount}`,
    ...renderCandidateLines(topCandidates),
    "",
    "## Strategy Rules",
    `- Thesis: ${reviewedStrategySpec.strategyThesis}`,
    `- Entry rules: ${reviewedStrategySpec.entryRules.length}`,
    `- Exit rules: ${reviewedStrategySpec.exitRules.length}`,
    `- Risk controls: ${reviewedStrategySpec.riskControls.length}`,
    `- Invalidation rules: ${reviewedStrategySpec.invalidation.length}`,
    `- Brain agents: ${reviewedStrategySpec.brainReview.agents.map((agent) => `${agent.role}:${agent.verdict}`).join(", ") || "none"}`,
    `- Learned lessons applied: ${reviewedStrategySpec.brainReview.learning.appliedLessonIds.length}`,
    "",
    ...rejectionSection,
    "## Artifacts",
    `- Market context: ${basename(paths.marketContext)}`,
    `- bStocks snapshot: ${basename(paths.bstocksUniverse)}`,
    ...(paths.tokenInfo ? [`- Token info: ${basename(paths.tokenInfo)}`] : []),
    `- Draft strategy spec: ${basename(paths.draftStrategySpec)}`,
    `- Reviewed strategy spec: ${basename(paths.reviewedStrategySpec)}`,
    `- Demo summary: ${basename(paths.demoSummary)}`,
    "",
    "## Demo Command",
    "```powershell",
    "npm run cli -- strategy generate --lane bstocks",
    "```",
    "",
  ].join("\n");
}

function renderCandidateLines(candidates: BstocksUniverseSnapshot["candidates"]): string[] {
  if (candidates.length === 0) {
    return ["- No tracked bStocks symbols currently have live quotes."];
  }

  return candidates.map((candidate) => {
    const volume = candidate.volume24hUsd > 0 ? `$${formatUsd(candidate.volume24hUsd)}` : "n/a";
    return `- ${candidate.symbol} | CMC ${candidate.cmcId} | 24h ${candidate.percentChange24h.toFixed(2)}% | 7d ${candidate.percentChange7d.toFixed(2)}% | Vol ${volume}`;
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
