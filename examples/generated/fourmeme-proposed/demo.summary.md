# Four.Meme Strategy Demo Summary

Generated at: 2026-06-18T10:11:37.931Z
Strategy ID: cmc-bnb-fourmeme-2026-06-18T04-00-00-000Z
Status: proposed
Regime: risk-on-bnb-meme-rotation
Confidence: 0.83
Brain: multi-agent / local-rules
Brain verdict: approve
Data quality: complete
Skill route: 4lpha_fourmeme_strategy_skill
On-chain enrichment: cmc-skills-marketplace-fixture

## Inputs
- CMC source: coinmarketcap
- CMC transport: agent-hub-mcp
- CMC as-of: 2026-06-18T04:00:00.000Z
- Fear and Greed: 64 (Greed)
- Total market cap 24h change: 1.25%
- BTC dominance 24h change: -0.12%
- BNB 24h / 7d: 1.18% / 4.70%
- Optional skill enrichments: score_holder_concentration_risk, review_dex_wallet_activity_profile, review_dex_wallet_pnl, cmc_crypto_research

## Four.Meme Scan
- Feed counts: new=1, volume=2, hot=2, dex=1
- Bucket counts: safe2ape=1, mediumRisk=1, gemHunt=1
- Featured candidates: 3
- FOUR (Four Meme Signal) | safe2ape | new | 0x0a43fc31a73013089df59194872ecae4cae14444 | MC $92.00K | Vol $186.00K
- WATCH (Watchlist Only) | mediumRisk | new | 0x5f0e1d2c3b4a69788766554433221100aabbccdd | MC $52.00K | Vol $210.00K
- BNBMAX (BNB Max Rotation) | gemHunt | migrated | 0x7a1b9c2d3e4f5061728394a5b6c7d8e9f0012345 | MC $420.00K | Vol $620.00K
- On-chain skill candidates: 3
- On-chain skill source: cmc-skills-marketplace-fixture

## Strategy Rules
- Thesis: Use CMC market regime as the first gate, then only promote contract-level Four.Meme candidates that survive the approved discovery bucket rules. Current BNB 7d strength is 4.70%, Fear and Greed is 64, and the venue scan produced safe2ape=1, mediumRisk=1, gemHunt=1. The multi-agent brain approved activation because 2 sampled candidate(s) match the approved bucket gate, the final review preserved explicit risk controls, and the smart-wallet doctrine is represented as evidence requirements rather than execution permission.
- Entry rules: 14
- Exit rules: 4
- Risk controls: 7
- Invalidation rules: 4
- Brain agents: safety:approve, social:approve, gatekeeper:approve
- Learned lessons applied: 12
- Artifact refs: skill-route.snapshot.json:208d2bd0d3, cmc-market-context.snapshot.json:2dda68e207, fourmeme-discovery.snapshot.json:dfcb659ed6, fourmeme-onchain-enrichment.snapshot.json:4555f3fbe7

## Artifacts
- Skill route: skill-route.snapshot.json
- Market context: cmc-market-context.snapshot.json
- Four.Meme discovery: fourmeme-discovery.snapshot.json
- On-chain enrichment: fourmeme-onchain-enrichment.snapshot.json
- Strategy spec: cmc-market-regime.strategy.json
- Demo summary: demo.summary.md

## Demo Command
```powershell
npm run demo
```
