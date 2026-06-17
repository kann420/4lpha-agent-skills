# Architecture Draft

## High-Level Flow

```text
CMC / Agent Hub market context
        +
domain lane input
        ->
lane-specific filters and rejection gates
        ->
explicit strategy rule synthesis
        ->
4alpha strategy brain review
        ->
machine-readable strategy spec
        +
human-readable rationale
```

## Current Domain Lanes

### Four.Meme lane

```text
CMC / Agent Hub market context
        +
Four.Meme meme-api discovery feeds
        +
distilled 4alpha-style bucket rules
        +
Four.Meme smart-wallet doctrine
        ->
regime filter
        ->
candidate scoring and rejection gates
        ->
explicit strategy rule synthesis
        ->
single-agent or Safety -> Social -> Gatekeeper review
```

### bStocks lane

```text
CMC / Agent Hub market context
        +
committed bStocks allowlist
        +
CMC quote snapshot for tracked symbols
        ->
relative-strength ranking
        ->
explicit strategy rule synthesis
```

## Planned Modules

### `src/adapters/`

- `cmc/`: broad market, sentiment, and technical context
- `bstocks/`: explicit bStocks universe loading and quote normalization
- `fourmeme/`: direct Four.Meme meme-api discovery plus compact `safe2ape / mediumRisk / gemHunt` normalization
- `normalizers/`: provider payload to internal type mapping with timestamp retention

### `src/strategy/`

- lane-specific regime classification
- candidate filtering
- rule synthesis
- invalidation logic
- rejection logic when the setup quality is too weak

### `src/brain/`

- distilled 4alpha global-learning policy loading
- integrated Four.Meme smart-wallet doctrine loading
- local deterministic strategy reviewers for judge-friendly reruns
- optional OpenAI-compatible LLM reviewer boundary
- `single-agent` review for compact strategy assessment
- `multi-agent` review that mirrors the 4alpha shape: Safety first, Social second, Gatekeeper last

### `src/output/`

- schema formatting
- human-readable summaries
- deterministic serialization for examples and tests

### `integrations/bnbagent/`

- official BNBAgent SDK identity registration
- optional later service-wrapper experiments

## Architecture Rules

- Adapter code should not contain strategy opinions.
- Strategy logic should not depend on provider-specific response shapes.
- Four.Meme and bStocks strategy logic should stay in separate lane files.
- Output code should only consume normalized internal types.
- Official BNBAgent SDK integration should stay optional until the core skill path is stable.
- Brain review should remain an activation/spec-quality gate, not a wallet execution path.

## First Runtime Choice

The first implementation should use `TypeScript` on `Node.js`.

Why this is the best first fit for the repo:

- it keeps JSON-schema-driven output and validation straightforward
- it is a natural fit for API adapters and hackathon packaging
- it makes future Agent Hub and BNBAgent SDK integration easier to present
- it stays small without forcing frontend or infra decisions too early

## BNBAgent SDK Boundary

The official BNBAgent SDK is currently a Python SDK, so the repo should keep that integration isolated under `integrations/bnbagent/`.

That means:

- core strategy generation can still stay TypeScript-first
- ERC-8004 identity work can use the official Python SDK without forcing the whole repo to become Python-first
- the integration boundary remains explicit and judge-friendly

## First Narrow Slice

The first Four.Meme code slice should be:

1. ingest one normalized market-context payload
2. ingest one normalized Four.Meme candidate payload
   using the direct meme-api discovery slice instead of HTML scraping
3. run deterministic regime and rejection gates
4. emit one schema-valid strategy spec

That slice is enough to prove the contract without drifting into execution features.

## bStocks Slice

The first bStocks code slice should be:

1. ingest one normalized market-context payload
2. ingest one maintained bStocks universe file
3. fetch current CMC quotes for that allowlist
4. emit one schema-valid bStocks strategy spec

That is enough to prove lane separation and repo structure without pretending the final stock thesis is already complete.
