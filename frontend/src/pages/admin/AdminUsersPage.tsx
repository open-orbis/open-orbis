import { useEffect, useState } from 'react';
import { fetchUsers, fetchUserActivity } from '../../api/admin';
import AdminLayout from '../../components/admin/AdminLayout';

interface UserSummary {
  user_id: string;
  first_seen: string;
  last_seen: string;
  event_count: number;
  llm_tokens: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [activity, setActivity] = useState<{ events: unknown[]; llm_usage: unknown[] } | null>(null);

  useEffect(() => {
    fetchUsers()
      .then((data) => setUsers(data.users))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSelectUser = async (userId: string) => {
    if (selectedUser === userId) {
      setSelectedUser(null);
      setActivity(null);
      return;
    }
    setSelectedUser(userId);
    try {
      const data = await fetchUserActivity(userId);
      setActivity(data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AdminLayout>
      <h2 className="text-xl font-semibold text-white mb-6">Users</h2>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-gray-400 font-medium">User ID</th>
                <th className="px-4 py-3 text-gray-400 font-medium">First Seen</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Last Seen</th>
                <th className="px-4 py-3 text-gray-400 font-medium text-right">Events</th>
                <th className="px-4 py-3 text-gray-400 font-medium text-right">LLM Tokens</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.user_id}
                  onClick={() => handleSelectUser(user.user_id)}
                  className="border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer"
                >
                  <td className="px-4 py-3 text-white font-mono text-xs">{user.user_id}</td>
                  <td className="px-4 py-3 text-gray-400">{user.first_seen || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{user.last_seen || '—'}</td>
                  <td className="px-4 py-3 text-gray-300 text-right">{user.event_count}</td>
                  <td className="px-4 py-3 text-gray-300 text-right">{user.llm_tokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {selectedUser && activity && (
            <div className="px-4 py-4 bg-gray-800/30 border-t border-gray-800">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Recent Activity — {selectedUser}</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {activity.events.slice(0, 20).map((evt, i) => (
                  <div key={i} className="text-xs text-gray-400 font-mono">
                    {JSON.stringify(evt)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
