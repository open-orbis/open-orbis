import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchLLMUsage } from '../../api/admin';
import AdminLayout from '../../components/admin/AdminLayout';

const COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#10b981'];

interface LLMData {
  by_model: { model: string; input_tokens: number; output_tokens: number; count: number }[];
  by_operation: { operation: string; input_tokens: number; output_tokens: number; count: number }[];
  over_time: { date: string; input_tokens: number; output_tokens: number }[];
  top_users: { user_id: string; input_tokens: number; output_tokens: number }[];
}

export default function AdminLLMPage() {
  const [data, setData] = useState<LLMData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLLMUsage()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <AdminLayout><p className="text-gray-500">Loading...</p></AdminLayout>;
  }

  if (!data) {
    return <AdminLayout><p className="text-gray-500">No data available</p></AdminLayout>;
  }

  const pieData = data.by_model.map((m) => ({
    name: m.model,
    value: m.input_tokens + m.output_tokens,
  }));

  return (
    <AdminLayout>
      <h2 className="text-xl font-semibold text-white mb-6">LLM Token Usage</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Tokens by Model</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name }) => name}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-sm">No model data</p>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Top Users by Tokens</h3>
          <div className="space-y-2">
            {data.top_users.slice(0, 10).map((user, i) => (
              <div key={user.user_id} className="flex items-center justify-between text-sm">
                <span className="text-gray-400 font-mono text-xs">
                  {i + 1}. {user.user_id}
                </span>
                <span className="text-gray-300">
                  {(user.input_tokens + user.output_tokens).toLocaleString()} tokens
                </span>
              </div>
            ))}
            {data.top_users.length === 0 && (
              <p className="text-gray-500 text-sm">No user data</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Tokens Over Time</h3>
        {data.over_time.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.over_time}>
              <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 12 }} />
              <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="input_tokens" stackId="1" fill="#8b5cf6" stroke="#8b5cf6" name="Input" />
              <Area type="monotone" dataKey="output_tokens" stackId="1" fill="#06b6d4" stroke="#06b6d4" name="Output" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-sm">No time series data</p>
        )}
      </div>
    </AdminLayout>
  );
}
