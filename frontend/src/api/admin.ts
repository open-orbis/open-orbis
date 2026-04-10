import client from './client';

// ── Types ──

export interface InviteCodeCounts {
  total: number;
  used: number;
  available: number;
}

export interface AdminStats {
  registered: number;
  pending_activation: number;
  invite_code_required: boolean;
  invite_codes: InviteCodeCounts;
}

export interface AccessCode {
  code: string;
  label: string;
  active: boolean;
  created_at: string;
  created_by: string;
  used_at: string | null;
  used_by: string | null;
}

export interface PendingUser {
  user_id: string;
  name: string;
  email: string;
  provider: string;
  created_at: string;
}

export interface BetaConfig {
  invite_code_required: boolean;
  updated_at: string;
}

// ── Stats ──

export async function getStats(): Promise<AdminStats> {
  const { data } = await client.get('/admin/stats');
  return data;
}

// ── BetaConfig ──

export async function getBetaConfig(): Promise<BetaConfig> {
  const { data } = await client.get('/admin/beta-config');
  return data;
}

export async function updateBetaConfig(
  updates: Partial<Pick<BetaConfig, 'invite_code_required'>>,
): Promise<BetaConfig> {
  const { data } = await client.patch('/admin/beta-config', updates);
  return data;
}

// ── Access Codes ──

export async function listAccessCodes(): Promise<AccessCode[]> {
  const { data } = await client.get('/admin/access-codes');
  return data;
}

export async function createAccessCode(
  code: string,
  label: string = '',
): Promise<AccessCode> {
  const { data } = await client.post('/admin/access-codes', { code, label });
  return data;
}

export async function createBatchAccessCodes(
  prefix: string,
  count: number,
  label: string = '',
): Promise<AccessCode[]> {
  const { data } = await client.post('/admin/access-codes/batch', {
    prefix,
    count,
    label,
  });
  return data;
}

export async function toggleAccessCode(
  code: string,
  active: boolean,
): Promise<AccessCode> {
  const { data } = await client.patch(`/admin/access-codes/${code}`, {
    active,
  });
  return data;
}

export async function deleteAccessCode(code: string): Promise<void> {
  await client.delete(`/admin/access-codes/${code}`);
}

// ── Pending Users ──

export async function listPendingUsers(): Promise<PendingUser[]> {
  const { data } = await client.get('/admin/pending-users');
  return data;
}
