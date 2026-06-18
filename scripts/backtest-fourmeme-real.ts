import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { FourMemeCandidate } from "../src/adapters/fourmeme/client.js";
import type {
  FourMemeRealSnapshot,
  FourMemeRealSnapshotManifest,
} from "../src/types/fourmeme-real-snapshot.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REAL_DIR = resolve(REPO_ROOT, "examples", "real-snapshots", "fourmeme");
const DEFAULT_REPLAY_DIR = resolve(REPO_ROOT, "examples", "replay");
const DEFAULT_MIN_SNAPSHOTS = 30;
const DEFAULT_MIN_SPAN_HOURS = 12;
const MIN_PNL_OBSERVATIONS = 10;
const HORIZONS = [6, 24] as const;

interface ForwardObservation {
  entryAt: string;
  entryPriceUsd: number;
  exitAt: string;
  exitPriceUsd: number;
  horizonHours: 6 | 24;
  returnPct: number;
  tokenAddress: string;
}

interface BacktestSummary {
  generatedAt: string;
  manifestPath: string;
  minPnlObservations: number;
  mode: "pnl-backtest" | "selection-replay-only";
  observationCount: number;
  pnlMetrics?: Record<string, {
    averageReturnPct: number;
    medianReturnPct: number;
    observationCount: number;
    winRate: number;
  }>;
  realSnapshotCount: number;
  reason: string;
  snapshotSpanHours: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const realDir = resolve(REPO_ROOT, args.realDir ?? DEFAULT_REAL_DIR);
  const replayDir = resolve(REPO_ROOT, args.replayDir ?? DEFAULT_REPLAY_DIR);
  const manifestPath = resolve(realDir, "manifest.json");
  const manifest = await readJson<FourMemeRealSnapshotManifest>(manifestPath);
  assertManifestReady(manifest, args.minSnapshots, args.minSpanHours);

  const snapshots = (await Promise.all(
    manifest.snapshots.map((entry) => readJson<FourMemeRealSnapshot>(resolve(realDir, entry.path))),
  )).sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  const observations = buildForwardObservations(snapshots);
  const hasEnoughPnl = observations.length >= MIN_PNL_OBSERVATIONS;
  const summary: BacktestSummary = {
    generatedAt: new Date().toISOString(),
    manifestPath: normalizeRelativePath(manifestPath.replace(`${REPO_ROOT}\\`, "").replace(`${REPO_ROOT}/`, "")),
    minPnlObservations: MIN_PNL_OBSERVATIONS,
    mode: hasEnoughPnl ? "pnl-backtest" : "selection-replay-only",
    observationCount: observations.length,
    realSnapshotCount: manifest.snapshotCount,
    reason: hasEnoughPnl
      ? "Enough forward price observations were found to report basic replay PnL metrics."
      : "Not enough forward price observations were found; output is selection replay only and makes no PnL claim.",
    snapshotSpanHours: manifest.spanHours,
    ...(hasEnoughPnl ? { pnlMetrics: buildPnlMetrics(observations) } : {}),
  };

  await mkdir(replayDir, { recursive: true });
  const jsonPath = resolve(replayDir, "fourmeme-real-backtest.summary.json");
  const mdPath = resolve(replayDir, "fourmeme-real-backtest.summary.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    writeFile(mdPath, renderMarkdown(summary), "utf8"),
  ]);

  if (args.plain) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`Wrote real backtest JSON to ${jsonPath}`);
  console.log(`Wrote real backtest summary to ${mdPath}`);
  console.log(`${summary.mode}; forward observations ${summary.observationCount}.`);
}

function buildForwardObservations(snapshots: FourMemeRealSnapshot[]): ForwardObservation[] {
  const observations: ForwardObservation[] = [];
  for (let index = 0; index < snapshots.length; index += 1) {
    const entrySnapshot = snapshots[index];
    const entryAtMs = new Date(entrySnapshot.capturedAt).getTime();
    const entryCandidates = candidatePriceMap(entrySnapshot);
    for (const selected of entrySnapshot.fourMemeDiscovery.selectedCandidates) {
      const tokenAddress = selected.tokenAddress.toLowerCase();
      const entryPriceUsd = entryCandidates.get(tokenAddress)?.priceUsd ?? 0;
      if (!Number.isFinite(entryPriceUsd) || entryPriceUsd <= 0) {
        continue;
      }

      for (const horizonHours of HORIZONS) {
        const exitSnapshot = snapshots
          .slice(index + 1)
          .find((candidate) => new Date(candidate.capturedAt).getTime() >= entryAtMs + horizonHours * 3_600_000);
        if (!exitSnapshot) {
          continue;
        }
        const exitPriceUsd = candidatePriceMap(exitSnapshot).get(tokenAddress)?.priceUsd ?? 0;
        if (!Number.isFinite(exitPriceUsd) || exitPriceUsd <= 0) {
          continue;
        }
        observations.push({
          entryAt: entrySnapshot.capturedAt,
          entryPriceUsd,
          exitAt: exitSnapshot.capturedAt,
          exitPriceUsd,
          horizonHours,
          returnPct: Number((((exitPriceUsd - entryPriceUsd) / entryPriceUsd) * 100).toFixed(4)),
          tokenAddress,
        });
      }
    }
  }
  return observations;
}

function candidatePriceMap(snapshot: FourMemeRealSnapshot): Map<string, FourMemeCandidate> {
  const byAddress = new Map<string, FourMemeCandidate>();
  for (const candidate of [
    ...snapshot.fourMemeDiscovery.safe2apeCandidates,
    ...snapshot.fourMemeDiscovery.mediumRiskCandidates,
    ...snapshot.fourMemeDiscovery.gemHuntCandidates,
    ...snapshot.fourMemeDiscovery.selectedCandidates,
  ]) {
    byAddress.set(candidate.tokenAddress.toLowerCase(), candidate);
  }
  return byAddress;
}

function buildPnlMetrics(observations: ForwardObservation[]): BacktestSummary["pnlMetrics"] {
  const metrics: NonNullable<BacktestSummary["pnlMetrics"]> = {};
  for (const horizon of HORIZONS) {
    const returns = observations
      .filter((observation) => observation.horizonHours === horizon)
      .map((observation) => observation.returnPct)
      .sort((left, right) => left - right);
    if (returns.length === 0) {
      continue;
    }
    metrics[`${horizon}h`] = {
      averageReturnPct: Number((returns.reduce((sum, value) => sum + value, 0) / returns.length).toFixed(4)),
      medianReturnPct: median(returns),
      observationCount: returns.length,
      winRate: Number((returns.filter((value) => value > 0).length / returns.length).toFixed(4)),
    };
  }
  return metrics;
}

function median(values: number[]): number {
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? Number(((values[mid - 1] + values[mid]) / 2).toFixed(4))
    : values[mid];
}

function assertManifestReady(
  manifest: FourMemeRealSnapshotManifest,
  minSnapshots: number,
  minSpanHours: number,
): void {
  if (manifest.source !== "live-fourmeme-cmc-capture") {
    throw new Error(`Real backtest manifest has unsupported source ${manifest.source}.`);
  }
  if (manifest.snapshotCount < minSnapshots) {
    throw new Error(`Real backtest needs at least ${minSnapshots} snapshots; found ${manifest.snapshotCount}.`);
  }
  if (manifest.spanHours < minSpanHours) {
    throw new Error(`Real backtest needs at least ${minSpanHours}h span; found ${manifest.spanHours.toFixed(2)}h.`);
  }
}

function renderMarkdown(summary: BacktestSummary): string {
  const pnlLines = summary.pnlMetrics
    ? Object.entries(summary.pnlMetrics).flatMap(([horizon, metrics]) => [
        `- ${horizon}: observations=${metrics.observationCount}, avg=${metrics.averageReturnPct.toFixed(2)}%, median=${metrics.medianReturnPct.toFixed(2)}%, winRate=${(metrics.winRate * 100).toFixed(2)}%`,
      ])
    : ["- No PnL metrics reported; insufficient forward observations."];

  return [
    "# Four.Meme Real Snapshot Backtest Summary",
    "",
    `Generated at: ${summary.generatedAt}`,
    `Mode: ${summary.mode}`,
    `Reason: ${summary.reason}`,
    "",
    "## Inputs",
    `- Real snapshots: ${summary.realSnapshotCount}`,
    `- Snapshot span hours: ${summary.snapshotSpanHours.toFixed(2)}`,
    `- Forward observations: ${summary.observationCount}`,
    `- Minimum PnL observations: ${summary.minPnlObservations}`,
    "",
    "## PnL Metrics",
    ...pnlLines,
    "",
    "## Caveat",
    summary.mode === "pnl-backtest"
      ? "These are empirical replay metrics from captured snapshots, not a profitability guarantee."
      : "This output intentionally makes no PnL claim.",
    "",
  ].join("\n");
}

function parseArgs(args: string[]): {
  minSnapshots: number;
  minSpanHours: number;
  plain: boolean;
  realDir?: string;
  replayDir?: string;
} {
  const parsed = {
    minSnapshots: DEFAULT_MIN_SNAPSHOTS,
    minSpanHours: DEFAULT_MIN_SPAN_HOURS,
    plain: false,
    realDir: undefined as string | undefined,
    replayDir: undefined as string | undefined,
  };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--plain") {
      parsed.plain = true;
      continue;
    }
    if (["--min-snapshots", "--min-span-hours", "--real-dir", "--replay-dir"].includes(token)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${token}.`);
      }
      if (token === "--min-snapshots") {
        parsed.minSnapshots = parsePositiveNumber(value, token);
      } else if (token === "--min-span-hours") {
        parsed.minSpanHours = parsePositiveNumber(value, token);
      } else if (token === "--real-dir") {
        parsed.realDir = value;
      } else {
        parsed.replayDir = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return parsed;
}

function parsePositiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/gu, "/");
}

async function readJson<T>(path: string): Promise<T> {
  await access(path);
  return JSON.parse(await readFile(path, "utf8")) as T;
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
