# Four.Meme Smart-Wallet Doctrine

This doctrine is integrated into `fourmeme-strategy-skill`.

It is not a separate lane and it is not an execution bot. It is an advisory strategy-review policy used by the Four.Meme brain layer before a strategy spec is proposed.

## Source

The source material was adapted from:

```text
D:\4alpha\skills\custom skill\SKILL.md
```

The original doctrine summarized smart-money behavior from 10 BNB Chain top-PnL wallets observed from 2026-05-11 to 2026-05-21.

## How It Is Used

The doctrine is represented as structured policy data:

```text
data/learning/fourmeme-smart-wallet-doctrine.json
```

The brain layer applies it alongside the global learning policy:

```text
CMC -> Four.Meme scan -> deterministic strategy spec -> global learning + smart-wallet doctrine -> Safety -> Social -> Gatekeeper
```

## What The Current Repo Can Enforce

The current adapters can use these doctrine ideas immediately:

- contract-address-first identity
- market-cap setup mode ranges
- venue volume and holder proxies
- Four.Meme bucket assignment
- bonding progress for launch-phase candidates
- avoid dead-liquidity and unclear-contract setups

## What Remains Future Evidence

The custom skill mentions signals that this repo does not yet fetch directly:

- 1-minute volume versus previous 5-minute average
- buy-volume versus sell-volume ratio
- smart-wallet cluster count inside 5-30 minute windows
- wallet PnL quality and high-churn wallet tags
- creator, bundle, sniper, rat, and suspicious-holder scan fields

Those are preserved as explicit evidence requirements. The strategy brain must not invent them.

## Hackathon Fit

This strengthens the Track 2 submission because it turns prior 4alpha smart-money research into explicit, auditable strategy policy while preserving the required output:

```text
backtestable strategy.json, not live trade execution
```
