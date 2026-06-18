import { config as loadDotEnv } from "dotenv";

import type { DataQuality, ProviderError } from "../../types/artifact-metadata.js";

export const CMC_DOC_URLS = {
  agentHub: "https://coinmarketcap.com/api/agent/",
  bnbQuote: "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=BNB",
  fearAndGreed: "https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest",
  globalMetrics: "https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest",
  mcp: "https://coinmarketcap.com/api/documentation/ai-agent-hub/mcp",
  mcpEndpoint: "https://mcp.coinmarketcap.com/mcp",
} as const;

const BNB_CMC_ID = 1839;
const CMC_BASE_URL = "https://pro-api.coinmarketcap.com";
const ROOT_ENV_PATH = new URL("../../../.env.local", import.meta.url);

export type CmcDataTransport = "rest" | "agent-hub-mcp";

interface GlobalMetricsResponse {
  data: {
    quote: {
      USD: {
        total_market_cap: number;
        total_volume_24h: number;
        total_market_cap_yesterday_percentage_change: number;
        last_updated: string;
      };
    };
    btc_dominance: number;
    btc_dominance_24h_percentage_change: number;
    eth_dominance: number;
    last_updated: string;
  };
}

interface FearAndGreedResponse {
  data: {
    value: number;
    update_time: string;
    value_classification: string;
  };
}

interface RestQuotesResponse {
  data: Record<
    string,
    {
      id: number;
      name: string;
      symbol: string;
      slug: string;
      cmc_rank: number;
      quote: {
        USD: {
          price: number;
          volume_24h: number;
          percent_change_1h: number;
          percent_change_24h: number;
          percent_change_7d: number;
          percent_change_30d: number;
          market_cap: number;
          market_cap_dominance: number;
          last_updated: string;
        };
      };
    }
  >;
}

interface McpToolCallResponse {
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

interface McpGlobalMetricsPayload {
  last_updated: string;
  market_size: {
    total_crypto_market_cap_usd: {
      current: string;
      percent_change: {
        "24h": string;
      };
    };
  };
  liquidity: {
    volume24h: {
      total: {
        current: string;
      };
    };
  };
  sentiment: {
    fear_greed: {
      current: {
        value: string;
        index: number;
      };
    };
  };
  dominance: {
    btc: {
      current: string;
      history: {
        yesterday: string;
      };
    };
    eth: {
      current: string;
    };
  };
}

interface McpQuotesTabularPayload {
  headers: string[];
  rows: unknown[][];
}

interface McpQuoteObjectPayload {
  id: string | number;
  name: string;
  symbol: string;
  slug: string;
  rank: string | number;
  price: string | number;
  volume_24h: string | number;
  percent_change_1h: string | number;
  percent_change_24h: string | number;
  percent_change_7d: string | number;
  percent_change_30d: string | number;
  market_cap: string | number;
  market_cap_dominance: string | number;
  last_updated_time: string;
}

type McpQuotesPayload = McpQuotesTabularPayload | McpQuoteObjectPayload[];

export interface CmcLatestQuote {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  cmcRank: number;
  priceUsd: number;
  volume24hUsd: number;
  percentChange1h: number;
  percentChange24h: number;
  percentChange7d: number;
  percentChange30d: number;
  marketCapUsd: number;
  marketCapDominancePct: number;
  observedAt: string;
}

export interface CmcMovingAverageSignal {
  period: string;
  type: "ema" | "sma" | "ma";
  value: number;
}

export interface CmcTechnicalIndicators {
  assetId: number;
  macd?: {
    histogram?: number;
    line?: number;
    signal?: number;
  };
  movingAverages: CmcMovingAverageSignal[];
  observedAt: string;
  rsi?: number;
  source: "coinmarketcap";
  sourceTool: "get_crypto_technical_analysis";
  summary: string;
  symbol: string;
  transport: "agent-hub-mcp";
}

export interface CmcMarketContext {
  asOf: string;
  dataQuality: DataQuality;
  source: "coinmarketcap";
  transport: CmcDataTransport;
  global: {
    totalMarketCapUsd: number;
    totalVolume24hUsd: number;
    totalMarketCapChange24hPct: number;
    btcDominancePct: number;
    btcDominanceChange24hPct: number;
    ethDominancePct: number;
    observedAt: string;
  };
  fearGreed: {
    value: number;
    classification: string;
    observedAt: string;
  };
  bnb: {
    assetId: number;
    name: string;
    symbol: string;
    cmcRank: number;
    priceUsd: number;
    volume24hUsd: number;
    percentChange1h: number;
    percentChange24h: number;
    percentChange7d: number;
    percentChange30d: number;
    marketCapUsd: number;
    marketCapDominancePct: number;
    observedAt: string;
  };
  technicalIndicators?: CmcTechnicalIndicators;
}

export interface CmcDataProvider {
  readonly transport: CmcDataTransport;
  fetchLatestQuotesByIds(ids: number[]): Promise<CmcLatestQuote[]>;
  fetchMarketContext(): Promise<CmcMarketContext>;
}

export function loadRepoEnv(): void {
  loadDotEnv({ path: ROOT_ENV_PATH, override: false, quiet: true });
}

export function readCmcApiKey(): string {
  loadRepoEnv();

  const apiKey = process.env.CMC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing CMC_API_KEY in .env.local");
  }

  return apiKey;
}

export function readCmcMcpApiKey(): string {
  loadRepoEnv();

  const apiKey = process.env.CMC_MCP_API_KEY?.trim() || process.env.CMC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing CMC_MCP_API_KEY or CMC_API_KEY in .env.local for CMC Agent Hub MCP provider");
  }

  return apiKey;
}

export class CmcClient implements CmcDataProvider {
  readonly transport = "rest" satisfies CmcDataTransport;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = CMC_BASE_URL,
  ) {}

  async fetchMarketContext(): Promise<CmcMarketContext> {
    const retrievedAt = new Date().toISOString();
    const [globalMetrics, fearAndGreed, bnbQuotes] = await Promise.all([
      this.requestJson<GlobalMetricsResponse>("/v1/global-metrics/quotes/latest"),
      this.requestJson<FearAndGreedResponse>("/v3/fear-and-greed/latest"),
      this.fetchLatestQuotesByIds([BNB_CMC_ID]),
    ]);
    const bnbQuote = bnbQuotes[0];

    if (!bnbQuote) {
      throw new Error("CoinMarketCap REST provider did not return BNB quote data");
    }

    const asOfCandidates = [
      globalMetrics.data.last_updated,
      globalMetrics.data.quote.USD.last_updated,
      fearAndGreed.data.update_time,
      bnbQuote.observedAt,
    ];

    return {
      asOf: asOfCandidates.sort().at(-1) ?? new Date().toISOString(),
      dataQuality: {
        freshness: [
          {
            expectedCadence: "CMC global metrics and BNB quote are sampled at the provider's latest available cadence.",
            retrievedAt,
            sourceObservedAt: asOfCandidates.sort().at(-1),
          },
        ],
        providerErrors: [],
        status: "complete",
        summary: "CMC REST market context, Fear and Greed, and BNB quote were fetched successfully. Technical indicators are only attached on the Agent Hub MCP transport.",
      },
      source: "coinmarketcap",
      transport: this.transport,
      global: {
        totalMarketCapUsd: globalMetrics.data.quote.USD.total_market_cap,
        totalVolume24hUsd: globalMetrics.data.quote.USD.total_volume_24h,
        totalMarketCapChange24hPct: globalMetrics.data.quote.USD.total_market_cap_yesterday_percentage_change,
        btcDominancePct: globalMetrics.data.btc_dominance,
        btcDominanceChange24hPct: globalMetrics.data.btc_dominance_24h_percentage_change,
        ethDominancePct: globalMetrics.data.eth_dominance,
        observedAt: globalMetrics.data.last_updated,
      },
      fearGreed: {
        value: fearAndGreed.data.value,
        classification: fearAndGreed.data.value_classification,
        observedAt: fearAndGreed.data.update_time,
      },
      bnb: {
        assetId: bnbQuote.id,
        name: bnbQuote.name,
        symbol: bnbQuote.symbol,
        cmcRank: bnbQuote.cmcRank,
        priceUsd: bnbQuote.priceUsd,
        volume24hUsd: bnbQuote.volume24hUsd,
        percentChange1h: bnbQuote.percentChange1h,
        percentChange24h: bnbQuote.percentChange24h,
        percentChange7d: bnbQuote.percentChange7d,
        percentChange30d: bnbQuote.percentChange30d,
        marketCapUsd: bnbQuote.marketCapUsd,
        marketCapDominancePct: bnbQuote.marketCapDominancePct,
        observedAt: bnbQuote.observedAt,
      },
    };
  }

  async fetchLatestQuotesByIds(ids: number[]): Promise<CmcLatestQuote[]> {
    if (ids.length === 0) {
      return [];
    }

    const query = new URLSearchParams({
      id: ids.join(","),
    }).toString();
    const quotes = await this.requestJson<RestQuotesResponse>(
      `/v1/cryptocurrency/quotes/latest?${query}`,
    );
    const quotesById = new Map(
      Object.values(quotes.data).map((asset) => {
        const normalized = normalizeRestQuote(asset);
        return [normalized.id, normalized] as const;
      }),
    );

    return ids.flatMap((id) => {
      const quote = quotesById.get(id);
      return quote ? [quote] : [];
    });
  }

  private async requestJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        "X-CMC_PRO_API_KEY": this.apiKey,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`CMC request failed for ${path}: ${response.status} ${response.statusText} - ${body}`);
    }

    return response.json() as Promise<T>;
  }
}

export class CmcMcpClient implements CmcDataProvider {
  readonly transport = "agent-hub-mcp" satisfies CmcDataTransport;

  constructor(
    private readonly apiKey: string,
    private readonly endpoint: string = CMC_DOC_URLS.mcpEndpoint,
  ) {}

  async fetchMarketContext(): Promise<CmcMarketContext> {
    const retrievedAt = new Date().toISOString();
    const providerErrors: ProviderError[] = [];
    const [globalMetrics, bnbQuotes] = await Promise.all([
      this.callTool<McpGlobalMetricsPayload>("get_global_metrics_latest", {}),
      this.fetchLatestQuotesByIds([BNB_CMC_ID]),
    ]);
    const technicalIndicators = await this.fetchTechnicalIndicatorsById(BNB_CMC_ID, "BNB")
      .catch((error: unknown) => {
        providerErrors.push(toProviderError({
          error,
          observedAt: new Date().toISOString(),
          source: "CoinMarketCap Agent Hub MCP",
          tool: "get_crypto_technical_analysis",
        }));
        return undefined;
      });
    const bnbQuote = bnbQuotes[0];

    if (!bnbQuote) {
      throw new Error("CMC Agent Hub MCP provider did not return BNB quote data");
    }

    const observedAt = parseObservedAt(globalMetrics.last_updated);
    const asOfCandidates = [observedAt, bnbQuote.observedAt];
    const btcDominancePct = parseSignedPercent(globalMetrics.dominance.btc.current);
    const btcDominanceYesterdayPct = parseSignedPercent(globalMetrics.dominance.btc.history.yesterday);

    return {
      asOf: asOfCandidates.sort().at(-1) ?? new Date().toISOString(),
      dataQuality: {
        freshness: [
          {
            expectedCadence: "CMC Agent Hub MCP global metrics and BNB quote are sampled at the provider's latest available cadence.",
            retrievedAt,
            sourceObservedAt: asOfCandidates.sort().at(-1),
          },
          ...(technicalIndicators
            ? [
                {
                  expectedCadence: "CMC MCP technical-analysis snapshot for BNB.",
                  retrievedAt,
                  sourceObservedAt: technicalIndicators.observedAt,
                },
              ]
            : []),
        ],
        providerErrors,
        status: providerErrors.length > 0 ? "partial" : "complete",
        summary: providerErrors.length > 0
          ? "CMC Agent Hub MCP market context succeeded, but at least one optional technical-analysis tool returned no usable payload."
          : "CMC Agent Hub MCP market context, BNB quote, and BNB technical-analysis payload were fetched successfully.",
      },
      source: "coinmarketcap",
      transport: this.transport,
      global: {
        totalMarketCapUsd: parseCompactNumber(globalMetrics.market_size.total_crypto_market_cap_usd.current),
        totalVolume24hUsd: parseCompactNumber(globalMetrics.liquidity.volume24h.total.current),
        totalMarketCapChange24hPct: parseSignedPercent(
          globalMetrics.market_size.total_crypto_market_cap_usd.percent_change["24h"],
        ),
        btcDominancePct,
        btcDominanceChange24hPct: Number((btcDominancePct - btcDominanceYesterdayPct).toFixed(4)),
        ethDominancePct: parseSignedPercent(globalMetrics.dominance.eth.current),
        observedAt,
      },
      fearGreed: {
        value: globalMetrics.sentiment.fear_greed.current.index,
        classification: globalMetrics.sentiment.fear_greed.current.value,
        observedAt,
      },
      bnb: {
        assetId: bnbQuote.id,
        name: bnbQuote.name,
        symbol: bnbQuote.symbol,
        cmcRank: bnbQuote.cmcRank,
        priceUsd: bnbQuote.priceUsd,
        volume24hUsd: bnbQuote.volume24hUsd,
        percentChange1h: bnbQuote.percentChange1h,
        percentChange24h: bnbQuote.percentChange24h,
        percentChange7d: bnbQuote.percentChange7d,
        percentChange30d: bnbQuote.percentChange30d,
        marketCapUsd: bnbQuote.marketCapUsd,
        marketCapDominancePct: bnbQuote.marketCapDominancePct,
        observedAt: bnbQuote.observedAt,
      },
      ...(technicalIndicators ? { technicalIndicators } : {}),
    };
  }

  async fetchLatestQuotesByIds(ids: number[]): Promise<CmcLatestQuote[]> {
    if (ids.length === 0) {
      return [];
    }

    const payload = await this.callTool<McpQuotesPayload>("get_crypto_quotes_latest", {
      id: ids.join(","),
    });
    const quotesById = new Map(resolveMcpQuotes(payload).map((quote) => [quote.id, quote] as const));

    return ids.flatMap((id) => {
      const quote = quotesById.get(id);
      return quote ? [quote] : [];
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

    const body = await response.json() as McpToolCallResponse;

    if (body.error) {
      throw new Error(`CMC MCP tool ${name} failed: ${body.error.code} ${body.error.message}`);
    }

    if (!body.result) {
      throw new Error(`CMC MCP tool ${name} returned no result payload`);
    }

    if (body.result.isError) {
      throw new Error(`CMC MCP tool ${name} returned an error result`);
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

  private async fetchTechnicalIndicatorsById(
    id: number,
    symbol: string,
  ): Promise<CmcTechnicalIndicators> {
    const payload = await this.callTool<unknown>("get_crypto_technical_analysis", {
      id: String(id),
    });

    return normalizeMcpTechnicalIndicators(payload, id, symbol);
  }
}

export function createCmcClientFromEnv(): CmcClient {
  return new CmcClient(readCmcApiKey());
}

export function createCmcDataProviderFromEnv(input: {
  provider?: CmcDataTransport;
} = {}): CmcDataProvider {
  const provider = normalizeCmcDataTransport(input.provider ?? readCmcDataProviderFromEnv());

  if (provider === "agent-hub-mcp") {
    return new CmcMcpClient(readCmcMcpApiKey());
  }

  return new CmcClient(readCmcApiKey());
}

export function readCmcDataProviderFromEnv(): CmcDataTransport {
  loadRepoEnv();
  return normalizeCmcDataTransport(process.env.CMC_DATA_PROVIDER?.trim() ?? "rest");
}

export function normalizeCmcDataTransport(value: string): CmcDataTransport {
  if (value === "rest" || value === "agent-hub-mcp") {
    return value;
  }

  throw new Error("Unsupported CMC data provider. Use rest or agent-hub-mcp.");
}

export function buildCmcQuoteSourceUrl(transport: CmcDataTransport, ids: number[]): string {
  if (transport === "agent-hub-mcp") {
    return `${CMC_DOC_URLS.mcpEndpoint}#tool=get_crypto_quotes_latest&id=${ids.join(",")}`;
  }

  return `${CMC_BASE_URL}/v1/cryptocurrency/quotes/latest?id=${ids.join(",")}`;
}

function normalizeRestQuote(asset: RestQuotesResponse["data"][string]): CmcLatestQuote {
  return {
    id: asset.id,
    name: asset.name,
    symbol: asset.symbol,
    slug: asset.slug,
    cmcRank: asset.cmc_rank,
    priceUsd: asset.quote.USD.price,
    volume24hUsd: asset.quote.USD.volume_24h,
    percentChange1h: asset.quote.USD.percent_change_1h,
    percentChange24h: asset.quote.USD.percent_change_24h,
    percentChange7d: asset.quote.USD.percent_change_7d,
    percentChange30d: asset.quote.USD.percent_change_30d,
    marketCapUsd: asset.quote.USD.market_cap,
    marketCapDominancePct: asset.quote.USD.market_cap_dominance,
    observedAt: asset.quote.USD.last_updated,
  };
}

function normalizeMcpQuote(
  row: unknown[],
  headerIndexes: Map<string, number>,
): CmcLatestQuote {
  return {
    id: readNumberField(row, headerIndexes, "id"),
    name: readStringField(row, headerIndexes, "name"),
    symbol: readStringField(row, headerIndexes, "symbol"),
    slug: readStringField(row, headerIndexes, "slug"),
    cmcRank: readNumberField(row, headerIndexes, "rank"),
    priceUsd: readNumberField(row, headerIndexes, "price"),
    volume24hUsd: readNumberField(row, headerIndexes, "volume_24h"),
    percentChange1h: readNumberField(row, headerIndexes, "percent_change_1h"),
    percentChange24h: readNumberField(row, headerIndexes, "percent_change_24h"),
    percentChange7d: readNumberField(row, headerIndexes, "percent_change_7d"),
    percentChange30d: readNumberField(row, headerIndexes, "percent_change_30d"),
    marketCapUsd: readNumberField(row, headerIndexes, "market_cap"),
    marketCapDominancePct: readNumberField(row, headerIndexes, "market_cap_dominance"),
    observedAt: readStringField(row, headerIndexes, "last_updated_time"),
  };
}

function normalizeMcpQuoteObject(asset: McpQuoteObjectPayload): CmcLatestQuote {
  return {
    id: Number(asset.id),
    name: asset.name,
    symbol: asset.symbol,
    slug: asset.slug,
    cmcRank: Number(asset.rank),
    priceUsd: Number(asset.price),
    volume24hUsd: Number(asset.volume_24h),
    percentChange1h: Number(asset.percent_change_1h),
    percentChange24h: Number(asset.percent_change_24h),
    percentChange7d: Number(asset.percent_change_7d),
    percentChange30d: Number(asset.percent_change_30d),
    marketCapUsd: Number(asset.market_cap),
    marketCapDominancePct: Number(asset.market_cap_dominance),
    observedAt: asset.last_updated_time,
  };
}

function resolveMcpQuotes(payload: McpQuotesPayload): CmcLatestQuote[] {
  if (Array.isArray(payload)) {
    return payload.map((asset) => normalizeMcpQuoteObject(asset));
  }

  const headerIndexes = new Map(payload.headers.map((header, index) => [header, index]));
  return payload.rows.map((row) => normalizeMcpQuote(row, headerIndexes));
}

function readStringField(
  row: unknown[],
  headerIndexes: Map<string, number>,
  field: string,
): string {
  const index = headerIndexes.get(field);
  if (index === undefined) {
    throw new Error(`CMC MCP quote payload is missing ${field}`);
  }

  const value = row[index];
  if (typeof value !== "string") {
    throw new Error(`CMC MCP quote field ${field} is not a string`);
  }

  return value;
}

function readNumberField(
  row: unknown[],
  headerIndexes: Map<string, number>,
  field: string,
): number {
  const index = headerIndexes.get(field);
  if (index === undefined) {
    throw new Error(`CMC MCP quote payload is missing ${field}`);
  }

  const value = row[index];
  const normalized = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(normalized)) {
    throw new Error(`CMC MCP quote field ${field} is not numeric`);
  }

  return normalized;
}

function parseCompactNumber(value: string): number {
  const normalized = value.trim().replace(/,/g, "");
  const match = normalized.match(/^([+-]?\d+(?:\.\d+)?)\s*([KMBT])?$/i);

  if (!match) {
    throw new Error(`Unable to parse compact number from '${value}'`);
  }

  const base = Number(match[1]);
  const suffix = match[2]?.toUpperCase();
  const multiplier = suffix === "T"
    ? 1_000_000_000_000
    : suffix === "B"
      ? 1_000_000_000
      : suffix === "M"
        ? 1_000_000
        : suffix === "K"
          ? 1_000
          : 1;

  return base * multiplier;
}

function parseSignedPercent(value: string): number {
  const normalized = value.trim().replace(/%$/, "");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Unable to parse percentage from '${value}'`);
  }

  return parsed;
}

function parseObservedAt(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse observedAt timestamp from '${value}'`);
  }

  return parsed.toISOString();
}

function normalizeMcpTechnicalIndicators(
  payload: unknown,
  assetId: number,
  symbol: string,
): CmcTechnicalIndicators {
  const observedAt = findDateString(payload) ?? new Date().toISOString();
  const rsi = findNumberByKey(payload, (key) =>
    key === "rsi" ||
    key === "rsi_14" ||
    key === "rsi14" ||
    key.includes("relative_strength_index")
  );
  const macdLine = findNumberByKey(payload, (key) =>
    key === "macd" ||
    key === "macd_line" ||
    key === "macd_value" ||
    key === "macdline"
  );
  const macdSignal = findNumberByKey(payload, (key) =>
    (key.includes("macd") && key.includes("signal")) ||
    key === "signalline" ||
    key === "signal_line"
  );
  const macdHistogram = findNumberByKey(payload, (key) =>
    key === "histogram" ||
    (key.includes("macd") && (key.includes("histogram") || key.includes("hist")))
  );
  const movingAverages = collectMovingAverages(payload);
  const summary = findStringByKey(payload, (key) =>
    key === "summary" ||
    key === "technical_summary" ||
    key === "signal" ||
    key === "recommendation"
  ) ?? buildTechnicalSummary({
    macdHistogram,
    macdLine,
    macdSignal,
    movingAverages,
    rsi,
  });

  if (rsi === undefined && macdLine === undefined && movingAverages.length === 0) {
    throw new Error("CMC MCP technical-analysis payload did not contain RSI, MACD, or moving-average values");
  }

  return {
    assetId,
    movingAverages,
    observedAt,
    source: "coinmarketcap",
    sourceTool: "get_crypto_technical_analysis",
    summary,
    symbol,
    transport: "agent-hub-mcp",
    ...(rsi !== undefined ? { rsi } : {}),
    ...(macdLine !== undefined || macdSignal !== undefined || macdHistogram !== undefined
      ? {
          macd: {
            ...(macdLine !== undefined ? { line: macdLine } : {}),
            ...(macdSignal !== undefined ? { signal: macdSignal } : {}),
            ...(macdHistogram !== undefined ? { histogram: macdHistogram } : {}),
          },
        }
      : {}),
  };
}

function findDateString(value: unknown): string | undefined {
  const raw = findStringByKey(value, (key) =>
    key === "last_updated" ||
    key === "last_updated_time" ||
    key === "observed_at" ||
    key === "timestamp" ||
    key === "updated_at"
  );

  if (!raw) {
    return undefined;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function findStringByKey(
  value: unknown,
  predicate: (normalizedKey: string) => boolean,
): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKey(item, predicate);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizePayloadKey(key);
    if (predicate(normalizedKey) && typeof item === "string" && item.trim().length > 0) {
      return item.trim();
    }

    const found = findStringByKey(item, predicate);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function findNumberByKey(
  value: unknown,
  predicate: (normalizedKey: string) => boolean,
): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNumberByKey(item, predicate);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizePayloadKey(key);
    if (predicate(normalizedKey)) {
      const parsed = toFiniteNumber(item);
      if (parsed !== undefined) {
        return parsed;
      }
    }

    const found = findNumberByKey(item, predicate);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function collectMovingAverages(value: unknown): CmcMovingAverageSignal[] {
  const collected: CmcMovingAverageSignal[] = [];
  visitPayload(value, (key, item) => {
    const normalizedKey = normalizePayloadKey(key);
    const compactMatch = normalizedKey.match(/\b(sma|ema|ma)[_-]?(\d+)\b/u);
    const verboseMatch = normalizedKey.match(/\b(simple|exponential)_moving_average_?(\d+)?(?:_day)?\b/u);
    if (!compactMatch && !verboseMatch) {
      return;
    }

    const parsed = toFiniteNumber(item);
    if (parsed === undefined) {
      return;
    }

    const type = compactMatch
      ? compactMatch[1] as CmcMovingAverageSignal["type"]
      : verboseMatch?.[1] === "exponential"
        ? "ema"
        : "sma";
    const period = compactMatch?.[2] ?? verboseMatch?.[2] ?? "unknown";

    collected.push({
      period,
      type,
      value: parsed,
    });
  });

  const seen = new Set<string>();
  return collected.filter((item) => {
    const key = `${item.type}-${item.period}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function visitPayload(
  value: unknown,
  visitor: (key: string, value: unknown) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitPayload(item, visitor);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    visitor(key, item);
    visitPayload(item, visitor);
  }
}

function buildTechnicalSummary(input: {
  macdHistogram?: number;
  macdLine?: number;
  macdSignal?: number;
  movingAverages: CmcMovingAverageSignal[];
  rsi?: number;
}): string {
  const parts = [
    input.rsi !== undefined ? `RSI ${input.rsi.toFixed(2)}` : undefined,
    input.macdLine !== undefined
      ? `MACD ${input.macdLine.toFixed(4)}${input.macdSignal !== undefined ? ` / signal ${input.macdSignal.toFixed(4)}` : ""}${input.macdHistogram !== undefined ? ` / histogram ${input.macdHistogram.toFixed(4)}` : ""}`
      : undefined,
    input.movingAverages.length > 0
      ? `moving averages ${input.movingAverages.map((item) => `${item.type.toUpperCase()}${item.period}=${item.value.toFixed(2)}`).join(", ")}`
      : undefined,
  ].filter((part): part is string => part !== undefined);

  return parts.length > 0
    ? parts.join("; ")
    : "CMC MCP technical-analysis payload contained no normalized indicator summary.";
}

function toProviderError(input: {
  error: unknown;
  observedAt: string;
  source: string;
  tool?: string;
}): ProviderError {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return {
    message: sanitizeProviderErrorMessage(message),
    observedAt: input.observedAt,
    recoverable: true,
    source: input.source,
    ...(input.tool ? { tool: input.tool } : {}),
  };
}

function sanitizeProviderErrorMessage(message: string): string {
  return message
    .replace(/(api[-_ ]?key|authorization|bearer)\s*[:=]\s*[A-Za-z0-9_.:-]+/giu, "$1=[redacted]")
    .replace(/0x[a-fA-F0-9]{64}/gu, "0x[redacted-private-key]")
    .slice(0, 500);
}

function normalizePayloadKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/gu, "_");
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/,/gu, "")) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
