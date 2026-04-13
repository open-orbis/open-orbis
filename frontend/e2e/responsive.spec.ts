import { test, expect } from './fixtures/base';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
} as const;

test.describe('Responsive layout — cross-browser', () => {
  test('desktop: landing page has large heading', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/');

    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();

    const fontSize = await heading.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    // sm:text-7xl = 4.5rem = 72px at default font size
    expect(fontSize).toBeGreaterThanOrEqual(48);
  });

  test('mobile: landing page heading is smaller', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');

    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();

    const fontSize = await heading.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    // text-5xl = 3rem = 48px — should be smaller than desktop 72px
    expect(fontSize).toBeLessThanOrEqual(72);
    expect(fontSize).toBeGreaterThanOrEqual(24);
  });

  test('mobile: no horizontal overflow', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });

  test('tablet: page renders without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize(VIEWPORTS.tablet);
    await page.goto('/');

    await expect(page.locator('h1')).toContainText('Beyond the');
    expect(errors).toHaveLength(0);
  });

  test('privacy page is readable at desktop size', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/privacy');
    await expect(page.locator('h1')).toContainText('Privacy Policy', { timeout: 10_000 });

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });

  test('privacy page is readable at mobile size', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/privacy');
    await expect(page.locator('h1')).toContainText('Privacy Policy', { timeout: 10_000 });

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });
});
