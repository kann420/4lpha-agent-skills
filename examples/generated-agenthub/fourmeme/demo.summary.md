# Four.Meme Strategy Demo Summary

Generated at: 2026-06-18T06:12:11.991Z
Strategy ID: cmc-bnb-fourmeme-2026-06-18T06-11-00-000Z
Status: rejected
Regime: risk-off-wait-for-confirmation
Confidence: 0.78
Brain: multi-agent / local-rules
Brain verdict: wait
Data quality: complete
Skill route: 4lpha_fourmeme_strategy_skill
On-chain enrichment: not attached

## Inputs
- CMC source: coinmarketcap
- CMC transport: agent-hub-mcp
- CMC as-of: 2026-06-18T06:11:00.000Z
- Fear and Greed: 21 (Fear)
- Total market cap 24h change: -2.59%
- BTC dominance 24h change: -0.12%
- BNB 24h / 7d: -3.15% / -1.00%
- Optional skill enrichments: score_holder_concentration_risk, review_dex_wallet_activity_profile, review_dex_wallet_pnl, cmc_crypto_research

## Four.Meme Scan
- Feed counts: new=50, volume=50, hot=50, dex=100
- Bucket counts: safe2ape=0, mediumRisk=64, gemHunt=4
- Featured candidates: 5
- non-ascii-token | mediumRisk | new | 0x89da89494878472ba8cfd509b524688675f84444 | MC $5.10K | Vol $96.83K
- non-ascii-token | mediumRisk | new | 0x0c5c7a260a47ebb3ba202f6ca754256c203b4444 | MC $4.65K | Vol $94.83K
- non-ascii-token | mediumRisk | new | 0x0d8920c08f9f5b17f07616e5159a044d034c4444 | MC $6.47K | Vol $32.72K
- ME | mediumRisk | new | 0xea3f9272c3d1f95a94d03aef76cf5cbc4bfa4444 | MC $3.49K | Vol $74.13K
- non-ascii-token | gemHunt | migrated | 0x64e42d99fa091cf0507c42e21eb3c4418b9a4444 | MC $591.14K | Vol $361.55K

## Strategy Rules
- Thesis: Do not activate fresh Four.Meme exposure until the CMC regime gate improves. BNB 7d strength is -1.00%, Fear and Greed is 21, and the latest venue buckets are safe2ape=0, mediumRisk=64, gemHunt=4. The multi-agent brain keeps this strategy inactive for now: Gatekeeper kept the strategy inactive because the deterministic regime gate rejected it. Smart-wallet doctrine requirements remain explicit so the setup can be backtested or rejected without inventing missing wallet-flow data.
- Entry rules: 12
- Exit rules: 4
- Risk controls: 5
- Invalidation rules: 3
- Brain agents: safety:approve, social:approve, gatekeeper:wait
- Learned lessons applied: 14
- Artifact refs: skill-route.snapshot.json:6f7c033a0f, cmc-market-context.snapshot.json:002b7b6ea1, fourmeme-discovery.snapshot.json:24d563e3bd

## Rejection Signals
- Total crypto market cap is -2.59% over 24h, below the flat-to-up entry gate.
- CMC Fear and Greed is 21, below the minimum activation threshold of 35.
- BNB 24h performance is -3.15%, below the non-negative momentum gate.
- BNB 7d performance is -1.00%, below the strategy's strength floor.
- Brain review returned wait: Gatekeeper kept the strategy inactive because the deterministic regime gate rejected it.

## Artifacts
- Skill route: skill-route.snapshot.json
- Market context: cmc-market-context.snapshot.json
- Four.Meme discovery: fourmeme-discovery.snapshot.json
- Strategy spec: cmc-market-regime.strategy.json
- Demo summary: demo.summary.md

## Demo Command
```powershell
npm run demo
```
