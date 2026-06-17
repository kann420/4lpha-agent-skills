# BNBAgent Integration

This directory now contains the first **official** BNBAgent SDK integration slice.

## What It Covers

- ERC-8004 identity preview payload generation
- ERC-8004 on-chain registration through the official `bnbagent` SDK
- env-based configuration only

## Files

- `requirements.txt`: pinned Python dependencies for the official SDK path
- `client.py`: env loading and SDK wrapper helpers
- `register_identity.py`: preview or register an agent identity from local env

## Required Environment Variables

Store real values in the repo-root `.env.local`, not in tracked files.

- `BNBAGENT_AGENT_NAME`
- `BNBAGENT_AGENT_DESCRIPTION`
- `BNBAGENT_AGENT_ENDPOINT`
- `WALLET_PASSWORD`

Optional but commonly needed:

- `BNBAGENT_NETWORK` default: `bsc-testnet`
- `BNBAGENT_ENDPOINT_NAME` default: `web`
- `BNBAGENT_ENDPOINT_VERSION`
- `BNBAGENT_ENDPOINT_CAPABILITIES` comma-separated
- `BNBAGENT_AGENT_IMAGE`
- `BNBAGENT_SUPPORTED_TRUST` comma-separated
- `PRIVATE_KEY` required on first wallet import
- `ERC8004_MINTER_PRIVATE_KEY` supported as a legacy alias for `PRIVATE_KEY`
- `BSC_RPC_URL` supported as a legacy alias for `RPC_URL`
- `WALLET_ADDRESS` optional when reusing an existing encrypted wallet
- `BNBAGENT_WALLETS_DIR` optional custom keystore directory

## Local Commands

Install dependencies:

```powershell
.\\.venv\\Scripts\\python.exe -m pip install -r integrations\\bnbagent\\requirements.txt
```

Preview the ERC-8004 registration payload without sending a transaction:

```powershell
.\\.venv\\Scripts\\python.exe integrations\\bnbagent\\register_identity.py
```

Dry-run the full registration preflight without broadcasting a transaction:

```powershell
.\\.venv\\Scripts\\python.exe integrations\\bnbagent\\register_identity.py --register --dry-run --debug
```

Register the identity on-chain:

```powershell
.\\.venv\\Scripts\\python.exe integrations\\bnbagent\\register_identity.py --register
```

## Notes

- The official SDK is Python, so this integration stays isolated from the future TypeScript strategy runtime.
- `PRIVATE_KEY` should only be present for first-run wallet import. The SDK can later reuse the encrypted keystore with `WALLET_PASSWORD` and, if needed, `WALLET_ADDRESS`.
- `--dry-run` takes priority over `--register`, so the combined command is safe for CLI-path verification.
- Keep this layer optional until the core strategy-spec path is stable.
