import { test, expect } from '@playwright/test';
import { mockAuthRoutes } from './fixtures/auth';
import { mockOrbRoutes, MOCK_ORB } from './fixtures/mock-orb';

async function setupAuthed(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.addEventListener('orbis:session-expired', (e) => { e.stopImmediatePropagation(); }, true);
  });
  await mockAuthRoutes(page);
  await mockOrbRoutes(page);
}

test.describe('OrbViewPage (/myorbis) — cross-browser', () => {
  test('renders the 3D graph with nodes', async ({ page }) => {
    await setupAuthed(page);
    await page.goto('/myorbis');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeAttached({ timeout: 15_000 });
  });

  test('loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await setupAuthed(page);
    await page.goto('/myorbis');
    await page.waitForTimeout(3000);

    expect(errors).toHaveLength(0);
  });

  test('displays the person name', async ({ page }) => {
    await setupAuthed(page);
    await page.goto('/myorbis');

    await expect(page.getByText(MOCK_ORB.person.name)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('CreateOrbPage (/create) — cross-browser', () => {
  test('renders without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await setupAuthed(page);
    await page.goto('/create');
    await page.waitForTimeout(3000);

    expect(errors).toHaveLength(0);
  });

  test('page is interactive', async ({ page }) => {
    await setupAuthed(page);
    await page.goto('/create');

    const interactive = page.locator('input, textarea, button, canvas').first();
    await expect(interactive).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('CvExportPage (/cv-export) — cross-browser', () => {
  test('renders the CV view', async ({ page }) => {
    await setupAuthed(page);
    await page.goto('/cv-export');

    await expect(page.getByText(MOCK_ORB.person.name)).toBeVisible({ timeout: 10_000 });
  });

  test('loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await setupAuthed(page);
    await page.goto('/cv-export');
    await page.waitForTimeout(3000);

    expect(errors).toHaveLength(0);
  });
});
