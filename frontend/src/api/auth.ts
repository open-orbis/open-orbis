import client from './client';

export interface UserInfo {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
}

export async function getMe(): Promise<UserInfo> {
  const { data } = await client.get('/auth/me');
  return data;
}

export async function devLogin(): Promise<{ access_token: string; user: UserInfo }> {
  const { data } = await client.post('/auth/dev-login');
  return data;
}

export async function changeEmail(newEmail: string): Promise<{ access_token: string }> {
  const { data } = await client.post('/auth/change-email', { new_email: newEmail });
  return data;
}

export async function deleteAccount(): Promise<void> {
  await client.delete('/auth/account');
}

export function getGoogleLoginUrl(): string {
  return '/api/auth/google';
}
