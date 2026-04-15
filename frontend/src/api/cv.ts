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

export interface ExtractedProfile {
  headline?: string;
  location?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  github_url?: string;
  twitter_url?: string;
  website_url?: string;
  scholar_url?: string;
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
  profile?: ExtractedProfile | null;
  document_id?: string | null;
}

export interface DocumentMetadata {
  document_id: string;
  original_filename: string;
  uploaded_at: string;
  file_size_bytes: number;
  page_count: number;
  entities_count: number | null;
  edges_count: number | null;
}

export interface UploadResponse {
  job_id: string;
  status: string;
}

export interface CVJobResponse {
  job_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  step: string | null;
  progress_pct: number;
  progress_detail: string | null;
  filename: string | null;
  node_count: number | null;
  edge_count: number | null;
  llm_provider: string | null;
  llm_model: string | null;
  created_at: string | null;
  completed_at: string | null;
  error_message?: string | null;
  result?: ExtractedData;
}

export async function uploadCV(file: File, signal?: AbortSignal): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post<UploadResponse>('/cv/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30_000,
    signal,
  });
  return data;
}

export async function getJob(jobId: string): Promise<CVJobResponse> {
  const { data } = await client.get<CVJobResponse>(`/cv/job/${jobId}`);
  return data;
}

export async function confirmCV(
  nodes: ExtractedData['nodes'],
  relationships?: ExtractedRelationship[],
  cv_owner_name?: string | null,
  document_id?: string | null,
  original_filename?: string | null,
  file_size_bytes?: number | null,
  page_count?: number | null,
  profile?: ExtractedProfile | null,
): Promise<void> {
  await client.post('/cv/confirm', {
    nodes,
    relationships: relationships || [],
    cv_owner_name: cv_owner_name || null,
    profile: profile || null,
    document_id: document_id || null,
    original_filename: original_filename || null,
    file_size_bytes: file_size_bytes || null,
    page_count: page_count || null,
  });
}

export async function downloadCV(documentId?: string): Promise<void> {
  const url = documentId ? `/cv/documents/${documentId}/download` : '/cv/download';
  const response = await client.get(url, { responseType: 'blob' });
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : 'cv.pdf';
  const blobUrl = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

export async function importDocument(file: File): Promise<ExtractedData> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await client.post('/cv/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 1800000,
  });
  return data;
}

export async function confirmImport(
  nodes: ExtractedData['nodes'],
  relationships?: ExtractedRelationship[],
  cv_owner_name?: string | null,
  document_id?: string | null,
  original_filename?: string | null,
  file_size_bytes?: number | null,
  page_count?: number | null,
  profile?: ExtractedProfile | null,
): Promise<void> {
  await client.post('/cv/import-confirm', {
    nodes,
    relationships: relationships || [],
    cv_owner_name: cv_owner_name || null,
    profile: profile || null,
    document_id: document_id || null,
    original_filename: original_filename || null,
    file_size_bytes: file_size_bytes || null,
    page_count: page_count || null,
  });
}

export async function getDocuments(): Promise<DocumentMetadata[]> {
  const { data } = await client.get('/cv/documents');
  return data;
}

export async function getProcessingCount(): Promise<number> {
  const { data } = await client.get('/cv/processing-count');
  return data.count;
}

export interface CVProgressData {
  active: boolean;
  job_id: string | null;
  status: string | null;
  step: string | null;
  percent: number;
  message: string | null;
  detail: string | null;
  node_count: number | null;
  edge_count: number | null;
  elapsed_seconds: number;
}

export async function getCVProgress(): Promise<CVProgressData> {
  const { data } = await client.get('/cv/progress');
  return data;
}

