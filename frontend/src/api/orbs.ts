import client from './client';

export interface OrbNode {
  uid: string;
  _labels: string[];
  score?: number;
  [key: string]: unknown;
}

interface OrbLink {
  source: string;
  target: string;
  type: string;
}

export interface OrbData {
  person: Record<string, unknown>;
  nodes: OrbNode[];
  links: OrbLink[];
}

export async function getMyOrb(): Promise<OrbData> {
  const { data } = await client.get('/orbs/me');
  return data;
}

export async function hasOrbContent(): Promise<boolean> {
  try {
    const data = await getMyOrb();
    return data.nodes.length > 0;
  } catch {
    return false;
  }
}

export async function discardOrbContent(): Promise<void> {
  await client.delete('/orbs/me/content');
}

export async function getPublicOrb(orbId: string, token?: string | null): Promise<OrbData> {
  // Token is required only for public orbs. Restricted orbs use the
  // axios interceptor's Bearer auth instead.
  const params = token ? { token } : undefined;
  const { data } = await client.get(`/orbs/${orbId}`, { params });
  return data;
}

// ── Share Tokens ──

export interface ShareToken {
  token_id: string;
  orb_id: string;
  keywords: string[];
  hidden_node_types: string[];
  label: string | null;
  created_at: string;
  expires_at: string | null;
  revoked: boolean;
}

export async function createShareToken(
  keywords: string[] = [],
  hiddenNodeTypes: string[] = [],
  label?: string,
  expiresInDays?: number,
): Promise<ShareToken> {
  const { data } = await client.post('/orbs/me/share-tokens', {
    keywords,
    hidden_node_types: hiddenNodeTypes,
    label: label || null,
    expires_in_days: expiresInDays ?? null,
  });
  return data;
}

export async function listShareTokens(): Promise<{ tokens: ShareToken[] }> {
  const { data } = await client.get('/orbs/me/share-tokens');
  return data;
}

export async function revokeShareToken(tokenId: string): Promise<void> {
  await client.delete(`/orbs/me/share-tokens/${tokenId}`);
}

// ── Access Grants (restricted-mode allowlist) ──

export interface AccessGrant {
  grant_id: string;
  orb_id: string;
  email: string;
  keywords: string[];
  hidden_node_types: string[];
  created_at: string;
  revoked: boolean;
}

export interface AccessGrantCreatePayload {
  email: string;
  keywords?: string[];
  hidden_node_types?: string[];
}

export interface AccessGrantFiltersUpdatePayload {
  keywords: string[];
  hidden_node_types: string[];
}

export async function createAccessGrant(payload: AccessGrantCreatePayload): Promise<AccessGrant> {
  const { data } = await client.post('/orbs/me/access-grants', payload);
  return data;
}

export async function listAccessGrants(): Promise<{ grants: AccessGrant[] }> {
  const { data } = await client.get('/orbs/me/access-grants');
  return data;
}

export async function revokeAccessGrant(grantId: string): Promise<void> {
  await client.delete(`/orbs/me/access-grants/${grantId}`);
}

export async function updateAccessGrantFilters(
  grantId: string,
  payload: AccessGrantFiltersUpdatePayload,
): Promise<AccessGrant> {
  const { data } = await client.put(`/orbs/me/access-grants/${grantId}/filters`, payload);
  return data;
}

export async function addNode(nodeType: string, properties: Record<string, unknown>): Promise<OrbNode> {
  const { data } = await client.post('/orbs/me/nodes', { node_type: nodeType, properties });
  return data;
}

export async function updateNode(uid: string, properties: Record<string, unknown>): Promise<OrbNode> {
  const { data } = await client.put(`/orbs/me/nodes/${uid}`, { properties });
  return data;
}

export async function deleteNode(uid: string): Promise<void> {
  await client.delete(`/orbs/me/nodes/${uid}`);
}

export async function updateProfile(properties: Record<string, unknown>): Promise<void> {
  await client.put('/orbs/me', properties);
}

export async function claimOrbId(orbId: string): Promise<void> {
  await client.put('/orbs/me/orb-id', { orb_id: orbId });
}

export type OrbVisibility = 'private' | 'public' | 'restricted';

export async function updateVisibility(visibility: OrbVisibility): Promise<void> {
  await client.put('/orbs/me/visibility', { visibility });
}

export async function uploadProfileImage(file: File): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  await client.post('/orbs/me/profile-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function deleteProfileImage(): Promise<void> {
  await client.delete('/orbs/me/profile-image');
}

export async function textSearch(query: string): Promise<OrbNode[]> {
  const { data } = await client.post('/search/text', { query });
  return data;
}

export async function publicTextSearch(query: string, orbId: string, token?: string | null): Promise<OrbNode[]> {
  const payload: { query: string; orb_id: string; token?: string } = { query, orb_id: orbId };
  if (token) payload.token = token;
  const { data } = await client.post('/search/text/public', payload);
  return data;
}

export async function linkSkill(nodeUid: string, skillUid: string): Promise<void> {
  await client.post('/orbs/me/link-skill', { node_uid: nodeUid, skill_uid: skillUid });
}

export async function unlinkSkill(nodeUid: string, skillUid: string): Promise<void> {
  await client.post('/orbs/me/unlink-skill', { node_uid: nodeUid, skill_uid: skillUid });
}

// ── Note Enhancement ──

export interface EnhanceNoteResult {
  node_type: string;
  properties: Record<string, string>;
  suggested_skill_uids: string[];
}

export async function enhanceNote(
  text: string,
  targetLanguage: string,
  existingSkills: { uid: string; name: string }[],
): Promise<EnhanceNoteResult> {
  const { data } = await client.post('/notes/enhance', {
    text,
    target_language: targetLanguage,
    existing_skills: existingSkills,
  });
  return data;
}

// ── Versions ──

export interface SnapshotMetadata {
  snapshot_id: string;
  user_id: string;
  created_at: string;
  trigger: string;
  label: string | null;
  node_count: number;
  edge_count: number;
}

export async function getVersions(): Promise<SnapshotMetadata[]> {
  const { data } = await client.get('/orbs/me/versions');
  return data;
}

export async function createVersion(): Promise<SnapshotMetadata> {
  const { data } = await client.post('/orbs/me/versions');
  return data;
}

export async function restoreVersion(snapshotId: string): Promise<void> {
  await client.post(`/orbs/me/versions/${snapshotId}/restore`);
}

export async function deleteVersion(snapshotId: string): Promise<void> {
  await client.delete(`/orbs/me/versions/${snapshotId}`);
}

export async function submitIdea(text: string): Promise<void> {
  await client.post('/ideas', { text });
}

// ── Connection Requests ──

export interface ConnectionRequest {
  request_id: string;
  requester_user_id: string;
  requester_email: string;
  requester_name: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export async function requestAccess(orbId: string): Promise<ConnectionRequest> {
  const { data } = await client.post(`/orbs/${orbId}/connection-requests`);
  return data;
}

export async function getMyConnectionRequest(orbId: string): Promise<ConnectionRequest | null> {
  try {
    const { data } = await client.get(`/orbs/${orbId}/connection-requests/me`);
    return data;
  } catch {
    return null;
  }
}

export async function listConnectionRequests(): Promise<ConnectionRequest[]> {
  const { data } = await client.get('/orbs/me/connection-requests');
  return data.requests;
}

export async function acceptConnectionRequest(
  requestId: string,
  filters: { keywords: string[]; hidden_node_types: string[] },
): Promise<void> {
  await client.post(`/orbs/me/connection-requests/${requestId}/accept`, filters);
}

export async function rejectConnectionRequest(requestId: string): Promise<void> {
  await client.post(`/orbs/me/connection-requests/${requestId}/reject`);
}
