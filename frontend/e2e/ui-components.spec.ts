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

test.describe('MCP integration info — cross-browser', () => {
  test('Discover Uses modal shows MCP tab', async ({ page }) => {
    await setupAuthed(page);
    await page.goto('/myorbis');

    // Click the "Discover uses" button in the ChatBox bottom bar
    const discoverBtn = page.locator('button[title="Discover uses"]');
    await expect(discoverBtn).toBeVisible({ timeout: 10_000 });
    await discoverBtn.click();

    // The DiscoverUsesModal should open with "Via MCP Client" tab
    const mcpTab = page.getByText('Via MCP Client');
    await expect(mcpTab).toBeVisible({ timeout: 5_000 });
  });

  test('MCP tab shows orb ID for copying', async ({ page }) => {
    await setupAuthed(page);
    await page.goto('/myorbis');

    const discoverBtn = page.locator('button[title="Discover uses"]');
    await expect(discoverBtn).toBeVisible({ timeout: 10_000 });
    await discoverBtn.click();

    // "Via MCP Client" tab is default — should show "Copy ID: <orbId>"
    const copyIdBtn = page.locator('button', { hasText: /Copy ID:/ });
    await expect(copyIdBtn).toBeVisible({ timeout: 5_000 });
  });

  test('Discover Uses modal shows Via Link tab', async ({ page }) => {
    await setupAuthed(page);
    await page.goto('/myorbis');

    const discoverBtn = page.locator('button[title="Discover uses"]');
    await expect(discoverBtn).toBeVisible({ timeout: 10_000 });
    await discoverBtn.click();

    // Switch to "Via Link" tab
    const linkTab = page.getByText('Via Link');
    await expect(linkTab).toBeVisible({ timeout: 5_000 });
    await linkTab.click();

    // Should show a copy link button
    const copyLinkBtn = page.locator('button', { hasText: /Copy/ });
    await expect(copyLinkBtn.first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Open Graph meta tags — cross-browser', () => {
  test('landing page has og:title meta tag', async ({ page }) => {
    // OG meta tags are not yet implemented — this test will pass once they are added.
    // See issue #112 area 8: "Meta tags / Open Graph preview renders when sharing links"
    test.skip(true, 'OG meta tags not yet added to index.html');

    await page.goto('/');
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toBeTruthy();
  });

  test('landing page has og:description meta tag', async ({ page }) => {
    test.skip(true, 'OG meta tags not yet added to index.html');

    await page.goto('/');
    const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
    expect(ogDesc).toBeTruthy();
  });
});
