import { useEffect, useState } from 'react';
import { fetchOverview, fetchFunnel } from '../../api/admin';
import MetricCard from '../../components/admin/MetricCard';
import FunnelChart from '../../components/admin/FunnelChart';
import AdminLayout from '../../components/admin/AdminLayout';

interface OverviewData {
  total_users: { label: string; value: number; sparkline: number[] };
  active_today: { label: string; value: number; sparkline: number[] };
  signups_this_week: { label: string; value: number; sparkline: number[] };
  llm_tokens_today: { label: string; value: number; sparkline: number[] };
  recent_events: Record<string, unknown>[];
}

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [funnel, setFunnel] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [ov, fn] = await Promise.all([fetchOverview(), fetchFunnel()]);
        setOverview(ov);
        setFunnel(fn.steps || []);
      } catch (err) {
        console.error('Failed to load overview', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <p className="text-gray-500">Loading...</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h2 className="text-xl font-semibold text-white mb-6">Overview</h2>

      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard label={overview.total_users.label} value={overview.total_users.value} sparkline={overview.total_users.sparkline} />
          <MetricCard label={overview.active_today.label} value={overview.active_today.value} sparkline={overview.active_today.sparkline} />
          <MetricCard label={overview.signups_this_week.label} value={overview.signups_this_week.value} sparkline={overview.signups_this_week.sparkline} />
          <MetricCard label={overview.llm_tokens_today.label} value={overview.llm_tokens_today.value} sparkline={overview.llm_tokens_today.sparkline} />
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-8">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Registration Funnel</h3>
        <FunnelChart steps={funnel} />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Recent Events</h3>
        {overview?.recent_events.length ? (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {overview.recent_events.map((event, i) => (
              <div key={i} className="text-xs text-gray-400 font-mono bg-gray-800 rounded px-3 py-2">
                {JSON.stringify(event)}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No events yet</p>
        )}
      </div>
    </AdminLayout>
  );
}
