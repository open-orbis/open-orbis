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
  pending_deletion: number;
  deleted_accounts: number;
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
  // Backend is paginated (L2 fix). Hit the cap so the admin dashboard
  // keeps showing everything until proper pagination UI lands.
  const { data } = await client.get('/admin/access-codes', {
    params: { limit: 200 },
  });
  return data.items;
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

// ── User Management ──

export interface AdminUser {
  user_id: string;
  name: string;
  email: string;
  provider: string;
  is_admin: boolean;
  signup_code: string | null;
  waitlist_joined: boolean;
  waitlist_joined_at?: string | null;
  activated_at: string | null;
  created_at: string;
}

export interface ProcessingRecord {
  document_id: string;
  original_filename: string;
  llm_provider: string;
  llm_model: string;
  extraction_method: string;
  nodes_extracted: number;
  edges_extracted: number;
  ontology_version: number | null;
  processed_at: string;
}

export interface AdminUserDetail extends AdminUser {
  orb_id: string;
  picture: string;
  headline: string;
  location: string;
  node_count: number;
  gdpr_consent: boolean;
  deletion_requested_at: string | null;
  processing_records: ProcessingRecord[];
  llm_usage: LLMUsageRecord[];
  llm_usage_summary: LLMUsageSummary;
}

export async function listUsers(): Promise<AdminUser[]> {
  // Backend is paginated (L2 fix). Hit the cap to preserve the existing
  // "show everything" admin-dashboard behavior; swap to real pagination
  // UI once the user base grows past 200.
  const { data } = await client.get('/admin/users', {
    params: { limit: 200 },
  });
  return data.items;
}

export async function getUser(userId: string): Promise<AdminUserDetail> {
  const { data } = await client.get(`/admin/users/${userId}`);
  return data;
}

export async function activateUser(userId: string): Promise<AdminUser> {
  const { data } = await client.post(`/admin/users/${userId}/activate`);
  return data;
}

export async function activateUsersBatch(
  userIds: string[],
): Promise<AdminUser[]> {
  const { data } = await client.post('/admin/users/activate-batch', {
    user_ids: userIds,
  });
  return data;
}

export async function promoteUser(userId: string): Promise<AdminUser> {
  const { data } = await client.post(`/admin/users/${userId}/promote`);
  return data;
}

export async function demoteUser(userId: string): Promise<AdminUser> {
  const { data } = await client.post(`/admin/users/${userId}/demote`);
  return data;
}

export async function deleteUser(userId: string): Promise<void> {
  await client.delete(`/admin/users/${userId}`);
}

// ── Ideas ──

export interface Idea {
  idea_id: string;
  user_id: string;
  text: string;
  created_at: string;
  source: string;
}

export async function listIdeas(source?: string): Promise<Idea[]> {
  const { data } = await client.get<Idea[]>('/admin/ideas', { params: source ? { source } : {} });
  return data;
}

export async function deleteIdea(ideaId: string): Promise<void> {
  await client.delete(`/admin/ideas/${ideaId}`);
}

// ── Funnel Metrics ──

export interface DailyCount {
  date: string;
  count: number;
}

export interface FunnelMetrics {
  signups: DailyCount[];
  activations: DailyCount[];
  total_signups: number;
  total_activations: number;
  conversion_rate: number;
}

export async function getFunnelMetrics(
  days: number = 30,
): Promise<FunnelMetrics> {
  const { data } = await client.get('/admin/funnel', { params: { days } });
  return data;
}

// ── Insights ──

export interface ProviderCount {
  provider: string;
  count: number;
}

export interface ActivationTimeStats {
  total: number;
  avg_hours: number | null;
  min_hours: number | null;
  max_hours: number | null;
}

export interface CodeAttributionEntry {
  label: string;
  count: number;
}

export interface EngagementBucket {
  bucket: string;
  count: number;
}

export interface CumulativePoint {
  date: string;
  count: number;
}

export interface ActivationStages {
  registered: number;
  activated: number;
  built_orb: number;
  rich_orb: number;
}

export interface SkillCount {
  name: string;
  count: number;
}

export interface NodeTypeCount {
  label: string;
  count: number;
}

export interface ProfileCompletenessStats {
  empty: number;
  partial: number;
  good: number;
  complete: number;
}

export interface GraphRichnessStats {
  total_users: number;
  avg_nodes: number;
  min_nodes: number;
  max_nodes: number;
  median_nodes: number;
}

export interface CodeEfficiencyEntry {
  label: string;
  created: number;
  used: number;
  rate: number;
}

export interface Insights {
  providers: ProviderCount[];
  activation_time: ActivationTimeStats;
  code_attribution: CodeAttributionEntry[];
  engagement: EngagementBucket[];
  cumulative_growth: CumulativePoint[];
  activation_stages: ActivationStages;
  top_skills: SkillCount[];
  node_type_distribution: NodeTypeCount[];
  profile_completeness: ProfileCompletenessStats;
  graph_richness: GraphRichnessStats;
  recently_active_7d: number;
  code_efficiency: CodeEfficiencyEntry[];
  llm_usage: LLMUsageInsights;
}

export async function getInsights(): Promise<Insights> {
  const { data } = await client.get('/admin/insights');
  return data;
}

// ── CV Jobs ──

export interface CVJobAdmin {
  job_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  filename: string | null;
  status: string;
  step: string | null;
  progress_pct: number;
  progress_detail: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  text_chars: number | null;
  node_count: number | null;
  edge_count: number | null;
  error_message: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export async function listCVJobs(params?: {
  offset?: number;
  limit?: number;
  status?: string;
}): Promise<{ items: CVJobAdmin[]; total: number }> {
  const { data } = await client.get('/admin/cv-jobs', { params });
  return data;
}

export async function cancelCVJob(jobId: string): Promise<void> {
  await client.post(`/admin/cv-jobs/${jobId}/cancel`);
}
