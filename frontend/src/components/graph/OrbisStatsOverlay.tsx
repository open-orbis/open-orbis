import { useEffect, useMemo, useRef, useState } from 'react';
import type { OrbData } from '../../api/orbs';
import { computeOrbisStatsSummary, formatTypeLabel } from './orbisStats';
import type { ClusterDetail } from './orbisStats';

interface OrbisStatsOverlayProps {
  data: OrbData;
  filteredNodeIds?: Set<string>;
  hiddenNodeTypes?: Set<string>;
}

interface OrbisPulsePanelProps {
  stats: ReturnType<typeof computeOrbisStatsSummary>;
}

const COMPACT_BREAKPOINT_PX = 1280;

function MetricInfo({ description, label }: { description: string; label: string }) {
  return (
    <div className="absolute right-1.5 top-1.5 pointer-events-auto">
      <div className="group relative">
        <button
          type="button"
          aria-label={`${label} metric info`}
          className="h-[18px] w-[18px] rounded-full border border-white/20 bg-white/5 text-[10px] font-semibold text-white/75 flex items-center justify-center cursor-help"
        >
          i
        </button>
        <div className="pointer-events-none absolute right-0 top-6 z-10 w-56 rounded-lg border border-white/15 bg-black/90 px-2 py-1.5 text-[10px] leading-snug text-white/80 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          {description}
        </div>
      </div>
    </div>
  );
}

function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function metricHint(active: number, total: number): string {
  if (active === total) return 'All visible';
  return `${active} of ${total}`;
}

function freshnessColor(score: number): string {
  if (score >= 0.7) return 'text-emerald-400';
  if (score >= 0.4) return 'text-amber-400';
  return 'text-red-400';
}

function NodeDetailList({ nodes, max = 8 }: { nodes: NodeDetail[]; max?: number }) {
  const shown = nodes.slice(0, max);
  const more = nodes.length - shown.length;
  return (
    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
      {shown.map((n) => (
        <div key={n.uid} className="flex items-center gap-2 text-[11px]">
          <span className="text-white/70 truncate flex-1">{n.name}</span>
          <span className="text-white/30 flex-shrink-0">{n.type}</span>
        </div>
      ))}
      {more > 0 && <p className="text-[10px] text-white/30">+{more} more</p>}
    </div>
  );
}

function ClusterDetailList({ clusters }: { clusters: ClusterDetail[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  return (
    <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
      {clusters.map((cluster, i) => (
        <div key={i} className="rounded-md border border-white/6 bg-white/[0.02] px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
            className="w-full flex items-center gap-2 text-left cursor-pointer"
          >
            <span className="text-[11px] text-white/80 font-medium truncate flex-1">{cluster.hub.name}</span>
            <span className="text-[10px] text-white/30 flex-shrink-0">{cluster.size} nodes</span>
            <span className="text-[10px] text-purple-400/70">{expandedIdx === i ? '▲' : '▼'}</span>
          </button>
          {expandedIdx === i && (
            <div className="mt-1.5 space-y-0.5 border-t border-white/5 pt-1.5">
              {cluster.nodes.slice(0, 8).map((n) => (
                <div key={n.uid} className="flex items-center gap-2 text-[10px] pl-1">
                  <span className="text-white/60 truncate flex-1">{n.name}</span>
                  <span className="text-white/25 flex-shrink-0">{n.type}</span>
                </div>
              ))}
              {cluster.nodes.length > 8 && <p className="text-[10px] text-white/25 pl-1">+{cluster.nodes.length - 8} more</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const METRIC_CARD = 'rounded-lg border border-white/8 bg-white/[0.03] p-2 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_0_12px_rgba(255,255,255,0.04)]';
const METRIC_CARD_LG = 'rounded-lg border border-white/8 bg-white/[0.03] p-2.5 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_0_12px_rgba(255,255,255,0.04)]';

function ExpandableMetric({ label, description, value, hint, children, count }: {
  label: string;
  description: string;
  value: React.ReactNode;
  hint: string;
  children: React.ReactNode;
  count: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`relative ${METRIC_CARD_LG}`}>
      <MetricInfo label={label} description={description} />
      <button
        type="button"
        onClick={() => count > 0 && setExpanded((v) => !v)}
        className={`w-full text-left ${count > 0 ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <p className="pr-7 text-[10px] uppercase tracking-wide text-white/40">{label}</p>
        <p className="mt-1 text-lg leading-none font-semibold text-white">{value}</p>
        <p className="mt-1 text-[10px] text-white/45">
          {hint}
          {count > 0 && (
            <span className="ml-1 text-purple-400/70">{expanded ? '▲' : '▼'}</span>
          )}
        </p>
      </button>
      {expanded && children}
    </div>
  );
}

function OrbisPulsePanel({ stats }: OrbisPulsePanelProps) {
  const [areasExpanded, setAreasExpanded] = useState(false);
  return (
    <div className="w-[min(336px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-black/50 backdrop-blur-md shadow-[0_20px_60px_rgba(0,0,0,0.45)] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#C43A82' }}>Orbis Pulse</p>
          <p className="mt-1 text-xs text-white/70">
            {metricHint(stats.activeNodes, stats.visibleNodes)} nodes in focus
          </p>
        </div>
      </div>

      {/* Top Hub — prominent at the top */}
      <div className={`mt-3 ${METRIC_CARD_LG}`}>
        <p className="text-[10px] uppercase tracking-wide text-white/40">Top Hub</p>
        <p className="mt-1 text-sm leading-tight text-white/90 truncate">{stats.topHubName}</p>
        <p className="mt-1 text-[10px] text-white/45">
          {formatTypeLabel(stats.topHubType)} {stats.topHubDegree > 0 && `\u00b7 ${stats.topHubDegree} active edges`}
        </p>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className={METRIC_CARD}>
          <p className="text-[10px] uppercase tracking-wide text-white/40">Active Nodes</p>
          <p className="mt-1 text-lg leading-none font-semibold text-white">{stats.activeNodes}</p>
          <p className="mt-1 text-[10px] text-white/45">{stats.visibleNodes} visible</p>
        </div>

        <div className={METRIC_CARD}>
          <p className="text-[10px] uppercase tracking-wide text-white/40">Active Edges</p>
          <p className="mt-1 text-lg leading-none font-semibold text-white">{stats.activeLinks}</p>
          <p className="mt-1 text-[10px] text-white/45">{stats.visibleLinks} visible</p>
        </div>

        <div className={`relative ${METRIC_CARD_LG}`}>
          <MetricInfo
            label="Density"
            description="Ratio of actual edges to the maximum possible edges among active nodes."
          />
          <p className="pr-7 text-[10px] uppercase tracking-wide text-white/40">Density</p>
          <p className="mt-1 text-lg leading-none font-semibold text-white">{formatPercent(stats.density, 1)}</p>
          <p className="mt-1 text-[10px] text-white/45">{stats.avgLinksPerNode.toFixed(1)} edges/node</p>
        </div>

        <div className={`relative ${METRIC_CARD_LG}`}>
          <MetricInfo
            label="Skill Coverage"
            description="Percentage of non-skill nodes linked to at least one skill."
          />
          <p className="pr-7 text-[10px] uppercase tracking-wide text-white/40">Skill Coverage</p>
          <p className="mt-1 text-lg leading-none font-semibold text-white">{formatPercent(stats.skillCoverageRate)}</p>
          <p className="mt-1 text-[10px] text-white/45">
            {stats.skillLinkedNodes}/{stats.skillEligibleNodes} linked
          </p>
        </div>

        <div className={`relative ${METRIC_CARD_LG}`}>
          <MetricInfo
            label="Freshness"
            description="Percentage of dated nodes with at least one date in the last 24 months. Higher means your orbis reflects recent activity."
          />
          <p className="pr-7 text-[10px] uppercase tracking-wide text-white/40">Freshness</p>
          <p className={`mt-1 text-lg leading-none font-semibold ${freshnessColor(stats.freshnessScore)}`}>{formatPercent(stats.freshnessScore)}</p>
          <p className="mt-1 text-[10px] text-white/45">recent entries</p>
        </div>
      </div>

      {/* Expandable metrics */}
      <div className="mt-2 space-y-2">
        <ExpandableMetric
          label="Orphan Nodes"
          description="Nodes with no connections to other nodes. Consider linking them to skills or experiences."
          value={stats.orphanNodes}
          hint={`${formatPercent(stats.orphanRate)} of active`}
          count={stats.orphanNodes}
        >
          <NodeDetailList nodes={stats.orphanNodeDetails} />
        </ExpandableMetric>

        <div className={`relative ${METRIC_CARD_LG}`}>
          <MetricInfo
            label="Background Areas"
            description="Key areas of your background, each identified by the skill most connected to your experiences, certifications, and projects."
          />
          <button
            type="button"
            onClick={() => stats.backgroundAreas > 0 && setAreasExpanded((v) => !v)}
            className={`w-full text-left ${stats.backgroundAreas > 0 ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <p className="pr-7 text-[10px] uppercase tracking-wide text-white/40">Background Areas</p>
            <p className="mt-1 text-lg leading-none font-semibold text-white">{stats.backgroundAreas}</p>
            {stats.clusterDetails.length > 0 && (
              <p className="mt-1 text-[10px] text-white/55 truncate">
                {stats.clusterDetails.map((c) => c.hub.name).join(', ')}
                {stats.backgroundAreas > 0 && (
                  <span className="ml-1 text-purple-400/70">{areasExpanded ? '▲' : '▼'}</span>
                )}
              </p>
            )}
          </button>
          {areasExpanded && <ClusterDetailList clusters={stats.clusterDetails} />}
        </div>
      </div>

    </div>
  );
}

export default function OrbisStatsOverlay({
  data,
  filteredNodeIds = new Set(),
  hiddenNodeTypes = new Set(),
}: OrbisStatsOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isCompact, setIsCompact] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < COMPACT_BREAKPOINT_PX;
  });
  const [compactOpen, setCompactOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const stats = useMemo(
    () => computeOrbisStatsSummary(data, hiddenNodeTypes, filteredNodeIds),
    [data, hiddenNodeTypes, filteredNodeIds],
  );

  useEffect(() => {
    const handleResize = () => {
      setIsCompact(window.innerWidth < COMPACT_BREAKPOINT_PX);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isCompact) setCompactOpen(false);
  }, [isCompact]);

  useEffect(() => {
    if (!isCompact || !compactOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setCompactOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCompactOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [compactOpen, isCompact]);

  return (
    <div
      ref={containerRef}
      data-tour="orbis-pulse"
      className="pointer-events-none fixed right-4 bottom-32 z-20 sm:right-6 sm:bottom-8"
    >
      {dismissed ? (
        /* Collapsed pill — click to re-open */
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/65 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-white/90 shadow-lg shadow-black/40 hover:bg-black/75 transition-colors"
        >
          <span style={{ color: '#C43A82' }}>Orbis Pulse</span>
          <svg className="h-3.5 w-3.5 text-white/70" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M5 13l5-6 5 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : isCompact ? (
        <div className="flex flex-col items-end gap-2">
          {compactOpen && (
            <div className="pointer-events-auto relative">
              <button
                type="button"
                onClick={() => { setCompactOpen(false); setDismissed(true); }}
                className="absolute top-2 right-2 w-6 h-6 rounded-md text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors z-10"
                aria-label="Close Orbis Pulse"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <OrbisPulsePanel stats={stats} />
            </div>
          )}
          <button
            type="button"
            onClick={() => setCompactOpen((prev) => !prev)}
            aria-expanded={compactOpen}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/65 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-white/90 shadow-lg shadow-black/40 hover:bg-black/75 transition-colors"
          >
            <span style={{ color: '#C43A82' }}>Orbis Pulse</span>
            <svg
              className={`h-3.5 w-3.5 text-white/70 transition-transform ${compactOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M5 7l5 6 5-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="pointer-events-auto relative">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="absolute top-2 right-2 w-6 h-6 rounded-md text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors z-10"
            aria-label="Close Orbis Pulse"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <OrbisPulsePanel stats={stats} />
        </div>
      )}
    </div>
  );
}
