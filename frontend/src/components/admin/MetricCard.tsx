import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface MetricCardProps {
  label: string;
  value: number | string;
  sparkline?: number[];
}

export default function MetricCard({ label, value, sparkline = [] }: MetricCardProps) {
  const sparkData = sparkline.map((v, i) => ({ i, v }));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-semibold text-white mt-1">{value}</p>
      {sparkData.length > 1 && (
        <div className="h-8 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line type="monotone" dataKey="v" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
