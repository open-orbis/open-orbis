"""Integration tests for MCP tools against a real Neo4j instance.

These tests seed a temporary graph, create share tokens, and call MCP
tool functions to verify end-to-end behavior including:
- Real Cypher query execution
- Share token validation and filter enforcement
- Owner bypass access control
- Response schema correctness

Requirements:
- Neo4j running at bolt://localhost:7687 (docker-compose up neo4j)

Run: cd backend && uv run pytest tests/integration/test_mcp_integration.py -v
"""

from __future__ import annotations

import os
import uuid

import pytest
from neo4j import AsyncGraphDatabase, GraphDatabase

# ── Config ──

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "orbis_dev_password")

# ── Test data constants ──

TEST_USER_ID = f"mcp-test-{uuid.uuid4().hex[:8]}"
TEST_ORB_ID = f"mcp-test-orb-{uuid.uuid4().hex[:8]}"
TEST_STRANGER_ID = f"mcp-stranger-{uuid.uuid4().hex[:8]}"
TOKEN_FULL = f"{TEST_ORB_ID}-token-full"
TOKEN_KW = f"{TEST_ORB_ID}-token-kw"
TOKEN_TYPE = f"{TEST_ORB_ID}-token-type"
SK1 = f"{TEST_ORB_ID}-sk1"
SK2 = f"{TEST_ORB_ID}-sk2"
WE1 = f"{TEST_ORB_ID}-we1"
EDU1 = f"{TEST_ORB_ID}-edu1"


# ── Sync seeding (avoids event loop issues) ──


def _seed_sync():
    """Seed test data using the synchronous driver."""
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    try:
        with driver.session() as session:
            session.run("RETURN 1")  # connectivity check
            session.run(
                """
                CREATE (p:Person {
                    user_id: $user_id, orb_id: $orb_id,
                    name: 'MCP Test User', headline: 'Integration Tester',
                    location: 'Test City', visibility: 'public', open_to_work: true
                })
                CREATE (p)-[:HAS_SKILL]->(s1:Skill {uid: $sk1, name: 'Python'})
                CREATE (p)-[:HAS_SKILL]->(s2:Skill {uid: $sk2, name: 'Confidential Skill'})
                CREATE (p)-[:HAS_WORK_EXPERIENCE]->(w:WorkExperience {
                    uid: $we1, title: 'Engineer', company: 'Acme Corp',
                    start_date: '2020-01', end_date: '2024-06'
                })
                CREATE (p)-[:HAS_EDUCATION]->(e:Education {
                    uid: $edu1, institution: 'MIT', degree: 'MSc CS'
                })
                CREATE (w)-[:USED_SKILL]->(s1)
                CREATE (p)-[:HAS_SHARE_TOKEN]->(t1:ShareToken {
                    token_id: $tok_full, orb_id: $orb_id,
                    keywords: [], hidden_node_types: [], label: 'full',
                    created_at: datetime(), expires_at: datetime() + duration('P365D'),
                    revoked: false, revoked_at: null
                })
                CREATE (p)-[:HAS_SHARE_TOKEN]->(t2:ShareToken {
                    token_id: $tok_kw, orb_id: $orb_id,
                    keywords: ['confidential'], hidden_node_types: [], label: 'kw',
                    created_at: datetime(), expires_at: datetime() + duration('P365D'),
                    revoked: false, revoked_at: null
                })
                CREATE (p)-[:HAS_SHARE_TOKEN]->(t3:ShareToken {
                    token_id: $tok_type, orb_id: $orb_id,
                    keywords: [], hidden_node_types: ['Education'], label: 'type',
                    created_at: datetime(), expires_at: datetime() + duration('P365D'),
                    revoked: false, revoked_at: null
                })
                """,
                user_id=TEST_USER_ID,
                orb_id=TEST_ORB_ID,
                sk1=SK1,
                sk2=SK2,
                we1=WE1,
                edu1=EDU1,
                tok_full=TOKEN_FULL,
                tok_kw=TOKEN_KW,
                tok_type=TOKEN_TYPE,
            )
        return True
    except Exception:
        return False
    finally:
        driver.close()


def _cleanup_sync():
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    try:
        with driver.session() as session:
            session.run(
                "MATCH (p:Person {user_id: $uid})-[*0..]->(n) DETACH DELETE n",
                uid=TEST_USER_ID,
            )
            session.run(
                "MATCH (p:Person {user_id: $uid}) DETACH DELETE p",
                uid=TEST_USER_ID,
            )
    finally:
        driver.close()


# Seed at module load, skip if Neo4j unavailable
_seeded = _seed_sync()
pytestmark = pytest.mark.skipif(not _seeded, reason="Neo4j not available")


def _set_mcp_user(user_id: str | None):
    from mcp_server.auth import _current_user_id

    _current_user_id.set(user_id)


@pytest.fixture()
async def driver():
    drv = AsyncGraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    yield drv
    await drv.close()


def teardown_module(_module):
    _cleanup_sync()


# ── Tests: Owner access (no token needed) ──


class TestOwnerAccess:
    @pytest.mark.asyncio
    async def test_get_summary(self, driver):
        from mcp_server.tools import get_orb_summary

        _set_mcp_user(TEST_USER_ID)
        result = await get_orb_summary(driver, TEST_ORB_ID)

        assert "error" not in result
        assert result["name"] == "MCP Test User"
        assert result["orb_id"] == TEST_ORB_ID
        assert result["total_nodes"] >= 4
        assert "Skill" in result["node_counts"]

    @pytest.mark.asyncio
    async def test_get_full_orb(self, driver):
        from mcp_server.tools import get_orb_full

        _set_mcp_user(TEST_USER_ID)
        result = await get_orb_full(driver, TEST_ORB_ID)

        assert "error" not in result
        assert "person" in result
        assert len(result["nodes"]) >= 4
        types = {n["_type"] for n in result["nodes"]}
        assert {"Skill", "WorkExperience", "Education"} <= types

    @pytest.mark.asyncio
    async def test_get_nodes_by_type(self, driver):
        from mcp_server.tools import get_nodes_by_type

        _set_mcp_user(TEST_USER_ID)
        result = await get_nodes_by_type(driver, TEST_ORB_ID, "skill")

        assert len(result) >= 2
        names = {n["name"] for n in result}
        assert "Python" in names
        assert "Confidential Skill" in names

    @pytest.mark.asyncio
    async def test_get_connections(self, driver):
        from mcp_server.tools import get_connections

        _set_mcp_user(TEST_USER_ID)
        result = await get_connections(driver, TEST_ORB_ID, WE1)

        assert "error" not in result
        assert result["node_uid"] == WE1
        assert len(result["connections"]) >= 1

    @pytest.mark.asyncio
    async def test_get_skills_for_experience(self, driver):
        from mcp_server.tools import get_skills_for_experience

        _set_mcp_user(TEST_USER_ID)
        result = await get_skills_for_experience(driver, TEST_ORB_ID, WE1)

        assert len(result) >= 1
        assert any(s["name"] == "Python" for s in result)


# ── Tests: Stranger with token + filter enforcement ──


class TestTokenFilters:
    @pytest.mark.asyncio
    async def test_full_token_returns_all(self, driver):
        from mcp_server.tools import get_orb_full

        _set_mcp_user(TEST_STRANGER_ID)
        result = await get_orb_full(driver, TEST_ORB_ID, token=TOKEN_FULL)

        assert "error" not in result
        assert len(result["nodes"]) >= 4

    @pytest.mark.asyncio
    async def test_keyword_filter_excludes_matching(self, driver):
        from mcp_server.tools import get_orb_full

        _set_mcp_user(TEST_STRANGER_ID)
        result = await get_orb_full(driver, TEST_ORB_ID, token=TOKEN_KW)

        assert "error" not in result
        for node in result["nodes"]:
            assert "Confidential" not in node.get("name", "")

    @pytest.mark.asyncio
    async def test_keyword_filter_on_nodes_by_type(self, driver):
        from mcp_server.tools import get_nodes_by_type

        _set_mcp_user(TEST_STRANGER_ID)
        result = await get_nodes_by_type(driver, TEST_ORB_ID, "skill", token=TOKEN_KW)

        names = {n["name"] for n in result}
        assert "Python" in names
        assert "Confidential Skill" not in names

    @pytest.mark.asyncio
    async def test_hidden_type_excludes_from_full(self, driver):
        from mcp_server.tools import get_orb_full

        _set_mcp_user(TEST_STRANGER_ID)
        result = await get_orb_full(driver, TEST_ORB_ID, token=TOKEN_TYPE)

        assert "error" not in result
        for node in result["nodes"]:
            assert node["_type"] != "Education"

    @pytest.mark.asyncio
    async def test_hidden_type_returns_empty_for_type(self, driver):
        from mcp_server.tools import get_nodes_by_type

        _set_mcp_user(TEST_STRANGER_ID)
        result = await get_nodes_by_type(
            driver, TEST_ORB_ID, "education", token=TOKEN_TYPE
        )

        assert result == []

    @pytest.mark.asyncio
    async def test_summary_excludes_hidden_type(self, driver):
        from mcp_server.tools import get_orb_summary

        _set_mcp_user(TEST_STRANGER_ID)
        result = await get_orb_summary(driver, TEST_ORB_ID, token=TOKEN_TYPE)

        assert "error" not in result
        assert "Education" not in result.get("node_counts", {})


# ── Tests: Access control ──


class TestAccessControl:
    @pytest.mark.asyncio
    async def test_unauthenticated_rejected(self, driver):
        from mcp_server.tools import get_orb_summary

        _set_mcp_user(None)
        result = await get_orb_summary(driver, TEST_ORB_ID)

        assert "error" in result

    @pytest.mark.asyncio
    async def test_stranger_no_token_rejected(self, driver):
        from mcp_server.tools import get_orb_summary

        _set_mcp_user(TEST_STRANGER_ID)
        result = await get_orb_summary(driver, TEST_ORB_ID, token="")

        assert "error" in result

    @pytest.mark.asyncio
    async def test_invalid_token_rejected(self, driver):
        from mcp_server.tools import get_orb_summary

        _set_mcp_user(TEST_STRANGER_ID)
        result = await get_orb_summary(driver, TEST_ORB_ID, token="bogus")

        assert "error" in result

    @pytest.mark.asyncio
    async def test_nonexistent_orb_rejected(self, driver):
        from mcp_server.tools import get_orb_summary

        _set_mcp_user(TEST_USER_ID)
        result = await get_orb_summary(driver, "no-such-orb")

        assert "error" in result
