# bStocks Strategy Demo Summary

Generated at: 2026-06-18T05:16:28.675Z
Strategy ID: cmc-bnb-bstocks-2026-06-18T05-15-00-000Z
Draft status: rejected
Reviewed status: rejected
Regime: risk-off-wait-for-coverage
Confidence: 0.78
Brain: multi-agent / local-rules
Brain verdict: wait
Data quality: complete

## Inputs
- CMC as-of: 2026-06-18T05:15:00.000Z
- CMC transport: agent-hub-mcp
- Fear and Greed: 21 (Fear)
- Total market cap 24h change: -2.65%
- BNB 24h: -3.04%

## bStocks Universe
- Issuer: bStocks
- Venue: pancakeswap-stocks
- Quote transport: agent-hub-mcp
- Quoteable symbols: 6
- MUB | CMC 40212 | 24h 1.99% | 7d 17.83% | Vol $3.36M
- CRCLB | CMC 40213 | 24h 0.25% | 7d -3.86% | Vol $2.30M
- SNDKB | CMC 40216 | 24h -1.06% | 7d 10.74% | Vol $3.43M
- TSLAB | CMC 40214 | 24h -1.31% | 7d 1.15% | Vol $2.62M
- NVDAB | CMC 40215 | 24h -1.46% | 7d 1.35% | Vol $1.54M

## Strategy Rules
- Thesis: Use CMC market regime as the first gate, then rank the committed bStocks allowlist by 24h relative strength and active quoted volume. Current Fear and Greed is 21, BNB 24h is -3.04%, and the tracked universe has 6 quoteable symbols. Current leaders are MUB (1.99%), CRCLB (0.25%), SNDKB (-1.06%). The deterministic draft status is rejected under regime risk-off-wait-for-coverage. The multi-agent brain keeps this strategy inactive for now: Safety kept the strategy inactive because the broader market regime remains below the bStocks activation floor.
- Entry rules: 8
- Exit rules: 5
- Risk controls: 5
- Invalidation rules: 3
- Brain agents: safety:wait
- Learned lessons applied: 3
- Artifact refs: cmc-market-context.snapshot.json:b06efeb3d6, bstocks-universe.snapshot.json:99c3b4b351

## Rejection Signals
- Total crypto market cap is -2.65% over 24h, below the flat-to-up gate.
- CMC Fear and Greed is 21, below the bStocks activation threshold of 45.
- BNB 24h performance is -3.04%, below the non-negative venue-support gate.
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
