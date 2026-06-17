# Source Layout

Current source boundaries:

- `adapters/cmc/`: official CoinMarketCap-backed market context fetch and normalization
- `adapters/bstocks/`: explicit bStocks allowlist loading plus quote normalization
- `cli/`: capability catalog metadata for the repo CLI
- `adapters/fourmeme/`: direct Four.Meme meme-api discovery and compact bucketing borrowed from the old `4alpha` pulse flow
- `pipelines/`: end-to-end artifact generation used by scripts and CLI
- `strategy/`: market regime, filters, and rule synthesis
- `output/`: schema validation and serialization helpers
- `types/`: shared TypeScript contracts used by generators and validators

Keep the code simple and provider-agnostic where possible.

Current lane split:

- Four.Meme files stay in the existing adapter and strategy paths.
- bStocks files live under dedicated `bstocks/` folders where possible.
- Do not merge Four.Meme and bStocks heuristics into one strategy module.
