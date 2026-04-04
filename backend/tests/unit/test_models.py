"""Unit tests for Pydantic model validation."""

from __future__ import annotations

from app.auth.models import TokenResponse, UserInfo
from app.cv.models import (
    ConfirmRequest,
    ExtractedData,
    ExtractedNode,
    ExtractedRelationship,
    SkippedNode,
)
from app.graph.queries import CREATE_PERSON
from app.orbs.models import NodeCreate, NodeUpdate, OrbIdUpdate, PersonUpdate

# ── CV Models ──


class TestExtractedNode:
    def test_valid(self):
        node = ExtractedNode(node_type="skill", properties={"name": "Python"})
        assert node.node_type == "skill"
        assert node.properties["name"] == "Python"


class TestSkippedNode:
    def test_valid(self):
        node = SkippedNode(original={"node_type": "bad"}, reason="Unknown type")
        assert node.reason == "Unknown type"


class TestExtractedRelationship:
    def test_valid(self):
        rel = ExtractedRelationship(from_index=0, to_index=1, type="USED_SKILL")
        assert rel.from_index == 0
        assert rel.to_index == 1

    def test_default_type(self):
        rel = ExtractedRelationship(from_index=0, to_index=1)
        assert rel.type == "USED_SKILL"


class TestExtractedData:
    def test_valid_full(self):
        data = ExtractedData(
            nodes=[ExtractedNode(node_type="skill", properties={"name": "Python"})],
            unmatched=["some text"],
            skipped_nodes=[SkippedNode(original={}, reason="bad")],
            relationships=[ExtractedRelationship(from_index=0, to_index=1)],
            truncated=True,
            cv_owner_name="Alice",
        )
        assert len(data.nodes) == 1
        assert data.truncated is True
        assert data.cv_owner_name == "Alice"

    def test_defaults(self):
        data = ExtractedData(nodes=[])
        assert data.unmatched == []
        assert data.skipped_nodes == []
        assert data.relationships == []
        assert data.truncated is False
        assert data.cv_owner_name is None


class TestConfirmRequest:
    def test_valid(self):
        req = ConfirmRequest(
            nodes=[ExtractedNode(node_type="skill", properties={"name": "Go"})],
            cv_owner_name="Bob",
        )
        assert len(req.nodes) == 1
        assert req.cv_owner_name == "Bob"

    def test_defaults(self):
        req = ConfirmRequest(nodes=[])
        assert req.relationships == []
        assert req.cv_owner_name is None


# ── Auth Models ──


class TestUserInfo:
    def test_valid(self):
        user = UserInfo(user_id="u1", email="a@b.com", name="Alice")
        assert user.user_id == "u1"
        assert user.picture == ""

    def test_with_picture(self):
        user = UserInfo(
            user_id="u1", email="a@b.com", name="Alice", picture="https://pic.com/a.jpg"
        )
        assert user.picture == "https://pic.com/a.jpg"


class TestTokenResponse:
    def test_valid(self):
        resp = TokenResponse(
            access_token="tok123",
            user=UserInfo(user_id="u1", email="a@b.com", name="A"),
        )
        assert resp.token_type == "bearer"

    def test_custom_token_type(self):
        resp = TokenResponse(
            access_token="tok",
            token_type="custom",
            user=UserInfo(user_id="u1", email="a@b.com", name="A"),
        )
        assert resp.token_type == "custom"


# ── Orbs Models ──


class TestNodeCreate:
    def test_valid(self):
        nc = NodeCreate(node_type="education", properties={"institution": "MIT"})
        assert nc.node_type == "education"


class TestNodeUpdate:
    def test_valid(self):
        nu = NodeUpdate(properties={"name": "Updated"})
        assert nu.properties["name"] == "Updated"


class TestPersonUpdate:
    def test_all_none_defaults(self):
        pu = PersonUpdate()
        assert pu.headline is None
        assert pu.location is None
        assert pu.open_to_work is None

    def test_partial_update(self):
        pu = PersonUpdate(headline="Software Engineer", open_to_work=True)
        assert pu.headline == "Software Engineer"
        assert pu.open_to_work is True
        assert pu.location is None

    def test_all_fields(self):
        pu = PersonUpdate(
            headline="SWE",
            location="Milan",
            linkedin_url="https://linkedin.com/in/test",
            github_url="https://github.com/test",
            twitter_url="https://twitter.com/test",
            instagram_url="https://instagram.com/test",
            scholar_url="https://scholar.google.com/test",
            website_url="https://test.dev",
            open_to_work=False,
        )
        assert pu.linkedin_url == "https://linkedin.com/in/test"
        assert pu.open_to_work is False

    def test_serialization_excludes_none(self):
        pu = PersonUpdate(headline="SWE")
        dumped = pu.model_dump(exclude_none=True)
        assert "headline" in dumped
        assert "location" not in dumped


class TestOrbIdUpdate:
    def test_valid(self):
        update = OrbIdUpdate(orb_id="my-custom-orb-id")
        assert update.orb_id == "my-custom-orb-id"


# ── Schema mismatch detection ──


class TestSchemaMismatch:
    def test_person_update_fields_vs_create_person_query(self):
        """PersonUpdate allows github_url, twitter_url, instagram_url but
        CREATE_PERSON query does not initialize them. This documents the gap.
        """
        update_fields = set(PersonUpdate.model_fields.keys())
        # Fields that PersonUpdate supports but CREATE_PERSON doesn't initialize
        fields_in_query = set()
        for field in update_fields:
            if field in CREATE_PERSON:
                fields_in_query.add(field)

        missing_from_create = update_fields - fields_in_query
        expected_missing = {"github_url", "twitter_url", "instagram_url"}
        assert expected_missing.issubset(missing_from_create), (
            f"Expected {expected_missing} to be missing from CREATE_PERSON, "
            f"but missing fields are: {missing_from_create}. "
            "CREATE_PERSON should be updated to initialize these fields."
        )
