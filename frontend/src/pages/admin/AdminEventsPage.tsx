import { useEffect, useState } from 'react';
import { fetchEvents } from '../../api/admin';
import AdminLayout from '../../components/admin/AdminLayout';
import HeatmapChart from '../../components/admin/HeatmapChart';

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    event_type: '',
    user_id: '',
    date_from: '',
    date_to: '',
  });
  const [heatmapData] = useState<number[][]>(
    Array.from({ length: 7 }, () => Array(24).fill(0))
  );

  const loadEvents = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filters.event_type) params.event_type = filters.event_type;
      if (filters.user_id) params.user_id = filters.user_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      const data = await fetchEvents(params);
      setEvents(data.events || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  return (
    <AdminLayout>
      <h2 className="text-xl font-semibold text-white mb-6">Events Explorer</h2>

      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="Event type"
          value={filters.event_type}
          onChange={(e) => setFilters({ ...filters, event_type: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <input
          type="text"
          placeholder="User ID"
          value={filters.user_id}
          onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <input
          type="date"
          value={filters.date_from}
          onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500"
        />
        <input
          type="date"
          value={filters.date_to}
          onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500"
        />
        <button
          onClick={loadEvents}
          className="bg-purple-600 hover:bg-purple-700 text-white rounded px-4 py-1.5 text-sm"
        >
          Filter
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Activity Heatmap</h3>
        <HeatmapChart data={heatmapData} />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-4">
          Events {!loading && `(${events.length})`}
        </h3>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : events.length > 0 ? (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {events.map((event, i) => (
              <div key={i} className="text-xs text-gray-400 font-mono bg-gray-800 rounded px-3 py-2">
                {JSON.stringify(event)}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No events found</p>
        )}
      </div>
    </AdminLayout>
  );
}
