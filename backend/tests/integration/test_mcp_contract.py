import os
import uuid

import pytest
from neo4j import AsyncGraphDatabase

from app.config import settings
from app.orbs.filter_token import create_filter_token
from mcp_server.server import orbis_send_message
from mcp_server.tools import (
    get_connections,
    get_nodes_by_type,
    get_orb_full,
    get_orb_summary,
    get_skills_for_experience,
)
from tests.fixtures.mcp_schemas import (
    ConnectionsResponse,
    FullOrbResponse,
    MessageResponse,
    NodeListResponse,
    SummaryResponse,
)


@pytest.fixture(scope="function")
async def real_driver():
    """Get a real Neo4j driver using environment variables or settings."""
    uri = os.environ.get("NEO4J_URI", settings.neo4j_uri)
    user = os.environ.get("NEO4J_USER", settings.neo4j_user)
    pwd = os.environ.get("NEO4J_PASSWORD", settings.neo4j_password)

    driver = AsyncGraphDatabase.driver(uri, auth=(user, pwd))
    try:
        # Check connection
        async with driver.session() as s:
            await s.run("RETURN 1")
    except Exception as e:
        pytest.skip(f"Real Neo4j not available at {uri}: {e}")

    yield driver
    await driver.close()


@pytest.fixture(scope="function")
async def test_orb(real_driver):
    """Seed a test orb in the real database."""
    orb_id = f"contract-test-{uuid.uuid4().hex[:8]}"
    user_id = f"user-{orb_id}"

    async with real_driver.session() as s:
        # 1. Create Person
        await s.run(
            """
            CREATE (p:Person {
                user_id: $user_id, orb_id: $orb_id,
                name: 'Contract Test User', headline: 'QA Engineer',
                location: 'Integration Cloud', open_to_work: true
            })
        """,
            user_id=user_id,
            orb_id=orb_id,
        )

        # 2. Create a Skill
        await s.run(
            """
            MATCH (p:Person {orb_id: $orb_id})
            CREATE (p)-[:HAS_SKILL]->(s:Skill {name: 'Contracting', uid: $uid, proficiency: 'Expert'})
        """,
            orb_id=orb_id,
            uid=f"skill-{orb_id}",
        )

        # 3. Create WorkExperience and linked Skill
        exp_uid = f"exp-{orb_id}"
        await s.run(
            """
            MATCH (p:Person {orb_id: $orb_id})
            CREATE (p)-[:HAS_WORK_EXPERIENCE]->(e:WorkExperience {
                company: 'TestCorp', title: 'Senior Tester', uid: $exp_uid
            })
            CREATE (s:Skill {name: 'SecretSkill', uid: $secret_uid})
            CREATE (e)-[:USED_SKILL]->(s)
        """,
            orb_id=orb_id,
            exp_uid=exp_uid,
            secret_uid=f"secret-{orb_id}",
        )

    yield orb_id

    # Cleanup: detach delete person and all its nodes
    async with real_driver.session() as s:
        await s.run(
            """
            MATCH (p:Person {orb_id: $orb_id})
            OPTIONAL MATCH (p)-[*1..2]-(n)
            DETACH DELETE n, p
        """,
            orb_id=orb_id,
        )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_contract_get_summary(real_driver, test_orb):
    result = await get_orb_summary(real_driver, test_orb)
    SummaryResponse.model_validate(result)
    assert result["name"] == "Contract Test User"
    assert result["node_counts"]["Skill"] >= 1
    assert result["node_counts"]["WorkExperience"] >= 1
    assert result["total_nodes"] >= 2


@pytest.mark.integration
@pytest.mark.asyncio
async def test_contract_get_summary_filtering(real_driver, test_orb):
    # Create a filter token that excludes "Contracting"
    token = create_filter_token(test_orb, ["Contracting"])

    result = await get_orb_summary(real_driver, test_orb, filter_token=token)
    SummaryResponse.model_validate(result)

    # "Contracting" skill should be excluded from counts
    assert result["node_counts"].get("Skill", 0) == 0
    assert result["total_nodes"] == 1  # Only WorkExperience left


@pytest.mark.integration
@pytest.mark.asyncio
async def test_contract_get_full_orb(real_driver, test_orb):
    result = await get_orb_full(real_driver, test_orb)
    FullOrbResponse.model_validate(result)
    assert result["person"]["name"] == "Contract Test User"
    # Ensure nodes are there
    uids = [n.get("uid") for n in result["nodes"]]
    assert any(u.startswith("skill-") for u in uids if u)
    assert any(u.startswith("exp-") for u in uids if u)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_contract_get_nodes_by_type(real_driver, test_orb):
    result = await get_nodes_by_type(real_driver, test_orb, "skill")
    NodeListResponse.model_validate(result)
    assert any(n["name"] == "Contracting" for n in result)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_contract_get_connections(real_driver, test_orb):
    exp_uid = f"exp-{test_orb}"
    result = await get_connections(real_driver, test_orb, exp_uid)
    ConnectionsResponse.model_validate(result)
    assert result["node_uid"] == exp_uid
    # Should have a connection to SecretSkill
    assert any(c["node"]["name"] == "SecretSkill" for c in result["connections"])


@pytest.mark.integration
@pytest.mark.asyncio
async def test_contract_get_skills_for_experience(real_driver, test_orb):
    exp_uid = f"exp-{test_orb}"
    result = await get_skills_for_experience(real_driver, test_orb, exp_uid)
    NodeListResponse.model_validate(result)
    assert any(s["name"] == "SecretSkill" for s in result)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_contract_filtering_integration(real_driver, test_orb):
    # Filter "Contracting"
    token = create_filter_token(test_orb, ["Contracting"])

    # Test Full Orb
    full = await get_orb_full(real_driver, test_orb, filter_token=token)
    assert not any(n.get("name") == "Contracting" for n in full["nodes"])

    # Test Nodes by Type
    skills = await get_nodes_by_type(real_driver, test_orb, "skill", filter_token=token)
    assert not any(s["name"] == "Contracting" for s in skills)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_contract_send_message(real_driver, test_orb):
    # We need to mock _get_driver in server.py to use our real_driver
    from unittest.mock import AsyncMock, patch

    with patch("mcp_server.server._get_driver", AsyncMock(return_value=real_driver)):
        result = await orbis_send_message(
            test_orb,
            "Integration",
            "test@example.com",
            "Test Message",
            "Integration body",
        )

    MessageResponse.model_validate(result)
    msg_uid = result["uid"]

    # Verify in DB
    async with real_driver.session() as s:
        res = await s.run("MATCH (m:Message {uid: $uid}) RETURN m", uid=msg_uid)
        record = await res.single()
        assert record is not None
        assert record["m"]["subject"] == "Test Message"
