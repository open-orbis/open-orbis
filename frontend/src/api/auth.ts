import client from './client';

export interface UserInfo {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  gdpr_consent: boolean;
}

export async function getMe(): Promise<UserInfo> {
  const { data } = await client.get('/auth/me');
  return data;
}

export async function devLogin(): Promise<{ access_token: string; user: UserInfo }> {
  const { data } = await client.post('/auth/dev-login');
  return data;
}

export async function grantGdprConsent(): Promise<void> {
  await client.post('/auth/gdpr-consent');
}
