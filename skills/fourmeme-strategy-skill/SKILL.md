---
name: fourmeme-strategy-skill
description: Generate a backtestable BNB Chain meme-token strategy spec using market context plus Four.Meme-specific setup filters.
---

# Four.Meme Strategy Skill

## Purpose

This skill is for generating a **strategy specification**, not for blindly executing trades.

It should:

- analyze broad market context
- narrow to a Four.Meme-relevant BNB opportunity set
- apply the distilled 4alpha global-learning review policy
- apply the Four.Meme smart-wallet entry doctrine as advisory strategy policy
- return explicit entry, exit, risk, and invalidation rules
- surface assumptions, evidence, and confidence limits

The core product frame is:

`market context -> Four.Meme-specific filtering -> smart-wallet doctrine -> explicit rules -> strategy brain review -> backtestable strategy spec`

## Expected Inputs

- `requestId`: caller-supplied identifier for traceability
- `asOf`: timestamp for the data snapshot used to generate the strategy
- `chain`: expected to be `bnb-chain`
- `venue`: expected to include `fourmeme`
- `timeframe`: bar interval and holding horizon the strategy will assume
- `marketContext`: normalized market snapshot from CMC / Agent Hub-aligned sources
- `candidateUniverse`: normalized candidate list or explicit filtering scope
- `riskProfile`: optional constraints such as max position size or max daily loss
- `constraints`: optional exclusions, liquidity floors, or launch-age requirements
- `smartWalletEvidence`: optional smart-wallet cluster, buy/sell flow, and short-window confirmation data when an adapter provides it

## Input Requirements

- Every candidate should be identified by contract address, not symbol alone.
- Market context should be timestamped and source-attributed.
- Missing required fields must be reported, not guessed.
- If venue signals and market context disagree, the conflict must be explicit in the output.
- If smart-wallet evidence is missing, treat it as missing evidence and do not invent wallet-flow confirmation.

## Expected Outputs

- a machine-readable strategy spec that conforms to `schemas/strategy-spec.schema.json`
- a concise human-readable rationale
- a strategy thesis and brain-review verdict
- evidence records with source and timestamp context
- explicit assumptions required for backtesting
- clear invalidation conditions
- rejection reasons when no strategy should be proposed

## Output Standard

The strategy must be concrete enough that a reviewer can answer:

- What regime is being assumed?
- What exact universe is being traded?
- What exact rules trigger entry?
- What exact rules trigger exit?
- What risk rules cap loss or churn?
- What observation invalidates the setup?
- What evidence supported the recommendation?
- What assumptions would a backtest engine need?

## Hard Constraints

- Do not output a strategy that cannot be backtested.
- Do not rely on token symbol alone when contract identity matters.
- Do not imply execution certainty.
- Do not fabricate missing market data.
- Do not turn the skill into a live-trading wrapper.
- Do not claim profitability without evidence.

## Preferred Behavior

- Prefer explicit, falsifiable rules over persuasive commentary.
- Prefer rejecting a weak setup over manufacturing a marginal one.
- Prefer venue-aware heuristics that can still be explained as testable rules.
- Prefer stable normalized fields over provider-specific raw payloads.
- Prefer Safety -> Social -> Gatekeeper review when multi-agent mode is requested.
- Prefer smart-wallet doctrine as evidence requirements, not permission to bypass CMC or safety gates.

## Current Status

This file defines the contract target for the first implementation slice.

The next implementation step is a narrow path:

1. Normalize market context from Agent Hub-aligned inputs.
2. Normalize Four.Meme candidate records into contract-level facts.
3. Synthesize one explicit strategy spec or one explicit rejection result.
4. Apply single-agent or multi-agent brain review without adding live execution.
5. Surface smart-wallet doctrine requirements in `brainReview` and assumptions.
