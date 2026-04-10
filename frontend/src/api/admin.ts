import client from './client';

// ── Types ──

export interface InviteCodeCounts {
  total: number;
  used: number;
  available: number;
}

export interface WaitlistReasonCounts {
  no_code: number;
  invalid_code: number;
  code_already_used: number;
  registration_closed: number;
}

export interface AdminStats {
  registered: number;
  registration_enabled: boolean;
  invite_codes: InviteCodeCounts;
  waitlist_total: number;
  waitlist_by_reason: WaitlistReasonCounts;
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

export interface WaitlistEntry {
  email: string;
  name: string;
  provider: string;
  attempted_code: string | null;
  reason: string;
  first_attempt_at: string;
  last_attempt_at: string;
  attempts: number;
  contacted: boolean;
  contacted_at: string | null;
}

export interface BetaConfig {
  max_users: number;
  registration_enabled: boolean;
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
  updates: Partial<Pick<BetaConfig, 'max_users' | 'registration_enabled'>>,
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

// ── Waitlist ──

export async function listWaitlist(): Promise<WaitlistEntry[]> {
  const { data } = await client.get('/admin/waitlist');
  return data;
}

export async function markWaitlistContacted(
  email: string,
  contacted: boolean,
): Promise<WaitlistEntry> {
  const { data } = await client.patch(`/admin/waitlist/${email}`, {
    contacted,
  });
  return data;
}
