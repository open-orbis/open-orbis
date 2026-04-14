import { useEffect, useMemo, useRef, useState } from 'react';
import type { OrbData } from '../../api/orbs';
import { computeOrbisStatsSummary } from './orbisStats';

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

function formatTypeLabel(type: string | null): string {
  if (!type) return 'Node';
  return type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function metricHint(active: number, total: number): string {
  if (active === total) return 'All visible';
  return `${active} of ${total}`;
}

function shareReadinessLabel(score: number): string {
  if (score >= 0.8) return 'Excellent';
  if (score >= 0.65) return 'Strong';
  if (score >= 0.5) return 'Improving';
  return 'Needs work';
}

function OrbisPulsePanel({ stats }: OrbisPulsePanelProps) {
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

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/8 bg-white/[0.03] p-2">
          <p className="text-[10px] uppercase tracking-wide text-white/40">Active Nodes</p>
          <p className="mt-1 text-lg leading-none font-semibold text-white">{stats.activeNodes}</p>
          <p className="mt-1 text-[10px] text-white/45">{stats.visibleNodes} visible</p>
        </div>

        <div className="rounded-lg border border-white/8 bg-white/[0.03] p-2">
          <p className="text-[10px] uppercase tracking-wide text-white/40">Active Edges</p>
          <p className="mt-1 text-lg leading-none font-semibold text-white">{stats.activeLinks}</p>
          <p className="mt-1 text-[10px] text-white/45">{stats.visibleLinks} visible</p>
        </div>

        <div className="relative rounded-lg border border-white/8 bg-white/[0.03] p-2.5">
          <MetricInfo
            label="Density"
            description="Active links divided by the maximum possible links among active nodes in the current view."
          />
          <p className="pr-7 text-[10px] uppercase tracking-wide text-white/40">Density</p>
          <p className="mt-1 text-lg leading-none font-semibold text-white">{formatPercent(stats.density, 1)}</p>
          <p className="mt-1 text-[10px] text-white/45">{stats.avgLinksPerNode.toFixed(1)} links/node</p>
        </div>

        <div className="relative rounded-lg border border-white/8 bg-white/[0.03] p-2.5">
          <MetricInfo
            label="Skill Coverage"
            description="Share of active non-skill nodes connected to at least one skill through a USED_SKILL link."
          />
          <p className="pr-7 text-[10px] uppercase tracking-wide text-white/40">Skill Coverage</p>
          <p className="mt-1 text-lg leading-none font-semibold text-white">{formatPercent(stats.skillCoverageRate)}</p>
          <p className="mt-1 text-[10px] text-white/45">
            {stats.skillLinkedNodes}/{stats.skillEligibleNodes} linked
          </p>
        </div>
      </div>

      <div className="mt-2.5 rounded-lg border border-white/8 bg-white/[0.03] p-2.5">
        <p className="text-[10px] uppercase tracking-wide text-white/40">Top Hub</p>
        <p className="mt-1 text-sm leading-tight text-white/90 truncate">{stats.topHubName}</p>
        <p className="mt-1 text-[10px] text-white/45">
          {formatTypeLabel(stats.topHubType)} • {stats.topHubDegree} active links
        </p>
      </div>

      <div className="relative mt-2.5 rounded-lg border border-white/8 bg-white/[0.03] p-2.5">
        <MetricInfo
          label="Share Readiness"
          description="Weighted score: 40% completeness, 25% skill coverage, 20% connectivity, 15% domain balance."
        />
        <p className="pr-7 text-[10px] uppercase tracking-wide text-white/40">Share Readiness</p>
        <p className="mt-1 text-lg leading-none font-semibold text-white">{formatPercent(stats.shareReadinessScore)}</p>
        <p className="mt-1 text-[10px] text-white/45">{shareReadinessLabel(stats.shareReadinessScore)}</p>
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
      className="pointer-events-none fixed right-4 bottom-24 z-20 sm:right-6 sm:bottom-8"
    >
      {isCompact ? (
        <div className="flex flex-col items-end gap-2">
          {compactOpen && (
            <div className="pointer-events-auto">
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
        <div className="pointer-events-auto">
          <OrbisPulsePanel stats={stats} />
        </div>
      )}
    </div>
  );
}
