import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Upload CV and verify extracted nodes', async ({ page }) => {
  // Mock the upload API to avoid real LLM calls and PDF parsing issues
  await page.route('**/cv/upload', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        nodes: [
          {
            node_type: 'work_experience',
            properties: {
              company: 'Test Corp',
              title: 'Senior Developer',
              start_date: '2020-01-01',
              description: 'Building amazing things'
            }
          },
          {
            node_type: 'skill',
            properties: {
              name: 'Playwright',
              category: 'Tool'
            }
          }
        ],
        relationships: [
          { from_index: 0, to_index: 1, type: 'USED_SKILL' }
        ],
        unmatched: [],
        skipped_nodes: [],
        truncated: false,
        cv_owner_name: 'Test User'
      })
    });
  });

  // Mock the confirm API
  await page.route('**/cv/confirm', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ created: 2, node_ids: ['uuid1', 'uuid2'] })
    });
  });

  await page.goto('/create');

  // Click "Import from your CV"
  await page.getByRole('button', { name: /Import from your CV/i }).click();

  // Upload the dummy PDF
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText(/Click to browse/i).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(path.resolve(__dirname, 'fixtures/dummy.pdf'));

  // Wait for "Found 2 entries"
  await expect(page.getByText(/Found 2 entries/i)).toBeVisible();

  // Verify the extracted data is displayed
  await expect(page.getByText(/Test Corp/i)).toBeVisible();
  await expect(page.getByText(/Senior Developer/i)).toBeVisible();
  await expect(page.getByText(/Playwright/i)).toBeVisible();

  // Click "Add 2 entries to graph"
  await page.getByRole('button', { name: /Add 2 entries to graph/i }).click();

  // Should redirect to /myorbis
  await expect(page).toHaveURL(/\/myorbis/);
});
