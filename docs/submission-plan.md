# Submission Plan

## Milestone 1

- repo scaffold
- AGENTS / CLAUDE rules
- initial skill contract
- initial schema contract

## Milestone 2

- CMC / Agent Hub integration
- normalized market-context layer
- initial Four.Meme filter set
- first deterministic sample payloads for local verification

## Milestone 3

- strategy-spec generator
- example outputs
- schema validation
- no-op / reject path when evidence is insufficient

## Milestone 4

- official BNBAgent SDK identity integration
- demo flow for special-prize angle

## Milestone 5

- demo script
- short video
- submission polish

## Anti-Drift Checks

- If a task does not improve the strategy spec, Agent Hub usage, or official BNBAgent SDK usage, pause before building it.
- If the repo starts looking like a full product clone, scope it back down.

## Immediate Build Order

1. lock the skill contract and schema
2. choose TypeScript/Node.js as the minimal runtime
3. define normalized input shapes for market context and Four.Meme candidates
4. implement one deterministic strategy generation path
5. validate generated examples against schema
