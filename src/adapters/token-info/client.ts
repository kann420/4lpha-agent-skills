import {
  CMC_DOC_URLS,
  loadRepoEnv,
} from "../cmc/client.js";
import { readBstocksUniverseFile } from "../bstocks/client.js";
import type { BstocksUniverseEntry } from "../bstocks/client.js";
import type {
  BstocksTokenInfoSnapshot,
  FourMemeTokenInfoSnapshot,
  TokenInfoNewsItem,
  TokenInfoSnapshot,
} from "../../types/token-info.js";

const TOKEN_INFO_VERSION = "0.1.0";
const CMC_PUBLIC_TRIAL_BASE_URL = "https://pro-api.coinmarketcap.com/trial-pro-api";
const FOUR_MEME_API_BASE = "https://four.meme/meme-api/v1";
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const REQUIRES_CMC_API_KEY = "Requires CMC API key";

interface CmcMcpToolCallResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: {
    content: Array<{
      type: string;
      text?: string;
    }>;
    isError?: boolean;
  };
  error?: {
    code: number;
    message: string;
  };
}

interface CmcDexSearchResponse {
  data?: {
    total?: number;
    tks?: CmcDexToken[];
  };
}

interface CmcDexToken {
  addr?: string;
  cid?: number;
  liq?: number | string;
  mc?: number | string;
  n?: string;
  pc24h?: number | string;
  plt?: string;
  pu?: number | string;
  s?: string;
  ts?: string;
  ut24h?: string | number;
  v24h?: number | string;
}

interface CmcInfoPayload {
  date_added?: string;
  description?: string;
  id?: number;
  logo?: string;
  name?: string;
  platform?: {
    token_address?: string;
  };
  slug?: string;
  symbol?: string;
  urls?: {
    chat?: string[];
    explorer?: string[];
    twitter?: string[];
    website?: string[];
  };
}

interface CmcMetricsPayload {
  coinMarketCapCryptoTotalHolderData?: {
    latestCryptoTotalHolderCount?: number;
  };
}

interface FourMemeDetailResponse {
  code?: number | string;
  msg?: string;
  data?: FourMemeDetailPayload;
}

interface FourMemeDetailPayload {
  address?: string;
  createDate?: string | number;
  launchTime?: string | number;
  name?: string;
  shortName?: string;
  status?: string;
  telegramUrl?: string;
  tokenPrice?: {
    liquidity?: string | number;
    marketCap?: string | number;
    price?: string | number;
    tradingUsd?: string | number;
  };
  twitterUrl?: string;
  userAddress?: string;
  webUrl?: string;
}

type CmcQuotePayload = CmcQuoteObject[] | {
  headers: string[];
  rows: unknown[][];
};

interface CmcQuoteObject {
  id: string | number;
  last_updated_time?: string;
  market_cap?: string | number;
  name: string;
  percent_change_24h?: string | number;
  price: string | number;
  rank: string | number;
  slug: string;
  symbol: string;
  volume_24h: string | number;
}

export interface FetchTokenInfoInput {
  contract: string;
  lane: "fourmeme" | "bstocks";
}

export async function fetchTokenInfoSnapshot(input: FetchTokenInfoInput): Promise<TokenInfoSnapshot> {
  const contract = normalizeEvmAddress(input.contract);

  if (input.lane === "fourmeme") {
    return fetchFourMemeTokenInfo(contract);
  }

  return fetchBstocksTokenInfo(contract);
}

export async function fetchFourMemeTokenInfo(contract: string): Promise<FourMemeTokenInfoSnapshot> {
  const normalizedContract = normalizeEvmAddress(contract);
  const [dexToken, fourMemeDetail] = await Promise.all([
    fetchCmcDexTokenByContract(normalizedContract),
    fetchFourMemeDetail(normalizedContract),
  ]);
  const cmcApiKey = readOptionalCmcMcpApiKey();
  if (!cmcApiKey) {
    return buildLimitedFourMemeTokenInfo(normalizedContract, dexToken, fourMemeDetail);
  }

  const cmcClient = new CmcTokenInfoClient(cmcApiKey);
  const cmcId = readRequiredNumber(dexToken.cid, "CMC DEX search did not return a CMC id for the Four.Meme contract");
  const [quote, infoPayload, metrics, news] = await Promise.all([
    cmcClient.fetchQuoteById(cmcId),
    cmcClient.fetchInfoById(cmcId),
    cmcClient.fetchMetricsById(cmcId),
    cmcClient.fetchLatestNewsById(cmcId),
  ]).catch(() => {
    return [
      null,
      null,
      null,
      null,
    ] as const;
  });

  if (!quote || !infoPayload || !metrics) {
    return buildLimitedFourMemeTokenInfo(normalizedContract, dexToken, fourMemeDetail);
  }

  const info = readFirstInfo(infoPayload, cmcId);
  const fetchedAt = new Date().toISOString();
  const name = quote.name || info.name || fourMemeDetail?.name || dexToken.n || "unknown";
  const symbol = quote.symbol || info.symbol || fourMemeDetail?.shortName || dexToken.s || "unknown";
  const liquidityUsd = readNumber(dexToken.liq) || readNumber(fourMemeDetail?.tokenPrice?.liquidity);
  const status = fourMemeDetail?.status ?? null;
  const bondedOrGraduated = status === "TRADE" || status === "DEX";
  const createdAt = formatUtcTimestamp(fourMemeDetail?.createDate ?? fourMemeDetail?.launchTime ?? info.date_added);
  const cmcLink = buildCmcLink(info.slug || quote.slug);
  const latestNews = normalizeNews(news);
  const holderCount = readNumber(metrics.coinMarketCapCryptoTotalHolderData?.latestCryptoTotalHolderCount);
  const priceUsd = readNumber(quote.price);
  const volume24hUsd = readNumber(quote.volume_24h);
  const marketCapUsd = readNumber(quote.market_cap) || readNumber(dexToken.mc);
  const cmcRank = readNullableInteger(quote.rank);

  return {
    version: TOKEN_INFO_VERSION,
    lane: "fourmeme",
    contract: normalizedContract,
    fetchedAt,
    source: "coinmarketcap+fourmeme",
    display: {
      nameSymbol: `${name}/${symbol}`,
      priceUsd: formatUsd(priceUsd),
      volume24hUsd: formatUsd(volume24hUsd),
      totalHolders: holderCount.toLocaleString("en-US"),
      marketCap: formatUsd(marketCapUsd),
      liquidity: formatUsd(liquidityUsd),
      bondedOrGraduated,
      bondingStatusRaw: status,
      cmcRank: cmcRank ? `#${cmcRank}` : null,
      cmcLink,
      creator: fourMemeDetail?.userAddress ?? null,
      createdAtUtc: createdAt,
      socials: {
        website: firstUrl(info.urls?.website) ?? null,
        twitter: firstUrl(info.urls?.twitter) ?? fourMemeDetail?.twitterUrl ?? null,
        telegram: firstUrl(info.urls?.chat) ?? fourMemeDetail?.telegramUrl ?? null,
      },
      latestNews,
    },
    raw: {
      cmcId,
      name,
      symbol,
      priceUsd,
      volume24hUsd,
      totalHolders: holderCount,
      marketCapUsd,
      liquidityUsd,
      bondedOrGraduated,
      bondingStatusRaw: status,
      cmcRank,
      cmcLink,
      creator: fourMemeDetail?.userAddress ?? null,
      createdAt,
      latestNews,
    },
    sources: [
      {
        name: "CoinMarketCap MCP quotes/latest",
        observedAt: normalizeObservedAt(quote.last_updated_time, fetchedAt),
        url: `${CMC_DOC_URLS.mcpEndpoint}#tool=get_crypto_quotes_latest&id=${cmcId}`,
      },
      {
        name: "CoinMarketCap public DEX search",
        observedAt: normalizeDexObservedAt(dexToken.ts, fetchedAt),
        url: `${CMC_PUBLIC_TRIAL_BASE_URL}/v1/dex/search?q=${normalizedContract}`,
      },
      {
        name: "Four.Meme token detail",
        observedAt: fetchedAt,
        url: `${FOUR_MEME_API_BASE}/private/token/get/v2?address=${normalizedContract}`,
      },
    ],
  };
}

export async function fetchBstocksTokenInfo(contract: string): Promise<BstocksTokenInfoSnapshot> {
  const normalizedContract = normalizeEvmAddress(contract);
  const universe = await readBstocksUniverseFile();
  const entry = universe.selectionUniverse.find(
    (candidate) => candidate.contractAddress.toLowerCase() === normalizedContract,
  );

  if (!entry) {
    throw new Error(`Unsupported bStocks contract. This lane only accepts the committed six-symbol bStocks allowlist.`);
  }

  const cmcApiKey = readOptionalCmcMcpApiKey();
  if (!cmcApiKey) {
    return buildLimitedBstocksTokenInfo(normalizedContract, entry);
  }

  const cmcClient = new CmcTokenInfoClient(cmcApiKey);
  const [quote, infoPayload, news] = await Promise.all([
    cmcClient.fetchQuoteById(entry.cmcId),
    cmcClient.fetchInfoById(entry.cmcId),
    cmcClient.fetchLatestNewsById(entry.cmcId),
  ]).catch(() => {
    return [
      null,
      null,
      null,
    ] as const;
  });

  if (!quote || !infoPayload) {
    return buildLimitedBstocksTokenInfo(normalizedContract, entry);
  }

  const info = readFirstInfo(infoPayload, entry.cmcId);
  const fetchedAt = new Date().toISOString();
  const name = quote.name || info.name || entry.displayName;
  const symbol = quote.symbol || info.symbol || entry.symbol;
  const description = normalizeDescription(info.description);
  const priceUsd = readNumber(quote.price);
  const percentChange24h = readNumber(quote.percent_change_24h);
  const volume24hUsd = readNumber(quote.volume_24h);
  const cmcRank = readNullableInteger(quote.rank);
  const cmcLink = buildCmcLink(info.slug || quote.slug);
  const latestNews = normalizeNews(news);

  return {
    version: TOKEN_INFO_VERSION,
    lane: "bstocks",
    contract: normalizedContract,
    fetchedAt,
    source: "coinmarketcap+bstocks-allowlist",
    display: {
      nameSymbol: `${name}/${symbol}`,
      description,
      price: formatUsd(priceUsd),
      percentChange24h: formatPercent(percentChange24h),
      volume24h: formatUsd(volume24hUsd, 3),
      cmcRank: cmcRank ? `#${cmcRank}` : null,
      cmcLink,
      latestNews,
    },
    raw: {
      cmcId: entry.cmcId,
      name,
      symbol,
      description,
      priceUsd,
      percentChange24h,
      volume24hUsd,
      cmcRank,
      cmcLink,
      latestNews,
    },
    sources: [
      {
        name: "bStocks committed allowlist",
        observedAt: fetchedAt,
      },
      {
        name: "CoinMarketCap MCP quotes/latest",
        observedAt: normalizeObservedAt(quote.last_updated_time, fetchedAt),
        url: `${CMC_DOC_URLS.mcpEndpoint}#tool=get_crypto_quotes_latest&id=${entry.cmcId}`,
      },
    ],
  };
}

class CmcTokenInfoClient {
  constructor(
    private readonly apiKey: string,
    private readonly endpoint: string = CMC_DOC_URLS.mcpEndpoint,
  ) {}

  async fetchQuoteById(id: number): Promise<CmcQuoteObject> {
    const payload = await this.callTool<CmcQuotePayload>("get_crypto_quotes_latest", {
      id: String(id),
    });
    const quote = resolveQuote(payload, id);
    if (!quote) {
      throw new Error(`CMC MCP quotes/latest did not return id ${id}`);
    }

    return quote;
  }

  async fetchInfoById(id: number): Promise<CmcInfoPayload[]> {
    return this.callTool<CmcInfoPayload[]>("get_crypto_info", {
      id: String(id),
    });
  }

  async fetchMetricsById(id: number): Promise<CmcMetricsPayload> {
    return this.callTool<CmcMetricsPayload>("get_crypto_metrics", {
      id: String(id),
    });
  }

  async fetchLatestNewsById(id: number): Promise<unknown> {
    return this.callTool<unknown>("get_crypto_latest_news", {
      id: String(id),
    });
  }

  private async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "X-CMC-MCP-API-KEY": this.apiKey,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name,
          arguments: args,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`CMC MCP request failed for ${name}: ${response.status} ${response.statusText} - ${body}`);
    }

    const body = await response.json() as CmcMcpToolCallResponse;

    if (body.error) {
      throw new Error(`CMC MCP tool ${name} failed: ${body.error.code} ${body.error.message}`);
    }

    if (!body.result || body.result.isError) {
      throw new Error(`CMC MCP tool ${name} returned an error or empty result`);
    }

    const textContent = body.result.content
      .filter((content) => content.type === "text" && typeof content.text === "string")
      .map((content) => content.text ?? "")
      .join("\n")
      .trim();

    if (!textContent) {
      throw new Error(`CMC MCP tool ${name} returned no text content`);
    }

    return JSON.parse(textContent) as T;
  }
}

function readOptionalCmcMcpApiKey(): string | null {
  loadRepoEnv();

  const apiKey = process.env.CMC_MCP_API_KEY?.trim() || process.env.CMC_API_KEY?.trim();
  return apiKey || null;
}

function buildLimitedFourMemeTokenInfo(
  contract: string,
  dexToken: CmcDexToken,
  fourMemeDetail: FourMemeDetailPayload | null,
): FourMemeTokenInfoSnapshot {
  const fetchedAt = new Date().toISOString();
  const name = fourMemeDetail?.name || dexToken.n || "unknown";
  const symbol = fourMemeDetail?.shortName || dexToken.s || "unknown";
  const liquidityUsd = readNumber(dexToken.liq) || readNumber(fourMemeDetail?.tokenPrice?.liquidity);
  const status = fourMemeDetail?.status ?? null;
  const bondedOrGraduated = status === "TRADE" || status === "DEX";
  const createdAt = formatUtcTimestamp(fourMemeDetail?.createDate ?? fourMemeDetail?.launchTime);
  const priceUsd = readNumber(fourMemeDetail?.tokenPrice?.price) || readNumber(dexToken.pu);
  const volume24hUsd = readNumber(dexToken.v24h) || readNumber(fourMemeDetail?.tokenPrice?.tradingUsd);
  const marketCapUsd = readNumber(fourMemeDetail?.tokenPrice?.marketCap) || readNumber(dexToken.mc);

  return {
    version: TOKEN_INFO_VERSION,
    lane: "fourmeme",
    contract,
    fetchedAt,
    source: "coinmarketcap+fourmeme",
    display: {
      nameSymbol: `${name}/${symbol}`,
      priceUsd: priceUsd > 0 ? formatUsd(priceUsd) : REQUIRES_CMC_API_KEY,
      volume24hUsd: volume24hUsd > 0 ? formatUsd(volume24hUsd) : REQUIRES_CMC_API_KEY,
      totalHolders: REQUIRES_CMC_API_KEY,
      marketCap: marketCapUsd > 0 ? formatUsd(marketCapUsd) : REQUIRES_CMC_API_KEY,
      liquidity: liquidityUsd > 0 ? formatUsd(liquidityUsd) : REQUIRES_CMC_API_KEY,
      bondedOrGraduated,
      bondingStatusRaw: status,
      cmcRank: null,
      cmcLink: null,
      creator: fourMemeDetail?.userAddress ?? null,
      createdAtUtc: createdAt,
      socials: {
        website: fourMemeDetail?.webUrl ?? null,
        twitter: fourMemeDetail?.twitterUrl ?? null,
        telegram: fourMemeDetail?.telegramUrl ?? null,
      },
      latestNews: [
        {
          title: REQUIRES_CMC_API_KEY,
          source: "CoinMarketCap",
        },
      ],
    },
    raw: {
      cmcId: readNumber(dexToken.cid),
      name,
      symbol,
      priceUsd,
      volume24hUsd,
      totalHolders: 0,
      marketCapUsd,
      liquidityUsd,
      bondedOrGraduated,
      bondingStatusRaw: status,
      cmcRank: null,
      cmcLink: null,
      creator: fourMemeDetail?.userAddress ?? null,
      createdAt,
      latestNews: [],
      missingCmcApiKey: true,
    },
    sources: [
      {
        name: "CoinMarketCap public DEX search",
        observedAt: normalizeDexObservedAt(dexToken.ts, fetchedAt),
        url: `${CMC_PUBLIC_TRIAL_BASE_URL}/v1/dex/search?q=${contract}`,
      },
      {
        name: "Four.Meme token detail",
        observedAt: fetchedAt,
        url: `${FOUR_MEME_API_BASE}/private/token/get/v2?address=${contract}`,
      },
      {
        name: "CoinMarketCap API key required for quotes, metrics, info, rank, and news",
        observedAt: fetchedAt,
      },
    ],
  };
}

function buildLimitedBstocksTokenInfo(
  contract: string,
  entry: BstocksUniverseEntry,
): BstocksTokenInfoSnapshot {
  const fetchedAt = new Date().toISOString();

  return {
    version: TOKEN_INFO_VERSION,
    lane: "bstocks",
    contract,
    fetchedAt,
    source: "coinmarketcap+bstocks-allowlist",
    display: {
      nameSymbol: `${entry.displayName}/${entry.symbol}`,
      description: REQUIRES_CMC_API_KEY,
      price: REQUIRES_CMC_API_KEY,
      percentChange24h: REQUIRES_CMC_API_KEY,
      volume24h: REQUIRES_CMC_API_KEY,
      cmcRank: null,
      cmcLink: null,
      latestNews: [
        {
          title: REQUIRES_CMC_API_KEY,
          source: "CoinMarketCap",
        },
      ],
    },
    raw: {
      cmcId: entry.cmcId,
      name: entry.displayName,
      symbol: entry.symbol,
      description: null,
      priceUsd: 0,
      percentChange24h: 0,
      volume24hUsd: 0,
      cmcRank: null,
      cmcLink: null,
      latestNews: [],
      missingCmcApiKey: true,
    },
    sources: [
      {
        name: "bStocks committed allowlist",
        observedAt: fetchedAt,
      },
      {
        name: "CoinMarketCap API key required for quotes, info, rank, and news",
        observedAt: fetchedAt,
      },
    ],
  };
}

async function fetchCmcDexTokenByContract(contract: string): Promise<CmcDexToken> {
  const payload = await requestJson<CmcDexSearchResponse>(
    `${CMC_PUBLIC_TRIAL_BASE_URL}/v1/dex/search?q=${contract}`,
  );
  const token = payload.data?.tks?.find((candidate) => candidate.addr?.toLowerCase() === contract);

  if (!token) {
    throw new Error(`CMC public DEX search did not resolve contract ${contract}`);
  }

  return token;
}

async function fetchFourMemeDetail(contract: string): Promise<FourMemeDetailPayload | null> {
  const payload = await requestJson<FourMemeDetailResponse>(
    `${FOUR_MEME_API_BASE}/private/token/get/v2?address=${contract}`,
  );

  return payload.data ?? null;
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token info request failed for ${url}: ${response.status} ${response.statusText} - ${body}`);
  }

  return response.json() as Promise<T>;
}

function normalizeEvmAddress(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!ADDRESS_RE.test(normalized)) {
    throw new Error("Invalid contract address. Expected a 0x-prefixed EVM address.");
  }

  return normalized;
}

function resolveQuote(payload: CmcQuotePayload, id: number): CmcQuoteObject | null {
  if (Array.isArray(payload)) {
    return payload.find((quote) => Number(quote.id) === id) ?? null;
  }

  const headers = payload.headers;
  const row = payload.rows.find((candidate) => Number(candidate[0]) === id);

  if (!row) {
    return null;
  }

  const record = Object.fromEntries(headers.map((header, index) => [header, row[index]]));
  return record as unknown as CmcQuoteObject;
}

function readFirstInfo(payload: CmcInfoPayload[], id: number): CmcInfoPayload {
  const info = payload.find((candidate) => Number(candidate.id) === id) ?? payload[0];
  if (!info) {
    throw new Error(`CMC MCP info did not return id ${id}`);
  }

  return info;
}

function normalizeNews(payload: unknown): TokenInfoNewsItem[] {
  const rows = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : isRecord(payload) && Array.isArray(payload.news)
        ? payload.news
        : [];

  return rows
    .map((entry): TokenInfoNewsItem | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const title = readOptionalString(entry.title) ?? readOptionalString(entry.headline) ?? readOptionalString(entry.name);
      if (!title) {
        return null;
      }

      return {
        title,
        source: readOptionalString(entry.source) ?? readOptionalString(entry.source_name) ?? readOptionalString(entry.publisher),
        url: readOptionalString(entry.url) ?? readOptionalString(entry.link),
        publishedAt:
          readOptionalString(entry.published_at) ??
          readOptionalString(entry.publishedAt) ??
          readOptionalString(entry.created_at) ??
          readOptionalString(entry.released_at),
      };
    })
    .filter((entry): entry is TokenInfoNewsItem => entry !== null)
    .slice(0, 5);
}

function readNumber(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function readRequiredNumber(value: unknown, errorMessage: string): number {
  const numeric = readNumber(value);
  if (numeric <= 0) {
    throw new Error(errorMessage);
  }

  return numeric;
}

function readNullableInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.round(numeric);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeDescription(value: unknown): string | null {
  const description = readOptionalString(value);
  return description ? description.replace(/\s+/g, " ").trim() : null;
}

function firstUrl(values?: string[]): string | undefined {
  return values?.find((value) => value.trim().length > 0);
}

function buildCmcLink(slug?: string): string | null {
  return slug ? `https://coinmarketcap.com/currencies/${slug}/` : null;
}

function formatUsd(value: number, maxDecimals = 2): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `~$${trimNumber(value / 1_000_000_000, maxDecimals)}B`;
  }

  if (abs >= 1_000_000) {
    return `~$${trimNumber(value / 1_000_000, maxDecimals)}M`;
  }

  if (abs >= 1_000) {
    return `~$${trimNumber(value / 1_000, maxDecimals)}K`;
  }

  if (abs >= 1) {
    return `~$${trimNumber(value, maxDecimals)}`;
  }

  return `~$${trimNumber(value, 5)}`;
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${trimNumber(value, 2)}%`;
}

function trimNumber(value: number, maximumFractionDigits: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  });
}

function formatUtcTimestamp(value: unknown): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(typeof value === "number" || /^\d+$/u.test(String(value)) ? Number(value) : String(value));

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return [
    `${parsed.getUTCFullYear()}/${pad(parsed.getUTCMonth() + 1)}/${pad(parsed.getUTCDate())}`,
    `${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())}:${pad(parsed.getUTCSeconds())} UTC`,
  ].join(" ");
}

function normalizeObservedAt(value: unknown, fallback: string): string {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function normalizeDexObservedAt(value: unknown, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(Number(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
