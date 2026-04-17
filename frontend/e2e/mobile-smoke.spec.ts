import { test, expect } from '@playwright/test';

// Emulate only viewport + touch — keep defaultBrowserType from the project so
// this spec can run on every browser (chromium/firefox/webkit) without forcing
// a new worker per device via `test.use({ ...devices[...] })`.
const MOBILE_VIEWPORTS = [
  { name: 'iPhone SE',  width: 375, height: 667 },
  { name: 'Pixel 5',    width: 393, height: 851 },
  { name: 'Galaxy S8+', width: 360, height: 740 },
];

for (const vp of MOBILE_VIEWPORTS) {
  test.describe(`Mobile smoke — ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true });

    test('landing has no horizontal scroll', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const { clientWidth, scrollWidth } = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(scrollWidth, 'document.scrollWidth > clientWidth means horizontal scroll')
        .toBeLessThanOrEqual(clientWidth + 1);
    });

    test('landing primary sign-in buttons are at least 44x44', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const google = page.getByRole('button', { name: /google/i }).first();
      await expect(google).toBeVisible();
      const box = await google.boundingBox();
      expect(box, 'google button has a bounding box').not.toBeNull();
      expect(box!.width,  `width >= 44 on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `height >= 44 on ${vp.name}`).toBeGreaterThanOrEqual(44);
    });
  });
}
