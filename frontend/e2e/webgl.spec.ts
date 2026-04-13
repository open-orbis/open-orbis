import { test, expect } from './fixtures/base';

test.describe('WebGL / 3D rendering — cross-browser', () => {
  test('WebGL context is obtainable', async ({ page }) => {
    await page.goto('/');

    const hasWebGL = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return !!gl;
    });

    expect(hasWebGL).toBe(true);
  });

  test('landing page renders at least one canvas', async ({ page }) => {
    await page.goto('/');

    // Three.js / react-force-graph-3d render into <canvas> elements.
    // Wait generously for WebGL initialization in headless mode.
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeAttached({ timeout: 15_000 });
  });

  test('canvas elements appear after scrolling', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Scroll to the demo orb section (below the fold)
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3));
    await page.waitForTimeout(3000);

    const canvases = page.locator('canvas');
    const count = await canvases.count();
    // At least 1 canvas should exist on the landing page
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
