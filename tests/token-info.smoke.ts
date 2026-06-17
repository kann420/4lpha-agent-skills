import assert from "node:assert/strict";

import { loadRepoEnv } from "../src/adapters/cmc/client.js";
import {
  fetchBstocksTokenInfo,
  fetchFourMemeTokenInfo,
} from "../src/adapters/token-info/client.js";
import { validateTokenInfoSnapshot } from "../src/output/validate-token-info-snapshot.js";
import type { BstocksTokenInfoSnapshot } from "../src/types/token-info.js";

const FOURMEME_CONTRACT = "0x0a43fc31a73013089df59194872ecae4cae14444";
const BSTOCKS_CONTRACT = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";
const UNKNOWN_BSTOCKS_CONTRACT = "0x0000000000000000000000000000000000000001";

async function main(): Promise<void> {
  await testBstocksUnknownContractRejects();
  await testEmptyNewsSnapshotValidates();

  loadRepoEnv();
  if (!process.env.CMC_MCP_API_KEY?.trim() && !process.env.CMC_API_KEY?.trim()) {
    console.log("Skipping live token-info fetch tests because CMC_MCP_API_KEY/CMC_API_KEY is not configured.");
    return;
  }

  await testFourMemeFetchValidates();
  await testBstocksFetchValidates();

  console.log("token info smoke tests passed.");
}

async function testBstocksUnknownContractRejects(): Promise<void> {
  await assert.rejects(
    () => fetchBstocksTokenInfo(UNKNOWN_BSTOCKS_CONTRACT),
    /Unsupported bStocks contract/u,
  );
}

async function testEmptyNewsSnapshotValidates(): Promise<void> {
  const snapshot: BstocksTokenInfoSnapshot = {
    version: "0.1.0",
    lane: "bstocks",
    contract: BSTOCKS_CONTRACT,
    fetchedAt: "2026-06-16T13:59:29.834Z",
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
        observedAt: "2026-06-16T13:59:29.834Z",
      },
    ],
  };

  await validateTokenInfoSnapshot(snapshot);
  assert.deepEqual(snapshot.display.latestNews, []);
}

async function testFourMemeFetchValidates(): Promise<void> {
  const snapshot = await fetchFourMemeTokenInfo(FOURMEME_CONTRACT);
  await validateTokenInfoSnapshot(snapshot);

  assert.equal(snapshot.lane, "fourmeme");
  assert.equal(snapshot.contract, FOURMEME_CONTRACT);
  assert.match(snapshot.display.nameSymbol, /\//u);
}

async function testBstocksFetchValidates(): Promise<void> {
  const snapshot = await fetchBstocksTokenInfo(BSTOCKS_CONTRACT);
  await validateTokenInfoSnapshot(snapshot);

  assert.equal(snapshot.lane, "bstocks");
  assert.equal(snapshot.contract, BSTOCKS_CONTRACT);
  assert.equal(snapshot.raw.cmcId, 40215);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
