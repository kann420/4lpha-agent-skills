# Implementation Plan

## First Runtime

Use `TypeScript` on `Node.js` for the first milestone implementation.

Reasoning:

- the output contract is JSON-first
- schema validation is a first-class need
- adapter code for external data sources is simple to express
- this keeps future Agent Hub and BNBAgent SDK integration paths credible

The one deliberate exception is BNBAgent identity integration:

- the official BNBAgent SDK is Python
- that code should remain isolated under `integrations/bnbagent/`
- the repo can therefore stay TypeScript-first for strategy logic without faking SDK usage

## First Internal Boundaries

### `src/adapters/cmc/`

- fetch or ingest market-context inputs
- preserve source names and timestamps
- normalize provider-specific fields into internal market facts

### `src/adapters/fourmeme/`

- fetch or ingest Four.Meme candidate inputs
- normalize contract-level identity, liquidity, age, and venue-specific metadata
- reject incomplete or ambiguous records early

### `src/strategy/`

- `classify-regime`
- `filter-candidates`
- `synthesize-strategy`
- `build-rejection`

### `src/output/`

- format schema-valid strategy specs
- emit deterministic example JSON for docs and tests

## First Normalized Input Shapes

### Market Context

Minimum fields:

- `asOf`
- `source`
- `chain`
- `marketTrend`
- `momentumState`
- `riskAppetite`
- `btcContext`
- `bnbContext`

### Four.Meme Candidate

Minimum fields:

- `asOf`
- `chain`
- `venue`
- `tokenAddress`
- `baseSymbol`
- `quoteSymbol`
- `launchAgeMinutes`
- `liquidityUsd`
- `volume24hUsd`
- `holderCount` if available
- `isVerified` if available

## First Deterministic Strategy Path

Start with one narrow strategy family:

- regime: risk-on BNB meme rotation
- universe: newly launched or recently active Four.Meme candidates above basic liquidity and activity floors
- output: a long-only momentum continuation spec with explicit rejection criteria

This is intentionally narrow so that:

- the backtest assumptions stay legible
- the example outputs are judge-friendly
- the repo proves strategy-skill fit before adding breadth

## Verification Plan

Smallest useful checks for the first implementation:

- schema file parses as valid JSON
- generated example validates against the schema
- one weak-input fixture returns a rejection result instead of a low-quality strategy
