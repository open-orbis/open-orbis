import { test, expect } from '@playwright/test';

test('Export orbis in different formats', async ({ page, context }) => {
  // 1. Navigate from dashboard
  await page.goto('/myorbis');
  
  // 2. Click the Export button and expect a new tab to open
  const [exportPage] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: /Export CV/i }).click(),
  ]);

  // 3. Verify the new tab's URL and content
  await expect(exportPage).toHaveURL(/\/cv-export/);
  await expect(exportPage.getByRole('button', { name: /Download PDF/i })).toBeVisible();

  // PDF Export triggers print dialog, we just verify it's clickable
  await exportPage.getByRole('button', { name: /Download PDF/i }).click();

  // 4. Test the backend export endpoints directly
  const orbId = 'alessandro'; 

  // JSON Export
  const jsonResponse = await page.request.get(`/api/export/${orbId}?format=json`);
  expect(jsonResponse.ok()).toBeTruthy();
  const jsonData = await jsonResponse.json();
  expect(jsonData).toHaveProperty('person');
  expect(jsonData).toHaveProperty('nodes');

  // JSON-LD Export
  const jsonldResponse = await page.request.get(`/api/export/${orbId}?format=jsonld`);
  expect(jsonldResponse.ok()).toBeTruthy();
  expect(jsonldResponse.headers()['content-type']).toContain('application/ld+json');

  // PDF Export (Backend)
  const pdfResponse = await page.request.get(`/api/export/${orbId}?format=pdf`);
  expect(pdfResponse.ok()).toBeTruthy();
  expect(pdfResponse.headers()['content-type']).toBe('application/pdf');
});
