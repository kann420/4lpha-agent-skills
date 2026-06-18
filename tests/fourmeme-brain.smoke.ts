import assert from "node:assert/strict";

import type { CmcMarketContext } from "../src/adapters/cmc/client.js";
import type { FourMemeDiscoverySnapshot } from "../src/adapters/fourmeme/client.js";
import { applyStrategyBrainReview } from "../src/brain/review-strategy.js";
import { generateCmcMarketStrategySpec } from "../src/strategy/generate-cmc-market-strategy.js";
import type { FourMemeTokenInfoSnapshot } from "../src/types/token-info.js";

const AS_OF = "2026-06-16T10:39:04.000Z";
const TOKEN_ADDRESS = "0x0a43fc31a73013089df59194872ecae4cae14444";

async function main(): Promise<void> {
  await testSingleAgentAcceptsTokenInfo();
  await testMultiAgentAcceptsTokenInfo();

  console.log("Four.Meme brain smoke tests passed.");
}

async function testSingleAgentAcceptsTokenInfo(): Promise<void> {
  const marketContext = createMarketContext();
  const fourMemeSnapshot = createFourMemeSnapshot();
  const strategySpec = generateCmcMarketStrategySpec(marketContext, fourMemeSnapshot);
  const reviewed = await applyStrategyBrainReview({
    fourMemeTokenInfo: createTokenInfo(),
    fourMemeSnapshot,
    marketContext,
    options: {
      mode: "single-agent",
      provider: "local-rules",
    },
    strategySpec,
  });

  assert.equal(reviewed.brainReview.agents.length, 1);
  assert.equal(reviewed.brainReview.agents[0]?.role, "strategy");
}

async function testMultiAgentAcceptsTokenInfo(): Promise<void> {
  const marketContext = createMarketContext();
  const fourMemeSnapshot = createFourMemeSnapshot();
  const strategySpec = generateCmcMarketStrategySpec(marketContext, fourMemeSnapshot);
  const reviewed = await applyStrategyBrainReview({
    fourMemeTokenInfo: createTokenInfo(),
    fourMemeSnapshot,
    marketContext,
    options: {
      mode: "multi-agent",
      provider: "local-rules",
    },
    strategySpec,
  });

  assert.deepEqual(
    reviewed.brainReview.agents.map((agent) => agent.role),
    ["safety", "social", "gatekeeper"],
  );
}

function createMarketContext(): CmcMarketContext {
  return {
    asOf: AS_OF,
    dataQuality: createFixtureDataQuality(),
    source: "coinmarketcap",
    transport: "rest",
    global: {
      totalMarketCapUsd: 3_520_000_000_000,
      totalVolume24hUsd: 121_000_000_000,
      totalMarketCapChange24hPct: 1.4,
      btcDominancePct: 53.2,
      btcDominanceChange24hPct: 0.1,
      ethDominancePct: 17.8,
      observedAt: AS_OF,
    },
    fearGreed: {
      value: 67,
      classification: "Greed",
      observedAt: AS_OF,
    },
    bnb: {
      assetId: 1839,
      name: "BNB",
      symbol: "BNB",
      cmcRank: 5,
      priceUsd: 652.4,
      volume24hUsd: 1_780_000_000,
      percentChange1h: 0.2,
      percentChange24h: 1.2,
      percentChange7d: 3.1,
      percentChange30d: 8.4,
      marketCapUsd: 95_000_000_000,
      marketCapDominancePct: 3.2,
      observedAt: AS_OF,
    },
  };
}

function createFourMemeSnapshot(): FourMemeDiscoverySnapshot {
  const candidate = {
    tokenAddress: TOKEN_ADDRESS,
    venueUrl: `https://four.meme/en/token/${TOKEN_ADDRESS}`,
    symbol: "4",
    name: "4",
    createdAt: "2025-10-01T04:06:40.000Z",
    marketCapUsd: 8_940_000,
    volume24hUsd: 4_630_000,
    volume4hUsd: 400_000,
    priceUsd: 0.00894,
    holders: 41_689,
    bondingProgress: 100,
    graduated: true,
    launchStage: "migrated" as const,
    discoveryFeeds: ["dexMigrated" as const],
    selectionBucket: "gemHunt" as const,
    categoryScore: 88,
  };

  return {
    asOf: AS_OF,
    dataQuality: createFixtureDataQuality(),
    sourceBaseUrl: "https://four.meme/meme-api/v1",
    sourceEndpoints: ["https://four.meme/meme-api/v1/public/token/ranking"],
    venue: "fourmeme",
    feedCounts: {
      newLaunches: 1,
      volumeLeaders: 1,
      hot: 1,
      dexMigrated: 1,
    },
    safe2apeCandidates: [],
    mediumRiskCandidates: [],
    gemHuntCandidates: [candidate],
    selectedCandidates: [candidate],
  };
}

function createTokenInfo(): FourMemeTokenInfoSnapshot {
  return {
    version: "0.1.0",
    lane: "fourmeme",
    contract: TOKEN_ADDRESS,
    fetchedAt: AS_OF,
    source: "coinmarketcap+fourmeme",
    display: {
      nameSymbol: "4/4",
      priceUsd: "~$0.00894",
      volume24hUsd: "~$4.63M",
      totalHolders: "41,689",
      marketCap: "~$8.94M",
      liquidity: "~$984.64K",
      bondedOrGraduated: true,
      bondingStatusRaw: "TRADE",
      cmcRank: "#1023",
      cmcLink: "https://coinmarketcap.com/currencies/4four/",
      creator: "0x5511b9cba5f6a01f7685236393faca4415777f3d",
      createdAtUtc: "2025/10/01 04:06:40 UTC",
      socials: {
        website: null,
        twitter: "https://twitter.com/4onbsc",
        telegram: "https://t.me/ticker4",
      },
      latestNews: [],
    },
    raw: {
      cmcId: 38557,
      name: "4",
      symbol: "4",
      priceUsd: 0.00894,
      volume24hUsd: 4_630_000,
      totalHolders: 41_689,
      marketCapUsd: 8_940_000,
      liquidityUsd: 984_640,
      bondedOrGraduated: true,
      bondingStatusRaw: "TRADE",
      cmcRank: 1023,
      cmcLink: "https://coinmarketcap.com/currencies/4four/",
      creator: "0x5511b9cba5f6a01f7685236393faca4415777f3d",
      createdAt: "2025/10/01 04:06:40 UTC",
      latestNews: [],
    },
    sources: [
      {
        name: "fixture",
        observedAt: AS_OF,
      },
    ],
  };
}

function createFixtureDataQuality() {
  return {
    freshness: [],
    providerErrors: [],
    status: "complete" as const,
    summary: "Fixture data for deterministic smoke testing.",
  };
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
