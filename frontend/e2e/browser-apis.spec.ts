import { test, expect } from './fixtures/base';

test.describe('Browser APIs — cross-browser', () => {
  test('localStorage read/write works', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      try {
        localStorage.setItem('e2e_test_key', 'e2e_test_value');
        const val = localStorage.getItem('e2e_test_key');
        localStorage.removeItem('e2e_test_key');
        return val;
      } catch {
        return 'ERROR';
      }
    });

    expect(result).toBe('e2e_test_value');
  });

  test('sessionStorage read/write works', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      try {
        sessionStorage.setItem('e2e_test_key', 'e2e_test_value');
        const val = sessionStorage.getItem('e2e_test_key');
        sessionStorage.removeItem('e2e_test_key');
        return val;
      } catch {
        return 'ERROR';
      }
    });

    expect(result).toBe('e2e_test_value');
  });

  test('Clipboard API is available', async ({ page }) => {
    await page.goto('/');

    const clipboardAvailable = await page.evaluate(() => {
      return typeof navigator.clipboard?.writeText === 'function';
    });

    expect(clipboardAvailable).toBe(true);
  });

  test('clipboard write and read roundtrip', async ({ context, page, browserName }) => {
    // Only Chromium supports grantPermissions for clipboard in Playwright
    test.skip(browserName !== 'chromium', 'Clipboard permissions only supported in Chromium via Playwright');

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');

    const testText = 'orbis-e2e-clipboard-test';
    const readBack = await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
      return navigator.clipboard.readText();
    }, testText);

    expect(readBack).toBe(testText);
  });

  test('Blob and URL.createObjectURL work', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      try {
        const blob = new Blob(['test content'], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const valid = url.startsWith('blob:');
        URL.revokeObjectURL(url);
        return valid;
      } catch {
        return false;
      }
    });

    expect(result).toBe(true);
  });
});
