# bStocks Lane

## Purpose

This folder documents the separate `bstocks-strategy-skill` lane.

The lane exists to keep tokenized-stock logic isolated from Four.Meme logic while staying inside the same Track 2 submission repo.

## Current Scope

- maintain an explicit bStocks universe file under `data/`
- fetch quote snapshots from CoinMarketCap for that allowlist by committed `cmcId`
- generate a backtestable strategy spec with conservative, explicit rules
- keep the lane shallow until the strategy thesis is finalized

## Non-Goals For This Milestone

- do not merge bStocks logic into Four.Meme files
- do not introduce live execution
- do not overfit a deeper stock thesis before the team locks the strategy

## Lane Boundary

- `skills/bstocks-strategy-skill/`: prompt contract for the lane
- `src/adapters/bstocks/`: bStocks-specific universe and quote normalization
- `src/strategy/bstocks/`: bStocks-specific rule synthesis
- `schemas/bstocks/`: bStocks-specific output contracts
- `examples/generated/bstocks/`: generated artifacts for demo and review

## Current Strategy Shape

The current generator intentionally stays simple:

`CMC regime gate -> bStocks allowlist snapshot -> relative-strength rank -> explicit rules -> strategy spec`

That gives the repo a clean second lane without pretending the final bStocks thesis is already locked.
