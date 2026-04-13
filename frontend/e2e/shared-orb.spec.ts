import { test, expect } from '@playwright/test';
import { mockOrbRoutes, MOCK_ORB } from './fixtures/mock-orb';

/** Set up unauthenticated page with orb mock */
async function setup(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.addEventListener('orbis:session-expired', (e) => { e.stopImmediatePropagation(); }, true);
  });
  await page.route((url) => url.pathname === '/api/auth/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Not authenticated"}' }),
  );
  await page.route((url) => url.pathname === '/api/auth/refresh', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"No refresh token"}' }),
  );
  await mockOrbRoutes(page);
}

test.describe('SharedOrbPage (/:orbId) — cross-browser', () => {
  test('renders the shared orb graph', async ({ page }) => {
    await setup(page);
    await page.goto('/test-orb-001');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeAttached({ timeout: 15_000 });
  });

  test('displays the person name', async ({ page }) => {
    await setup(page);
    await page.goto('/test-orb-001');

    await expect(page.getByText(MOCK_ORB.person.name)).toBeVisible({ timeout: 10_000 });
  });

  test('loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await setup(page);
    await page.goto('/test-orb-001');
    await page.waitForTimeout(3000);

    expect(errors).toHaveLength(0);
  });

  test('no horizontal overflow', async ({ page }) => {
    await setup(page);
    await page.goto('/test-orb-001');
    await page.waitForTimeout(2000);

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });

  test('WebGL canvas renders at mobile size', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setup(page);
    await page.goto('/test-orb-001');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeAttached({ timeout: 15_000 });
  });
});
