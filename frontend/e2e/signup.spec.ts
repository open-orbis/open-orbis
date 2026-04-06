import { test, expect } from '@playwright/test';

test('Signup and Build from scratch onboarding', async ({ page }) => {
  // Start at /create (auth setup already handles getting here)
  await page.goto('/create');

  // We should be at "How do you want to build your orbis?"
  await expect(page.getByText(/How do you want to build your orbis/i)).toBeVisible();

  // Click "Build from scratch"
  await page.getByRole('button', { name: /Build from scratch/i }).click();

  // Redirected to /myorbis (based on CreateOrbPage manual path onClick={() => navigate('/myorbis')})
  await expect(page).toHaveURL(/\/myorbis/);
  
  // Verify we are on the Orb View page
  // The header should have the user name (at least "My Orbis" or something)
  await expect(page.locator('canvas')).toBeVisible(); // 3D Graph should be there
});
