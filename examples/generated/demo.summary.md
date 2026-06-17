# Four.Meme Strategy Demo Summary

Generated at: 2026-06-17T13:21:11.493Z
Strategy ID: cmc-bnb-fourmeme-2026-06-17T13-19-59-999Z
Status: rejected
Regime: risk-off-wait-for-confirmation
Confidence: 0.78
Brain: multi-agent / local-rules
Brain verdict: wait

## Inputs
- CMC source: coinmarketcap
- CMC transport: rest
- CMC as-of: 2026-06-17T13:19:59.999Z
- Fear and Greed: 23 (Fear)
- Total market cap 24h change: -1.58%
- BTC dominance 24h change: -0.11%
- BNB 24h / 7d: -0.28% / 3.66%

## Four.Meme Scan
- Feed counts: new=50, volume=50, hot=50, dex=100
- Bucket counts: safe2ape=1, mediumRisk=65, gemHunt=5
- Featured candidates: 5
- MAX | safe2ape | new | 0x30c03f3ef3bf39db282e6e80474754ea8df441a4 | MC $11.32K | Vol $56.86K
- 不吃压力 | mediumRisk | new | 0x89da89494878472ba8cfd509b524688675f84444 | MC $5.26K | Vol $95.35K
- czzzzzzzzz | mediumRisk | new | 0x11bca62f586185a09641aee156d53ec027db4444 | MC $4.41K | Vol $82.96K
- ME | mediumRisk | new | 0xea3f9272c3d1f95a94d03aef76cf5cbc4bfa4444 | MC $3.50K | Vol $74.13K
- 妮卡 | mediumRisk | new | 0x4358cad0a1eeb5cfaa9f56363c79207bc0014444 | MC $3.53K | Vol $72.64K

## Strategy Rules
- Thesis: Do not activate fresh Four.Meme exposure until the CMC regime gate improves. BNB 7d strength is 3.66%, Fear and Greed is 23, and the latest venue buckets are safe2ape=1, mediumRisk=65, gemHunt=5. The multi-agent brain keeps this strategy inactive for now: Gatekeeper kept the strategy inactive because the deterministic regime gate rejected it. Smart-wallet doctrine requirements remain explicit so the setup can be backtested or rejected without inventing missing wallet-flow data.
- Entry rules: 11
- Exit rules: 4
- Risk controls: 5
- Invalidation rules: 3
- Brain agents: safety:approve, social:approve, gatekeeper:wait
- Learned lessons applied: 14

## Rejection Signals
- Total crypto market cap is -1.58% over 24h, below the flat-to-up entry gate.
- CMC Fear and Greed is 23, below the minimum activation threshold of 35.
- BNB 24h performance is -0.28%, below the non-negative momentum gate.
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
