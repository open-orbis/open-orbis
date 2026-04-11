import client from './client';

export interface UserInfo {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  profile_image?: string;
  gdpr_consent: boolean;
  is_admin: boolean;
  activated: boolean;
  deletion_requested_at?: string | null;
  deletion_days_remaining?: number | null;
}

export async function getMe(): Promise<UserInfo> {
  const { data } = await client.get('/auth/me');
  return data;
}

export async function deleteAccount(): Promise<void> {
  await client.delete('/auth/me');
}

// The backend still returns `access_token` in the body for now, but the
// frontend reads it from the httpOnly cookie and ignores the field —
// Stage 5 will drop it from the response entirely.
export async function googleLogin(
  code: string,
): Promise<{ user: UserInfo }> {
  const { data } = await client.post('/auth/google', { code });
  return data;
}

export async function linkedinLogin(
  code: string,
): Promise<{ user: UserInfo }> {
  const { data } = await client.post('/auth/linkedin', { code });
  return data;
}

export async function logoutBackend(): Promise<void> {
  await client.post('/auth/logout');
}

export async function activateAccount(
  code: string,
): Promise<{ status: string }> {
  const { data } = await client.post('/auth/activate', { code });
  return data;
}

export async function grantGdprConsent(): Promise<void> {
  await client.post('/auth/gdpr-consent');
}

export async function recoverAccount(): Promise<void> {
  await client.post('/auth/me/recover');
}
