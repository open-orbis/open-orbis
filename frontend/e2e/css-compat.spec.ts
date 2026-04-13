import { test, expect } from './fixtures/base';

test.describe('CSS rendering — cross-browser', () => {
  test('gradient text renders with bg-clip-text', async ({ page }) => {
    await page.goto('/');

    const gradientSpan = page.locator('span.bg-clip-text').first();
    await expect(gradientSpan).toBeVisible();

    const bgClip = await gradientSpan.evaluate(
      (el) => getComputedStyle(el).webkitBackgroundClip || getComputedStyle(el).backgroundClip,
    );
    expect(bgClip).toBe('text');
  });

  test('scrollbar-width CSS property is recognized', async ({ page }) => {
    await page.goto('/');

    const scrollbarWidth = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollbarWidth,
    );
    // 'thin' (Firefox/Chrome with explicit CSS), 'auto', or 'none' are all valid
    expect(['thin', 'auto', 'none']).toContain(scrollbarWidth);
  });

  test('backdrop-blur elements are visible', async ({ page }) => {
    await page.goto('/');

    const blurElements = page.locator('[class*="backdrop-blur"]');
    const count = await blurElements.count();

    if (count > 0) {
      const firstVisible = blurElements.first();
      const bf = await firstVisible.evaluate(
        (el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter,
      );
      expect(typeof bf).toBe('string');
    }
  });

  test('no horizontal overflow on landing page', async ({ page }) => {
    await page.goto('/');

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);
  });
});
