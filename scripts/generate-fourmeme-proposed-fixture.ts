import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CmcDataProvider, CmcLatestQuote, CmcMarketContext } from "../src/adapters/cmc/client.js";
import type { FourMemeCandidate } from "../src/adapters/fourmeme/client.js";
import type { FourMemeDiscoverySnapshot } from "../src/adapters/fourmeme/client.js";
import { generateStrategyArtifacts } from "../src/pipelines/generate-strategy-artifacts.js";
import type {
  FourMemeOnchainCandidateReview,
  FourMemeOnchainEnrichmentSnapshot,
} from "../src/types/fourmeme-onchain-enrichment.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = resolve(REPO_ROOT, "examples", "generated", "fourmeme-proposed");
const AS_OF = "2026-06-18T04:00:00.000Z";

class FixtureCmcProvider implements CmcDataProvider {
  readonly transport = "agent-hub-mcp" as const;

  async fetchLatestQuotesByIds(_ids: number[]): Promise<CmcLatestQuote[]> {
    return [];
  }

  async fetchMarketContext(): Promise<CmcMarketContext> {
    return createMarketContextFixture();
  }
}

async function main(): Promise<void> {
  const result = await generateStrategyArtifacts(OUTPUT_DIR, {
    brain: {
      mode: "multi-agent",
      provider: "local-rules",
    },
    cmcProvider: new FixtureCmcProvider(),
    fourMemeClient: {
      fetchDiscoverySnapshot: async () => createFourMemeDiscoveryFixture(),
    },
    onchainEnrichmentClient: {
      fetchEnrichmentSnapshot: async ({ asOf, candidates }) =>
        createOnchainEnrichmentFixture(asOf, candidates),
    },
    skillRouteQuery:
      "Generate a BNB Chain Four.Meme meme-token strategy with CMC market regime, Four.Meme launch signals, holder concentration checks, DEX wallet activity, and wallet PnL review.",
    skillRouteNow: AS_OF,
  });

  console.log(`Wrote proposed Four.Meme fixture to ${result.paths.artifactsDir}`);
  console.log(`Strategy status: ${result.strategySpec.status}`);
  console.log(`Brain verdict: ${result.strategySpec.brainReview.finalVerdict}`);
}

function createMarketContextFixture(): CmcMarketContext {
  return {
    asOf: AS_OF,
    dataQuality: {
      freshness: [
        {
          expectedCadence: "Fixture snapshot pinned for deterministic replay; live demo uses Agent Hub MCP.",
          retrievedAt: AS_OF,
          sourceObservedAt: AS_OF,
        },
      ],
      providerErrors: [],
      status: "complete",
      summary: "Deterministic supportive-regime fixture for judge replay; not a live market claim.",
    },
    source: "coinmarketcap",
    transport: "agent-hub-mcp",
    global: {
      totalMarketCapUsd: 3_480_000_000_000,
      totalVolume24hUsd: 132_000_000_000,
      totalMarketCapChange24hPct: 1.25,
      btcDominancePct: 53.4,
      btcDominanceChange24hPct: -0.12,
      ethDominancePct: 17.9,
      observedAt: AS_OF,
    },
    fearGreed: {
      value: 64,
      classification: "Greed",
      observedAt: AS_OF,
    },
    bnb: {
      assetId: 1839,
      name: "BNB",
      symbol: "BNB",
      cmcRank: 5,
      priceUsd: 652.4,
      volume24hUsd: 1_840_000_000,
      percentChange1h: 0.25,
      percentChange24h: 1.18,
      percentChange7d: 4.7,
      percentChange30d: 7.9,
      marketCapUsd: 96_000_000_000,
      marketCapDominancePct: 2.76,
      observedAt: AS_OF,
    },
    technicalIndicators: {
      assetId: 1839,
      macd: {
        histogram: 0.42,
        line: 1.84,
        signal: 1.42,
      },
      movingAverages: [
        {
          period: "20",
          type: "ema",
          value: 640.2,
        },
        {
          period: "50",
          type: "ema",
          value: 626.8,
        },
      ],
      observedAt: AS_OF,
      rsi: 58.4,
      source: "coinmarketcap",
      sourceTool: "get_crypto_technical_analysis",
      summary: "Fixture BNB TA: RSI 58.4, MACD histogram positive, price above EMA20 and EMA50.",
      symbol: "BNB",
      transport: "agent-hub-mcp",
    },
  };
}

function createFourMemeDiscoveryFixture(): FourMemeDiscoverySnapshot {
  const safeCandidate = {
    tokenAddress: "0x0a43fc31a73013089df59194872ecae4cae14444",
    venueUrl: "https://four.meme/en/token/0x0a43fc31a73013089df59194872ecae4cae14444",
    symbol: "FOUR",
    name: "Four Meme Signal",
    createdAt: "2026-06-18T02:30:00.000Z",
    marketCapUsd: 92_000,
    volume24hUsd: 186_000,
    volume4hUsd: 64_000,
    priceUsd: 0.00092,
    holders: 188,
    bondingProgress: 84,
    graduated: false,
    launchStage: "new" as const,
    discoveryFeeds: ["newLaunches" as const, "volumeLeaders" as const, "hot" as const],
    selectionBucket: "safe2ape" as const,
    categoryScore: 74,
  };
  const gemCandidate = {
    tokenAddress: "0x7a1b9c2d3e4f5061728394a5b6c7d8e9f0012345",
    venueUrl: "https://four.meme/en/token/0x7a1b9c2d3e4f5061728394a5b6c7d8e9f0012345",
    symbol: "BNBMAX",
    name: "BNB Max Rotation",
    createdAt: "2026-06-17T18:45:00.000Z",
    marketCapUsd: 420_000,
    volume24hUsd: 620_000,
    volume4hUsd: 92_000,
    priceUsd: 0.0042,
    holders: 840,
    bondingProgress: 100,
    graduated: true,
    launchStage: "migrated" as const,
    discoveryFeeds: ["dexMigrated" as const, "volumeLeaders" as const],
    selectionBucket: "gemHunt" as const,
    categoryScore: 81,
  };
  const watchlistCandidate = {
    tokenAddress: "0x5f0e1d2c3b4a69788766554433221100aabbccdd",
    venueUrl: "https://four.meme/en/token/0x5f0e1d2c3b4a69788766554433221100aabbccdd",
    symbol: "WATCH",
    name: "Watchlist Only",
    createdAt: "2026-06-18T01:15:00.000Z",
    marketCapUsd: 52_000,
    volume24hUsd: 210_000,
    volume4hUsd: 41_000,
    priceUsd: 0.00052,
    holders: 42,
    bondingProgress: 22,
    graduated: false,
    launchStage: "new" as const,
    discoveryFeeds: ["hot" as const],
    selectionBucket: "mediumRisk" as const,
    categoryScore: 55,
  };

  return {
    asOf: AS_OF,
    dataQuality: {
      freshness: [
        {
          expectedCadence: "Fixture snapshot pinned for deterministic replay; live demo uses Four.Meme meme-api.",
          retrievedAt: AS_OF,
          sourceObservedAt: AS_OF,
        },
      ],
      providerErrors: [],
      status: "complete",
      summary: "Deterministic Four.Meme discovery fixture for judge replay; not a live venue claim.",
    },
    sourceBaseUrl: "fixture://fourmeme-proposed",
    sourceEndpoints: [
      "fixture://fourmeme-proposed/new-launches",
      "fixture://fourmeme-proposed/volume-leaders",
      "fixture://fourmeme-proposed/hot",
      "fixture://fourmeme-proposed/dex-migrated",
    ],
    venue: "fourmeme",
    feedCounts: {
      newLaunches: 1,
      volumeLeaders: 2,
      hot: 2,
      dexMigrated: 1,
    },
    safe2apeCandidates: [safeCandidate],
    mediumRiskCandidates: [watchlistCandidate],
    gemHuntCandidates: [gemCandidate],
    selectedCandidates: [safeCandidate, watchlistCandidate, gemCandidate],
  };
}

function createOnchainEnrichmentFixture(
  asOf: string,
  candidates: FourMemeCandidate[],
): FourMemeOnchainEnrichmentSnapshot {
  return {
    asOf,
    candidates: candidates.map((candidate) => createOnchainCandidateReview(candidate, asOf)),
    dataQuality: {
      freshness: [
        {
          expectedCadence: "Fixture snapshot pinned for deterministic replay; live CMC Skills Marketplace calls should be timestamped per candidate contract.",
          retrievedAt: asOf,
          sourceObservedAt: asOf,
        },
      ],
      providerErrors: [],
      status: "complete",
      summary: "Deterministic CMC Skills Marketplace on-chain enrichment fixture for shortlisted Four.Meme contracts; not a live on-chain claim.",
    },
    skillExecution: {
      mode: "recorded",
      reason: "Replay fixture records the expected output contract for curated CMC Skills Marketplace on-chain enrichment; it is not a live cloud execution claim.",
      sourceUrl: "https://coinmarketcap.com/api/skills-marketplace/",
      status: "matched",
    },
    skills: [
      "score_holder_concentration_risk",
      "review_dex_wallet_activity_profile",
      "review_dex_wallet_pnl",
    ],
    source: "cmc-skills-marketplace-fixture",
    summary:
      "Applied curated on-chain skill outputs after Four.Meme shortlist: holder concentration as a hard risk gate, DEX wallet activity as entry quality, and wallet PnL as advisory confidence only.",
  };
}

function createOnchainCandidateReview(
  candidate: FourMemeCandidate,
  observedAt: string,
): FourMemeOnchainCandidateReview {
  if (candidate.symbol === "WATCH") {
    return {
      addressProvenance: "deterministic-fixture-address",
      aggregateRisk: "high",
      eligibleForEntry: false,
      positionSizeMultiplier: 0,
      reviews: [
        {
          metrics: {
            top10HolderPct: 72.4,
            uniqueHolderCount: 42,
          },
          observedAt,
          role: "hard-risk-gate",
          skillId: "score_holder_concentration_risk",
          status: "failed",
          summary: "Top-holder concentration is too high for active entry; keep watchlist-only.",
        },
        {
          metrics: {
            activeWallets4h: 18,
            buySellRatio4h: 0.41,
            clusterDominancePct: 63.2,
          },
          observedAt,
          role: "entry-quality-gate",
          skillId: "review_dex_wallet_activity_profile",
          status: "warning",
          summary: "Wallet flow is narrow and seller-heavy, so activity is not enough to override concentration risk.",
        },
        {
          metrics: {
            profitableWalletSharePct: 18.2,
            realizedPnlUsd: -7400,
          },
          observedAt,
          role: "advisory-confidence",
          skillId: "review_dex_wallet_pnl",
          status: "warning",
          summary: "Wallet PnL is weak and remains advisory only.",
        },
      ],
      symbol: candidate.symbol,
      tokenAddress: candidate.tokenAddress,
    };
  }

  const isGem = candidate.symbol === "BNBMAX";
  return {
    addressProvenance: "deterministic-fixture-address",
    aggregateRisk: isGem ? "medium" : "low",
    eligibleForEntry: true,
    positionSizeMultiplier: isGem ? 0.75 : 1,
    reviews: [
      {
        metrics: {
          top10HolderPct: isGem ? 34.8 : 24.6,
          uniqueHolderCount: candidate.holders ?? 0,
        },
        observedAt,
        role: "hard-risk-gate",
        skillId: "score_holder_concentration_risk",
        status: isGem ? "warning" : "passed",
        summary: isGem
          ? "Holder concentration is elevated but below the hard rejection threshold; reduce size."
          : "Holder concentration is acceptable for the fixture's launch-stage risk budget.",
      },
      {
        metrics: {
          activeWallets4h: isGem ? 124 : 76,
          buySellRatio4h: isGem ? 1.18 : 1.32,
          clusterDominancePct: isGem ? 28.5 : 19.7,
        },
        observedAt,
        role: "entry-quality-gate",
        skillId: "review_dex_wallet_activity_profile",
        status: "passed",
        summary: "DEX wallet activity is broad enough and not dominated by a single wallet cluster.",
      },
      {
        metrics: {
          profitableWalletSharePct: isGem ? 51.4 : 44.9,
          realizedPnlUsd: isGem ? 18400 : 6200,
        },
        observedAt,
        role: "advisory-confidence",
        skillId: "review_dex_wallet_pnl",
        status: "passed",
        summary: "Wallet PnL is supportive but used only as advisory confidence, not as a buy trigger.",
      },
    ],
    symbol: candidate.symbol,
    tokenAddress: candidate.tokenAddress,
  };
}

await main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
