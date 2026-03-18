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

export async function voiceTranscribe(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.webm');
  const { data } = await client.post('/cv/voice-transcribe', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data.text;
}

export async function voiceClassify(text: string): Promise<ExtractedData> {
  const { data } = await client.post('/cv/voice-classify', { text }, {
    timeout: 180000,
  });
  return data;
}
