export interface CliCapability {
  id:
    | "catalog.list"
    | "catalog.show"
    | "menu.open"
    | "market.fetch-cmc"
    | "token.info"
    | "strategy.generate"
    | "strategy.validate"
    | "example.generate"
    | "bnbagent.dry-run";
  command: string;
  summary: string;
  details: string;
  examples: string[];
  outputs?: string[];
}

export const CLI_CAPABILITIES: CliCapability[] = [
  {
    id: "menu.open",
    command: "menu",
    summary: "Open an interactive arrow-key launcher for the main demo commands.",
    details:
      "Use this for polished video demos when an operator should pick numbered actions with arrow keys and Enter, then return to the main menu after each action.",
    examples: ["npx --yes . menu", "4lpha-agent-skill menu"],
  },
  {
    id: "catalog.list",
    command: "catalog list",
    summary: "Show every repo-visible capability in the strategy-skill CLI.",
    details:
      "Use this first in demos so judges can see that the skill exposes a small, inspectable capability surface rather than a black-box script.",
    examples: ["npm run cli -- catalog list"],
  },
  {
    id: "catalog.show",
    command: "catalog show <capability-id>",
    summary: "Explain one CLI capability in detail, including its command shape and expected outputs.",
    details:
      "This mirrors the Byreal-style catalog flow and makes the skill feel discoverable before running live commands.",
    examples: ["npm run cli -- catalog show strategy.generate"],
  },
  {
    id: "market.fetch-cmc",
    command: "market fetch-cmc [--cmc-provider rest|agent-hub-mcp] [--out <file>] [--stdout]",
    summary: "Fetch live CoinMarketCap market context using either direct REST or official Agent Hub MCP.",
    details:
      "This is the clean proof point that the repo is using real CMC-backed inputs, not just bundled fixtures. The default provider is REST, and the Agent Hub path uses the official CoinMarketCap MCP endpoint.",
    examples: [
      "npm run cli -- market fetch-cmc",
      "npm run cli -- market fetch-cmc --out examples/generated/cmc-market-context.snapshot.json",
      "npm run cli -- market fetch-cmc --cmc-provider agent-hub-mcp --out examples/generated/cmc-market-context.snapshot.json",
    ],
    outputs: ["CMC market context JSON"],
  },
  {
    id: "token.info",
    command: "token info --lane fourmeme|bstocks --contract <0x-address> [--out <file>] [--stdout]",
    summary: "Fetch a lane-specific token info snapshot for a Four.Meme or bStocks contract.",
    details:
      "This is the contract-level preflight input for brain review. Four.Meme combines CMC Agent Hub, CMC DEX search, and Four.Meme venue fields. bStocks resolves only through the committed six-contract allowlist before using CMC Agent Hub.",
    examples: [
      "npm run cli -- token info --lane fourmeme --contract 0x0a43fc31a73013089df59194872ecae4cae14444 --stdout",
      "npm run cli -- token info --lane bstocks --contract 0x02fca66c1d1afb4e2a7884261eb00f63598a7436 --stdout",
      "npm run cli -- token info --lane bstocks --contract 0x02fca66c1d1afb4e2a7884261eb00f63598a7436 --out examples/generated/bstocks/token-info.snapshot.json",
    ],
    outputs: ["token-info.snapshot.json"],
  },
  {
    id: "strategy.generate",
    command: "strategy generate [--lane fourmeme|bstocks] [--token-contract <0x-address>] [--cmc-provider rest|agent-hub-mcp] [--artifacts-dir <dir>] [--brain-mode off|single-agent|multi-agent] [--brain-provider local-rules|openai-compatible] [--stdout]",
    summary: "Generate, brain-review, validate, and save a lane-specific backtestable strategy spec.",
    details:
      "This is the main Track 2 command. The default lane is Four.Meme. The bStocks lane uses a separate CMC-backed allowlist flow and writes both draft and brain-reviewed strategy artifacts while preserving lane separation. REST stays as the fallback, and Agent Hub MCP is available as a first-class data path.",
    examples: [
      "npm run cli -- strategy generate",
      "npm run cli -- strategy generate --cmc-provider agent-hub-mcp",
      "npm run cli -- strategy generate --lane bstocks",
      "npm run cli -- strategy generate --lane bstocks --cmc-provider agent-hub-mcp",
      "npm run cli -- strategy generate --lane fourmeme --token-contract 0x0a43fc31a73013089df59194872ecae4cae14444",
      "npm run cli -- strategy generate --lane bstocks --token-contract 0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
      "npm run cli -- strategy generate --brain-mode single-agent",
      "npm run cli -- strategy generate --lane bstocks --brain-mode multi-agent --brain-provider local-rules",
      "npm run cli -- strategy generate --artifacts-dir examples/generated",
    ],
    outputs: [
      "Four.Meme lane: cmc-market-context.snapshot.json, fourmeme-discovery.snapshot.json, cmc-market-regime.strategy.json, demo.summary.md",
      "bStocks lane: cmc-market-context.snapshot.json, bstocks-universe.snapshot.json, bstocks-draft.strategy.json, bstocks-reviewed.strategy.json, demo.summary.md",
    ],
  },
  {
    id: "strategy.validate",
    command: "strategy validate [--lane fourmeme|bstocks] [--stage draft|reviewed] <file>",
    summary: "Validate a lane-specific strategy JSON file against the correct repo schema.",
    details:
      "Use this immediately after generation in the demo to show that the output is machine-readable and schema-constrained. The bStocks lane requires an explicit validation stage.",
    examples: [
      "npm run cli -- strategy validate examples/generated/cmc-market-regime.strategy.json",
      "npm run cli -- strategy validate --lane bstocks --stage draft examples/generated/bstocks/bstocks-draft.strategy.json",
      "npm run cli -- strategy validate --lane bstocks --stage reviewed examples/generated/bstocks/bstocks-reviewed.strategy.json",
    ],
  },
  {
    id: "example.generate",
    command: "example generate [--lane fourmeme|bstocks] [--cmc-provider rest|agent-hub-mcp] [--artifacts-dir <dir>] [--brain-mode off|single-agent|multi-agent]",
    summary: "Run the judge-friendly one-command demo bundle generation flow with brain review.",
    details:
      "This is the shortest rerun path for judges and for demo recording. The default lane is Four.Meme, and the bStocks lane writes both draft and reviewed artifacts. The default mode uses local-rules so the demo works without exposing LLM API keys, while `--cmc-provider agent-hub-mcp` shows the sponsor-backed data path.",
    examples: [
      "npm run demo",
      "npm run demo -- --cmc-provider agent-hub-mcp",
      "npm run demo -- --lane bstocks",
      "npm run demo -- --lane bstocks --cmc-provider agent-hub-mcp",
      "4lpha-agent-skill demo --lane bstocks --brain-mode multi-agent",
    ],
    outputs: [
      "Lane-scoped artifacts written under the selected artifacts directory",
    ],
  },
  {
    id: "bnbagent.dry-run",
    command: "bnbagent dry-run [--debug]",
    summary: "Run the official BNBAgent SDK preflight without broadcasting a transaction.",
    details:
      "This wraps the Python ERC-8004 integration so the repo can show SDK readiness from the same CLI surface as the strategy commands.",
    examples: ["npm run cli -- bnbagent dry-run --debug"],
    outputs: ["BNBAgent dry-run JSON payload"],
  },
];

export function findCapability(capabilityId: string): CliCapability | undefined {
  return CLI_CAPABILITIES.find((capability) => capability.id === capabilityId);
}
