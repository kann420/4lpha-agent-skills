import assert from "node:assert/strict";

import type { BstocksUniverseSnapshot } from "../src/adapters/bstocks/client.js";
import type { CmcMarketContext } from "../src/adapters/cmc/client.js";
import { applyBstocksStrategyBrainReview } from "../src/brain/review-bstocks-strategy.js";
import { generateBstocksDraftStrategySpec } from "../src/strategy/bstocks/generate-bstocks-strategy.js";
import type { BstocksTokenInfoSnapshot } from "../src/types/token-info.js";

const AS_OF = "2026-06-16T10:39:04.000Z";

async function main(): Promise<void> {
  await testWeakFearGreedBlocksSingleAgent();
  await testWeakFearGreedBlocksMultiAgent();
  await testHealthyRegimeApprovesMultiAgent();

  console.log("bStocks brain smoke tests passed.");
}

async function testWeakFearGreedBlocksSingleAgent(): Promise<void> {
  const marketContext = createMarketContext({ fearGreed: 25 });
  const bstocksSnapshot = createBstocksSnapshot();
  const draftStrategySpec = generateBstocksDraftStrategySpec(marketContext, bstocksSnapshot);
  const reviewedStrategySpec = await applyBstocksStrategyBrainReview({
    bstocksTokenInfo: createBstocksTokenInfo(),
    marketContext,
    bstocksSnapshot,
    draftStrategySpec,
    options: {
      mode: "single-agent",
      provider: "local-rules",
    },
  });

  assert.equal(draftStrategySpec.status, "proposed");
  assert.equal(reviewedStrategySpec.status, "rejected");
  assert.equal(reviewedStrategySpec.brainReview.finalVerdict, "wait");
  assert.equal(reviewedStrategySpec.brainReview.agents.length, 1);
  assert.equal(reviewedStrategySpec.brainReview.agents[0]?.role, "strategy");
}

async function testWeakFearGreedBlocksMultiAgent(): Promise<void> {
  const marketContext = createMarketContext({ fearGreed: 25 });
  const bstocksSnapshot = createBstocksSnapshot();
  const draftStrategySpec = generateBstocksDraftStrategySpec(marketContext, bstocksSnapshot);
  const reviewedStrategySpec = await applyBstocksStrategyBrainReview({
    marketContext,
    bstocksSnapshot,
    draftStrategySpec,
    options: {
      mode: "multi-agent",
      provider: "local-rules",
    },
  });

  assert.equal(draftStrategySpec.status, "proposed");
  assert.equal(reviewedStrategySpec.status, "rejected");
  assert.equal(reviewedStrategySpec.brainReview.finalVerdict, "wait");
  assert.deepEqual(
    reviewedStrategySpec.brainReview.agents.map((agent) => agent.role),
    ["safety"],
  );
}

async function testHealthyRegimeApprovesMultiAgent(): Promise<void> {
  const marketContext = createMarketContext({
    fearGreed: 67,
    marketCapChange24hPct: 2.1,
    bnbChange24hPct: 1.2,
  });
  const bstocksSnapshot = createBstocksSnapshot({
    candidates: [
      createCandidate({
        cmcId: 40212,
        symbol: "MUB",
        percentChange24h: 7.2,
        percentChange7d: 19.4,
        volume24hUsd: 2_100_000,
      }),
      createCandidate({
        cmcId: 40216,
        symbol: "SNDKB",
        percentChange24h: 4.8,
        percentChange7d: 16.1,
        volume24hUsd: 1_950_000,
      }),
      createCandidate({
        cmcId: 40213,
        symbol: "CRCLB",
        percentChange24h: 3.5,
        percentChange7d: 9.6,
        volume24hUsd: 2_400_000,
      }),
      createCandidate({
        cmcId: 40215,
        symbol: "NVDAB",
        percentChange24h: 1.1,
        percentChange7d: 4.4,
        volume24hUsd: 1_600_000,
      }),
      createCandidate({
        cmcId: 40214,
        symbol: "TSLAB",
        percentChange24h: 0.3,
        percentChange7d: 3.1,
        volume24hUsd: 1_450_000,
      }),
    ],
  });
  const draftStrategySpec = generateBstocksDraftStrategySpec(marketContext, bstocksSnapshot);
  const reviewedStrategySpec = await applyBstocksStrategyBrainReview({
    marketContext,
    bstocksSnapshot,
    draftStrategySpec,
    options: {
      mode: "multi-agent",
      provider: "local-rules",
    },
  });

  assert.equal(draftStrategySpec.status, "proposed");
  assert.equal(reviewedStrategySpec.status, "proposed");
  assert.equal(reviewedStrategySpec.brainReview.finalVerdict, "approve");
  assert.deepEqual(
    reviewedStrategySpec.brainReview.agents.map((agent) => agent.role),
    ["safety", "market-analysis", "gatekeeper"],
  );
  assert.doesNotMatch(
    JSON.stringify(reviewedStrategySpec.brainReview),
    /Safe 2 Ape|Gem Hunt|fourmeme-discovery-bucket/u,
  );
}

function createMarketContext(overrides: {
  fearGreed?: number;
  marketCapChange24hPct?: number;
  bnbChange24hPct?: number;
} = {}): CmcMarketContext {
  const fearGreed = overrides.fearGreed ?? 55;

  return {
    asOf: AS_OF,
    dataQuality: createFixtureDataQuality(),
    source: "coinmarketcap",
    transport: "rest",
    global: {
      totalMarketCapUsd: 3_520_000_000_000,
      totalVolume24hUsd: 121_000_000_000,
      totalMarketCapChange24hPct: overrides.marketCapChange24hPct ?? 1.4,
      btcDominancePct: 53.2,
      btcDominanceChange24hPct: 0.1,
      ethDominancePct: 17.8,
      observedAt: AS_OF,
    },
    fearGreed: {
      value: fearGreed,
      classification: fearGreed >= 55 ? "Greed" : fearGreed >= 45 ? "Neutral" : "Fear",
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
      percentChange24h: overrides.bnbChange24hPct ?? 0.5,
      percentChange7d: 2.9,
      percentChange30d: 8.4,
      marketCapUsd: 95_000_000_000,
      marketCapDominancePct: 3.2,
      observedAt: AS_OF,
    },
  };
}

function createBstocksSnapshot(overrides: {
  candidates?: BstocksUniverseSnapshot["candidates"];
} = {}): BstocksUniverseSnapshot {
  const candidates = overrides.candidates ?? [
    createCandidate({
      cmcId: 40212,
      symbol: "MUB",
      percentChange24h: 6.5,
      percentChange7d: 23.0,
      volume24hUsd: 1_830_000,
    }),
    createCandidate({
      cmcId: 40216,
      symbol: "SNDKB",
      percentChange24h: 3.4,
      percentChange7d: 18.3,
      volume24hUsd: 2_040_000,
    }),
    createCandidate({
      cmcId: 40213,
      symbol: "CRCLB",
      percentChange24h: 3.2,
      percentChange7d: 0.7,
      volume24hUsd: 2_850_000,
    }),
    createCandidate({
      cmcId: 40215,
      symbol: "NVDAB",
      percentChange24h: 1.0,
      percentChange7d: 4.4,
      volume24hUsd: 1_280_000,
    }),
    createCandidate({
      cmcId: 40214,
      symbol: "TSLAB",
      percentChange24h: -1.3,
      percentChange7d: 2.9,
      volume24hUsd: 2_760_000,
    }),
  ];

  return {
    asOf: AS_OF,
    dataQuality: createFixtureDataQuality(),
    source: "coinmarketcap",
    transport: "rest",
    universeVersion: "0.1.0",
    issuer: "bStocks",
    venue: "pancakeswap-stocks",
    venueUrl: "https://pancakeswap.finance/stocks",
    sourceBaseUrl: "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest",
    symbols: candidates.map((candidate) => candidate.symbol),
    candidateCount: candidates.length,
    candidates,
  };
}

function createCandidate(input: {
  cmcId: number;
  symbol: string;
  percentChange24h: number;
  percentChange7d: number;
  volume24hUsd: number;
}): BstocksUniverseSnapshot["candidates"][number] {
  return {
    cmcId: input.cmcId,
    symbol: input.symbol,
    name: input.symbol,
    issuer: "bStocks",
    venue: "pancakeswap-stocks",
    venueUrl: "https://pancakeswap.finance/stocks",
    cmcRank: 999,
    priceUsd: 100 + input.cmcId / 1000,
    volume24hUsd: input.volume24hUsd,
    percentChange1h: 0.3,
    percentChange24h: input.percentChange24h,
    percentChange7d: input.percentChange7d,
    percentChange30d: input.percentChange7d * 1.5,
    marketCapUsd: 5_000_000_000 + input.cmcId,
    observedAt: AS_OF,
  };
}

function createBstocksTokenInfo(): BstocksTokenInfoSnapshot {
  return {
    version: "0.1.0",
    lane: "bstocks",
    contract: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
    fetchedAt: AS_OF,
    source: "coinmarketcap+bstocks-allowlist",
    display: {
      nameSymbol: "NVIDIA Tokenized bStocks/NVDAB",
      description: "Tokenized bStocks fixture.",
      price: "~$209.69",
      percentChange24h: "+0.27%",
      volume24h: "~$1.129M",
      cmcRank: "#1407",
      cmcLink: "https://coinmarketcap.com/currencies/nvidia-tokenized-bstocks/",
      latestNews: [],
    },
    raw: {
      cmcId: 40215,
      name: "NVIDIA Tokenized bStocks",
      symbol: "NVDAB",
      description: "Tokenized bStocks fixture.",
      priceUsd: 209.69,
      percentChange24h: 0.27,
      volume24hUsd: 1_129_000,
      cmcRank: 1407,
      cmcLink: "https://coinmarketcap.com/currencies/nvidia-tokenized-bstocks/",
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
