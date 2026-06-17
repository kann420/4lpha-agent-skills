# bStocks Strategy Demo Summary

Generated at: 2026-06-16T10:42:44.410Z
Strategy ID: cmc-bnb-bstocks-2026-06-16T10-41-04-000Z
Draft status: proposed
Reviewed status: rejected
Regime: selective-bstocks-rotation
Confidence: 0.64
Brain: single-agent / local-rules
Brain verdict: wait

## Inputs
- CMC as-of: 2026-06-16T10:41:04.000Z
- Fear and Greed: 25 (Fear)
- Total market cap 24h change: 1.65%
- BNB 24h: 0.04%

## bStocks Universe
- Issuer: bStocks
- Venue: pancakeswap-stocks
- Quoteable symbols: 5
- MUB | CMC 40212 | 24h 6.65% | 7d 23.09% | Vol $1.84M
- SNDKB | CMC 40216 | 24h 3.42% | 7d 18.28% | Vol $2.04M
- CRCLB | CMC 40213 | 24h 3.17% | 7d 0.65% | Vol $2.85M
- NVDAB | CMC 40215 | 24h 0.98% | 7d 4.34% | Vol $1.28M
- TSLAB | CMC 40214 | 24h -1.32% | 7d 2.90% | Vol $2.76M

## Strategy Rules
- Thesis: Use CMC market regime as the first gate, then rank the committed bStocks allowlist by 24h relative strength and active quoted volume. Current Fear and Greed is 25, BNB 24h is 0.04%, and the tracked universe has 5 quoteable symbols. Current leaders are MUB (6.65%), SNDKB (3.42%), CRCLB (3.17%). The deterministic draft status is proposed under regime selective-bstocks-rotation. The single-agent brain keeps this strategy inactive for now: Single-agent review stopped on the safety gate: Safety kept the strategy inactive because the broader market regime remains below the bStocks activation floor.
- Entry rules: 8
- Exit rules: 5
- Risk controls: 5
- Invalidation rules: 3
- Brain agents: strategy:wait
- Learned lessons applied: 4

## Rejection Signals
- CMC Fear and Greed is 25, below the bStocks activation threshold of 45.
- Brain review returned wait: Single-agent review stopped on the safety gate: Safety kept the strategy inactive because the broader market regime remains below the bStocks activation floor.

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
