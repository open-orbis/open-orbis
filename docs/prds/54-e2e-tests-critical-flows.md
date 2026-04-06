# Spec: [F1.3] E2E tests for critical user flows

## Objective
Implement end-to-end (E2E) tests to ensure the reliability of Orbis's core user journeys. These tests will simulate real user interactions in a browser to verify that the frontend and backend work together correctly.

### User Stories / Acceptance Criteria:
- **Signup & Onboarding**: A new user can sign up, create their first orb, and see the initial 3D graph visualization.
- **CV Processing**: A user can upload a CV (PDF/TXT), review the extracted information (nodes/edges), confirm the extraction, and see the updated orb.
- **Sharing**: A user can generate a shareable link for their orb, and an unauthenticated user can view the public version of that orb with the correct (and restricted) data.
- **Editing**: A user can edit an existing node in their graph and verify that the change is persisted and reflected in the 3D visualization.
- **Exporting**: A user can export their orb data in multiple formats (PDF, JSON, JSON-LD) and receive a valid file.

## Tech Stack
- **Test Runner**: Playwright (v1.40+)
- **Language**: TypeScript
- **Environment**: Node.js
- **CI/CD**: GitHub Actions integration

## Commands
- **Install E2E Dependencies**: `cd frontend && npm install -D @playwright/test && npx playwright install`
- **Run E2E Tests**: `cd frontend && npx playwright test`
- **Run E2E Tests (Headed)**: `cd frontend && npx playwright test --headed`
- **Generate Report**: `cd frontend && npx playwright show-report`

## Project Structure
- `frontend/e2e/` → Playwright test files
- `frontend/e2e/fixtures/` → Test data and helper files
- `frontend/e2e/utils/` → Shared test utilities (auth, setup/teardown)
- `frontend/playwright.config.ts` → Playwright configuration

## Code Style
```typescript
import { test, expect } from '@playwright/test';

test('user can upload CV and see graph', async ({ page }) => {
  await page.goto('/upload');
  await page.setInputFiles('input[type="file"]', 'e2e/fixtures/sample_cv.pdf');
  await page.click('button:has-text("Upload")');
  
  // Wait for processing
  await expect(page.locator('text=Extraction Complete')).toBeVisible({ timeout: 30000 });
  
  await page.click('button:has-text("Confirm")');
  await expect(page.locator('canvas')).toBeVisible(); // 3D Graph
});
```

## Testing Strategy
- **Isolation**: Use a dedicated test database (Neo4j) or a clean-up script before/after runs.
- **Mocking**: Minimize mocking; prefer testing the real integrated system. Use mocking only for external APIs (like Claude/OpenAI) if necessary for cost/stability.
- **Wait Strategies**: Prefer web-first assertions (`expect(...).toBeVisible()`) over hard sleeps.
- **Coverage**: Focus on the "happy path" for critical flows first, then add edge cases.

## Boundaries
- **Always**: 
  - Ensure the local dev environment is running before executing E2E tests.
  - Clean up test data after execution.
- **Ask first**: 
  - Adding new dependencies to the root `package.json`.
  - Significant changes to the `docker-compose.yml` for CI integration.
- **Never**: 
  - Hardcode credentials in test files (use `.env.test`).
  - Run E2E tests against production databases.

## Success Criteria
- [ ] Playwright is successfully integrated into the `frontend` project.
- [ ] All 5 critical user journeys listed in the Objective are covered by automated tests.
- [ ] Tests pass consistently in a headless environment.
- [ ] A GitHub Action is configured to run these tests on every Pull Request to `main`.

## Implementation Plan

### Overview
We'll set up Playwright in the `frontend` directory and implement 5 core E2E tests. Each test will cover a critical user journey. We'll also set up a basic CI configuration for GitHub Actions.

### Architecture Decisions
- **Playwright Configuration**: We'll use a single `playwright.config.ts` in the `frontend` directory.
- **Base URL**: The tests will target `http://localhost:5173` (Vite dev server) and `http://localhost:8000` (FastAPI backend).
- **Authentication**: We'll use a shared auth setup to avoid re-authenticating for every test where possible.
- **Data Cleanup**: We'll use unique email addresses for each test run to ensure isolation.

### Task List

#### Phase 1: Foundation & Setup
- [ ] **Task 1: Install and Configure Playwright**
  - **Acceptance**: Playwright installed, `playwright.config.ts` created, and a "hello world" test passes.
  - **Verify**: `cd frontend && npx playwright test tests/example.spec.ts`
  - **Files**: `frontend/package.json`, `frontend/playwright.config.ts`, `frontend/tests/example.spec.ts`
  - **Scope**: S (1-2 files)
- [ ] **Task 2: Global Setup (Auth & Environment)**
  - **Acceptance**: A mechanism to sign up/in once and reuse the session for multiple tests.
  - **Verify**: A test that starts in an authenticated state works.
  - **Files**: `frontend/e2e/utils/auth.setup.ts`, `frontend/e2e/utils/global.setup.ts`
  - **Scope**: S (2 files)

#### Phase 2: Core User Journeys
- [ ] **Task 3: Signup & Onboarding Flow**
  - **Acceptance**: Full flow from landing page to sign-up to viewing the first orb.
  - **Verify**: `npx playwright test e2e/signup.spec.ts`
  - **Files**: `frontend/e2e/signup.spec.ts`
  - **Scope**: S (1 file)
- [ ] **Task 4: CV Upload & Extraction Flow**
  - **Acceptance**: Upload a sample CV, verify "Extraction Complete" message, confirm, and see the orb.
  - **Verify**: `npx playwright test e2e/cv_upload.spec.ts`
  - **Files**: `frontend/e2e/cv_upload.spec.ts`, `frontend/e2e/fixtures/sample_cv.txt`
  - **Scope**: M (2-3 files)
- [ ] **Task 5: Orb Sharing & Public View**
  - **Acceptance**: Generate share link, open in a new (unauthenticated) context, verify data presence/restriction.
  - **Verify**: `npx playwright test e2e/sharing.spec.ts`
  - **Files**: `frontend/e2e/sharing.spec.ts`
  - **Scope**: S (1 file)
- [ ] **Task 6: Node Editing & Persistence**
  - **Acceptance**: Select a node in the graph, edit its properties, save, refresh, and verify the change.
  - **Verify**: `npx playwright test e2e/editing.spec.ts`
  - **Files**: `frontend/e2e/editing.spec.ts`
  - **Scope**: S (1 file)
- [ ] **Task 7: Data Export (PDF/JSON/JSON-LD)**
  - **Acceptance**: Click export buttons and verify that a file is downloaded with correct content type.
  - **Verify**: `npx playwright test e2e/export.spec.ts`
  - **Files**: `frontend/e2e/export.spec.ts`
  - **Scope**: S (1 file)

#### Phase 3: CI Integration & Polish
- [ ] **Task 8: GitHub Actions Workflow**
  - **Acceptance**: A new workflow file `.github/workflows/e2e-tests.yml` that runs Playwright tests.
  - **Verify**: Push to a PR and see the action run.
  - **Files**: `.github/workflows/e2e-tests.yml`
  - **Scope**: S (1 file)

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM Flakiness | High | Use mock extractions if the backend supports it, or increase timeouts for Claude/Ollama. |
| Neo4j State Persistence | Med | Use unique email addresses for each test run to avoid collisions. |
| 3D Graph Interaction | Med | Use Playwright's canvas interaction or wait for specific text elements if canvas is hard to target. |

## Open Questions
- Do we have a dedicated "test mode" in the backend to bypass real LLM calls and use mock extractions for E2E speed/cost?
- How should we handle Neo4j state reset efficiently between tests?
