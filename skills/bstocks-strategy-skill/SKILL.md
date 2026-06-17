---
name: bstocks-strategy-skill
description: Generate a backtestable BNB Chain bStocks strategy spec using CMC market context plus an explicit bStocks allowlist and relative-strength rules.
---

# bStocks Strategy Skill

## Purpose

This skill is for generating a **strategy specification**, not for blindly executing trades.

It should:

- analyze broad market context
- narrow to a maintained bStocks opportunity set
- apply a lane-specific global-learning review policy
- optionally apply single-agent or multi-agent brain review
- return explicit entry, exit, risk, and invalidation rules
- preserve source timestamps, universe assumptions, and evidence

The core product frame is:

`market context -> bStocks universe filter -> draft spec -> strategy brain review -> backtestable strategy spec`

## Expected Inputs

- `requestId`: caller-supplied identifier for traceability
- `asOf`: timestamp for the data snapshot used to generate the strategy
- `chain`: expected to be `bnb-chain`
- `venue`: expected to include `pancakeswap-stocks`
- `issuer`: expected to include `bStocks`
- `timeframe`: bar interval and holding horizon the strategy will assume
- `marketContext`: normalized market snapshot from CMC / Agent Hub-aligned sources
- `candidateUniverse`: maintained bStocks symbol allowlist or explicit filtering scope
- `riskProfile`: optional constraints such as max position size or max daily loss
- `constraints`: optional exclusions, quote freshness rules, or minimum universe coverage

## Input Requirements

- Every candidate should be identified by CMC ID plus symbol, not symbol alone.
- Market context should be timestamped and source-attributed.
- Missing required fields must be reported, not guessed.
- If venue coverage and market context disagree, the conflict must be explicit in the output.

## Expected Outputs

- a machine-readable draft strategy spec that conforms to `schemas/bstocks/bstocks-draft-strategy-spec.schema.json`
- a machine-readable reviewed strategy spec that conforms to `schemas/bstocks/bstocks-reviewed-strategy-spec.schema.json`
- a concise human-readable rationale
- a strategy thesis and brain-review verdict
- evidence records with source and timestamp context
- explicit assumptions required for backtesting
- clear invalidation conditions
- rejection reasons when no strategy should be proposed

## Output Standard

The strategy must be concrete enough that a reviewer can answer:

- What regime is being assumed?
- What exact bStocks universe is being traded?
- What exact rules trigger entry?
- What exact rules trigger exit?
- What risk rules cap loss or churn?
- What observation invalidates the setup?
- What evidence supported the recommendation?
- What assumptions would a backtest engine need?

## Hard Constraints

- Do not output a strategy that cannot be backtested.
- Do not imply execution certainty.
- Do not fabricate missing market data.
- Do not turn the skill into a live-trading wrapper.
- Do not claim profitability without evidence.
- Do not reuse Four.Meme bucket logic inside this lane.

## Preferred Behavior

- Prefer explicit, falsifiable rules over persuasive commentary.
- Prefer rejecting a weak setup over manufacturing a marginal one.
- Prefer allowlist-aware heuristics that can still be explained as testable rules.
- Prefer stable normalized fields over provider-specific raw payloads.
- Prefer Safety -> Market Analysis -> Gatekeeper review when multi-agent mode is requested.

## Current Status

This file defines the contract target for the first bStocks implementation slice.

The current implementation path is:

1. Normalize market context from Agent Hub-aligned inputs.
2. Normalize the tracked bStocks allowlist into quoteable CMC facts.
3. Synthesize one explicit draft strategy spec.
4. Apply single-agent or multi-agent brain review without adding live execution.
5. Emit both draft and reviewed artifacts with separate schema validation.
