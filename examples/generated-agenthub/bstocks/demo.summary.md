# bStocks Strategy Demo Summary

Generated at: 2026-06-17T12:56:14.199Z
Strategy ID: cmc-bnb-bstocks-2026-06-17T12-55-00-000Z
Draft status: rejected
Reviewed status: rejected
Regime: risk-off-wait-for-coverage
Confidence: 0.78
Brain: multi-agent / local-rules
Brain verdict: wait

## Inputs
- CMC as-of: 2026-06-17T12:55:00.000Z
- CMC transport: agent-hub-mcp
- Fear and Greed: 23 (Fear)
- Total market cap 24h change: -2.10%
- BNB 24h: -1.03%

## bStocks Universe
- Issuer: bStocks
- Venue: pancakeswap-stocks
- Quote transport: agent-hub-mcp
- Quoteable symbols: 6
- SPCXB | CMC 40217 | 24h 2.86% | 7d 29.63% | Vol $58.67M
- TSLAB | CMC 40214 | 24h -1.03% | 7d 2.09% | Vol $2.66M
- NVDAB | CMC 40215 | 24h -1.22% | 7d 2.76% | Vol $1.05M
- SNDKB | CMC 40216 | 24h -3.02% | 7d 13.06% | Vol $2.76M
- MUB | CMC 40212 | 24h -3.96% | 7d 15.32% | Vol $3.20M

## Strategy Rules
- Thesis: Use CMC market regime as the first gate, then rank the committed bStocks allowlist by 24h relative strength and active quoted volume. Current Fear and Greed is 23, BNB 24h is -1.03%, and the tracked universe has 6 quoteable symbols. Current leaders are SPCXB (2.86%), TSLAB (-1.03%), NVDAB (-1.22%). The deterministic draft status is rejected under regime risk-off-wait-for-coverage. The multi-agent brain keeps this strategy inactive for now: Safety kept the strategy inactive because the broader market regime remains below the bStocks activation floor.
- Entry rules: 8
- Exit rules: 5
- Risk controls: 5
- Invalidation rules: 3
- Brain agents: safety:wait
- Learned lessons applied: 3

## Rejection Signals
- Total crypto market cap is -2.10% over 24h, below the flat-to-up gate.
- CMC Fear and Greed is 23, below the bStocks activation threshold of 45.
- BNB 24h performance is -1.03%, below the non-negative venue-support gate.
- Brain review returned wait: Safety kept the strategy inactive because the broader market regime remains below the bStocks activation floor.

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
