interface FunnelStep {
  name: string;
  count: number;
}

interface FunnelChartProps {
  steps: FunnelStep[];
}

export default function FunnelChart({ steps }: FunnelChartProps) {
  if (steps.length === 0) return <p className="text-gray-500 text-sm">No funnel data</p>;

  const maxCount = Math.max(...steps.map((s) => s.count), 1);

  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        const widthPct = Math.max((step.count / maxCount) * 100, 4);
        const conversionRate = i > 0 && steps[i - 1].count > 0
          ? ((step.count / steps[i - 1].count) * 100).toFixed(1)
          : null;

        return (
          <div key={step.name}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-300">{step.name}</span>
              <span className="text-gray-400">
                {step.count}
                {conversionRate && <span className="text-gray-500 ml-2">({conversionRate}%)</span>}
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded h-6">
              <div
                className="bg-purple-600 h-6 rounded"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
