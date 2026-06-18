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
import { buildArtifactRef } from "../output/artifact-refs.js";
import { validateTokenInfoSnapshot } from "../output/validate-token-info-snapshot.js";
import { validateStrategySpec } from "../output/validate-strategy-spec.js";
import { routeSkill } from "../skills/marketplace-router.js";
import { applyFourMemeOnchainEnrichment } from "../strategy/apply-fourmeme-onchain-enrichment.js";
import { generateCmcMarketStrategySpec } from "../strategy/generate-cmc-market-strategy.js";
import type { FourMemeOnchainEnrichmentSnapshot } from "../types/fourmeme-onchain-enrichment.js";
import type { StrategySpec } from "../types/strategy-spec.js";
import type { FourMemeTokenInfoSnapshot } from "../types/token-info.js";

const MARKET_CONTEXT_FILENAME = "cmc-market-context.snapshot.json";
const FOUR_MEME_FILENAME = "fourmeme-discovery.snapshot.json";
const ONCHAIN_ENRICHMENT_FILENAME = "fourmeme-onchain-enrichment.snapshot.json";
const SKILL_ROUTE_FILENAME = "skill-route.snapshot.json";
const TOKEN_INFO_FILENAME = "token-info.snapshot.json";
const STRATEGY_FILENAME = "cmc-market-regime.strategy.json";
const SUMMARY_FILENAME = "demo.summary.md";
const DEFAULT_SKILL_ROUTE_QUERY =
  "Generate a BNB Chain Four.Meme meme-token strategy from CMC market context and Four.Meme launch signals.";

export interface StrategyArtifactPaths {
  artifactsDir: string;
  marketContext: string;
  fourMemeDiscovery: string;
  onchainEnrichment?: string;
  skillRoute: string;
  tokenInfo?: string;
  strategySpec: string;
  demoSummary: string;
}

export interface GenerateStrategyArtifactsResult {
  paths: StrategyArtifactPaths;
  marketContext: CmcMarketContext;
  fourMemeSnapshot: FourMemeDiscoverySnapshot;
  onchainEnrichment?: FourMemeOnchainEnrichmentSnapshot;
  tokenInfo?: FourMemeTokenInfoSnapshot;
  strategySpec: StrategySpec;
  demoSummary: string;
}

export interface GenerateStrategyArtifactsOptions {
  brain?: Partial<BrainRuntimeOptions>;
  cmcProvider?: CmcDataProvider;
  fourMemeClient?: {
    fetchDiscoverySnapshot(): Promise<FourMemeDiscoverySnapshot>;
  };
  onchainEnrichmentClient?: {
    fetchEnrichmentSnapshot(input: {
      asOf: string;
      candidates: FourMemeCandidate[];
    }): Promise<FourMemeOnchainEnrichmentSnapshot>;
  };
  onStep?: (message: string) => void | Promise<void>;
  skillRouteNow?: string;
  skillRouteQuery?: string;
  tokenContract?: string;
}

export async function generateStrategyArtifacts(
  artifactsDir: string,
  options: GenerateStrategyArtifactsOptions = {},
): Promise<GenerateStrategyArtifactsResult> {
  const resolvedArtifactsDir = resolve(artifactsDir);
  const cmcProvider = options.cmcProvider ?? createCmcDataProviderFromEnv();
  const fourMemeClient = options.fourMemeClient ?? createFourMemeClient();

  await emitStep(options, "Routing intent through curated CMC Skills Marketplace contract...");
  const skillRoute = await routeSkill(options.skillRouteQuery ?? DEFAULT_SKILL_ROUTE_QUERY, {
    now: options.skillRouteNow,
  });

  await emitStep(options, "Fetching CMC market context...");
  await emitStep(options, "Scanning Four.Meme venue...");
  const [marketContext, fourMemeSnapshot] = await Promise.all([
    cmcProvider.fetchMarketContext(),
    fourMemeClient.fetchDiscoverySnapshot(),
  ]);
  const tokenInfo = options.tokenContract
    ? await fetchFourMemeTokenInfoWithStep(options.tokenContract, options)
    : undefined;
  const onchainEnrichment = options.onchainEnrichmentClient
    ? await fetchOnchainEnrichmentWithStep(fourMemeSnapshot, options)
    : undefined;

  await emitStep(options, "Generating strategy spec...");
  const generatedStrategySpec = generateCmcMarketStrategySpec(marketContext, fourMemeSnapshot);
  const enrichedStrategySpec = onchainEnrichment
    ? applyFourMemeOnchainEnrichment(generatedStrategySpec, onchainEnrichment)
    : generatedStrategySpec;
  const baseStrategySpec = tokenInfo
    ? appendFourMemeTokenInfoEvidence(enrichedStrategySpec, tokenInfo)
    : enrichedStrategySpec;
  const brain = resolveBrainRuntimeOptions(options.brain);

  await emitStep(options, `Reviewing strategy with ${brain.mode} brain...`);
  let strategySpec = await applyStrategyBrainReview({
    fourMemeTokenInfo: tokenInfo,
    marketContext,
    fourMemeSnapshot,
    options: brain,
    strategySpec: baseStrategySpec,
  });

  const paths: StrategyArtifactPaths = {
    artifactsDir: resolvedArtifactsDir,
    marketContext: resolve(resolvedArtifactsDir, MARKET_CONTEXT_FILENAME),
    fourMemeDiscovery: resolve(resolvedArtifactsDir, FOUR_MEME_FILENAME),
    onchainEnrichment: onchainEnrichment ? resolve(resolvedArtifactsDir, ONCHAIN_ENRICHMENT_FILENAME) : undefined,
    skillRoute: resolve(resolvedArtifactsDir, SKILL_ROUTE_FILENAME),
    tokenInfo: tokenInfo ? resolve(resolvedArtifactsDir, TOKEN_INFO_FILENAME) : undefined,
    strategySpec: resolve(resolvedArtifactsDir, STRATEGY_FILENAME),
    demoSummary: resolve(resolvedArtifactsDir, SUMMARY_FILENAME),
  };
  strategySpec = {
    ...strategySpec,
    skillRoute,
    artifactRefs: [
      buildArtifactRef({
        artifactsDir: resolvedArtifactsDir,
        path: paths.skillRoute,
        role: "input",
        value: skillRoute,
      }),
      buildArtifactRef({
        artifactsDir: resolvedArtifactsDir,
        path: paths.marketContext,
        role: "input",
        value: marketContext,
      }),
      buildArtifactRef({
        artifactsDir: resolvedArtifactsDir,
        path: paths.fourMemeDiscovery,
        role: "input",
        value: fourMemeSnapshot,
      }),
      ...(paths.onchainEnrichment && onchainEnrichment
        ? [
            buildArtifactRef({
              artifactsDir: resolvedArtifactsDir,
              path: paths.onchainEnrichment,
              role: "input",
              value: onchainEnrichment,
            }),
          ]
        : []),
      ...(paths.tokenInfo && tokenInfo
        ? [
            buildArtifactRef({
              artifactsDir: resolvedArtifactsDir,
              path: paths.tokenInfo,
              role: "input",
              value: tokenInfo,
            }),
          ]
        : []),
    ],
  };

  await emitStep(options, "Validating schema...");
  await validateStrategySpec(strategySpec);

  await emitStep(options, "Writing demo artifacts...");
  await mkdir(resolvedArtifactsDir, { recursive: true });

  const demoSummary = renderDemoSummary(marketContext, fourMemeSnapshot, strategySpec, paths);

  await Promise.all([
    writeJsonFile(paths.skillRoute, skillRoute),
    writeJsonFile(paths.marketContext, marketContext),
    writeJsonFile(paths.fourMemeDiscovery, fourMemeSnapshot),
    ...(paths.onchainEnrichment && onchainEnrichment
      ? [writeJsonFile(paths.onchainEnrichment, onchainEnrichment)]
      : []),
    ...(paths.tokenInfo && tokenInfo ? [writeJsonFile(paths.tokenInfo, tokenInfo)] : []),
    writeJsonFile(paths.strategySpec, strategySpec),
    writeFile(paths.demoSummary, demoSummary, "utf8"),
  ]);

  return {
    paths,
    marketContext,
    fourMemeSnapshot,
    onchainEnrichment,
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

async function fetchOnchainEnrichmentWithStep(
  fourMemeSnapshot: FourMemeDiscoverySnapshot,
  options: GenerateStrategyArtifactsOptions,
): Promise<FourMemeOnchainEnrichmentSnapshot> {
  if (!options.onchainEnrichmentClient) {
    throw new Error("Missing on-chain enrichment client.");
  }

  await emitStep(options, "Applying curated CMC on-chain skill enrichments...");
  return options.onchainEnrichmentClient.fetchEnrichmentSnapshot({
    asOf: fourMemeSnapshot.asOf,
    candidates: fourMemeSnapshot.selectedCandidates,
  });
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
    `Data quality: ${strategySpec.dataQuality?.status ?? "unknown"}`,
    `Skill route: ${strategySpec.skillRoute?.selectedSkill ?? "unknown"}`,
    `On-chain enrichment: ${strategySpec.onchainEnrichment ? strategySpec.onchainEnrichment.source : "not attached"}`,
    "",
    "## Inputs",
    `- CMC source: ${marketContext.source}`,
    `- CMC transport: ${marketContext.transport}`,
    `- CMC as-of: ${marketContext.asOf}`,
    `- Fear and Greed: ${marketContext.fearGreed.value} (${marketContext.fearGreed.classification})`,
    `- Total market cap 24h change: ${marketContext.global.totalMarketCapChange24hPct.toFixed(2)}%`,
    `- BTC dominance 24h change: ${marketContext.global.btcDominanceChange24hPct.toFixed(2)}%`,
    `- BNB 24h / 7d: ${marketContext.bnb.percentChange24h.toFixed(2)}% / ${marketContext.bnb.percentChange7d.toFixed(2)}%`,
    `- Optional skill enrichments: ${strategySpec.skillRoute?.optionalEnrichments.join(", ") || "none"}`,
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
    ...(strategySpec.onchainEnrichment
      ? [
          `- On-chain skill candidates: ${strategySpec.onchainEnrichment.candidates.length}`,
          `- On-chain skill source: ${strategySpec.onchainEnrichment.source}`,
        ]
      : []),
    "",
    "## Strategy Rules",
    `- Thesis: ${strategySpec.strategyThesis}`,
    `- Entry rules: ${strategySpec.entryRules.length}`,
    `- Exit rules: ${strategySpec.exitRules.length}`,
    `- Risk controls: ${strategySpec.riskControls.length}`,
    `- Invalidation rules: ${strategySpec.invalidation.length}`,
    `- Brain agents: ${strategySpec.brainReview.agents.map((agent) => `${agent.role}:${agent.verdict}`).join(", ") || "none"}`,
    `- Learned lessons applied: ${strategySpec.brainReview.learning.appliedLessonIds.length}`,
    `- Artifact refs: ${strategySpec.artifactRefs?.map((ref) => `${ref.label}:${ref.sha256.slice(0, 10)}`).join(", ") || "none"}`,
    "",
    ...rejectionSection,
    "## Artifacts",
    `- Skill route: ${basename(paths.skillRoute)}`,
    `- Market context: ${basename(paths.marketContext)}`,
    `- Four.Meme discovery: ${basename(paths.fourMemeDiscovery)}`,
    ...(paths.onchainEnrichment ? [`- On-chain enrichment: ${basename(paths.onchainEnrichment)}`] : []),
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
    return `- ${formatCandidateLabel(candidate)} | ${candidate.selectionBucket} | ${candidate.launchStage} | ${candidate.tokenAddress} | MC ${marketCap} | Vol ${volume}`;
  });
}

function formatCandidateLabel(candidate: FourMemeCandidate): string {
  const safeSymbol = toSafeDisplay(candidate.symbol, "non-ascii-token");
  const safeName = toSafeDisplay(candidate.name, "");
  return safeName && safeName !== safeSymbol ? `${safeSymbol} (${safeName})` : safeSymbol;
}

function toSafeDisplay(value: string, fallback: string): string {
  if (!/^[\x20-\x7E]+$/u.test(value) || /(?:Ã|Â|å|æ|è|�)/u.test(value)) {
    return fallback;
  }

  return value;
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
