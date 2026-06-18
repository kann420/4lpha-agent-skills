# 5-Minute Judge Demo Script

This script is designed for Track 2 Strategy Skills judging. The main flow uses two commands only: one live CMC Agent Hub path and one offline replay path.

## 0:00-0:30 - Frame The Submission

Say:

> 4lpha is a BNB Chain Strategy Skill, not a live-trading bot. It turns CMC Agent Hub market context plus Four.Meme venue signals into a schema-valid, backtestable strategy spec with explicit entry rules, exits, risk controls, evidence, assumptions, and a review verdict.

## 0:30-2:15 - Command 1: Live CMC Agent Hub Path

Run:

```powershell
npm run judge:live
```

Show:

- `skill:probe` reports whether a remote CMC Skills endpoint is configured.
- `CMC transport: agent-hub-mcp`
- strategy `Status`
- `Brain verdict`
- Four.Meme bucket counts
- `Data quality`
- generated `skill-route.snapshot.json`

If live market is risk-off and the strategy is `rejected`, say:

> This is expected. The skill is allowed to reject weak regimes. A rejected output is still backtestable because the exact failed gates are preserved.

## 2:15-4:10 - Command 2: Offline Replay And Judge Gate

Run:

```powershell
npm run judge:replay
```

Open:

```text
examples/generated/fourmeme-proposed/demo.summary.md
examples/generated/fourmeme-proposed/fourmeme-onchain-enrichment.snapshot.json
examples/replay/fourmeme-fixture-replay.summary.md
examples/replay/fourmeme-pack-replay.summary.md
```

Say:

> The fixture is clearly labeled and does not claim to be live market data. It proves the happy path, the curated on-chain enrichment contract, and the replay method. The replay pack compares bucket-plus-on-chain selection against a simple volume-only baseline and does not claim profitability.

Show:

- `skillExecution.mode` in route and on-chain artifacts
- replay-pack snapshot count
- high-risk baseline selections avoided
- volume-only high-risk selection rate
- `validate:judge-readiness` pass

## 4:10-5:00 - Close

Say:

> The core deliverable is a reproducible strategy spec: market regime, universe, entry conditions, exit conditions, risk controls, invalidation, evidence, timestamps, and assumptions. Four.Meme is the differentiated BNB-native lane; bStocks and BNBAgent are available as appendix proof points.

If the empirical appendix is available, run:

```powershell
npm run skill:proof:preflight -- --plain
npm run judge:empirical
```

Show:

- CMC proof mode is `recorded-remote` or `live-execution`
- proof bundle includes `find_skill` plus the three on-chain skill executions
- real snapshot count and time span; recommended capture is 36 snapshots over about 18 hours, strict minimum is 30 snapshots over 12 hours
- real replay baseline comparison
- backtest mode is either `pnl-backtest` or explicitly `selection-replay-only`

Fallback if live CMC or Four.Meme is down:

```powershell
npm run check
```

This offline gate runs typecheck, curated skill routing, marketplace probe fallback, smoke tests, fixture replay, replay pack, example validation, and judge-readiness validation without live secrets.

## Appendix

BNBAgent dry-run:

```powershell
npm run cli -- bnbagent dry-run --debug --plain
```

bStocks secondary lane:

```powershell
npm run demo -- --lane bstocks --cmc-provider agent-hub-mcp --plain
```
