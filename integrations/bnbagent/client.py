from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from bnbagent import AgentEndpoint, ERC8004Agent, EVMWalletProvider
from bnbagent.erc8004.agent_uri import AgentURIGenerator
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_PATHS = (
    REPO_ROOT / ".env.local",
    Path(__file__).with_name(".env.local"),
)


def load_local_env() -> None:
    for env_path in ENV_PATHS:
        if env_path.exists():
            load_dotenv(env_path, override=False)

    # Allow this standalone repo to reuse the older 4alpha ERC-8004 env names
    # without duplicating secrets across two local .env files.
    if not os.getenv("RPC_URL", "").strip():
        fallback_rpc = os.getenv("BSC_RPC_URL", "").strip()
        if fallback_rpc:
            os.environ["RPC_URL"] = fallback_rpc


def _read_required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _read_optional(name: str) -> str | None:
    value = os.getenv(name, "").strip()
    return value or None


def _read_optional_alias(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return None


def _read_csv(name: str) -> list[str] | None:
    value = _read_optional(name)
    if not value:
        return None
    items = [item.strip() for item in value.split(",")]
    return [item for item in items if item]


@dataclass(frozen=True)
class AgentIdentityConfig:
    network: str
    agent_name: str
    agent_description: str
    agent_endpoint: str
    endpoint_name: str
    endpoint_version: str | None
    endpoint_capabilities: list[str] | None
    agent_image: str | None
    supported_trust: list[str] | None
    wallet_password: str | None
    private_key: str | None
    wallet_address: str | None
    wallets_dir: str | None


def load_identity_config() -> AgentIdentityConfig:
    load_local_env()

    return AgentIdentityConfig(
        network=os.getenv("BNBAGENT_NETWORK", "bsc-testnet").strip() or "bsc-testnet",
        agent_name=_read_required("BNBAGENT_AGENT_NAME"),
        agent_description=_read_required("BNBAGENT_AGENT_DESCRIPTION"),
        agent_endpoint=_read_required("BNBAGENT_AGENT_ENDPOINT"),
        endpoint_name=os.getenv("BNBAGENT_ENDPOINT_NAME", "web").strip() or "web",
        endpoint_version=_read_optional("BNBAGENT_ENDPOINT_VERSION"),
        endpoint_capabilities=_read_csv("BNBAGENT_ENDPOINT_CAPABILITIES"),
        agent_image=_read_optional_alias("BNBAGENT_AGENT_IMAGE", "ERC8004_AGENT_IMAGE_URL"),
        supported_trust=_read_csv("BNBAGENT_SUPPORTED_TRUST"),
        wallet_password=_read_optional("WALLET_PASSWORD"),
        private_key=_read_optional_alias("PRIVATE_KEY", "ERC8004_MINTER_PRIVATE_KEY"),
        wallet_address=_read_optional("WALLET_ADDRESS"),
        wallets_dir=_read_optional("BNBAGENT_WALLETS_DIR"),
    )


def build_endpoint(config: AgentIdentityConfig) -> AgentEndpoint:
    return AgentEndpoint(
        name=config.endpoint_name,
        endpoint=config.agent_endpoint,
        version=config.endpoint_version,
        capabilities=config.endpoint_capabilities or [],
    )


def build_registration_file(config: AgentIdentityConfig) -> dict:
    return AgentURIGenerator.generate_registration_file(
        name=config.agent_name,
        description=config.agent_description,
        endpoints=[build_endpoint(config)],
        image=config.agent_image,
        supported_trust=config.supported_trust,
    )


def build_agent_uri(config: AgentIdentityConfig) -> str:
    return AgentURIGenerator.generate_agent_uri(
        name=config.agent_name,
        description=config.agent_description,
        endpoints=[build_endpoint(config)],
        image=config.agent_image,
        supported_trust=config.supported_trust,
    )


def build_identity_preview(config: AgentIdentityConfig) -> dict:
    return {
        "network": config.network,
        "agentUri": build_agent_uri(config),
        "registrationFile": build_registration_file(config),
    }


def create_wallet_provider(config: AgentIdentityConfig) -> EVMWalletProvider:
    if not config.wallet_password:
        raise ValueError("WALLET_PASSWORD is required for BNBAgent registration")

    return EVMWalletProvider(
        password=config.wallet_password,
        private_key=config.private_key,
        address=config.wallet_address,
        wallets_dir=config.wallets_dir,
    )


def build_registration_dry_run(
    config: AgentIdentityConfig,
    debug: bool = False,
    requested_registration: bool = False,
) -> dict:
    wallet_provider = create_wallet_provider(config)
    payload = build_identity_preview(config)
    result = {
        "mode": "dry-run",
        "debug": debug,
        "requestedRegistration": requested_registration,
        "transactionBroadcast": False,
        "sdkReady": False,
    }

    try:
        sdk = ERC8004Agent(
            network=config.network,
            wallet_provider=wallet_provider,
            debug=debug,
        )
    except Exception as exc:
        result["sdkError"] = str(exc)
    else:
        result["sdkClass"] = sdk.__class__.__name__
        result["sdkReady"] = True

    payload.update(
        {
            "walletAddress": wallet_provider.address,
            "result": result,
        }
    )
    return payload


def register_agent_identity(config: AgentIdentityConfig, debug: bool = False) -> dict:
    wallet_provider = create_wallet_provider(config)
    sdk = ERC8004Agent(
        network=config.network,
        wallet_provider=wallet_provider,
        debug=debug,
    )
    payload = build_identity_preview(config)
    result = sdk.register_agent(agent_uri=payload["agentUri"])
    payload.update(
        {
            "walletAddress": wallet_provider.address,
            "result": result,
        }
    )
    return payload
