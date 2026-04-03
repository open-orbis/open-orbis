import client from './client';

export interface DraftNote {
  uid: string;
  text: string;
  from_voice: boolean;
  created_at: string;
  updated_at: string;
}

export async function getDrafts(): Promise<DraftNote[]> {
  const { data } = await client.get('/drafts');
  return data;
}

export async function createDraft(text: string, fromVoice: boolean = false): Promise<DraftNote> {
  const { data } = await client.post('/drafts', { text, from_voice: fromVoice });
  return data;
}

export async function updateDraft(uid: string, text: string): Promise<DraftNote> {
  const { data } = await client.put(`/drafts/${uid}`, { text });
  return data;
}

export async function deleteDraft(uid: string): Promise<void> {
  await client.delete(`/drafts/${uid}`);
}
