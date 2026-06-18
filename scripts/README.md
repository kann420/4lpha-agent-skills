# Scripts

Current script types:

- live CoinMarketCap-backed example generation
- repo CLI entrypoint for catalog, market, strategy, example, and BNBAgent flows
- schema validation
- real CMC skill proof import/live validation
- real Four.Meme snapshot capture, replay, and forward-observation backtest
- future skill packaging

Primary commands:

```powershell
npm run cli -- catalog list
npm run cli -- strategy generate
npm run demo
npm run skill:proof:preflight -- --plain
npm run validate:cmc-skill-proof
npm run capture:fourmeme-real -- --count 36 --interval-minutes 30 --cmc-provider agent-hub-mcp
npm run judge:empirical
```
