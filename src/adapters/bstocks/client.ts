import { readFile } from "node:fs/promises";

import {
  buildCmcQuoteSourceUrl,
  createCmcDataProviderFromEnv,
  type CmcDataProvider,
  type CmcDataTransport,
} from "../cmc/client.js";

const BSTOCKS_UNIVERSE_PATH = new URL("../../../data/bstocks-universe.json", import.meta.url);

interface BstocksUniverseFile {
  version: string;
  issuer: "bStocks";
  venue: "pancakeswap-stocks";
  venueUrl: string;
  selectionUniverse: BstocksUniverseEntry[];
}

export interface BstocksUniverseEntry {
  cmcId: number;
  contractAddress: string;
  displayName: string;
  symbol: string;
}

export interface BstocksInstrumentSnapshot {
  cmcId: number;
  symbol: string;
  name: string;
  issuer: "bStocks";
  venue: "pancakeswap-stocks";
  venueUrl: string;
  cmcRank: number;
  priceUsd: number;
  volume24hUsd: number;
  percentChange1h: number;
  percentChange24h: number;
  percentChange7d: number;
  percentChange30d: number;
  marketCapUsd: number;
  observedAt: string;
}

export interface BstocksUniverseSnapshot {
  asOf: string;
  source: "coinmarketcap";
  transport: CmcDataTransport;
  universeVersion: string;
  issuer: "bStocks";
  venue: "pancakeswap-stocks";
  venueUrl: string;
  sourceBaseUrl: string;
  symbols: string[];
  candidateCount: number;
  candidates: BstocksInstrumentSnapshot[];
}

export async function readBstocksUniverseFile(): Promise<BstocksUniverseFile> {
  return JSON.parse(await readFile(BSTOCKS_UNIVERSE_PATH, "utf8")) as BstocksUniverseFile;
}

export class BstocksClient {
  constructor(private readonly cmcProvider: CmcDataProvider) {}

  async fetchUniverseSnapshot(): Promise<BstocksUniverseSnapshot> {
    const universeFile = await readBstocksUniverseFile();
    const selectionUniverse = universeFile.selectionUniverse;

    if (selectionUniverse.length === 0) {
      throw new Error("bStocks selection universe is empty");
    }

    const quoteIds = selectionUniverse.map((entry) => entry.cmcId);
    const quotes = await this.cmcProvider.fetchLatestQuotesByIds(quoteIds);
    const quotesById = new Map(quotes.map((quote) => [quote.id, quote] as const));
    const candidates = selectionUniverse
      .map((entry) => {
        const asset = quotesById.get(entry.cmcId);
        if (!asset) {
          return undefined;
        }

        return {
          cmcId: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          issuer: universeFile.issuer,
          venue: universeFile.venue,
          venueUrl: universeFile.venueUrl,
          cmcRank: asset.cmcRank,
          priceUsd: asset.priceUsd,
          volume24hUsd: asset.volume24hUsd,
          percentChange1h: asset.percentChange1h,
          percentChange24h: asset.percentChange24h,
          percentChange7d: asset.percentChange7d,
          percentChange30d: asset.percentChange30d,
          marketCapUsd: asset.marketCapUsd,
          observedAt: asset.observedAt,
        } satisfies BstocksInstrumentSnapshot;
      })
      .filter((candidate): candidate is BstocksInstrumentSnapshot => candidate !== undefined)
      .sort((left, right) => {
        if (right.percentChange24h !== left.percentChange24h) {
          return right.percentChange24h - left.percentChange24h;
        }

        return right.volume24hUsd - left.volume24hUsd;
      });

    const asOfCandidates = candidates.map((candidate) => candidate.observedAt).sort();

    return {
      asOf: asOfCandidates.at(-1) ?? new Date().toISOString(),
      source: "coinmarketcap",
      transport: this.cmcProvider.transport,
      universeVersion: universeFile.version,
      issuer: universeFile.issuer,
      venue: universeFile.venue,
      venueUrl: universeFile.venueUrl,
      sourceBaseUrl: buildCmcQuoteSourceUrl(this.cmcProvider.transport, quoteIds),
      symbols: selectionUniverse.map((entry) => entry.symbol),
      candidateCount: candidates.length,
      candidates,
    };
  }
}

export function createBstocksClient(cmcProvider: CmcDataProvider): BstocksClient {
  return new BstocksClient(cmcProvider);
}

export function createBstocksClientFromEnv(): BstocksClient {
  return new BstocksClient(createCmcDataProviderFromEnv());
}
