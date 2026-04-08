import client from './client';

export interface Draft {
  uid: string;
  text: string;
  created_at: string;
  updated_at: string;
}

export async function listDrafts(): Promise<Draft[]> {
  const { data } = await client.get('/drafts');
  return data;
}

export async function createDraft(text: string): Promise<Draft> {
  const { data } = await client.post('/drafts', { text });
  return data;
}

export async function updateDraft(uid: string, text: string): Promise<Draft> {
  const { data } = await client.put(`/drafts/${uid}`, { text });
  return data;
}

export async function deleteDraft(uid: string): Promise<void> {
  await client.delete(`/drafts/${uid}`);
}
