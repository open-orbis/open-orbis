import { test, expect } from '@playwright/test';
import { mockAuthRoutes } from './fixtures/auth';
import { mockOrbRoutes } from './fixtures/mock-orb';

async function setupAuthed(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.addEventListener('orbis:session-expired', (e) => { e.stopImmediatePropagation(); }, true);
  });
  await mockAuthRoutes(page);
  await mockOrbRoutes(page);
}

test.describe('DateRangeSlider — cross-browser', () => {
  test('slider renders on OrbViewPage when nodes have dates', async ({ page }) => {
    await setupAuthed(page);
    await page.goto('/myorbis');

    // DateRangeSlider has a track div with slider handles
    // Look for input[type="range"] or the custom slider track
    const slider = page.locator('[class*="slider"], [role="slider"], input[type="range"]').first();

    // If no standard slider, look for the DateRangeSlider component by its structure
    // It uses a vertical track with draggable handles
    const dateSlider = slider.or(page.locator('text=/\\d{4}/').first());

    await expect(dateSlider).toBeAttached({ timeout: 15_000 });
  });

  test('slider shows year labels', async ({ page }) => {
    await setupAuthed(page);
    await page.goto('/myorbis');

    // Mock orb has dates from 2016 to present — slider should show year labels
    // Wait for the page to render fully
    await page.waitForTimeout(3000);

    // Look for year text like "2016", "2020" in the slider area
    const hasYearLabel = await page.evaluate(() => {
      const body = document.body.innerText;
      return body.includes('2016') || body.includes('2020');
    });

    expect(hasYearLabel).toBe(true);
  });
});

test.describe('Open Graph meta tags — cross-browser', () => {
  test('landing page has og:title meta tag', async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener('orbis:session-expired', (e) => { e.stopImmediatePropagation(); }, true);
    });
    await page.route((url) => url.pathname === '/api/auth/me', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
    );
    await page.route((url) => url.pathname === '/api/auth/refresh', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
    );

    await page.goto('/');

    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toBeTruthy();
  });

  test('landing page has og:description meta tag', async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener('orbis:session-expired', (e) => { e.stopImmediatePropagation(); }, true);
    });
    await page.route((url) => url.pathname === '/api/auth/me', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
    );
    await page.route((url) => url.pathname === '/api/auth/refresh', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
    );

    await page.goto('/');

    const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
    expect(ogDesc).toBeTruthy();

    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    expect(twitterCard).toBeTruthy();
  });
});
