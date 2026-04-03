import client from './client';

export interface ExtractedRelationship {
  from_index: number;
  to_index: number;
  type: string;
}

interface SkippedNode {
  original: Record<string, unknown>;
  reason: string;
}

export interface ExtractedData {
  nodes: Array<{
    node_type: string;
    properties: Record<string, unknown>;
  }>;
  unmatched: string[];
  skipped_nodes?: SkippedNode[];
  relationships?: ExtractedRelationship[];
  truncated?: boolean;
  cv_owner_name?: string | null;
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

export async function confirmCV(
  nodes: ExtractedData['nodes'],
  relationships?: ExtractedRelationship[],
  cv_owner_name?: string | null,
): Promise<void> {
  await client.post('/cv/confirm', { nodes, relationships: relationships || [], cv_owner_name: cv_owner_name || null });
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
