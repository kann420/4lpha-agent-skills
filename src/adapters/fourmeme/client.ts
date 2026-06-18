import type { DataQuality, ProviderError } from "../../types/artifact-metadata.js";

const FOUR_MEME_API_BASE = "https://four.meme/meme-api/v1";
const FOUR_MEME_IMAGE_BASE = "https://static.four.meme";
const FOUR_MEME_VENUE_BASE = "https://four.meme";
const BNB_PRICE_FALLBACK_USD = 600;
const FOUR_MEME_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const SAFE_TO_APE_MIN_MC_USD = 3_000;
const SAFE_TO_APE_MAX_MC_USD = 150_000;
const SAFE_TO_APE_MIN_VOLUME_24H_USD = 5_000;
const SAFE_TO_APE_MIN_HOLDERS = 30;
const SAFE_TO_APE_MIN_BONDING_PROGRESS = 50;
const GEM_HUNT_MAX_MC_USD = 1_000_000;
const GEM_HUNT_MIN_VOLUME_24H_USD = 100_000;
const GEM_HUNT_STRONG_VOLUME_4H_USD = 50_000;
const GEM_HUNT_STRONG_VOLUME_24H_USD = 500_000;
const MEDIUM_RISK_MAX_MC_USD = 1_500_000;
const SELECTED_BUCKET_LIMIT = 4;

const FOUR_MEME_DISCOVERY_ENDPOINTS = {
  dexMigrated: `${FOUR_MEME_API_BASE}/public/token/ranking`,
  hot: `${FOUR_MEME_API_BASE}/public/token/ranking`,
  newLaunches: `${FOUR_MEME_API_BASE}/public/token/search`,
  volumeLeaders: `${FOUR_MEME_API_BASE}/public/token/ranking`,
} as const;

const USD_QUOTES = new Set(["USDT", "USD", "BUSD", "USDC", "FDUSD", "USD1", "DAI", "UUSD"]);

type FourMemeDiscoveryFeed = "newLaunches" | "volumeLeaders" | "hot" | "dexMigrated";
type FourMemeLaunchStage = "new" | "migrated";
export type FourMemeSelectionBucket = "safe2ape" | "mediumRisk" | "gemHunt";

interface RawToken {
  tokenAddress?: string;
  name?: string;
  shortName?: string;
  symbol?: string;
  img?: string;
  cap?: string | number;
  hold?: number;
  volume?: string | number;
  day1Vol?: string | number;
  hour4Vol?: string | number;
  price?: string | number;
  createDate?: string | number;
  progress?: string | number;
  status?: string;
}

interface FourMemeListResponse {
  list?: RawToken[];
}

interface FeedFetchResult {
  error?: ProviderError;
  feed: FourMemeDiscoveryFeed;
  tokens: RawToken[];
}

interface BaseCandidate {
  tokenAddress: string;
  venueUrl: string;
  symbol: string;
  name: string;
  image?: string;
  createdAtMs?: number;
  marketCapUsd: number;
  volume24hUsd: number;
  volume4hUsd: number;
  priceUsd: number;
  holders?: number;
  bondingProgress?: number;
  graduated: boolean;
  launchStage: FourMemeLaunchStage;
  discoveryFeeds: FourMemeDiscoveryFeed[];
}

export interface FourMemeCandidate {
  tokenAddress: string;
  venueUrl: string;
  symbol: string;
  name: string;
  image?: string;
  createdAt?: string;
  marketCapUsd: number;
  volume24hUsd: number;
  volume4hUsd: number;
  priceUsd: number;
  holders?: number;
  bondingProgress?: number;
  graduated: boolean;
  launchStage: FourMemeLaunchStage;
  discoveryFeeds: FourMemeDiscoveryFeed[];
  selectionBucket: FourMemeSelectionBucket;
  categoryScore: number;
}

export interface FourMemeDiscoverySnapshot {
  asOf: string;
  dataQuality: DataQuality;
  sourceBaseUrl: string;
  sourceEndpoints: string[];
  venue: "fourmeme";
  feedCounts: {
    newLaunches: number;
    volumeLeaders: number;
    hot: number;
    dexMigrated: number;
  };
  safe2apeCandidates: FourMemeCandidate[];
  mediumRiskCandidates: FourMemeCandidate[];
  gemHuntCandidates: FourMemeCandidate[];
  selectedCandidates: FourMemeCandidate[];
}

export class FourMemeClient {
  constructor(private readonly apiBaseUrl: string = FOUR_MEME_API_BASE) {}

  async fetchDiscoverySnapshot(): Promise<FourMemeDiscoverySnapshot> {
    const retrievedAt = new Date().toISOString();
    const bnbPriceUsd = await getBnbPriceUsd();
    const [newLaunchesResult, volumeLeadersResult, hotResult, dexMigratedResult] = await Promise.all([
      fetchTokenSearch("NEW", "PUBLISH", 50),
      fetchRanking("VOL_DAY_1", 50),
      fetchRanking("HOT", 50),
      fetchRanking("DEX", 100),
    ]);
    const providerErrors = [
      newLaunchesResult.error,
      volumeLeadersResult.error,
      hotResult.error,
      dexMigratedResult.error,
    ].filter((error): error is ProviderError => error !== undefined);
    const newLaunches = newLaunchesResult.tokens;
    const volumeLeaders = volumeLeadersResult.tokens;
    const hot = hotResult.tokens;
    const dexMigrated = dexMigratedResult.tokens;

    const launchMap = new Map<string, BaseCandidate>();
    for (const entry of tagCandidates(newLaunches, "newLaunches", bnbPriceUsd)) {
      if (isOutsideLookback(entry.createdAtMs)) {
        continue;
      }
      upsertCandidate(launchMap, entry);
    }

    for (const entry of tagCandidates(volumeLeaders, "volumeLeaders", bnbPriceUsd)) {
      if (isOutsideLookback(entry.createdAtMs)) {
        continue;
      }
      upsertCandidate(launchMap, entry);
    }

    for (const entry of tagCandidates(hot, "hot", bnbPriceUsd)) {
      if (isOutsideLookback(entry.createdAtMs)) {
        continue;
      }
      upsertCandidate(launchMap, entry);
    }

    const dexMap = new Map<string, BaseCandidate>();
    for (const entry of tagCandidates(dexMigrated, "dexMigrated", bnbPriceUsd)) {
      if (!entry.graduated) {
        continue;
      }
      upsertCandidate(dexMap, entry);
    }

    const candidateMap = new Map<string, BaseCandidate>();
    for (const candidate of [...launchMap.values(), ...dexMap.values()]) {
      upsertCandidate(candidateMap, candidate);
    }

    const safe2apeCandidates: FourMemeCandidate[] = [];
    const mediumRiskCandidates: FourMemeCandidate[] = [];
    const gemHuntCandidates: FourMemeCandidate[] = [];

    for (const candidate of candidateMap.values()) {
      if (hasNativeRedVeto(candidate)) {
        continue;
      }

      if (isGemHuntCandidate(candidate)) {
        gemHuntCandidates.push(materializeCandidate(candidate, "gemHunt", scoreGemHuntCandidate(candidate)));
        continue;
      }

      if (isSafe2ApeCandidate(candidate)) {
        safe2apeCandidates.push(materializeCandidate(candidate, "safe2ape", scoreSafe2ApeCandidate(candidate)));
        continue;
      }

      if (isMediumRiskCandidate(candidate)) {
        mediumRiskCandidates.push(materializeCandidate(candidate, "mediumRisk", scoreMediumRiskCandidate(candidate)));
      }
    }

    safe2apeCandidates.sort(compareCategoryScore);
    mediumRiskCandidates.sort(compareCategoryScore);
    gemHuntCandidates.sort(compareCategoryScore);

    return {
      asOf: new Date().toISOString(),
      dataQuality: {
        freshness: [
          {
            expectedCadence: "Four.Meme meme-api discovery feeds are fetched live for each run.",
            retrievedAt,
            sourceObservedAt: new Date().toISOString(),
          },
        ],
        providerErrors,
        status: resolveDataQualityStatus(providerErrors.length, 4),
        summary: providerErrors.length === 0
          ? "All Four.Meme discovery feeds returned usable payloads."
          : `${4 - providerErrors.length} of 4 Four.Meme discovery feeds returned usable payloads; failed feeds are preserved in providerErrors.`,
      },
      sourceBaseUrl: this.apiBaseUrl,
      sourceEndpoints: [...new Set(Object.values(FOUR_MEME_DISCOVERY_ENDPOINTS))],
      venue: "fourmeme",
      feedCounts: {
        newLaunches: newLaunches.length,
        volumeLeaders: volumeLeaders.length,
        hot: hot.length,
        dexMigrated: dexMigrated.length,
      },
      safe2apeCandidates,
      mediumRiskCandidates,
      gemHuntCandidates,
      selectedCandidates: selectFeaturedCandidates(safe2apeCandidates, mediumRiskCandidates, gemHuntCandidates),
    };
  }
}

function selectFeaturedCandidates(
  safe2apeCandidates: FourMemeCandidate[],
  mediumRiskCandidates: FourMemeCandidate[],
  gemHuntCandidates: FourMemeCandidate[],
): FourMemeCandidate[] {
  const selected = new Map<string, FourMemeCandidate>();

  for (const candidate of [
    ...safe2apeCandidates.slice(0, SELECTED_BUCKET_LIMIT),
    ...mediumRiskCandidates.slice(0, SELECTED_BUCKET_LIMIT),
    ...gemHuntCandidates.slice(0, SELECTED_BUCKET_LIMIT),
  ]) {
    selected.set(candidate.tokenAddress.toLowerCase(), candidate);
  }

  return [...selected.values()];
}

function compareCategoryScore(left: FourMemeCandidate, right: FourMemeCandidate): number {
  const scoreDelta = right.categoryScore - left.categoryScore;
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const volumeDelta = right.volume24hUsd - left.volume24hUsd;
  if (volumeDelta !== 0) {
    return volumeDelta;
  }

  return (right.createdAt ? Date.parse(right.createdAt) : 0) - (left.createdAt ? Date.parse(left.createdAt) : 0);
}

function materializeCandidate(
  candidate: BaseCandidate,
  selectionBucket: FourMemeSelectionBucket,
  categoryScore: number,
): FourMemeCandidate {
  return {
    tokenAddress: candidate.tokenAddress,
    venueUrl: candidate.venueUrl,
    symbol: candidate.symbol,
    name: candidate.name,
    image: candidate.image,
    createdAt: candidate.createdAtMs ? new Date(candidate.createdAtMs).toISOString() : undefined,
    marketCapUsd: candidate.marketCapUsd,
    volume24hUsd: candidate.volume24hUsd,
    volume4hUsd: candidate.volume4hUsd,
    priceUsd: candidate.priceUsd,
    holders: candidate.holders,
    bondingProgress: candidate.bondingProgress,
    graduated: candidate.graduated,
    launchStage: candidate.launchStage,
    discoveryFeeds: candidate.discoveryFeeds,
    selectionBucket,
    categoryScore,
  };
}

function hasNativeRedVeto(candidate: BaseCandidate): boolean {
  if (candidate.tokenAddress.length === 0 || candidate.marketCapUsd <= 0) {
    return true;
  }

  if (!candidate.graduated && candidate.holders !== undefined && candidate.holders < 5) {
    return true;
  }

  return false;
}

function isSafe2ApeCandidate(candidate: BaseCandidate): boolean {
  if (candidate.graduated) {
    return false;
  }

  if (candidate.marketCapUsd < SAFE_TO_APE_MIN_MC_USD || candidate.marketCapUsd > SAFE_TO_APE_MAX_MC_USD) {
    return false;
  }

  if (candidate.volume24hUsd < SAFE_TO_APE_MIN_VOLUME_24H_USD) {
    return false;
  }

  if (candidate.holders !== undefined && candidate.holders < SAFE_TO_APE_MIN_HOLDERS) {
    return false;
  }

  if ((candidate.bondingProgress ?? 0) < SAFE_TO_APE_MIN_BONDING_PROGRESS) {
    return false;
  }

  return true;
}

function isGemHuntCandidate(candidate: BaseCandidate): boolean {
  if (!candidate.graduated) {
    return false;
  }

  if (candidate.marketCapUsd <= 0 || candidate.marketCapUsd >= GEM_HUNT_MAX_MC_USD) {
    return false;
  }

  if (candidate.volume24hUsd < GEM_HUNT_MIN_VOLUME_24H_USD) {
    return false;
  }

  if (candidate.holders !== undefined && candidate.holders > 0 && candidate.holders < SAFE_TO_APE_MIN_HOLDERS) {
    return false;
  }

  return (
    candidate.volume4hUsd >= GEM_HUNT_STRONG_VOLUME_4H_USD ||
    candidate.volume24hUsd >= GEM_HUNT_STRONG_VOLUME_24H_USD ||
    candidate.discoveryFeeds.includes("dexMigrated")
  );
}

function isMediumRiskCandidate(candidate: BaseCandidate): boolean {
  if (candidate.marketCapUsd <= 0 || candidate.marketCapUsd > MEDIUM_RISK_MAX_MC_USD) {
    return false;
  }

  if (candidate.volume24hUsd < 1_000) {
    return false;
  }

  if (candidate.holders !== undefined && candidate.holders > 0 && candidate.holders < 5) {
    return false;
  }

  return (
    candidate.graduated ||
    candidate.discoveryFeeds.includes("hot") ||
    candidate.marketCapUsd > SAFE_TO_APE_MAX_MC_USD ||
    candidate.volume24hUsd < SAFE_TO_APE_MIN_VOLUME_24H_USD ||
    candidate.holders === undefined ||
    candidate.holders < SAFE_TO_APE_MIN_HOLDERS
  );
}

function scoreSafe2ApeCandidate(candidate: BaseCandidate, now = Date.now()): number {
  const ageHours = candidate.createdAtMs ? (now - candidate.createdAtMs) / 3_600_000 : 999;
  let score = 0;

  score += clampScore(Math.log10(candidate.volume24hUsd / 1_000 + 1) * 7, 0, 18);
  score += candidate.holders !== undefined ? (candidate.holders >= 100 ? 12 : candidate.holders >= 50 ? 8 : 4) : 0;
  score += candidate.bondingProgress !== undefined
    ? candidate.bondingProgress >= 80
      ? 10
      : candidate.bondingProgress >= SAFE_TO_APE_MIN_BONDING_PROGRESS
        ? 6
        : 0
    : 0;
  score += ageHours <= 1 ? 12 : ageHours <= 6 ? 8 : ageHours <= 24 ? 4 : 0;
  score += candidate.marketCapUsd <= 50_000 ? 8 : candidate.marketCapUsd <= SAFE_TO_APE_MAX_MC_USD ? 4 : 0;
  score += candidate.discoveryFeeds.includes("volumeLeaders") ? 6 : 0;
  score += candidate.discoveryFeeds.includes("hot") ? 4 : 0;

  return Math.round(score);
}

function scoreGemHuntCandidate(candidate: BaseCandidate): number {
  let score = 0;

  score += clampScore(Math.log10(candidate.volume24hUsd / 1_000 + 1) * 8, 0, 22);
  score += candidate.volume4hUsd >= GEM_HUNT_STRONG_VOLUME_4H_USD ? 12 : candidate.volume4hUsd >= 10_000 ? 5 : 0;
  score += candidate.marketCapUsd < 250_000 ? 8 : candidate.marketCapUsd < GEM_HUNT_MAX_MC_USD ? 4 : 0;
  score += candidate.discoveryFeeds.includes("dexMigrated") ? 10 : 0;
  score += candidate.holders !== undefined ? (candidate.holders >= 500 ? 10 : candidate.holders >= 100 ? 6 : 0) : 0;

  return Math.round(score);
}

function scoreMediumRiskCandidate(candidate: BaseCandidate): number {
  let score = 0;

  score += clampScore(Math.log10(candidate.volume24hUsd / 1_000 + 1) * 7, 0, 18);
  score += candidate.discoveryFeeds.includes("hot") ? 8 : 0;
  score += candidate.graduated ? 6 : 0;
  score += candidate.marketCapUsd <= SAFE_TO_APE_MAX_MC_USD ? 6 : candidate.marketCapUsd <= GEM_HUNT_MAX_MC_USD ? 3 : 0;
  score += candidate.holders !== undefined ? (candidate.holders >= 100 ? 8 : candidate.holders >= 30 ? 5 : 2) : 2;

  return Math.round(score);
}

function isOutsideLookback(createdAtMs?: number): boolean {
  return createdAtMs !== undefined && Date.now() - createdAtMs > FOUR_MEME_LOOKBACK_MS;
}

function tagCandidates(rawTokens: RawToken[], feed: FourMemeDiscoveryFeed, bnbPriceUsd: number): BaseCandidate[] {
  return rawTokens
    .map((raw) => normalizeRawToken(raw, feed, bnbPriceUsd))
    .filter((candidate): candidate is BaseCandidate => candidate !== null);
}

function normalizeRawToken(raw: RawToken, feed: FourMemeDiscoveryFeed, bnbPriceUsd: number): BaseCandidate | null {
  const tokenAddress = normalizeAddress(raw.tokenAddress);
  if (!tokenAddress) {
    return null;
  }

  const quoteCurrency = (raw.symbol ?? "BNB").toUpperCase();
  const priceMultiplier = resolveQuoteUsdMultiplier({
    quoteSymbol: quoteCurrency,
    quoteVolume: normalizeNumberish(raw.volume),
    usdVolume: normalizeNumberish(raw.day1Vol),
    bnbPriceUsd,
  });
  const status = String(raw.status ?? "").toUpperCase();
  const graduated = status === "TRADE" || status === "DEX";
  const marketCapUsd = normalizeNumberish(raw.cap) * priceMultiplier;
  const volume24hUsd = normalizeNumberish(raw.day1Vol);
  const volume4hUsd = normalizeNumberish(raw.hour4Vol);
  const priceUsd = normalizeNumberish(raw.price) * priceMultiplier;
  const holders = normalizeOptionalPositive(raw.hold);
  const bondingProgress = normalizeOptionalPositive(roundPercent(normalizePercent(raw.progress)));
  const createdAtMs = normalizeTimestamp(raw.createDate);
  const imagePath = typeof raw.img === "string" && raw.img.length > 0 ? raw.img : undefined;

  return {
    tokenAddress,
    venueUrl: `${FOUR_MEME_VENUE_BASE}/en/token/${tokenAddress}`,
    symbol: normalizeText(raw.shortName ?? raw.name ?? tokenAddress.slice(0, 6)),
    name: normalizeText(raw.name ?? raw.shortName ?? tokenAddress),
    image: imagePath
      ? imagePath.startsWith("http")
        ? imagePath
        : `${FOUR_MEME_IMAGE_BASE}${imagePath}`
      : undefined,
    createdAtMs: createdAtMs > 0 ? createdAtMs : undefined,
    marketCapUsd,
    volume24hUsd,
    volume4hUsd,
    priceUsd,
    holders,
    bondingProgress,
    graduated,
    launchStage: graduated ? "migrated" : "new",
    discoveryFeeds: [feed],
  };
}

function upsertCandidate(map: Map<string, BaseCandidate>, incoming: BaseCandidate): void {
  const key = incoming.tokenAddress.toLowerCase();
  const current = map.get(key);
  map.set(key, current ? mergeCandidates(current, incoming) : incoming);
}

function mergeCandidates(current: BaseCandidate, incoming: BaseCandidate): BaseCandidate {
  return {
    tokenAddress: current.tokenAddress,
    venueUrl: incoming.venueUrl || current.venueUrl,
    symbol: incoming.symbol || current.symbol,
    name: incoming.name || current.name,
    image: incoming.image ?? current.image,
    createdAtMs: selectEarliestPositive(current.createdAtMs, incoming.createdAtMs),
    marketCapUsd: selectMaxPositive(current.marketCapUsd, incoming.marketCapUsd),
    volume24hUsd: selectMaxPositive(current.volume24hUsd, incoming.volume24hUsd),
    volume4hUsd: selectMaxPositive(current.volume4hUsd, incoming.volume4hUsd),
    priceUsd: selectFirstPositive(incoming.priceUsd, current.priceUsd),
    holders: selectMaxOptional(current.holders, incoming.holders),
    bondingProgress: selectMaxOptional(current.bondingProgress, incoming.bondingProgress),
    graduated: current.graduated || incoming.graduated,
    launchStage: current.graduated || incoming.graduated ? "migrated" : "new",
    discoveryFeeds: [...new Set([...current.discoveryFeeds, ...incoming.discoveryFeeds])],
  };
}

async function fetchTokenSearch(type: string, status: string, pageSize: number): Promise<FeedFetchResult> {
  const feed = "newLaunches" satisfies FourMemeDiscoveryFeed;
  try {
    const result = await postFourMeme<FourMemeListResponse | RawToken[]>("/public/token/search", {
      type,
      listType: "NOR",
      status,
      sort: "DESC",
      pageIndex: 1,
      pageSize,
    });
    return {
      feed,
      tokens: Array.isArray(result) ? result : result.list ?? [],
    };
  } catch (error) {
    return {
      error: toProviderError({
        endpoint: FOUR_MEME_DISCOVERY_ENDPOINTS[feed],
        error,
        source: "Four.Meme Meme API",
      }),
      feed,
      tokens: [],
    };
  }
}

async function fetchRanking(type: string, pageSize: number): Promise<FeedFetchResult> {
  const feed = resolveRankingFeed(type);
  try {
    const result = await postFourMeme<FourMemeListResponse | RawToken[]>("/public/token/ranking", {
      type,
      pageSize,
    });
    return {
      feed,
      tokens: Array.isArray(result) ? result : result.list ?? [],
    };
  } catch (error) {
    return {
      error: toProviderError({
        endpoint: FOUR_MEME_DISCOVERY_ENDPOINTS[feed],
        error,
        source: "Four.Meme Meme API",
      }),
      feed,
      tokens: [],
    };
  }
}

async function postFourMeme<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${FOUR_MEME_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Four.Meme API request failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as {
    code?: number | string;
    msg?: string;
    data?: T;
  };

  if (json.code !== undefined && String(json.code) !== "0") {
    throw new Error(`Four.Meme API returned code ${String(json.code)}: ${json.msg ?? "unknown error"}`);
  }

  return (json.data ?? json) as T;
}

async function getBnbPriceUsd(): Promise<number> {
  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT", {
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return BNB_PRICE_FALLBACK_USD;
    }

    const json = await response.json() as { price?: string };
    const price = Number(json.price);
    return Number.isFinite(price) && price > 0 ? price : BNB_PRICE_FALLBACK_USD;
  } catch {
    return BNB_PRICE_FALLBACK_USD;
  }
}

function resolveQuoteUsdMultiplier(input: {
  quoteSymbol?: string;
  quoteVolume?: number;
  usdVolume?: number;
  bnbPriceUsd: number;
}): number {
  const quoteSymbol = input.quoteSymbol?.trim().toUpperCase() ?? "";
  if (quoteSymbol && (USD_QUOTES.has(quoteSymbol) || quoteSymbol.startsWith("USD"))) {
    return 1;
  }

  const derivedMultiplier = derivePositiveRatio(input.usdVolume, input.quoteVolume);
  if (derivedMultiplier > 0) {
    return derivedMultiplier;
  }

  return input.bnbPriceUsd;
}

function derivePositiveRatio(
  numerator: number | undefined,
  denominator: number | undefined,
): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return 0;
  }

  if (!numerator || !denominator || denominator <= 0) {
    return 0;
  }

  const ratio = numerator / denominator;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
}

function normalizeAddress(value?: string): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTimestamp(value: number | string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return new Date(String(value)).getTime() || 0;
  }

  return parsed < 1e12 ? parsed * 1000 : parsed;
}

function normalizeNumberish(value: number | string | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePercent(value: number | string | undefined): number {
  const parsed = normalizeNumberish(value);
  if (parsed <= 0) {
    return 0;
  }

  if (parsed <= 1) {
    return parsed * 100;
  }

  return parsed;
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeOptionalPositive(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function clampScore(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function selectEarliestPositive(...values: Array<number | undefined>): number | undefined {
  const positives = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  return positives.length > 0 ? Math.min(...positives) : undefined;
}

function selectFirstPositive(...values: Array<number | undefined>): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return 0;
}

function selectMaxPositive(...values: Array<number | undefined>): number {
  return values.reduce<number>((current, value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return current;
    }

    return Math.max(current, value);
  }, 0);
}

function selectMaxOptional(...values: Array<number | undefined>): number | undefined {
  const max = selectMaxPositive(...values);
  return max > 0 ? max : undefined;
}

export function createFourMemeClient(): FourMemeClient {
  return new FourMemeClient();
}

function resolveRankingFeed(type: string): FourMemeDiscoveryFeed {
  if (type === "VOL_DAY_1") {
    return "volumeLeaders";
  }

  if (type === "HOT") {
    return "hot";
  }

  if (type === "DEX") {
    return "dexMigrated";
  }

  return "hot";
}

function resolveDataQualityStatus(errorCount: number, sourceCount: number): DataQuality["status"] {
  if (errorCount === 0) {
    return "complete";
  }

  if (errorCount >= sourceCount) {
    return "failed";
  }

  return "partial";
}

function toProviderError(input: {
  endpoint: string;
  error: unknown;
  source: string;
}): ProviderError {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return {
    endpoint: input.endpoint,
    message: sanitizeProviderErrorMessage(message),
    observedAt: new Date().toISOString(),
    recoverable: true,
    source: input.source,
  };
}

function sanitizeProviderErrorMessage(message: string): string {
  return message
    .replace(/(api[-_ ]?key|authorization|bearer)\s*[:=]\s*[A-Za-z0-9_.:-]+/giu, "$1=[redacted]")
    .replace(/0x[a-fA-F0-9]{64}/gu, "0x[redacted-private-key]")
    .slice(0, 500);
}
