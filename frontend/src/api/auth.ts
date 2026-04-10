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

export async function googleLogin(
  code: string,
): Promise<{ access_token: string; user: UserInfo }> {
  const { data } = await client.post('/auth/google', { code });
  return data;
}

export async function linkedinLogin(
  code: string,
): Promise<{ access_token: string; user: UserInfo }> {
  const { data } = await client.post('/auth/linkedin', { code });
  return data;
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
