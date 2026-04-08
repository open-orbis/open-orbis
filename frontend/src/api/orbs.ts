import client from './client';

export interface OrbNode {
  uid: string;
  _labels: string[];
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

export async function getPublicOrb(orbId: string, filterToken?: string): Promise<OrbData> {
  const params = filterToken ? { filter_token: filterToken } : {};
  const { data } = await client.get(`/orbs/${orbId}`, { params });
  return data;
}

export async function createFilterToken(keywords: string[]): Promise<{ token: string; keywords: string[] }> {
  const { data } = await client.post('/orbs/me/filter-token', { keywords });
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

export async function publicTextSearch(query: string, orbId: string, filterToken?: string): Promise<OrbNode[]> {
  const { data } = await client.post('/search/text/public', { query, orb_id: orbId, filter_token: filterToken });
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


