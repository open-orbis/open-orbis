import { test, expect } from './fixtures/base';

test.describe('Page load — cross-browser', () => {
  test('landing page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page).toHaveTitle(/OpenOrbis/);
    await expect(page.locator('h1')).toContainText('Beyond the');

    expect(errors).toHaveLength(0);
  });

  test('privacy page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/privacy');
    await expect(page.locator('h1')).toContainText('Privacy Policy', { timeout: 10_000 });

    expect(errors).toHaveLength(0);
  });

  test('unknown orb route does not crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.route('**/api/orbs/*', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) }),
    );

    await page.goto('/nonexistent-orb-id');
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });
});
