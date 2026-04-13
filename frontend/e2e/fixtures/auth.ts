import { test as base } from './base';
import type { Page } from '@playwright/test';

/** Mock user matching the UserInfo interface from src/api/auth.ts */
export const MOCK_USER = {
  user_id: 'test-user-001',
  email: 'test@openorbis.com',
  name: 'Test User',
  picture: null,
  profile_image: null,
  gdpr_consent: true,
  is_admin: false,
  activated: true,
  waitlist_joined: false,
  waitlist_joined_at: null,
  deletion_requested_at: null,
  deletion_days_remaining: null,
};

/** Intercept auth API routes so tests run without a real backend session. */
export async function mockAuthRoutes(page: Page) {
  await page.route((url) => url.pathname === '/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) }),
  );
  await page.route((url) => url.pathname === '/api/auth/refresh', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) }),
  );
  await page.route((url) => url.pathname === '/api/auth/logout', (route) =>
    route.fulfill({ status: 204 }),
  );
}

export const test = base;
export { expect } from './base';
