# Local Tooling And Submission Evidence

## Why Some Skills Live Outside The Repo

The installed `cmc-mcp` and `bnbchain-mcp` skills are local Codex tooling, not repo artifacts.

That is why they live under the user skill directory:

- `C:\Users\admin\.agents\skills\cmc-mcp`
- `C:\Users\admin\.agents\skills\bnbchain-mcp`

This keeps the hackathon repo small and avoids vendoring third-party skill code that judges do not need to review.

## What Judges Can Actually Track

Judges should not need access to local Codex state to understand the submission.

The repo itself must show:

- official CoinMarketCap-backed data ingestion
- a reproducible strategy generation flow
- official BNBAgent SDK integration code
- example outputs produced from that flow

## What Counts As Local Tooling

- `cmc-mcp`: developer convenience for interactive CoinMarketCap MCP usage inside Codex
- `bnbchain-mcp`: developer convenience for interactive BNB Chain MCP usage inside Codex

These help during development, but they are not the primary evidence for special-prize judging.

The repo runtime now calls the official CMC MCP endpoint directly when `CMC_DATA_PROVIDER=agent-hub-mcp`, so the submission no longer depends on local Codex MCP tooling to prove Agent Hub usage.

## What Counts As In-Repo Evidence

- `src/adapters/cmc/`: official CoinMarketCap-backed market context adapter with REST fallback plus Agent Hub MCP support
- `scripts/generate-cmc-strategy.ts`: deterministic generator that turns CMC data into a schema-valid strategy spec
- `scripts/generate-bstocks-strategy.ts`: separate deterministic generator for the bStocks lane
- `examples/generated/`: concrete output artifacts produced by the generator
- `integrations/bnbagent/`: official BNBAgent SDK integration layer

This is the material judges can inspect and rerun.

## Secret Handling

Real values stay in `.env.local`, which is gitignored.

Current env names used by repo code:

- `CMC_API_KEY`
- `CMC_DATA_PROVIDER`
- `CMC_MCP_API_KEY`
- `FOURMEME_BRAIN_*`
- `FOURMEME_LLM_*`
- `BSTOCKS_BRAIN_*`
- `BSTOCKS_LLM_*`
- `BNBAGENT_*`
- `WALLET_PASSWORD`
- `PRIVATE_KEY`

Do not copy real secrets into docs, examples, or committed config.

## Recommended Demo Story

For the submission demo, show the stack in this order:

1. generate a market-context-backed strategy spec from CoinMarketCap data
   recommended sponsor path: `npm run demo -- --cmc-provider agent-hub-mcp`
2. optionally show the separate bStocks lane output under `examples/generated/bstocks/`
3. show the resulting machine-readable output in `examples/generated/`
4. show the official BNBAgent SDK identity preview or registration flow under `integrations/bnbagent/`

That gives judges repo-visible proof for both the Agent Hub / CMC angle and the BNBAgent SDK angle.
