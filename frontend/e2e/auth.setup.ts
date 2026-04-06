import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.resolve(__dirname, './.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Go to landing page
  await page.goto('/');
  
  // Click "Create Your Orbis" which triggers devLogin
  const getStartedButton = page.getByRole('button', { name: /Create Your Orbis/i });
  await getStartedButton.click();

  // Wait for navigation to /create (which happens after devLogin)
  await expect(page).toHaveURL(/\/create/);
  
  // Wait for either the consent gate or the main content
  const consentCheckbox = page.locator('input[type="checkbox"]');
  const mainContent = page.getByText(/How do you want to build your orbis/i);

  // We wait for either of them to appear
  await Promise.race([
    consentCheckbox.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
    mainContent.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ]);

  // Handle ConsentGate if it is visible
  if (await consentCheckbox.isVisible()) {
    await consentCheckbox.check();
    await page.getByRole('button', { name: /Continue/i }).click();
  }

  // Now the main content MUST be visible
  await expect(mainContent).toBeVisible({ timeout: 10000 });

  // End of authentication steps.
  await page.context().storageState({ path: authFile });
});
