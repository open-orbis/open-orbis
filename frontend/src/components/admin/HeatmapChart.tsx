const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface HeatmapChartProps {
  /** 7x24 matrix: data[day][hour] = count */
  data: number[][];
}

export default function HeatmapChart({ data }: HeatmapChartProps) {
  const maxVal = Math.max(...data.flat(), 1);

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-1" style={{ gridTemplateColumns: `auto repeat(24, 1fr)` }}>
        {/* Header row */}
        <div />
        {HOURS.map((h) => (
          <div key={h} className="text-xs text-gray-500 text-center w-6">
            {h % 6 === 0 ? `${h}` : ''}
          </div>
        ))}

        {/* Data rows */}
        {DAYS.map((day, dayIdx) => (
          <div key={day} className="contents">
            <div className="text-xs text-gray-400 pr-2 flex items-center">
              {day}
            </div>
            {HOURS.map((hour) => {
              const val = data[dayIdx]?.[hour] ?? 0;
              const intensity = val / maxVal;
              return (
                <div
                  key={`${day}-${hour}`}
                  className="w-6 h-6 rounded-sm"
                  style={{ backgroundColor: `rgba(139, 92, 246, ${Math.max(intensity, 0.05)})` }}
                  title={`${day} ${hour}:00 — ${val} events`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
