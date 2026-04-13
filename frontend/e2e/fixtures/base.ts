import { test as base } from '@playwright/test';

/**
 * Base test fixture for ALL E2E specs.
 *
 * The app calls fetchUser() on every mount → GET /api/auth/me.
 * Without a real backend this triggers 401 → refresh → 401 →
 * orbis:session-expired → redirect to / + toast.
 *
 * This fixture suppresses that event and mocks auth endpoints
 * so every test starts with a clean, predictable unauthenticated state.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Suppress session-expired redirect before the app mounts
    await page.addInitScript(() => {
      window.addEventListener(
        'orbis:session-expired',
        (e) => { e.stopImmediatePropagation(); },
        true,
      );
    });

    // Return 401 for auth (unauthenticated) without triggering the redirect
    await page.route((url) => url.pathname === '/api/auth/me', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Not authenticated"}' }),
    );
    await page.route((url) => url.pathname === '/api/auth/refresh', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"No refresh token"}' }),
    );

    await use(page);
  },
});

export { expect } from '@playwright/test';
