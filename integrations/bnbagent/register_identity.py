from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
import json
import sys
from pathlib import Path


if __package__ in (None, ""):
    sys.path.append(str(Path(__file__).resolve().parent))
    from client import (  # type: ignore
        build_identity_preview,
        build_registration_dry_run,
        load_identity_config,
        register_agent_identity,
    )
else:
    from .client import (
        build_identity_preview,
        build_registration_dry_run,
        load_identity_config,
        register_agent_identity,
    )


def _to_json_safe(value: object) -> object:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, Path):
        return str(value)

    if isinstance(value, (bytes, bytearray)):
        return "0x" + bytes(value).hex()

    if isinstance(value, Mapping):
        return {str(key): _to_json_safe(item) for key, item in value.items()}

    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_to_json_safe(item) for item in value]

    hex_method = getattr(value, "hex", None)
    if callable(hex_method):
        try:
            return hex_method()
        except TypeError:
            pass

    if hasattr(value, "__dict__"):
        return _to_json_safe(vars(value))

    return str(value)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Preview or register an ERC-8004 BNBAgent identity from env config."
    )
    parser.add_argument(
        "--register",
        action="store_true",
        help="Submit the registration transaction on-chain.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable BNBAgent SDK debug mode during registration.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run the registration preflight without broadcasting any transaction.",
    )
    args = parser.parse_args()

    config = load_identity_config()

    if args.dry_run:
        payload = build_registration_dry_run(
            config,
            debug=args.debug,
            requested_registration=args.register,
        )
    elif args.register:
        payload = register_agent_identity(config, debug=args.debug)
    else:
        payload = build_identity_preview(config)

    print(json.dumps(_to_json_safe(payload), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
