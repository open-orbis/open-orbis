// frontend/src/api/templates.ts
import client from './client';

export interface TemplateListItem {
  id: string;
  name: string;
  description: string | null;
  engine: string;
  thumbnail_url: string | null;
  is_preloaded: boolean;
}

export interface TemplateDetail extends TemplateListItem {
  license: string | null;
  tex_content: string;
}

export async function listTemplates(): Promise<TemplateListItem[]> {
  const { data } = await client.get<TemplateListItem[]>('/cv/templates');
  return data;
}

export async function getTemplate(templateId: string): Promise<TemplateDetail> {
  const { data } = await client.get<TemplateDetail>(`/cv/templates/${templateId}`);
  return data;
}

export async function compileTemplate(
  templateId: string,
  texContent?: string,
): Promise<Blob> {
  const { data } = await client.post(
    '/cv/compile',
    { template_id: templateId, tex_content: texContent || undefined },
    { responseType: 'blob', timeout: 60_000 },
  );
  return data;
}

export async function uploadTemplate(
  texFile: File,
  name: string,
  engine: string,
  description?: string,
  clsFile?: File,
): Promise<TemplateDetail> {
  const form = new FormData();
  form.append('tex_file', texFile);
  form.append('name', name);
  form.append('engine', engine);
  if (description) form.append('description', description);
  if (clsFile) form.append('cls_file', clsFile);
  const { data } = await client.post<TemplateDetail>('/cv/templates/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30_000,
  });
  return data;
}
