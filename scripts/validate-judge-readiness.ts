import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { routeSkill } from "../src/skills/marketplace-router.js";
import { validateCmcSkillProofBundle } from "../src/proofs/cmc-skill-proof.js";
import type { CmcSkillProofBundle } from "../src/types/cmc-skill-proof.js";
import type { FourMemeOnchainEnrichmentSnapshot } from "../src/types/fourmeme-onchain-enrichment.js";
import type { FourMemeRealSnapshotManifest } from "../src/types/fourmeme-real-snapshot.js";
import type { StrategySpec } from "../src/types/strategy-spec.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FOURMEME_PROPOSED_DIR = resolve(REPO_ROOT, "examples", "generated", "fourmeme-proposed");
const STRATEGY_PATH = resolve(FOURMEME_PROPOSED_DIR, "cmc-market-regime.strategy.json");
const ONCHAIN_PATH = resolve(FOURMEME_PROPOSED_DIR, "fourmeme-onchain-enrichment.snapshot.json");
const REPLAY_PACK_PATH = resolve(REPO_ROOT, "examples", "replay-pack", "fourmeme", "snapshots.json");
const CMC_SKILL_PROOF_PATH = resolve(REPO_ROOT, "examples", "proofs", "cmc-skills", "fourmeme-onchain-proof.bundle.json");
const REAL_MANIFEST_PATH = resolve(REPO_ROOT, "examples", "real-snapshots", "fourmeme", "manifest.json");
const REAL_REPLAY_PATH = resolve(REPO_ROOT, "examples", "replay", "fourmeme-real-replay.summary.json");
const REAL_BACKTEST_PATH = resolve(REPO_ROOT, "examples", "replay", "fourmeme-real-backtest.summary.json");
const README_PATH = resolve(REPO_ROOT, "README.md");
const DEMO_SCRIPT_PATH = resolve(REPO_ROOT, "docs", "demo-script.md");
const PACKAGE_PATH = resolve(REPO_ROOT, "package.json");
const MIN_REAL_SNAPSHOTS = 30;
const MIN_REAL_SPAN_HOURS = 12;
const MIN_PNL_OBSERVATIONS = 10;

interface PackageJson {
  scripts?: Record<string, string>;
}

interface ReplayPack {
  snapshots?: Array<{
    candidates?: Array<{
      tokenAddress?: string;
    }>;
  }>;
}

interface RealReplaySummary {
  methodologyNote?: string;
  realSnapshotCount?: number;
  snapshotSpanHours?: number;
}

interface RealBacktestSummary {
  mode?: "pnl-backtest" | "selection-replay-only";
  observationCount?: number;
  pnlMetrics?: unknown;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [packageJson, strategySpec, onchainSnapshot, replayPack, readme, demoScript] = await Promise.all([
    readJson<PackageJson>(PACKAGE_PATH),
    readJson<StrategySpec>(STRATEGY_PATH),
    readJson<FourMemeOnchainEnrichmentSnapshot>(ONCHAIN_PATH),
    readJson<ReplayPack>(REPLAY_PACK_PATH),
    readFile(README_PATH, "utf8"),
    readFile(DEMO_SCRIPT_PATH, "utf8"),
  ]);

  assertScript(packageJson, "judge:live");
  assertScript(packageJson, "judge:replay");
  assertScript(packageJson, "judge:empirical");
  assertScript(packageJson, "skill:probe");
  assertScript(packageJson, "skill:proof:import");
  assertScript(packageJson, "skill:proof:live");
  assertScript(packageJson, "skill:proof:preflight");
  assertScript(packageJson, "replay:fourmeme-pack");
  assertScript(packageJson, "replay:fourmeme-real");
  assertScript(packageJson, "backtest:fourmeme-real");
  assertScript(packageJson, "capture:fourmeme-real");
  assertScript(packageJson, "validate:cmc-skill-proof");

  if (!strategySpec.skillRoute?.skillExecution) {
    throw new Error("Proposed strategy artifact is missing skillRoute.skillExecution.");
  }

  if (!onchainSnapshot.skillExecution) {
    throw new Error("On-chain enrichment artifact is missing skillExecution.");
  }

  const snapshots = replayPack.snapshots ?? [];
  if (snapshots.length < 10) {
    throw new Error(`Replay pack must contain at least 10 snapshots; found ${snapshots.length}.`);
  }

  for (const address of collectFixtureAddresses(strategySpec, onchainSnapshot, replayPack)) {
    if (isFakeLookingAddress(address)) {
      throw new Error(`Fake-looking fixture address detected: ${address}`);
    }
  }

  const marketReportRoute = await routeSkill("Give me a crypto market report");
  if (marketReportRoute.selectedSkill === "4lpha_fourmeme_strategy_skill") {
    throw new Error("Generic crypto market report query must not route to Four.Meme primary skill.");
  }

  if (marketReportRoute.routeStatus !== "context_only" || marketReportRoute.selectedSkill !== "cmc_market_report") {
    throw new Error(`Expected market report query to route context_only to cmc_market_report, got ${marketReportRoute.routeStatus}/${marketReportRoute.selectedSkill ?? "none"}.`);
  }

  const unrelatedRoute = await routeSkill("write a poem");
  if (unrelatedRoute.routeStatus !== "no_match" || unrelatedRoute.selectedSkill) {
    throw new Error("Unrelated query must return no_match and no selected skill.");
  }

  assertNoUnsupportedLiveClaims(readme, strategySpec.skillRoute.skillExecution.mode, "README.md");
  assertNoUnsupportedLiveClaims(demoScript, strategySpec.skillRoute.skillExecution.mode, "docs/demo-script.md");
  await assertRealProofAndReplayReadiness({
    strict: args.strictReal,
    selectedAddresses: collectFixtureAddresses(strategySpec, onchainSnapshot, replayPack),
  });

  console.log("judge readiness validation passed.");
}

function assertScript(packageJson: PackageJson, scriptName: string): void {
  if (!packageJson.scripts?.[scriptName]) {
    throw new Error(`package.json is missing npm script: ${scriptName}`);
  }
}

function collectFixtureAddresses(
  strategySpec: StrategySpec,
  onchainSnapshot: FourMemeOnchainEnrichmentSnapshot,
  replayPack: ReplayPack,
): string[] {
  return [
    ...(strategySpec.universe.sampleCandidates ?? []).map((candidate) => candidate.tokenAddress),
    ...onchainSnapshot.candidates.map((candidate) => candidate.tokenAddress),
    ...(replayPack.snapshots ?? []).flatMap((snapshot) =>
      (snapshot.candidates ?? []).map((candidate) => candidate.tokenAddress ?? ""),
    ),
  ].filter(Boolean);
}

async function assertRealProofAndReplayReadiness(input: {
  selectedAddresses: string[];
  strict: boolean;
}): Promise<void> {
  const proofBundle = await readJsonIfExists<CmcSkillProofBundle>(CMC_SKILL_PROOF_PATH);
  if (proofBundle) {
    const selectedAddresses = [
      ...input.selectedAddresses,
      ...(await collectRealManifestSelectedAddresses()),
    ];
    validateCmcSkillProofBundle(proofBundle, {
      allowedTokenAddresses: selectedAddresses,
    });
  } else if (input.strict) {
    throw new Error("Strict judge readiness requires examples/proofs/cmc-skills/fourmeme-onchain-proof.bundle.json.");
  } else {
    console.log("Skipping strict CMC skill proof gate; no real proof bundle is committed yet.");
  }

  const manifest = await readJsonIfExists<FourMemeRealSnapshotManifest>(REAL_MANIFEST_PATH);
  if (manifest) {
    assertRealManifest(manifest);
  } else if (input.strict) {
    throw new Error("Strict judge readiness requires examples/real-snapshots/fourmeme/manifest.json.");
  } else {
    console.log("Skipping strict real snapshot gate; no real snapshot manifest is committed yet.");
  }

  const replay = await readJsonIfExists<RealReplaySummary>(REAL_REPLAY_PATH);
  if (replay) {
    assertRealReplaySummary(replay);
  } else if (input.strict) {
    throw new Error("Strict judge readiness requires examples/replay/fourmeme-real-replay.summary.json.");
  }

  const backtest = await readJsonIfExists<RealBacktestSummary>(REAL_BACKTEST_PATH);
  if (backtest) {
    assertRealBacktestSummary(backtest);
  } else if (input.strict) {
    throw new Error("Strict judge readiness requires examples/replay/fourmeme-real-backtest.summary.json.");
  }
}

function assertRealManifest(manifest: FourMemeRealSnapshotManifest): void {
  if (manifest.source !== "live-fourmeme-cmc-capture") {
    throw new Error(`Real snapshot manifest source must be live-fourmeme-cmc-capture; got ${manifest.source}.`);
  }
  if (manifest.snapshotCount < MIN_REAL_SNAPSHOTS) {
    throw new Error(`Real snapshot manifest needs at least ${MIN_REAL_SNAPSHOTS} snapshots; found ${manifest.snapshotCount}.`);
  }
  if (manifest.spanHours < MIN_REAL_SPAN_HOURS) {
    throw new Error(`Real snapshot manifest needs at least ${MIN_REAL_SPAN_HOURS}h span; found ${manifest.spanHours.toFixed(2)}h.`);
  }
  const serialized = JSON.stringify(manifest).toLowerCase();
  if (serialized.includes("synthetic") || serialized.includes("fixture") || serialized.includes("methodologynote")) {
    throw new Error("Real snapshot manifest contains synthetic/fixture methodology labels.");
  }
}

function assertRealReplaySummary(summary: RealReplaySummary): void {
  if ((summary.realSnapshotCount ?? 0) < MIN_REAL_SNAPSHOTS) {
    throw new Error(`Real replay summary needs at least ${MIN_REAL_SNAPSHOTS} snapshots.`);
  }
  if ((summary.snapshotSpanHours ?? 0) < MIN_REAL_SPAN_HOURS) {
    throw new Error(`Real replay summary needs at least ${MIN_REAL_SPAN_HOURS}h span.`);
  }
  if (!/real captured snapshots|live-captured/iu.test(summary.methodologyNote ?? "")) {
    throw new Error("Real replay summary must state that it uses real captured snapshots.");
  }
}

function assertRealBacktestSummary(summary: RealBacktestSummary): void {
  if (summary.mode === "pnl-backtest") {
    if ((summary.observationCount ?? 0) < MIN_PNL_OBSERVATIONS) {
      throw new Error(`PnL backtest mode requires at least ${MIN_PNL_OBSERVATIONS} observations.`);
    }
    if (!summary.pnlMetrics) {
      throw new Error("PnL backtest mode must include pnlMetrics.");
    }
    return;
  }

  if (summary.mode !== "selection-replay-only") {
    throw new Error(`Unsupported real backtest mode: ${String(summary.mode)}.`);
  }

  if (summary.pnlMetrics) {
    throw new Error("selection-replay-only backtest must not include pnlMetrics.");
  }
}

async function collectRealManifestSelectedAddresses(): Promise<string[]> {
  const manifest = await readJsonIfExists<FourMemeRealSnapshotManifest>(REAL_MANIFEST_PATH);
  return [
    ...new Set(
      (manifest?.snapshots ?? []).flatMap((snapshot) =>
        snapshot.selectedTokenAddresses.map((address) => address.toLowerCase()),
      ),
    ),
  ];
}

function isFakeLookingAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/u.test(normalized)) {
    return true;
  }

  const body = normalized.slice(2);
  if (/^([a-f0-9])\1{39}$/u.test(body)) {
    return true;
  }

  return (
    normalized === "0x0000000000000000000000000000000000000000" ||
    normalized === "0x000000000000000000000000000000000000dead" ||
    normalized === "0xdead000000000000000000000000000000000000"
  );
}

function assertNoUnsupportedLiveClaims(
  text: string,
  routeExecutionMode: string,
  label: string,
): void {
  if (routeExecutionMode === "live-execution" || routeExecutionMode === "live-probe") {
    return;
  }

  const forbiddenPatterns = [
    /live\s+marketplace\s+execution/iu,
    /cloud-executed\s+marketplace/iu,
    /cloud\s+execution\s+is\s+used/iu,
  ];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) {
      throw new Error(`${label} appears to claim live marketplace/cloud execution while route mode is ${routeExecutionMode}.`);
    }
  }
}

function parseArgs(args: string[]): {
  strictReal: boolean;
} {
  let strictReal = false;
  for (const token of args) {
    if (token === "--strict-real") {
      strictReal = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return { strictReal };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  try {
    await access(path);
    return await readJson<T>(path);
  } catch {
    return undefined;
  }
}

await main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
