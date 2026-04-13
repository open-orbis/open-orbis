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

test.describe('CV Upload — cross-browser', () => {
  test('file input accepts PDF files', async ({ page }) => {
    await setupAuthed(page);
    await page.goto('/myorbis');

    // The page has a hidden file input for document import
    const fileInput = page.locator('input[type="file"][accept*=".pdf"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10_000 });

    // Verify the accept attribute includes PDF
    const accept = await fileInput.getAttribute('accept');
    expect(accept).toContain('.pdf');
  });

  test('file input is functional (can set files)', async ({ page }) => {
    await setupAuthed(page);
    await page.goto('/myorbis');

    const fileInput = page.locator('input[type="file"][accept*=".pdf"]').first();
    await expect(fileInput).toBeAttached({ timeout: 10_000 });

    // Playwright can set files on a file input — verify it doesn't throw
    // This creates a minimal PDF-like buffer (just to test the input, not real parsing)
    await fileInput.setInputFiles({
      name: 'test-cv.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test'),
    });

    // The input should now have the file
    const files = await fileInput.evaluate((el: HTMLInputElement) => el.files?.length ?? 0);
    expect(files).toBe(1);
  });
});

test.describe('CV Download — cross-browser', () => {
  test('PDF download triggers with correct filename', async ({ page }) => {
    await setupAuthed(page);

    // Mock the CV download endpoint
    await page.route((url) => url.pathname === '/api/cv/download', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: {
          'content-disposition': 'attachment; filename="Test_User_CV.pdf"',
        },
        body: Buffer.from('%PDF-1.4 fake content'),
      }),
    );

    await page.goto('/myorbis');
    await page.waitForTimeout(2000);

    // Find and click the CV download button
    const downloadButton = page.getByRole('button', { name: /download/i }).or(
      page.locator('button:has-text("CV")').first()
    );

    if (await downloadButton.isVisible()) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }),
        downloadButton.click(),
      ]);

      expect(download.suggestedFilename()).toBe('Test_User_CV.pdf');
    }
  });

  test('Blob and createObjectURL work for downloads', async ({ page }) => {
    await setupAuthed(page);
    await page.goto('/myorbis');

    // Verify the download mechanism works at the API level
    const result = await page.evaluate(() => {
      const blob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const valid = url.startsWith('blob:');
      URL.revokeObjectURL(url);
      return { valid, size: blob.size };
    });

    expect(result.valid).toBe(true);
    expect(result.size).toBeGreaterThan(0);
  });
});
