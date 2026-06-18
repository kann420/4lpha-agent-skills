import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { select } from "@inquirer/prompts";

import {
  createCmcDataProviderFromEnv,
  loadRepoEnv,
  normalizeCmcDataTransport,
  readCmcDataProviderFromEnv,
  type CmcDataTransport,
} from "../src/adapters/cmc/client.js";
import { readBstocksUniverseFile } from "../src/adapters/bstocks/client.js";
import { CLI_CAPABILITIES, findCapability } from "../src/cli/capabilities.js";
import { createCliUi } from "../src/cli/ui.js";
import { fetchTokenInfoSnapshot } from "../src/adapters/token-info/client.js";
import { generateBstocksStrategyArtifacts } from "../src/pipelines/generate-bstocks-strategy-artifacts.js";
import { generateStrategyArtifacts } from "../src/pipelines/generate-strategy-artifacts.js";
import {
  validateBstocksDraftStrategySpec,
  validateBstocksReviewedStrategySpec,
} from "../src/output/validate-bstocks-strategy-spec.js";
import { validateStrategySpec } from "../src/output/validate-strategy-spec.js";
import { validateTokenInfoSnapshot } from "../src/output/validate-token-info-snapshot.js";
import type { BrainRuntimeOptions } from "../src/brain/types.js";
import type {
  BstocksDraftStrategySpec,
  BstocksReviewedStrategySpec,
} from "../src/types/bstocks-strategy-spec.js";
import type { StrategySpec } from "../src/types/strategy-spec.js";
import type { TokenInfoSnapshot } from "../src/types/token-info.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_LOCAL_PATH = resolve(REPO_ROOT, ".env.local");
const CMC_API_KEYS_URL = "https://coinmarketcap.com/api/dashboard/api-keys/";
const DEFAULT_FOURMEME_ARTIFACTS_DIR = resolve(REPO_ROOT, "examples", "generated");
const DEFAULT_BSTOCKS_ARTIFACTS_DIR = resolve(REPO_ROOT, "examples", "generated", "bstocks");

type StrategyLane = "fourmeme" | "bstocks";
type BstocksValidationStage = "draft" | "reviewed";
type MenuChoiceResult = "back" | "exit" | "prompt-next";
type FourMemeGenerationResult = Awaited<ReturnType<typeof generateStrategyArtifacts>>;
type BstocksGenerationResult = Awaited<ReturnType<typeof generateBstocksStrategyArtifacts>>;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [group, action, ...rest] = args;

  if (!group || group === "help" || group === "--help" || group === "-h") {
    printUsage();
    return;
  }

  if (group === "version" || group === "--version" || group === "-v") {
    printVersion();
    return;
  }

  if (group === "menu") {
    await handleMenu(rest);
    return;
  }

  if (group === "demo") {
    await handleStrategyGenerate(action ? [action, ...rest] : [], {
      commandLabel: "example.generate",
      judgeMode: true,
    });
    return;
  }

  if (group === "catalog" && action === "list") {
    const parsed = parseFlags(rest, ["--plain"], []);
    printCatalogList(parsed.flags.has("--plain"));
    return;
  }

  if (group === "catalog" && action === "show") {
    const capabilityId = rest[0];
    if (!capabilityId) {
      throw new Error("Missing capability id. Example: npm run cli -- catalog show strategy.generate");
    }

    const parsed = parseFlags(rest.slice(1), ["--plain"], []);
    printCatalogShow(capabilityId, parsed.flags.has("--plain"));
    return;
  }

  if (group === "market" && action === "fetch-cmc") {
    await handleMarketFetch(rest);
    return;
  }

  if (group === "token" && action === "info") {
    await handleTokenInfo(rest);
    return;
  }

  if (group === "strategy" && action === "generate") {
    await handleStrategyGenerate(rest, { commandLabel: "strategy.generate" });
    return;
  }

  if (group === "strategy" && action === "validate") {
    await handleStrategyValidate(rest);
    return;
  }

  if (group === "example" && action === "generate") {
    await handleStrategyGenerate(rest, { commandLabel: "example.generate", judgeMode: true });
    return;
  }

  if (group === "bnbagent" && action === "dry-run") {
    await handleBnbAgentDryRun(rest);
    return;
  }

  throw new Error(`Unknown command: ${args.join(" ")}`);
}

async function handleMarketFetch(args: string[]): Promise<void> {
  const options = parseFlags(args, ["--plain", "--stdout"], ["--cmc-provider", "--out"]);
  const ui = createCliUi({
    plain: options.flags.has("--plain"),
    stream: process.stderr,
  });
  const provider = resolveRequestedCmcProvider(options.values["--cmc-provider"]);
  await ensureCmcApiKeyForProvider(provider, ui);
  const cmcProvider = createCmcDataProviderFromEnv({
    provider,
  });
  const marketContext = await cmcProvider.fetchMarketContext();

  if (options.values["--out"]) {
    const outPath = resolve(REPO_ROOT, options.values["--out"]);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(marketContext, null, 2)}\n`, "utf8");
    ui.banner("cmc-market-context", "Live CoinMarketCap-backed market snapshot");
    ui.keyValue("Source", "CoinMarketCap", "accent");
    ui.keyValue("Transport", marketContext.transport, marketContext.transport === "agent-hub-mcp" ? "success" : "default");
    ui.keyValue("Output", outPath, "default");
    ui.success("CMC market context written");
  }

  if (options.flags.has("--stdout") || !options.values["--out"]) {
    console.log(JSON.stringify(marketContext, null, 2));
  }
}

async function handleTokenInfo(args: string[]): Promise<void> {
  const parsed = parseFlags(args, ["--plain", "--stdout"], ["--cmc-provider", "--contract", "--lane", "--out"]);
  ensureNoUnexpectedPositionals(parsed.positionals, "token info");
  const plain = parsed.flags.has("--plain");
  const lane = parseLane(parsed.values["--lane"]);
  const contract = parsed.values["--contract"];
  const provider = parseCmcDataProvider(parsed.values["--cmc-provider"]);

  if (!contract) {
    throw new Error("Missing --contract for token info.");
  }

  if (provider && provider !== "agent-hub-mcp") {
    throw new Error("token info requires the CMC Agent Hub MCP provider. Use --cmc-provider agent-hub-mcp or omit the flag.");
  }

  const ui = createCliUi({ plain, tagline: taglineForLane(lane) });
  ui.banner("token-info", "Contract-level token snapshot for brain review");
  ui.keyValue("Lane", lane, lane === "fourmeme" ? "accent" : "success");
  ui.keyValue("Contract", contract, "default");
  ui.step("Fetching token info snapshot...");
  const tokenInfo = await fetchTokenInfoSnapshot({ contract, lane });
  await validateTokenInfoSnapshot(tokenInfo);

  if (parsed.values["--out"]) {
    const outPath = resolve(REPO_ROOT, parsed.values["--out"]);
    await mkdir(dirname(outPath), { recursive: true });
    await writeJsonFile(outPath, tokenInfo);
    ui.keyValue("Output", outPath, "default");
  }

  printTokenInfoSummary(ui, tokenInfo);

  if (parsed.flags.has("--stdout") || !parsed.values["--out"]) {
    console.log(JSON.stringify(tokenInfo, null, 2));
  }
}

async function handleMenu(args: string[]): Promise<void> {
  const parsed = parseFlags(args, ["--plain"], []);
  const plain = parsed.flags.has("--plain");
  const ui = createCliUi({ plain });

  if (!process.stdin.isTTY) {
    ui.banner("menu", "Interactive launcher requires a TTY");
    ui.warning("No interactive terminal detected. Use `npx --yes . help` to see command mode.");
    return;
  }

  while (true) {
    ui.banner("menu", "Use arrow keys and Enter to run a demo command");

    const choice = await select({
      message: "What would you like to run?",
      choices: [
        {
          name: "0. Enter CMC API KEY",
          value: "cmc.api-key",
          description: "Add a CoinMarketCap API key for live CMC-backed data.",
        },
        {
          name: "1. Generate strategy overview",
          value: "demo",
          description: "Generate live lane artifacts and validate the selected strategy spec.",
        },
        {
          name: "2. Live strategy run",
          value: "judge.live",
          description: "Generate and validate a live CMC Agent Hub strategy run.",
        },
        {
          name: "3. Fetch token info (Four.Meme + bStocks)",
          value: "token.info",
          description: "Fetch a contract-level token snapshot for brain review.",
        },
        {
          name: "4. Reproducible replay",
          value: "judge.replay",
          description: "Run the proposed-case fixture, replay pack, and readiness checks.",
        },
        {
          name: "5. BNBAgent dry-run",
          value: "bnbagent.dry-run",
          description: "Run official BNBAgent SDK preflight without broadcasting a transaction.",
        },
        {
          name: "6. Exit",
          value: "exit",
          description: "Close the menu without running another command.",
        },
      ],
    });

    if (choice === "exit") {
      ui.success("Bye.");
      return;
    }

    const result = await runMenuChoice(choice, plain);

    if (result === "exit") {
      ui.success("Bye.");
      return;
    }

    if (result === "back") {
      continue;
    }

    const next = await select({
      message: "What next?",
      choices: [
        {
          name: "1. Back to menu",
          value: "back",
          description: "Return to the main 4/_PHA skill menu.",
        },
        {
          name: "2. Exit",
          value: "exit",
          description: "Close the interactive launcher.",
        },
      ],
    });

    if (next === "exit") {
      ui.success("Bye.");
      return;
    }
  }
}

async function runMenuChoice(choice: string, plain: boolean): Promise<MenuChoiceResult> {
  const inheritedFlags = plain ? ["--plain"] : [];

  switch (choice) {
    case "cmc.api-key":
      await handleCmcApiKeySetup(plain);
      return "prompt-next";
    case "demo": {
      const lane = await promptForLane();
      await handleStrategyGenerate(["--lane", lane, ...inheritedFlags], { commandLabel: "example.generate", judgeMode: true });
      return "prompt-next";
    }
    case "judge.live":
      await handleJudgeLiveMenuCommand(plain);
      return "prompt-next";
    case "judge.replay":
      await handleJudgeReplayMenuCommand(plain);
      return "prompt-next";
    case "catalog.list":
      printCatalogList(plain);
      return "prompt-next";
    case "catalog.show.strategy":
      printCatalogShow("strategy.generate", plain);
      return "prompt-next";
    case "market.fetch-cmc":
      await handleMarketFetch(["--out", "examples/generated/cmc-market-context.snapshot.json", ...inheritedFlags]);
      return "prompt-next";
    case "token.info":
      return handleTokenInfoMenu(plain, inheritedFlags);
    case "strategy.generate": {
      const lane = await promptForLane();
      await handleStrategyGenerate(["--lane", lane, ...inheritedFlags], { commandLabel: "strategy.generate" });
      return "prompt-next";
    }
    case "strategy.validate": {
      const lane = await promptForLane();
      if (lane === "fourmeme") {
        await handleStrategyValidate(["--lane", lane, "examples/generated/cmc-market-regime.strategy.json", ...inheritedFlags]);
        return "prompt-next";
      }

      const stage = await promptForBstocksStage();
      const path = stage === "draft"
        ? "examples/generated/bstocks/bstocks-draft.strategy.json"
        : "examples/generated/bstocks/bstocks-reviewed.strategy.json";
      await handleStrategyValidate(["--lane", lane, "--stage", stage, path, ...inheritedFlags]);
      return "prompt-next";
    }
    case "bnbagent.dry-run":
      await handleBnbAgentDryRun(["--debug", ...inheritedFlags]);
      return "prompt-next";
    default:
      throw new Error(`Unknown menu choice: ${choice}`);
  }
}

async function handleJudgeLiveMenuCommand(plain: boolean): Promise<void> {
  const ui = createCliUi({ plain });
  ui.banner("judge-live", "Live CMC Agent Hub path. A rejected strategy is still a valid backtestable output when gates fail.");
  ui.keyValue("Command", "judge:live", "accent");
  ui.spacer();

  await runTsxScript("scripts/probe-skill-marketplace.ts", ["--plain"]);
  await handleStrategyGenerate(["--cmc-provider", "agent-hub-mcp", "--plain"], {
    commandLabel: "example.generate",
    judgeMode: true,
  });
  await handleStrategyValidate(["--lane", "fourmeme", "examples/generated/cmc-market-regime.strategy.json", "--plain"]);
}

async function handleJudgeReplayMenuCommand(plain: boolean): Promise<void> {
  const ui = createCliUi({ plain });
  ui.banner("judge-replay", "Offline fixture/replay path. This proves the happy path and methodology without claiming live profitability.");
  ui.keyValue("Command", "judge:replay", "accent");
  ui.spacer();

  await runTsxScript("scripts/generate-fourmeme-proposed-fixture.ts");
  await runTsxScript("scripts/replay-fourmeme-fixture.ts");
  await runTsxScript("scripts/replay-fourmeme-pack.ts");
  await runTsxScript("scripts/validate-examples.ts");
  await runTsxScript("scripts/validate-judge-readiness.ts");
}

async function handleCmcApiKeySetup(plain: boolean): Promise<void> {
  const ui = createCliUi({ plain });
  ui.banner("cmc-api-key", "Configure CoinMarketCap data access");
  ui.branch("Create or copy your API key here:", "default");
  ui.branch(CMC_API_KEYS_URL, "accent");
  ui.branch("Paste the key below. The input is hidden while you type.", "muted");

  const apiKey = await promptForCmcApiKey();
  process.env.CMC_API_KEY = apiKey;

  const shouldSave = await promptToSaveCmcApiKey();
  if (shouldSave) {
    await upsertEnvLocalValue("CMC_API_KEY", apiKey);
    ui.success("Saved CMC_API_KEY to .env.local.");
    return;
  }

  ui.branch("Using CoinMarketCap API key for this CLI session only.", "muted");
}

async function handleTokenInfoMenu(
  plain: boolean,
  inheritedFlags: string[],
): Promise<MenuChoiceResult> {
  const ui = createCliUi({ plain });

  while (true) {
    ui.banner("token-info", "Supports Four.Meme tokens and the committed six bStocks contracts");
    ui.branch("Paste a contract address. bStocks contracts are detected from the local allowlist; everything else is treated as Four.Meme.", "muted");
    const contract = await promptForTokenContract();
    const lane = await inferTokenInfoLane(contract);
    const out = lane === "fourmeme"
      ? "examples/generated/token-info.snapshot.json"
      : "examples/generated/bstocks/token-info.snapshot.json";

    await handleTokenInfo(["--lane", lane, "--contract", contract, "--out", out, ...inheritedFlags]);

    const next = await select<"another" | "back" | "exit">({
      message: "What next?",
      choices: [
        {
          name: "1. Fetch another token",
          value: "another",
          description: "Paste another Four.Meme or bStocks contract.",
        },
        {
          name: "2. Back to menu",
          value: "back",
          description: "Return to the main 4/_PHA skill menu.",
        },
        {
          name: "3. Exit",
          value: "exit",
          description: "Close the interactive launcher.",
        },
      ],
    });

    if (next === "another") {
      continue;
    }

    return next;
  }
}

async function promptForLane(): Promise<StrategyLane> {
  const choice = await select<StrategyLane>({
    message: "Which strategy lane?",
    choices: [
      {
        name: "Four.Meme",
        value: "fourmeme",
        description: "Default meme-token lane with Safety -> Social -> Gatekeeper review.",
      },
      {
        name: "bStocks",
        value: "bstocks",
        description: "Tokenized-stock lane with Safety -> Market Analysis -> Gatekeeper review.",
      },
    ],
  });

  return choice;
}

async function promptForBstocksStage(): Promise<BstocksValidationStage> {
  return select<BstocksValidationStage>({
    message: "Which bStocks artifact stage?",
    choices: [
      {
        name: "Draft",
        value: "draft",
        description: "Validate the deterministic draft spec before brain review.",
      },
      {
        name: "Reviewed",
        value: "reviewed",
        description: "Validate the brain-reviewed final strategy spec.",
      },
    ],
  });
}

async function promptForTokenContract(): Promise<string> {
  const { input } = await import("@inquirer/prompts");
  return input({
    message: "Token contract (Four.Meme or bStocks)?",
  });
}

async function inferTokenInfoLane(contract: string): Promise<StrategyLane> {
  const normalized = contract.trim().toLowerCase();
  const universe = await readBstocksUniverseFile();
  return universe.selectionUniverse.some(
    (entry) => entry.contractAddress.toLowerCase() === normalized,
  )
    ? "bstocks"
    : "fourmeme";
}

async function handleStrategyGenerate(
  args: string[],
  options: {
    commandLabel: "strategy.generate" | "example.generate";
    judgeMode?: boolean;
  },
): Promise<void> {
  const parsed = parseFlags(
    args,
    ["--plain", "--stdout"],
    ["--artifacts-dir", "--brain-mode", "--brain-provider", "--cmc-provider", "--lane", "--token-contract"],
  );
  ensureNoUnexpectedPositionals(parsed.positionals, "strategy generate");
  const plain = parsed.flags.has("--plain");
  const lane = parseLane(parsed.values["--lane"]);
  const ui = createCliUi({ plain, tagline: taglineForLane(lane) });
  const artifactsDir = resolve(
    REPO_ROOT,
    parsed.values["--artifacts-dir"] ?? defaultArtifactsDirForLane(lane),
  );
  const provider = resolveRequestedCmcProvider(parsed.values["--cmc-provider"]);
  await ensureCmcApiKeyForProvider(provider, ui);
  const cmcProvider = createCmcDataProviderFromEnv({
    provider,
  });
  const tag = options.commandLabel === "example.generate" ? "judge-demo" : "strategy-generate";
  const brain = parseBrainOptions(parsed.values);

  ui.banner(tag, "Live pipeline with schema-validated output");
  ui.keyValue("Lane", lane, lane === "fourmeme" ? "accent" : "success");
  ui.section("Pipeline");
  const result = lane === "fourmeme"
    ? await generateStrategyArtifacts(artifactsDir, {
        brain,
        cmcProvider,
        onStep: (message) => {
          ui.step(message);
        },
        tokenContract: parsed.values["--token-contract"],
      })
    : await generateBstocksStrategyArtifacts(artifactsDir, {
        brain,
        cmcProvider,
        onStep: (message) => {
          ui.step(message);
        },
        tokenContract: parsed.values["--token-contract"],
      });

  printGenerationSummary({
    commandLabel: options.commandLabel,
    lane,
    plain,
    result,
  }, false);

  if (parsed.flags.has("--stdout")) {
    const outputPayload = lane === "fourmeme"
      ? (result as FourMemeGenerationResult).strategySpec
      : (result as BstocksGenerationResult).reviewedStrategySpec;
    console.log(JSON.stringify(outputPayload, null, 2));
  }

  if (options.judgeMode) {
    ui.success(
      lane === "fourmeme"
        ? "Judge demo bundle ready. Re-run with `npm run demo`."
        : "Judge demo bundle ready. Re-run with `npm run demo -- --lane bstocks`.",
    );
  }
}

async function handleStrategyValidate(args: string[]): Promise<void> {
  const parsed = parseFlags(args, ["--plain"], ["--lane", "--stage"]);
  const targetPath = parsed.positionals[0];
  if (!targetPath) {
    throw new Error("Missing strategy file path. Example: npm run cli -- strategy validate examples/generated/cmc-market-regime.strategy.json");
  }

  if (parsed.positionals.length > 1) {
    throw new Error(`Unexpected extra arguments for strategy validate: ${parsed.positionals.slice(1).join(" ")}`);
  }

  const lane = parseLane(parsed.values["--lane"]);
  const filePath = resolve(REPO_ROOT, targetPath);
  const stage = parseBstocksStage(parsed.values["--stage"]);
  const ui = createCliUi({
    plain: parsed.flags.has("--plain"),
    tagline: taglineForLane(lane),
  });

  if (lane === "fourmeme") {
    if (stage) {
      throw new Error("Do not use --stage with the Four.Meme lane.");
    }

    const strategySpec = JSON.parse(await readFile(filePath, "utf8")) as StrategySpec;
    await validateStrategySpec(strategySpec);
  } else {
    if (!stage) {
      throw new Error("Missing --stage for bStocks validation. Use draft or reviewed.");
    }

    const strategySpec = JSON.parse(await readFile(filePath, "utf8")) as
      | BstocksDraftStrategySpec
      | BstocksReviewedStrategySpec;

    if (stage === "draft") {
      await validateBstocksDraftStrategySpec(strategySpec as BstocksDraftStrategySpec);
    } else {
      await validateBstocksReviewedStrategySpec(strategySpec as BstocksReviewedStrategySpec);
    }
  }

  ui.banner("strategy-validate", "Schema check for generated strategy spec");
  ui.keyValue("Lane", lane, lane === "fourmeme" ? "accent" : "success");
  if (lane === "bstocks") {
    ui.keyValue("Stage", stage ?? "unknown", "default");
  }
  ui.keyValue("File", filePath, "default");
  ui.success("PASS");
}

async function handleBnbAgentDryRun(args: string[]): Promise<void> {
  const parsed = parseFlags(args, ["--debug", "--plain"], []);
  const ui = createCliUi({ plain: parsed.flags.has("--plain") });
  const pythonBin = resolvePythonBin();
  const scriptPath = resolve(REPO_ROOT, "integrations", "bnbagent", "register_identity.py");
  const commandArgs = [scriptPath, "--register", "--dry-run"];

  if (parsed.flags.has("--debug")) {
    commandArgs.push("--debug");
  }

  ui.banner("bnbagent-dry-run", "Official BNBAgent SDK preflight without broadcast");
  ui.keyValue("SDK", "ERC-8004 / BNBAgent", "accent");
  ui.keyValue("Mode", parsed.flags.has("--debug") ? "dry-run + debug" : "dry-run", "default");
  ui.branch("Streaming JSON payload below.", "muted");
  ui.spacer();
  await runChildProcess(pythonBin, commandArgs);
}

function printCatalogList(plain = false): void {
  const ui = createCliUi({ plain });
  ui.banner("capability-catalog", "Repo-visible strategy skill commands");
  ui.keyValue("Skill", "4lpha-agent-skill", "accent");
  ui.keyValue("Lanes", "fourmeme, bstocks", "default");
  ui.keyValue("Command count", String(CLI_CAPABILITIES.length), "success");
  ui.section("Available commands");
  for (const capability of CLI_CAPABILITIES) {
    ui.item(`${capability.id.padEnd(18)} ${capability.summary}`);
  }
}

function printCatalogShow(capabilityId: string, plain = false): void {
  const capability = findCapability(capabilityId);
  if (!capability) {
    throw new Error(`Unknown capability id: ${capabilityId}`);
  }

  const ui = createCliUi({ plain });
  ui.banner("capability-detail", "Inspect one CLI capability before running it");
  ui.keyValue("Capability", capability.id, "accent");
  ui.keyValue("Command", capability.command, "default");
  ui.branch(capability.summary, "default");
  ui.branch(capability.details, "muted");

  if (capability.outputs && capability.outputs.length > 0) {
    ui.section("Outputs");
    for (const output of capability.outputs) {
      ui.item(output);
    }
  }

  ui.section("Examples");
  for (const example of capability.examples) {
    ui.item(example);
  }
}

function printGenerationSummary(
  input: {
    commandLabel: string;
    lane: StrategyLane;
    plain?: boolean;
    result: FourMemeGenerationResult | BstocksGenerationResult;
  },
  includeBanner = true,
): void {
  const ui = createCliUi({ plain: input.plain, tagline: taglineForLane(input.lane) });
  if (includeBanner) {
    ui.banner(
      input.commandLabel === "example.generate" ? "judge-demo" : "strategy-generate",
      "Live pipeline with schema-validated output",
    );
  }

  if (input.lane === "fourmeme") {
    printFourMemeGenerationSummary(ui, input.commandLabel, input.result as FourMemeGenerationResult);
    return;
  }

  printBstocksGenerationSummary(ui, input.commandLabel, input.result as BstocksGenerationResult);
}

function printFourMemeGenerationSummary(
  ui: ReturnType<typeof createCliUi>,
  commandLabel: string,
  result: FourMemeGenerationResult,
): void {
  ui.section("Result");
  ui.keyValue("Command", commandLabel, "accent");
  ui.keyValue("Lane", "fourmeme", "accent");
  ui.keyValue("Status", result.strategySpec.status, result.strategySpec.status === "proposed" ? "success" : "warning");
  ui.keyValue("Regime", result.strategySpec.regime.label, "default");
  ui.keyValue("Confidence", formatConfidence(result.strategySpec.regime.confidence), "default");
  ui.keyValue("CMC transport", result.marketContext.transport, result.marketContext.transport === "agent-hub-mcp" ? "success" : "default");
  ui.keyValue("Brain", `${result.strategySpec.brainReview.mode} / ${result.strategySpec.brainReview.provider}`, "accent");
  ui.keyValue("Brain verdict", result.strategySpec.brainReview.finalVerdict, result.strategySpec.brainReview.finalVerdict === "approve" ? "success" : "warning");
  ui.keyValue("Learning lessons", String(result.strategySpec.brainReview.learning.appliedLessonIds.length), "default");
  if (result.strategySpec.brainReview.agents.length > 0) {
    ui.section("Brain agents");
    for (const agent of result.strategySpec.brainReview.agents) {
      ui.item(`${agent.role}: ${agent.verdict} (${formatConfidence(agent.confidence)}) - ${agent.summary}`);
    }
  }
  ui.section("Venue scan");
  ui.item(`featured candidates: ${result.fourMemeSnapshot.selectedCandidates.length}`);
  ui.item(
    `bucket counts: safe2ape=${result.fourMemeSnapshot.safe2apeCandidates.length}, mediumRisk=${result.fourMemeSnapshot.mediumRiskCandidates.length}, gemHunt=${result.fourMemeSnapshot.gemHuntCandidates.length}`,
  );
}

function printBstocksGenerationSummary(
  ui: ReturnType<typeof createCliUi>,
  commandLabel: string,
  result: BstocksGenerationResult,
): void {
  ui.section("Result");
  ui.keyValue("Command", commandLabel, "accent");
  ui.keyValue("Lane", "bstocks", "success");
  ui.keyValue("Draft status", result.draftStrategySpec.status, result.draftStrategySpec.status === "proposed" ? "success" : "warning");
  ui.keyValue("Reviewed status", result.reviewedStrategySpec.status, result.reviewedStrategySpec.status === "proposed" ? "success" : "warning");
  ui.keyValue("Regime", result.reviewedStrategySpec.regime.label, "default");
  ui.keyValue("Confidence", formatConfidence(result.reviewedStrategySpec.regime.confidence), "default");
  ui.keyValue("CMC transport", result.marketContext.transport, result.marketContext.transport === "agent-hub-mcp" ? "success" : "default");
  ui.keyValue("Quote transport", result.bstocksSnapshot.transport, result.bstocksSnapshot.transport === "agent-hub-mcp" ? "success" : "default");
  ui.keyValue("Brain", `${result.reviewedStrategySpec.brainReview.mode} / ${result.reviewedStrategySpec.brainReview.provider}`, "accent");
  ui.keyValue("Brain verdict", result.reviewedStrategySpec.brainReview.finalVerdict, result.reviewedStrategySpec.brainReview.finalVerdict === "approve" ? "success" : "warning");
  ui.keyValue("Learning lessons", String(result.reviewedStrategySpec.brainReview.learning.appliedLessonIds.length), "default");
  if (result.reviewedStrategySpec.brainReview.agents.length > 0) {
    ui.section("Brain agents");
    for (const agent of result.reviewedStrategySpec.brainReview.agents) {
      ui.item(`${agent.role}: ${agent.verdict} (${formatConfidence(agent.confidence)}) - ${agent.summary}`);
    }
  }
  ui.section("Universe");
  ui.item(`quoteable symbols: ${result.bstocksSnapshot.candidateCount}`);
  ui.item(`issuer / venue: ${result.bstocksSnapshot.issuer} / ${result.bstocksSnapshot.venue}`);
}

function printTokenInfoSummary(ui: ReturnType<typeof createCliUi>, tokenInfo: TokenInfoSnapshot): void {
  ui.section("Token");
  ui.keyValue("Name/Symbol", tokenInfo.display.nameSymbol as string, "accent");

  if (tokenInfo.lane === "fourmeme") {
    ui.keyValue("Price", tokenInfo.display.priceUsd, "default");
    ui.keyValue("24h volume", tokenInfo.display.volume24hUsd, "default");
    ui.keyValue("Total holders", tokenInfo.display.totalHolders, "default");
    ui.keyValue("Market cap", tokenInfo.display.marketCap, "default");
    ui.keyValue("Liquidity", tokenInfo.display.liquidity, "default");
    ui.keyValue("Bonded/graduated", String(tokenInfo.display.bondedOrGraduated), "default");
    ui.keyValue("Bonding status", tokenInfo.display.bondingStatusRaw ?? "n/a", "default");
    ui.keyValue("CMC rank", tokenInfo.display.cmcRank ?? "n/a", "default");
    ui.keyValue("CMC link", tokenInfo.display.cmcLink ?? "n/a", "default");
    ui.keyValue("Creator", tokenInfo.display.creator ?? "n/a", "default");
    ui.keyValue("Created at", tokenInfo.display.createdAtUtc ?? "n/a", "default");
    ui.section("Socials");
    ui.item(`website: ${tokenInfo.display.socials.website ?? "n/a"}`);
    ui.item(`twitter: ${tokenInfo.display.socials.twitter ?? "n/a"}`);
    ui.item(`telegram: ${tokenInfo.display.socials.telegram ?? "n/a"}`);
  } else {
    ui.keyValue("Price", tokenInfo.display.price, "default");
    ui.keyValue("24h change", tokenInfo.display.percentChange24h, "default");
    ui.keyValue("24h volume", tokenInfo.display.volume24h, "default");
    ui.keyValue("CMC rank", tokenInfo.display.cmcRank ?? "n/a", "default");
    ui.keyValue("CMC link", tokenInfo.display.cmcLink ?? "n/a", "default");
    if (tokenInfo.display.description) {
      ui.branch(tokenInfo.display.description, "muted");
    }
  }

  ui.section("News");
  if (tokenInfo.display.latestNews.length === 0) {
    ui.item("No CMC news found", "muted");
    return;
  }

  for (const item of tokenInfo.display.latestNews) {
    ui.item(`${item.title}${item.url ? ` (${item.url})` : ""}`);
  }
}

function formatConfidence(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(2);
}

function parseBrainOptions(
  values: Record<string, string | undefined>,
): Partial<BrainRuntimeOptions> {
  const brain: Partial<BrainRuntimeOptions> = {};

  if (values["--brain-mode"]) {
    if (
      values["--brain-mode"] !== "off" &&
      values["--brain-mode"] !== "single-agent" &&
      values["--brain-mode"] !== "multi-agent"
    ) {
      throw new Error("Unsupported --brain-mode. Use off, single-agent, or multi-agent.");
    }
    brain.mode = values["--brain-mode"];
  }

  if (values["--brain-provider"]) {
    if (
      values["--brain-provider"] !== "local-rules" &&
      values["--brain-provider"] !== "openai-compatible"
    ) {
      throw new Error("Unsupported --brain-provider. Use local-rules or openai-compatible.");
    }
    brain.provider = values["--brain-provider"];
  }

  return brain;
}

function parseLane(value: string | undefined): StrategyLane {
  if (!value || value === "fourmeme") {
    return "fourmeme";
  }

  if (value === "bstocks") {
    return value;
  }

  throw new Error("Unsupported --lane. Use fourmeme or bstocks.");
}

function parseCmcDataProvider(value: string | undefined): CmcDataTransport | undefined {
  if (!value) {
    return undefined;
  }

  return normalizeCmcDataTransport(value);
}

function resolveRequestedCmcProvider(value: string | undefined): CmcDataTransport {
  return parseCmcDataProvider(value) ?? readCmcDataProviderFromEnv();
}

async function ensureCmcApiKeyForProvider(
  provider: CmcDataTransport,
  ui: ReturnType<typeof createCliUi>,
): Promise<void> {
  loadRepoEnv();

  const cmcApiKey = process.env.CMC_API_KEY?.trim();
  const cmcMcpApiKey = process.env.CMC_MCP_API_KEY?.trim();

  if (provider === "rest") {
    if (cmcApiKey) {
      return;
    }

    if (cmcMcpApiKey) {
      process.env.CMC_API_KEY = cmcMcpApiKey;
      return;
    }
  }

  if (provider === "agent-hub-mcp" && (cmcMcpApiKey || cmcApiKey)) {
    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      "Missing CoinMarketCap API key. Set CMC_API_KEY in .env.local, or run this command in an interactive terminal so the CLI can prompt for it.",
    );
  }

  ui.warning("CoinMarketCap API key is missing. The key will be hidden while you type.");
  const apiKey = await promptForCmcApiKey();
  process.env.CMC_API_KEY = apiKey;

  const shouldSave = await promptToSaveCmcApiKey();
  if (shouldSave) {
    await upsertEnvLocalValue("CMC_API_KEY", apiKey);
    ui.success("Saved CMC_API_KEY to .env.local for future local runs.");
  } else {
    ui.branch("Using CoinMarketCap API key for this CLI run only.", "muted");
  }
}

async function promptForCmcApiKey(): Promise<string> {
  const { password } = await import("@inquirer/prompts");
  const apiKey = await password({
    mask: "*",
    message: "CoinMarketCap API key?",
    validate: (value) => value.trim().length > 0 || "API key is required.",
  });

  return apiKey.trim();
}

async function promptToSaveCmcApiKey(): Promise<boolean> {
  const { confirm } = await import("@inquirer/prompts");
  return confirm({
    default: true,
    message: "Save key to .env.local for future local CLI runs?",
  });
}

async function upsertEnvLocalValue(key: string, value: string): Promise<void> {
  if (/[\r\n]/u.test(value)) {
    throw new Error(`${key} must be a single-line value.`);
  }

  let existing = "";
  try {
    existing = await readFile(ENV_LOCAL_PATH, "utf8");
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const line = `${key}=${formatEnvValue(value)}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
  const next = pattern.test(existing)
    ? existing.replace(pattern, line)
    : `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${line}\n`;

  await writeFile(ENV_LOCAL_PATH, next, "utf8");
}

function formatEnvValue(value: string): string {
  if (/^[A-Za-z0-9_.:-]+$/u.test(value)) {
    return value;
  }

  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function parseBstocksStage(value: string | undefined): BstocksValidationStage | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "draft" || value === "reviewed") {
    return value;
  }

  throw new Error("Unsupported --stage. Use draft or reviewed.");
}

function defaultArtifactsDirForLane(lane: StrategyLane): string {
  return lane === "fourmeme" ? DEFAULT_FOURMEME_ARTIFACTS_DIR : DEFAULT_BSTOCKS_ARTIFACTS_DIR;
}

function taglineForLane(lane: StrategyLane): string {
  return "CMC -> Four.Meme/bStocks -> Strategy Spec";
}

function ensureNoUnexpectedPositionals(positionals: string[], commandLabel: string): void {
  if (positionals.length === 0) {
    return;
  }

  throw new Error(`Unexpected positional arguments for ${commandLabel}: ${positionals.join(" ")}`);
}

function resolvePythonBin(): string {
  if (process.env.PYTHON_BIN?.trim()) {
    return process.env.PYTHON_BIN.trim();
  }

  return process.platform === "win32"
    ? resolve(REPO_ROOT, ".venv", "Scripts", "python.exe")
    : resolve(REPO_ROOT, ".venv", "bin", "python");
}

async function runChildProcess(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      shell: false,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`Command failed with exit code ${code ?? "unknown"}: ${command} ${args.join(" ")}`));
    });
  });
}

async function runTsxScript(scriptPath: string, args: string[] = []): Promise<void> {
  await runChildProcess(process.execPath, [
    "--import",
    "tsx",
    resolve(REPO_ROOT, scriptPath),
    ...args,
  ]);
}

function parseFlags(
  args: string[],
  booleanFlags: string[],
  valueFlags: string[],
): {
  flags: Set<string>;
  positionals: string[];
  values: Record<string, string | undefined>;
} {
  const flags = new Set<string>();
  const positionals: string[] = [];
  const values: Record<string, string | undefined> = {};
  const allowedFlags = new Set(booleanFlags);
  const allowedValueFlags = new Set(valueFlags);

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (allowedFlags.has(token)) {
      flags.add(token);
      continue;
    }

    if (allowedValueFlags.has(token)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${token}`);
      }
      values[token] = value;
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`Unknown flag: ${token}`);
    }

    positionals.push(token);
  }

  return { flags, positionals, values };
}

function printUsage(): void {
  const ui = createCliUi();
  ui.banner("help", "BNB strategy skill CLI");
  ui.section("Usage");
  ui.item("4lpha menu");
  ui.item("npx --yes . menu");
  ui.item("4lpha demo");
  ui.item("4lpha demo --lane bstocks");
  ui.item("npm run cli -- catalog list");
  ui.item("npm run cli -- catalog show strategy.generate");
  ui.item("npm run cli -- market fetch-cmc --out examples/generated/cmc-market-context.snapshot.json");
  ui.item("npm run cli -- market fetch-cmc --cmc-provider agent-hub-mcp --out examples/generated/cmc-market-context.snapshot.json");
  ui.item("npm run cli -- token info --lane fourmeme --contract 0x0a43fc31a73013089df59194872ecae4cae14444 --stdout");
  ui.item("npm run cli -- token info --lane bstocks --contract 0x02fca66c1d1afb4e2a7884261eb00f63598a7436 --stdout");
  ui.item("npm run cli -- strategy generate");
  ui.item("npm run cli -- strategy generate --cmc-provider agent-hub-mcp");
  ui.item("npm run cli -- strategy generate --lane fourmeme --token-contract 0x0a43fc31a73013089df59194872ecae4cae14444");
  ui.item("npm run cli -- strategy generate --lane bstocks");
  ui.item("npm run cli -- strategy generate --lane bstocks --token-contract 0x02fca66c1d1afb4e2a7884261eb00f63598a7436");
  ui.item("npm run cli -- strategy generate --lane bstocks --cmc-provider agent-hub-mcp");
  ui.item("npm run cli -- strategy generate --brain-mode single-agent");
  ui.item("npm run cli -- strategy generate --lane bstocks --brain-mode multi-agent --brain-provider local-rules");
  ui.item("npm run cli -- strategy validate examples/generated/cmc-market-regime.strategy.json");
  ui.item("npm run cli -- strategy validate --lane bstocks --stage draft examples/generated/bstocks/bstocks-draft.strategy.json");
  ui.item("npm run cli -- strategy validate --lane bstocks --stage reviewed examples/generated/bstocks/bstocks-reviewed.strategy.json");
  ui.item("npm run demo");
  ui.item("npm run cli -- bnbagent dry-run --debug");
}

function printVersion(): void {
  console.log("4lpha-agent-skill 0.1.0");
}

async function writeJsonFile(path: string, value: object): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
