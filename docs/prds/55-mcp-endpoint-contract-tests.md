# Spec: MCP Endpoint Contract Tests (Issue #55)

## Objective
The Orbis MCP (Model Context Protocol) server provides professional knowledge graph data to AI agents. To ensure the reliability of this interface and the privacy of user data, we must implement contract tests for all 6 tools. These tests will verify:
- **Correct response schema:** Each tool must return a valid JSON structure according to its contract.
- **Proper error handling:** Tools must handle missing orbs or invalid inputs gracefully.
- **Access control (Filter Tokens):** If a user provides a `filter_token`, the tool must exclude matching nodes, consistent with the main API's filtering logic.
- **Data integrity:** The data returned must accurately reflect the Neo4j graph state.

### Tools to test:
1. `orbis_get_summary`
2. `orbis_get_full_orb`
3. `orbis_get_nodes_by_type`
4. `orbis_get_connections`
5. `orbis_get_skills_for_experience`
6. `orbis_send_message`

## Tech Stack
- **Testing:** `pytest` (async-compatible)
- **Validation:** `pydantic` for schema enforcement
- **Mocking:** `unittest.mock` for Neo4j driver (in unit tests)
- **Integration:** Real Neo4j driver (for integration/contract tests)

## Commands
- **Unit Tests (Mocked DB):** `pytest backend/tests/unit/test_mcp_server.py`
- **Integration Tests (Real DB):** `NEO4J_URI=bolt://localhost:7687 pytest backend/tests/integration/test_mcp_contract.py`
- **Linting:** `ruff check backend/mcp_server`

## Project Structure
- `backend/mcp_server/` → Source code for the MCP server and tools.
- `backend/tests/unit/test_mcp_server.py` → Unit tests for tool logic with mocked Neo4j.
- `backend/tests/integration/test_mcp_contract.py` → Contract tests verifying graph state and schema.
- `backend/tests/fixtures/mcp_schemas.py` → Pydantic models for contract validation.

## Code Style
### Example Test Pattern (Unit/Mock)
```python
@pytest.mark.asyncio
async def test_orbis_get_summary_success(mock_db):
    # Setup mock record
    mock_record = {
        "p": {"name": "Test User", "headline": "Dev", "location": "Moon", "orb_id": "test-orb"},
        "connections": []
    }
    mock_db_single(mock_db, mock_record)
    
    # Call tool
    result = await orbis_get_summary("test-orb")
    
    # Verify schema and data
    assert result["name"] == "Test User"
    assert "node_counts" in result
```

### Filtering Requirement (New)
All retrieval tools must be updated to accept an optional `filter_token`:
```python
async def orbis_get_summary(orb_id: str, filter_token: str | None = None) -> dict:
```
The implementation must decode the token (using `app.orbs.filter_token.decode_filter_token`) and apply `node_matches_filters` to exclude matching nodes.

## Testing Strategy
1. **Schema Validation:** Define Pydantic models for each tool's response. In tests, parse the tool's return value through these models.
2. **Error Cases:** Test with non-existent `orb_id` (should return an error dict), invalid `node_type`, and invalid `filter_token`.
3. **Filter Token Validation:**
    - Test with no token: all data returned.
    - Test with valid token: matching nodes/links are excluded.
    - Test with token for different `orb_id`: token ignored (as per API logic).
4. **State Matching:** Use integration tests to populate a temporary Neo4j state and verify the MCP tool returns exactly what's expected.

## Boundaries
- **Always do:** Validate tool responses against Pydantic schemas in tests.
- **Ask first:** Modifying `app.graph.queries` to support specialized MCP filtering (prefer filtering in Python for parity with `orbs/router.py`).
- **Never do:** Commit tests that depend on a specific hardcoded Neo4j state without setup/teardown logic.

## Success Criteria
- [ ] Pydantic schemas defined for all 6 tools.
- [ ] Unit tests covering all 6 tools (success, error, filtering).
- [ ] Integration tests verifying state-matching for all 6 tools.
- [ ] All retrieval tools updated to support `filter_token`.
- [ ] `orbis_send_message` verified to correctly create nodes in Neo4j.

## Task Breakdown

### Phase 1: Foundation & Data Models

#### Task 1: Define Pydantic Models for MCP Tool Responses
**Description:** Create a new file `backend/tests/fixtures/mcp_schemas.py` and define Pydantic models for the response of each of the 6 MCP tools. These models will be used for contract validation in both unit and integration tests.

**Acceptance criteria:**
- [ ] Models defined for: `SummaryResponse`, `FullOrbResponse`, `NodeListResponse`, `ConnectionsResponse`, `SkillsListResponse`, `MessageResponse`.
- [ ] Schemas include all expected fields (e.g., `node_counts` in summary, `_type` in full orb nodes).
- [ ] Error response schema handles cases where an orb is not found.

**Verification:**
- [ ] Manual check: verify models against current `tools.py` return types.
- [ ] Linter passes: `ruff check backend/tests/fixtures/mcp_schemas.py`.

**Files likely touched:**
- `backend/tests/fixtures/mcp_schemas.py`

#### Task 2: Create Test Infrastructure
**Description:** Set up the base files for unit and integration tests, including necessary fixtures for mocking the Neo4j driver and decoding filter tokens.

**Acceptance criteria:**
- [ ] `backend/tests/unit/test_mcp_server.py` created with `mock_db` fixture.
- [ ] `backend/tests/integration/test_mcp_contract.py` created with real DB connection setup/teardown.
- [ ] Common utilities for contract validation (Pydantic parsing) added to a shared test lib if needed.

**Verification:**
- [ ] `pytest backend/tests/unit/test_mcp_server.py` runs (even if empty/skipped).

**Files likely touched:**
- `backend/tests/unit/test_mcp_server.py`
- `backend/tests/integration/test_mcp_contract.py`
- `backend/tests/conftest.py`

### Phase 2: Feature Implementation (Filtering)

#### Task 3: Implement Filter Token Support in MCP Tools
**Description:** Update all retrieval tools in `backend/mcp_server/tools.py` and their wrappers in `server.py` to accept an optional `filter_token`. Integrate `decode_filter_token` and `node_matches_filters` logic.

**Acceptance criteria:**
- [ ] `orbis_get_summary`, `orbis_get_full_orb`, `orbis_get_nodes_by_type`, `orbis_get_connections`, and `orbis_get_skills_for_experience` updated.
- [ ] Filtering logic correctly excludes nodes based on keywords if the `orb_id` in the token matches.
- [ ] Invalid or mismatched tokens are gracefully ignored (as per PRD).

**Verification:**
- [ ] Unit tests (from Task 4) pass for filtering scenarios.

**Files likely touched:**
- `backend/mcp_server/tools.py`
- `backend/mcp_server/server.py`

### Phase 3: Contract Testing Implementation

#### Task 4: Implement Unit Tests for Each Tool (One by One)
**Description:** Add unit tests with mocked Neo4j responses for all 6 tools, verifying both successful data retrieval and error handling.

**Acceptance criteria:**
- [ ] Tests for `get_summary`, `get_orb_full`, `get_nodes_by_type`, `get_connections`, `get_skills_for_experience`, and `send_message`.
- [ ] Each test validates the response against its Pydantic schema.
- [ ] Coverage for edge cases: Orb not found, invalid node type, empty graph.

**Verification:**
- [ ] `pytest backend/tests/unit/test_mcp_server.py` passes all tests.

**Files likely touched:**
- `backend/tests/unit/test_mcp_server.py`

#### Task 5: Implement Integration & Contract Tests
**Description:** Add integration tests that interact with a real (or test) Neo4j instance to verify the end-to-end contract and data integrity.

**Acceptance criteria:**
- [ ] Setup/Teardown logic populates a test orb with known data.
- [ ] Verification that tools return exactly what is in the graph.
- [ ] Filter token integration tested against real graph data.
- [ ] `orbis_send_message` verified by checking Neo4j for the created `Message` node.

**Verification:**
- [ ] `NEO4J_URI=... pytest backend/tests/integration/test_mcp_contract.py` passes.

**Files likely touched:**
- `backend/tests/integration/test_mcp_contract.py`

### Phase 4: Final Validation

#### Task 6: Final Quality Check and Documentation
**Description:** Perform a final audit of the implementation, ensuring consistent error messages, proper type hinting, and updated documentation.

**Acceptance criteria:**
- [ ] All tests (unit + integration) pass in CI/local.
- [ ] `docs/api.md` or similar updated if MCP tool signatures changed.
- [ ] Code follows all project conventions and linting rules.

**Verification:**
- [ ] `ruff check backend/mcp_server` passes.
- [ ] `mypy backend/mcp_server` (if used) passes.
