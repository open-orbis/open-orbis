import { test, expect } from '@playwright/test';

test('Generate share link and view public orb', async ({ page, context, baseURL }) => {
  // 1. Logged in user goes to their orbis
  await page.goto('/myorbis');
  await expect(page.locator('canvas')).toBeVisible();

  // 2. Open Share Panel
  const shareButton = page.getByRole('button', { name: /Share/i });
  await shareButton.click();

  // 3. Verify Share Panel is visible and has the link
  // Use getByRole to avoid strict mode violation (multiple matches for text)
  await expect(page.getByRole('heading', { name: /Share Your Orbis/i })).toBeVisible();
  const shareLinkInput = page.locator('input[readOnly]').first();
  const shareUrl = await shareLinkInput.inputValue();
  
  // Use baseURL instead of window.location (not available in Node context)
  expect(shareUrl).toContain(baseURL || 'localhost');

  // 4. Open the share link in a NEW UNAUTHENTICATED context
  const newPage = await context.browser().newPage({ storageState: { cookies: [], origins: [] } });
  await newPage.goto(shareUrl);

  // 5. Verify public view
  await expect(newPage.locator('canvas')).toBeVisible();
  // Check if "Create your own Orbis" link is present (only in SharedOrbPage)
  await expect(newPage.getByText(/Create your own Orbis/i)).toBeVisible();
  
  await newPage.close();
});
