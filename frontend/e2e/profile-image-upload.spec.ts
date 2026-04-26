import { test, expect } from '@playwright/test';
import { mockAuthRoutes } from './fixtures/auth';
import { MOCK_ORB } from './fixtures/mock-orb';
import type { Page, Route } from '@playwright/test';

const TINY_PNG_DATA_URI =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgB//Z';

const PRE_EXISTING_DATA_URI =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABwSFBcUEhwXFhcfHRwhKEMrKCQkKFE6PTBDYFVlZF9VXVtqeJmDanGQc1tdhrWHkJ6jq62rZ4G8ybmnx5moq6X/2wBDAR0fHygjKE4rK06lbl1upaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaX/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AH4z/9k=';

async function setupAuthed(page: Page) {
  await page.addInitScript(() => {
    window.addEventListener(
      'orbis:session-expired',
      (e) => { e.stopImmediatePropagation(); },
      true,
    );
  });
  await mockAuthRoutes(page);
}

test.describe('Profile image upload (#432)', () => {
  test('after upload, modal stays open AND trigger avatar shows new image', async ({ page }) => {
    await setupAuthed(page);

    // /api/orbs/me — return PRE_EXISTING until the test flips a flag (the
    // moment of upload), then return TINY_PNG with a 600ms delay so the
    // optimistic-preview path is observable.
    let uploadFired = false;
    let orbCallsAfterUpload = 0;
    await page.route((url) => url.pathname === '/api/orbs/me' && url.search === '', async (route: Route) => {
      if (!uploadFired) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...MOCK_ORB,
            person: { ...MOCK_ORB.person, profile_image: PRE_EXISTING_DATA_URI },
          }),
        });
      }
      orbCallsAfterUpload += 1;
      await new Promise((r) => setTimeout(r, 600));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_ORB,
          person: { ...MOCK_ORB.person, profile_image: TINY_PNG_DATA_URI },
        }),
      });
    });

    const json = (body: string) => ({ status: 200, contentType: 'application/json', body });
    await page.route((u) => u.pathname === '/api/orbs/has-content', (r) => r.fulfill(json('true')));
    await page.route((u) => u.pathname === '/api/cv/documents', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/cv/processing-count', (r) => r.fulfill(json('0')));
    await page.route((u) => u.pathname === '/api/drafts', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/orbs/me/share-tokens', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/orbs/me/access-grants', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/orbs/me/connection-requests', (r) => r.fulfill(json('{"requests":[]}')));
    await page.route((u) => u.pathname === '/api/orbs/me/public-filters', (r) => r.fulfill(json('{}')));
    await page.route((u) => u.pathname === '/api/orbs/me/visibility', (r) => r.fulfill(json('"restricted"')));

    await page.route((u) => u.pathname === '/api/orbs/me/profile-image', (route) => {
      uploadFired = true;
      return route.fulfill(json('{"status":"uploaded"}'));
    });

    await page.goto('/myorbis');

    await expect(page.getByText(MOCK_ORB.person.name)).toBeVisible({ timeout: 15_000 });

    // Open user menu → click "Edit Profile" to open the modal.
    await page.getByTitle('Account menu').click();
    await page.getByText('Edit Profile').click();

    // Modal is open (confirmed by its headline copy).
    await expect(page.getByText('Update your public identity, links, and profile image.')).toBeVisible();

    // Capture the modal preview's src BEFORE upload to verify it switches.
    const modalAvatar = page.getByTitle('Upload profile picture').locator('img');
    await expect(modalAvatar).toHaveAttribute('src', PRE_EXISTING_DATA_URI);

    // Upload via the hidden file input inside the modal.
    const fileInput = page.locator('input[type="file"][accept*="image"]');
    await fileInput.setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63F8CFC0F01F00050001FFA1FE9C720000000049454E44AE426082',
        'hex',
      ),
    });

    // Optimistic-preview check: WITHIN ~300ms of file pick (well before the
    // 600ms-delayed fetchOrb resolves), the modal preview must already show
    // a NEW src — either the blob URL or the persistent data URI. The point
    // is "not the pre-existing one" — the user's perceived "immediately".
    await expect.poll(
      async () => modalAvatar.getAttribute('src'),
      { timeout: 300, intervals: [50] },
    ).not.toBe(PRE_EXISTING_DATA_URI);

    // Wait until fetchOrb's post-upload refresh has resolved.
    await expect.poll(() => orbCallsAfterUpload, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);

    // Bug B regression: the modal MUST stay open after fetchOrb refreshes.
    // The OrbViewPage spinner gate (`if (loading || !data)`) used to unmount
    // the entire subtree on every refresh, killing modals mid-flow.
    await expect(page.getByText('Update your public identity, links, and profile image.')).toBeVisible();

    // Bug A regression: the trigger avatar in UserMenu must reflect the new
    // image. UserMenu used to read only from authStore.user.profile_image,
    // which fetchOrb does not refresh — so the trigger stayed empty.
    const triggerImg = page.getByTitle('Account menu').locator('img').first();
    await expect(triggerImg).toHaveAttribute('src', TINY_PNG_DATA_URI, { timeout: 5_000 });

    // Final state: once fetchOrb has refreshed, the persistent data URI takes
    // over from the optimistic blob URL.
    await expect(modalAvatar).toHaveAttribute('src', TINY_PNG_DATA_URI, { timeout: 5_000 });
  });

  test('clicking "Save profile" closes the modal after the PUT succeeds', async ({ page }) => {
    await setupAuthed(page);

    let putFired = false;
    await page.route((url) => url.pathname === '/api/orbs/me' && url.search === '', async (route: Route) => {
      if (route.request().method() === 'PUT') {
        putFired = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"updated"}' });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_ORB,
          person: { ...MOCK_ORB.person, headline: putFired ? 'Updated headline' : 'Software Engineer' },
        }),
      });
    });

    const json = (body: string) => ({ status: 200, contentType: 'application/json', body });
    await page.route((u) => u.pathname === '/api/orbs/has-content', (r) => r.fulfill(json('true')));
    await page.route((u) => u.pathname === '/api/cv/documents', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/cv/processing-count', (r) => r.fulfill(json('0')));
    await page.route((u) => u.pathname === '/api/drafts', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/orbs/me/share-tokens', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/orbs/me/access-grants', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/orbs/me/connection-requests', (r) => r.fulfill(json('{"requests":[]}')));
    await page.route((u) => u.pathname === '/api/orbs/me/public-filters', (r) => r.fulfill(json('{}')));
    await page.route((u) => u.pathname === '/api/orbs/me/visibility', (r) => r.fulfill(json('"restricted"')));

    await page.goto('/myorbis');
    await expect(page.getByText(MOCK_ORB.person.name)).toBeVisible({ timeout: 15_000 });

    await page.getByTitle('Account menu').click();
    await page.getByText('Edit Profile').click();
    await expect(page.getByText('Update your public identity, links, and profile image.')).toBeVisible();

    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect.poll(() => putFired, { timeout: 5_000 }).toBe(true);

    // Save profile must auto-close the modal once the PUT succeeds.
    await expect(page.getByText('Update your public identity, links, and profile image.')).toBeHidden({ timeout: 3_000 });
  });

  test('rejects image larger than 1000×1000 px before uploading', async ({ page }) => {
    await setupAuthed(page);

    let uploadAttempted = false;
    await page.route((url) => url.pathname === '/api/orbs/me/profile-image', (route) => {
      uploadAttempted = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"uploaded"}' });
    });

    const json = (body: string) => ({ status: 200, contentType: 'application/json', body });
    await page.route((u) => u.pathname === '/api/orbs/me' && u.search === '', (r) => r.fulfill(json(JSON.stringify({
      ...MOCK_ORB,
      person: { ...MOCK_ORB.person, profile_image: '' },
    }))));
    await page.route((u) => u.pathname === '/api/orbs/has-content', (r) => r.fulfill(json('true')));
    await page.route((u) => u.pathname === '/api/cv/documents', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/cv/processing-count', (r) => r.fulfill(json('0')));
    await page.route((u) => u.pathname === '/api/drafts', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/orbs/me/share-tokens', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/orbs/me/access-grants', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/orbs/me/connection-requests', (r) => r.fulfill(json('{"requests":[]}')));
    await page.route((u) => u.pathname === '/api/orbs/me/public-filters', (r) => r.fulfill(json('{}')));
    await page.route((u) => u.pathname === '/api/orbs/me/visibility', (r) => r.fulfill(json('"restricted"')));

    await page.goto('/myorbis');
    await expect(page.getByText(MOCK_ORB.person.name)).toBeVisible({ timeout: 15_000 });

    await page.getByTitle('Account menu').click();
    await page.getByText('Edit Profile').click();
    await expect(page.getByText('Update your public identity, links, and profile image.')).toBeVisible();

    // Generate a 1200×800 PNG inside the browser and attach it to the file
    // input — bigger than the 1000-px ceiling on the wider edge.
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 800;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#3366cc';
      ctx.fillRect(0, 0, 1200, 800);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
      const file = new File([blob], 'oversize.png', { type: 'image/png' });
      const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Inline error (NOT a toast) cites the actual dimensions and the limit.
    await expect(page.getByRole('alert')).toContainText(/Image is 1200.800 px.+maximum is 1000.1000/);

    // Upload endpoint must NOT have been called.
    await page.waitForTimeout(300);
    expect(uploadAttempted).toBe(false);
  });

  test('Remove photo clears the image and falls back to the name initial', async ({ page }) => {
    await setupAuthed(page);

    let deleteFired = false;
    await page.route((u) => u.pathname === '/api/orbs/me/profile-image', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteFired = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"deleted"}' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"uploaded"}' });
    });

    // First fetchOrb returns a person WITH a profile_image; once delete fires
    // the backend would clear both profile_image and picture, so the next
    // fetchOrb returns both empty.
    await page.route((url) => url.pathname === '/api/orbs/me' && url.search === '', (route: Route) => {
      const person = deleteFired
        ? { ...MOCK_ORB.person, profile_image: '', picture: '' }
        : { ...MOCK_ORB.person, profile_image: PRE_EXISTING_DATA_URI, picture: '' };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_ORB, person }),
      });
    });

    const json = (body: string) => ({ status: 200, contentType: 'application/json', body });
    await page.route((u) => u.pathname === '/api/orbs/has-content', (r) => r.fulfill(json('true')));
    await page.route((u) => u.pathname === '/api/cv/documents', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/cv/processing-count', (r) => r.fulfill(json('0')));
    await page.route((u) => u.pathname === '/api/drafts', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/orbs/me/share-tokens', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/orbs/me/access-grants', (r) => r.fulfill(json('[]')));
    await page.route((u) => u.pathname === '/api/orbs/me/connection-requests', (r) => r.fulfill(json('{"requests":[]}')));
    await page.route((u) => u.pathname === '/api/orbs/me/public-filters', (r) => r.fulfill(json('{}')));
    await page.route((u) => u.pathname === '/api/orbs/me/visibility', (r) => r.fulfill(json('"restricted"')));

    await page.goto('/myorbis');
    await expect(page.getByText(MOCK_ORB.person.name)).toBeVisible({ timeout: 15_000 });

    await page.getByTitle('Account menu').click();
    await page.getByText('Edit Profile').click();
    await expect(page.getByText('Update your public identity, links, and profile image.')).toBeVisible();

    // Confirm the modal starts with the existing photo.
    const modalAvatar = page.getByTitle('Upload profile picture').locator('img');
    await expect(modalAvatar).toHaveAttribute('src', PRE_EXISTING_DATA_URI);

    // Two-step destructive confirm: Remove → Confirm remove.
    await page.getByRole('button', { name: 'Remove photo' }).click();
    await page.getByRole('button', { name: /Confirm remove/ }).click();
    await expect.poll(() => deleteFired, { timeout: 5_000 }).toBe(true);

    // Modal preview now shows the initial (no <img> in the upload tile).
    await expect(page.getByTitle('Upload profile picture').locator('img')).toHaveCount(0);
    await expect(page.getByTitle('Upload profile picture').locator('span')).toContainText('T'); // 'Test User'
  });
});
