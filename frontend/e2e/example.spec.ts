import { test, expect } from '@playwright/test';

test('is already authenticated', async ({ page }) => {
  await page.goto('/');
  // After setup, we should see "Welcome back" or "View My Orbis"
  await expect(page.getByText(/Welcome back/i)).toBeVisible();
});
