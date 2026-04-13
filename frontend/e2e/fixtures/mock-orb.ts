import type { Page } from '@playwright/test';

/** Minimal orb data for E2E tests — mirrors OrbData from src/api/orbs.ts */
export const MOCK_ORB = {
  person: {
    user_id: 'test-user-001',
    orb_id: 'test-orb-001',
    name: 'Test User',
    headline: 'Software Engineer',
    location: 'Berlin, Germany',
  },
  nodes: [
    { uid: 'we1', _labels: ['WorkExperience'], title: 'Engineer', company: 'Acme Corp', start_date: '2020-01', end_date: null },
    { uid: 'ed1', _labels: ['Education'], institution: 'MIT', degree: 'BSc CS', start_date: '2016-09', end_date: '2020-06' },
    { uid: 'sk1', _labels: ['Skill'], name: 'TypeScript', category: 'Programming' },
    { uid: 'sk2', _labels: ['Skill'], name: 'React', category: 'Framework' },
  ],
  links: [
    { source: 'we1', target: 'sk1', type: 'REQUIRES_SKILL' },
    { source: 'we1', target: 'sk2', type: 'REQUIRES_SKILL' },
    { source: 'ed1', target: 'sk1', type: 'TEACHES' },
  ],
};

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

/**
 * Intercept all orb-related API routes to serve mock data.
 * Uses pathname predicates to avoid intercepting Vite source files
 * (e.g. /src/api/orbs.ts vs /api/orbs/me).
 */
export async function mockOrbRoutes(page: Page) {
  await page.route((url) => url.pathname === '/api/orbs/me', (route) =>
    route.fulfill(json(MOCK_ORB)),
  );
  await page.route((url) => url.pathname === '/api/orbs/has-content', (route) =>
    route.fulfill(json(true)),
  );
  await page.route((url) => url.pathname === '/api/cv/documents', (route) =>
    route.fulfill(json([])),
  );
  await page.route((url) => url.pathname === '/api/cv/processing-count', (route) =>
    route.fulfill(json(0)),
  );
  await page.route((url) => url.pathname === '/api/drafts', (route) =>
    route.fulfill(json([])),
  );
  await page.route((url) => url.pathname === '/api/orbs/me/share-tokens', (route) =>
    route.fulfill(json([])),
  );
  await page.route((url) => url.pathname === '/api/orbs/me/access-grants', (route) =>
    route.fulfill(json([])),
  );
  await page.route((url) => url.pathname === '/api/orbs/me/connection-requests', (route) =>
    route.fulfill(json([])),
  );
  await page.route((url) => url.pathname === '/api/orbs/me/public-filters', (route) =>
    route.fulfill(json({})),
  );
  await page.route((url) => url.pathname === '/api/orbs/me/visibility', (route) =>
    route.fulfill(json('restricted')),
  );
  // Shared orb view — any /api/orbs/:id not already handled
  await page.route(
    (url) => /^\/api\/orbs\/[^/]+$/.test(url.pathname) && url.pathname !== '/api/orbs/me' && url.pathname !== '/api/orbs/has-content',
    (route) => route.fulfill(json(MOCK_ORB)),
  );
}
