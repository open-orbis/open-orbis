"""Grant admin privileges to an existing Person.

Usage:
    uv run python -m scripts.grant_admin --user-id google-1234567890
    uv run python -m scripts.grant_admin --email someone@example.com
    uv run python -m scripts.grant_admin --user-id google-... --revoke

This is the bootstrap path for the very first admin: until at least one
Person has `is_admin = true`, the /admin/* endpoints have nobody to let in.
After that, admins can in principle promote others (no UI yet, but the DB
flag is the source of truth, so this script is the canonical way).

Lookup by email decrypts every Person's email field with the configured
Fernet key — fine for the small N of a closed beta, not what you'd do in
production at scale.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from neo4j import AsyncGraphDatabase

from app.config import settings
from app.graph.encryption import decrypt_value
from app.graph.queries import GRANT_ADMIN_BY_USER_ID, REVOKE_ADMIN_BY_USER_ID


async def find_user_id_by_email(driver, email: str) -> str | None:
    async with driver.session() as session:
        result = await session.run(
            "MATCH (p:Person) RETURN p.user_id AS user_id, p.email AS email"
        )
        async for record in result:
            stored = record["email"]
            if not stored:
                continue
            try:
                if decrypt_value(stored) == email:
                    return record["user_id"]
            except Exception:
                continue
    return None


async def run(user_id: str | None, email: str | None, revoke: bool) -> int:
    driver = AsyncGraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
    )
    try:
        if email and not user_id:
            user_id = await find_user_id_by_email(driver, email)
            if user_id is None:
                print(f"No Person found with email {email}", file=sys.stderr)
                return 1
            print(f"Resolved {email} -> {user_id}")

        query = REVOKE_ADMIN_BY_USER_ID if revoke else GRANT_ADMIN_BY_USER_ID
        async with driver.session() as session:
            result = await session.run(query, user_id=user_id)
            record = await result.single()
            if record is None:
                print(f"No Person found with user_id {user_id}", file=sys.stderr)
                return 1

        action = "revoked from" if revoke else "granted to"
        print(f"Admin {action} {user_id}")
        return 0
    finally:
        await driver.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--user-id", help="OAuth user_id (e.g. google-1234567890)")
    group.add_argument("--email", help="Email address of an existing Person")
    parser.add_argument(
        "--revoke",
        action="store_true",
        help="Revoke admin instead of granting it",
    )
    args = parser.parse_args()
    return asyncio.run(run(args.user_id, args.email, args.revoke))


if __name__ == "__main__":
    sys.exit(main())
