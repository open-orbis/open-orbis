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
    timeout: 1800000, // 30 min timeout for Docling + Claude CLI
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


export async function downloadCV(): Promise<void> {
  const response = await client.get('/cv/download', { responseType: 'blob' });
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : 'cv.pdf';
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function getProcessingCount(): Promise<number> {
  const { data } = await client.get('/cv/processing-count');
  return data.count;
}

export interface CVProgressData {
  active: boolean;
  step: string | null;
  percent: number;
  message: string | null;
  detail: string | null;
  elapsed_seconds: number;
}

export async function getCVProgress(): Promise<CVProgressData> {
  const { data } = await client.get('/cv/progress');
  return data;
}
