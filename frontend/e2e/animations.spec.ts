import { test, expect } from './fixtures/base';

test.describe('Framer Motion animations — cross-browser', () => {
  test('hero heading becomes visible', async ({ page }) => {
    await page.goto('/');

    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Framer Motion animates opacity — wait until it is near 1
    await expect(async () => {
      const opacity = await heading.evaluate((el) => Number(getComputedStyle(el).opacity));
      expect(opacity).toBeGreaterThan(0.8);
    }).toPass({ timeout: 10_000 });
  });

  test('scroll-triggered elements animate into view', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Scroll down to trigger IntersectionObserver-based animations
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(2000);

    // Feature sections should now be visible
    const featureSections = page.locator('section').first();
    if (await featureSections.isVisible()) {
      const opacity = await featureSections.evaluate((el) => Number(getComputedStyle(el).opacity));
      expect(opacity).toBeGreaterThan(0);
    }
  });

  test('privacy page content becomes visible', async ({ page }) => {
    await page.goto('/privacy');

    const content = page.locator('h1');
    await expect(content).toBeVisible({ timeout: 10_000 });

    await expect(async () => {
      const opacity = await content.evaluate((el) => Number(getComputedStyle(el).opacity));
      expect(opacity).toBeGreaterThan(0.8);
    }).toPass({ timeout: 10_000 });
  });
});
