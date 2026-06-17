export type TokenInfoLane = "fourmeme" | "bstocks";

export interface TokenInfoNewsItem {
  title: string;
  source?: string;
  url?: string;
  publishedAt?: string;
}

export interface TokenInfoSourceRecord {
  name: string;
  observedAt: string;
  url?: string;
}

export interface TokenInfoDisplay {
  [key: string]: string | boolean | Record<string, string | null> | TokenInfoNewsItem[] | null;
}

export interface TokenInfoBaseSnapshot {
  version: string;
  lane: TokenInfoLane;
  contract: string;
  fetchedAt: string;
  source: "coinmarketcap+fourmeme" | "coinmarketcap+bstocks-allowlist";
  display: TokenInfoDisplay;
  raw: Record<string, unknown>;
  sources: TokenInfoSourceRecord[];
}

export interface FourMemeTokenInfoSnapshot extends TokenInfoBaseSnapshot {
  lane: "fourmeme";
  source: "coinmarketcap+fourmeme";
  display: {
    nameSymbol: string;
    priceUsd: string;
    volume24hUsd: string;
    totalHolders: string;
    marketCap: string;
    liquidity: string;
    bondedOrGraduated: boolean;
    bondingStatusRaw: string | null;
    cmcRank: string | null;
    cmcLink: string | null;
    creator: string | null;
    createdAtUtc: string | null;
    socials: {
      website: string | null;
      twitter: string | null;
      telegram: string | null;
    };
    latestNews: TokenInfoNewsItem[];
  };
  raw: {
    cmcId: number;
    name: string;
    symbol: string;
    priceUsd: number;
    volume24hUsd: number;
    totalHolders: number;
    marketCapUsd: number;
    liquidityUsd: number;
    bondedOrGraduated: boolean;
    bondingStatusRaw: string | null;
    cmcRank: number | null;
    cmcLink: string | null;
    creator: string | null;
    createdAt: string | null;
    latestNews: TokenInfoNewsItem[];
    missingCmcApiKey?: boolean;
  };
}

export interface BstocksTokenInfoSnapshot extends TokenInfoBaseSnapshot {
  lane: "bstocks";
  source: "coinmarketcap+bstocks-allowlist";
  display: {
    nameSymbol: string;
    description: string | null;
    price: string;
    percentChange24h: string;
    volume24h: string;
    cmcRank: string | null;
    cmcLink: string | null;
    latestNews: TokenInfoNewsItem[];
  };
  raw: {
    cmcId: number;
    name: string;
    symbol: string;
    description: string | null;
    priceUsd: number;
    percentChange24h: number;
    volume24hUsd: number;
    cmcRank: number | null;
    cmcLink: string | null;
    latestNews: TokenInfoNewsItem[];
    missingCmcApiKey?: boolean;
  };
}

export type TokenInfoSnapshot = FourMemeTokenInfoSnapshot | BstocksTokenInfoSnapshot;
