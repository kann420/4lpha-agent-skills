# 4lpha Agent Skill

Standalone hackathon repo for backtestable BNB Chain strategy skills.

The goal is not to ship a full trading product here. The goal is to ship a compact, judge-friendly repository that turns market context plus lane-specific signals into backtestable strategy specifications.

## Current Lanes

- `fourmeme-strategy-skill`: the deeper current lane for BNB meme-token setups
- `bstocks-strategy-skill`: a separate early-stage lane for tokenized stocks on BNB Chain

Four.Meme remains the main repo story today.

bStocks is intentionally scaffolded as a separate lane so the repo can explore tokenized-stock strategy specs without mixing stock logic into meme-token logic.

## Why Four.Meme Still Matters

Four.Meme is still a good fit for this repo as long as it is used as the **domain edge**, not the whole product story.

That still means:

- The strategy still needs market-data grounding.
- The output still needs explicit rules and assumptions.
- The repo should optimize for Strategy Skills first, not live execution first.

## Planned Outcome

- Separate skills that generate Four.Meme-aware and bStocks-aware BNB strategy specs
- Machine-readable strategy schemas
- A clear Agent Hub integration path
- A clean official BNBAgent SDK integration path

## Current Stage

This repo has moved beyond scaffold-only mode.

It now includes:

- a live CoinMarketCap-backed market context adapter with `rest` fallback and official Agent Hub MCP support
- a live Four.Meme discovery adapter
- a schema-valid strategy generator
- a distilled 4alpha global-learning brain with `single-agent` and `multi-agent` strategy review modes
- an integrated Four.Meme smart-wallet doctrine adapted from the custom 4alpha skill
- a separate bStocks lane scaffold with its own skill, schema folder, data file, and generator path
- a Byreal-style repo CLI for demo and rerun flow
- an official BNBAgent SDK integration layer under `integrations/bnbagent/`

## Structure

```text
docs/
data/
examples/
integrations/bnbagent/
schemas/
scripts/
skills/bstocks-strategy-skill/
skills/fourmeme-strategy-skill/
src/
tests/
AGENTS.md
CLAUDE.md
README.md
```

## CLI Demo Flow

Main demo command:

```powershell
npm run demo
```

Pro-looking single-command options:

```powershell
npx --yes . demo
npx --yes . catalog list
```

Alternative local package execution:

```powershell
npm exec --yes --package=. 4lpha-agent-skill demo
```

or install the local repo CLI once and then run:

```powershell
npm install -g .
4lpha-agent-skill demo
```

Capability catalog:

```powershell
npm run cli -- catalog list
npm run cli -- catalog show strategy.generate
```

Strategy flow:

```powershell
npm run cli -- strategy generate
npm run cli -- strategy generate --cmc-provider agent-hub-mcp
npm run cli -- strategy generate --lane bstocks
npm run cli -- strategy generate --lane bstocks --cmc-provider agent-hub-mcp
npm run cli -- strategy generate --brain-mode single-agent
npm run cli -- strategy generate --lane bstocks --brain-mode multi-agent --brain-provider local-rules
npm run cli -- strategy validate examples/generated/cmc-market-regime.strategy.json
npm run cli -- strategy validate --lane bstocks --stage draft examples/generated/bstocks/bstocks-draft.strategy.json
npm run cli -- strategy validate --lane bstocks --stage reviewed examples/generated/bstocks/bstocks-reviewed.strategy.json
```

The repo now supports two CMC data transports: direct REST and the official CMC Agent Hub MCP endpoint. Keep `CMC_DATA_PROVIDER=rest` for compatibility, or switch to `CMC_DATA_PROVIDER=agent-hub-mcp` or `--cmc-provider agent-hub-mcp` for the sponsor-backed demo path.

The default Four.Meme strategy path uses a local, deterministic `Safety -> Social -> Gatekeeper` review so judges can rerun the demo without any LLM secret. To use a real OpenAI-compatible LLM endpoint, set `FOURMEME_BRAIN_PROVIDER=openai-compatible` and the `FOURMEME_LLM_*` env vars locally.

The bStocks lane now uses a separate `draft -> brain-reviewed` flow with `Safety -> Market Analysis -> Gatekeeper`. To use a real OpenAI-compatible LLM endpoint for that lane, set `BSTOCKS_BRAIN_PROVIDER=openai-compatible` and the `BSTOCKS_LLM_*` env vars locally.

BNBAgent SDK preflight:

```powershell
npm run cli -- bnbagent dry-run --debug
```

## Repo Evidence

- Local tooling notes: [docs/local-tooling.md](docs/local-tooling.md)
- One-command judge demo: `npm run demo`
- Agent Hub-backed judge demo: `npm run demo -- --cmc-provider agent-hub-mcp`
- bStocks judge demo: `npm run demo -- --lane bstocks`
- bStocks Agent Hub-backed demo: `npm run demo -- --lane bstocks --cmc-provider agent-hub-mcp`
- CLI capability catalog: `npm run cli -- catalog list`
- CMC-backed strategy generator: `npm run generate:cmc-strategy`
- bStocks strategy generator: `npm run generate:bstocks-strategy`
- Generated artifacts: [examples/generated](examples/generated)
- Strategy brain notes: [docs/strategy-brain.md](docs/strategy-brain.md)
- Smart-wallet doctrine notes: [docs/smart-wallet-doctrine.md](docs/smart-wallet-doctrine.md)
