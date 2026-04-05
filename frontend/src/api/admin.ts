import adminClient from './adminClient';

export async function adminLogin(username: string, password: string): Promise<string> {
  const { data } = await adminClient.post('/api/admin/login', { username, password });
  return data.access_token;
}

export async function fetchOverview() {
  const { data } = await adminClient.get('/api/admin/overview');
  return data;
}

export async function fetchUsers(limit = 50, offset = 0) {
  const { data } = await adminClient.get('/api/admin/users', { params: { limit, offset } });
  return data;
}

export async function fetchUserActivity(userId: string) {
  const { data } = await adminClient.get(`/api/admin/users/${userId}/activity`);
  return data;
}

export async function fetchLLMUsage(params?: {
  user_id?: string;
  model?: string;
  operation?: string;
  date_from?: string;
  date_to?: string;
}) {
  const { data } = await adminClient.get('/api/admin/llm-usage', { params });
  return data;
}

export async function fetchEvents(params?: {
  event_type?: string;
  user_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}) {
  const { data } = await adminClient.get('/api/admin/events', { params });
  return data;
}

export async function fetchFunnel() {
  const { data } = await adminClient.get('/api/admin/funnel');
  return data;
}

export async function fetchTrends(events: string[], interval = 'day', dateFrom?: string, dateTo?: string) {
  const { data } = await adminClient.get('/api/admin/trends', {
    params: { events: events.join(','), interval, date_from: dateFrom, date_to: dateTo },
  });
  return data;
}

export async function fetchRealtime() {
  const { data } = await adminClient.get('/api/admin/realtime');
  return data;
}
