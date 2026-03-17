import client from './client';

export interface ExtractedData {
  nodes: Array<{
    node_type: string;
    properties: Record<string, unknown>;
  }>;
}

export async function uploadCV(file: File): Promise<ExtractedData> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await client.post('/cv/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function confirmCV(nodes: ExtractedData['nodes']): Promise<void> {
  await client.post('/cv/confirm', { nodes });
}
