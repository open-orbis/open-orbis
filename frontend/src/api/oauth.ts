import client from './client';

export interface AuthorizeContext {
  login_required: boolean;
  next?: string;
  client_id?: string;
  client_name?: string;
  registered_at?: string;
  registered_from_ip?: string | null;
  redirect_uri?: string;
  scope?: string;
}

export async function getAuthorizeContext(
  searchParams: URLSearchParams,
): Promise<AuthorizeContext> {
  const { data } = await client.get(
    `/oauth/authorize?${searchParams.toString()}`,
  );
  return data;
}

export async function submitConsent(body: {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
  access_mode: 'full' | 'restricted';
  share_token_id?: string;
}): Promise<{ code: string; state: string; redirect_uri: string }> {
  const { data } = await client.post('/oauth/authorize', body);
  return data;
}

export interface OAuthGrant {
  client_id: string;
  client_name: string;
  share_token_id: string | null;
  share_token_label: string | null;
  connected_at: string;
  last_used_at: string | null;
}

export async function listGrants(): Promise<{ grants: OAuthGrant[] }> {
  const { data } = await client.get('/api/oauth/grants');
  return data;
}

export async function revokeGrant(clientId: string): Promise<void> {
  await client.delete(`/api/oauth/grants/${clientId}`);
}
