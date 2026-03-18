import client from './client';

export interface ExtractedData {
  nodes: Array<{
    node_type: string;
    properties: Record<string, unknown>;
  }>;
  unmatched: string[];
}

export async function uploadCV(file: File): Promise<ExtractedData> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await client.post('/cv/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000, // 3 min timeout for LLM Whisperer + Ollama
  });
  return data;
}

export async function confirmCV(nodes: ExtractedData['nodes']): Promise<void> {
  await client.post('/cv/confirm', { nodes });
}

export async function getProcessingCount(): Promise<number> {
  const { data } = await client.get('/cv/processing-count');
  return data.count;
}
