# Four.Meme Strategy Demo Summary

Generated at: 2026-06-17T12:56:07.845Z
Strategy ID: cmc-bnb-fourmeme-2026-06-17T12-55-00-000Z
Status: rejected
Regime: risk-off-wait-for-confirmation
Confidence: 0.78
Brain: multi-agent / local-rules
Brain verdict: wait

## Inputs
- CMC source: coinmarketcap
- CMC transport: agent-hub-mcp
- CMC as-of: 2026-06-17T12:55:00.000Z
- Fear and Greed: 23 (Fear)
- Total market cap 24h change: -2.10%
- BTC dominance 24h change: -0.20%
- BNB 24h / 7d: -1.03% / 3.15%

## Four.Meme Scan
- Feed counts: new=50, volume=50, hot=50, dex=100
- Bucket counts: safe2ape=2, mediumRisk=62, gemHunt=5
- Featured candidates: 5
- MAX | safe2ape | new | 0x30c03f3ef3bf39db282e6e80474754ea8df441a4 | MC $13.44K | Vol $55.72K
- Aster合规 | safe2ape | new | 0xc7bd4091fc0997744dca52a7ef4d0e600cb0ffff | MC $12.84K | Vol $9.93K
- 不吃压力 | mediumRisk | new | 0x89da89494878472ba8cfd509b524688675f84444 | MC $5.03K | Vol $95.01K
- czzzzzzzzz | mediumRisk | new | 0x11bca62f586185a09641aee156d53ec027db4444 | MC $4.41K | Vol $82.96K
- ME | mediumRisk | new | 0xea3f9272c3d1f95a94d03aef76cf5cbc4bfa4444 | MC $3.50K | Vol $74.12K

## Strategy Rules
- Thesis: Do not activate fresh Four.Meme exposure until the CMC regime gate improves. BNB 7d strength is 3.15%, Fear and Greed is 23, and the latest venue buckets are safe2ape=2, mediumRisk=62, gemHunt=5. The multi-agent brain keeps this strategy inactive for now: Gatekeeper kept the strategy inactive because the deterministic regime gate rejected it. Smart-wallet doctrine requirements remain explicit so the setup can be backtested or rejected without inventing missing wallet-flow data.
- Entry rules: 11
- Exit rules: 4
- Risk controls: 5
- Invalidation rules: 3
- Brain agents: safety:approve, social:approve, gatekeeper:wait
- Learned lessons applied: 14

## Rejection Signals
- Total crypto market cap is -2.10% over 24h, below the flat-to-up entry gate.
- CMC Fear and Greed is 23, below the minimum activation threshold of 35.
- BNB 24h performance is -1.03%, below the non-negative momentum gate.
- Brain review returned wait: Gatekeeper kept the strategy inactive because the deterministic regime gate rejected it.

## Artifacts
- Market context: cmc-market-context.snapshot.json
- Four.Meme discovery: fourmeme-discovery.snapshot.json
- Strategy spec: cmc-market-regime.strategy.json
- Demo summary: demo.summary.md

## Demo Command
```powershell
npm run demo
```
