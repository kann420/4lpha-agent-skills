# bStocks Strategy Demo Summary

Generated at: 2026-06-16T10:40:03.220Z
Strategy ID: cmc-bnb-bstocks-2026-06-16T10-39-04-000Z
Draft status: proposed
Reviewed status: proposed
Regime: selective-bstocks-rotation
Confidence: 0.64
Brain: off / local-rules
Brain verdict: approve

## Inputs
- CMC as-of: 2026-06-16T10:39:04.000Z
- Fear and Greed: 25 (Fear)
- Total market cap 24h change: 1.71%
- BNB 24h: 0.11%

## bStocks Universe
- Issuer: bStocks
- Venue: pancakeswap-stocks
- Quoteable symbols: 5
- MUB | CMC 40212 | 24h 6.54% | 7d 22.97% | Vol $1.83M
- SNDKB | CMC 40216 | 24h 3.47% | 7d 18.34% | Vol $2.04M
- CRCLB | CMC 40213 | 24h 3.21% | 7d 0.68% | Vol $2.85M
- NVDAB | CMC 40215 | 24h 1.05% | 7d 4.36% | Vol $1.28M
- TSLAB | CMC 40214 | 24h -1.36% | 7d 2.90% | Vol $2.76M

## Strategy Rules
- Thesis: Use CMC market regime as the first gate, then rank the committed bStocks allowlist by 24h relative strength and active quoted volume. Current Fear and Greed is 25, BNB 24h is 0.11%, and the tracked universe has 5 quoteable symbols. Current leaders are MUB (6.54%), SNDKB (3.47%), CRCLB (3.21%). The deterministic draft status is proposed under regime selective-bstocks-rotation.
- Entry rules: 8
- Exit rules: 5
- Risk controls: 5
- Invalidation rules: 3
- Brain agents: none
- Learned lessons applied: 0

## Rejection Signals
- CMC Fear and Greed is 25, below the bStocks activation threshold of 45.

## Artifacts
- Market context: cmc-market-context.snapshot.json
- bStocks snapshot: bstocks-universe.snapshot.json
- Draft strategy spec: bstocks-draft.strategy.json
- Reviewed strategy spec: bstocks-reviewed.strategy.json
- Demo summary: demo.summary.md

## Demo Command
```powershell
npm run cli -- strategy generate --lane bstocks
```
