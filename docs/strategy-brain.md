# Strategy Brain And Learning

This repo uses a distilled 4alpha strategy brain as a review layer for Track 2 strategy specs.

The brain does not execute trades, sign transactions, manage positions, or run a live wallet loop. It only reviews whether a generated strategy spec should be proposed or kept inactive.

## Lane Defaults

The default Four.Meme demo path uses:

```text
CMC market context
  -> Four.Meme discovery
  -> deterministic strategy spec
  -> smart-wallet doctrine check
  -> Safety review
  -> Social review
  -> Gatekeeper review
  -> schema-valid strategy.json
```

The default provider is `local-rules` so judges can rerun the demo without an LLM key.

The bStocks lane now uses:

```text
CMC market context
  -> bStocks allowlist snapshot
  -> deterministic draft strategy spec
  -> Safety review
  -> Market Analysis review
  -> Gatekeeper review
  -> reviewed strategy.json
```

## Modes

- `off`: generate the deterministic strategy spec without brain review.
- `single-agent`: one strategy reviewer applies the global learning policy.
- `multi-agent`: Safety reviews first, Social reviews second, Gatekeeper makes the final activation decision.

## Providers

- `local-rules`: deterministic reviewer, no secrets, no network LLM call.
- `openai-compatible`: optional LLM reviewer using `FOURMEME_LLM_*` env vars.

For the bStocks lane, the same provider modes exist but use `BSTOCKS_LLM_*` env vars instead.

## Global Learning

The portable learning policy lives in:

```text
data/learning/fourmeme-global-lessons.json
```

It is adapted from the 4alpha learning direction but intentionally compressed for this submission repo. The lessons are used as strategy-review constraints, not as execution automation.

The bStocks lane uses its own separate learning file:

```text
data/learning/bstocks-global-lessons.json
```

It is lane-specific and must not inherit Four.Meme-only doctrine or social heuristics.

## Smart-Wallet Doctrine

The Four.Meme custom smart-wallet doctrine is integrated into the same skill, not added as a new lane:

```text
data/learning/fourmeme-smart-wallet-doctrine.json
```

It contributes setup modes, smart-wallet confirmation levels, the 5-of-8 entry checklist, and avoid rules. The current repo uses available fields immediately and marks missing wallet-flow data as future evidence instead of inventing it.

## CLI Examples

```powershell
npm run cli -- strategy generate
npm run cli -- strategy generate --lane bstocks
npm run cli -- strategy generate --brain-mode single-agent
npm run cli -- strategy generate --brain-mode multi-agent --brain-provider local-rules
```

Optional LLM mode:

```powershell
$env:FOURMEME_BRAIN_PROVIDER="openai-compatible"
$env:FOURMEME_LLM_API_KEY="..."
npm run cli -- strategy generate --brain-mode multi-agent

$env:BSTOCKS_BRAIN_PROVIDER="openai-compatible"
$env:BSTOCKS_LLM_API_KEY="..."
npm run cli -- strategy generate --lane bstocks --brain-mode multi-agent
```

Do not commit real LLM API keys or provider credentials.
