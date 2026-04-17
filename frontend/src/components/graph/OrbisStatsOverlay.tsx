import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { OrbData } from '../../api/orbs';
import { submitIdea } from '../../api/orbs';
import { computeOrbisStatsSummary, formatTypeLabel } from './orbisStats';
import type { NodeDetail } from './orbisStats';

interface OrbisStatsOverlayProps {
  data: OrbData;
  filteredNodeIds?: Set<string>;
  hiddenNodeTypes?: Set<string>;
  onHighlight?: (nodeIds: Set<string>) => void;
}

interface OrbisPulsePanelProps {
  stats: ReturnType<typeof computeOrbisStatsSummary>;
  onHighlight?: (nodeIds: Set<string>) => void;
}

const COMPACT_BREAKPOINT_PX = 1280;

function MetricInfo({ description, label }: { description: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Desktop-only: compute a position near the (i) button when the tooltip opens,
  // and keep it correct on scroll/resize. Mobile uses the bottom-sheet layout
  // (inset-x-4 bottom-4) and ignores `anchor`.
  useEffect(() => {
    if (!open) return;
    const TOOLTIP_W = 224; // matches sm:w-56
    const GAP = 8;
    const updateAnchor = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      // Prefer opening to the LEFT of the button (toward the centre of the
      // panel) so it stays on-screen; clamp inside the viewport.
      const left = Math.max(
        GAP,
        Math.min(window.innerWidth - TOOLTIP_W - GAP, rect.right - TOOLTIP_W),
      );
      const top = rect.bottom + GAP;
      setAnchor({ left, top });
    };
    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="absolute right-1.5 top-1.5 pointer-events-auto">
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          aria-label={`${label} metric info`}
          aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className="h-5 w-5 sm:h-[18px] sm:w-[18px] rounded-full border border-white/20 bg-white/5 text-[11px] sm:text-[10px] font-semibold text-white/75 flex items-center justify-center cursor-pointer hover:bg-white/10 hover:text-white transition-colors"
        >
          i
        </button>
        {open && createPortal(
          <>
            {/* Metric info tooltip — portaled to body to escape the Pulse
                stacking context (z-[30] / z-[42]). Mobile: full-width bottom
                sheet with backdrop. Desktop: small popover anchored near the
                triggering (i) button via getBoundingClientRect. */}
            <div
              className="fixed inset-0 z-[1000] bg-black/50 sm:hidden"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              ref={panelRef}
              style={anchor ? { left: anchor.left, top: anchor.top } : undefined}
              className="fixed left-4 right-4 bottom-4 z-[1001] sm:left-auto sm:right-auto sm:bottom-auto sm:w-56 rounded-lg border border-white/15 bg-black/95 px-4 py-3 sm:px-3 sm:py-2 text-sm sm:text-[11px] leading-snug text-white/90 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3 mb-1.5 sm:hidden">
                <span className="text-[10px] uppercase tracking-[0.15em] text-white/45 font-semibold">{label}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                  aria-label="Close"
                  className="-my-1 -mr-1 p-1 text-white/50 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {description}
            </div>
          </>,
          document.body,
        )}
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

function NodeDetailList({ nodes }: { nodes: NodeDetail[] }) {
  return (
    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
      {nodes.map((n) => (
        <div key={n.uid} className="flex items-center gap-2 text-[11px]">
          <span className="text-white/70 truncate flex-1">{n.name}</span>
          <span className="text-white/30 flex-shrink-0">{n.type}</span>
        </div>
      ))}
    </div>
  );
}

const METRIC_CARD = 'rounded-lg border border-white/8 bg-white/[0.03] p-2 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_0_12px_rgba(255,255,255,0.04)]';
const METRIC_CARD_LG = 'rounded-lg border border-white/8 bg-white/[0.03] p-2.5 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_0_12px_rgba(255,255,255,0.04)]';


function OrbisPulsePanel({ stats, onHighlight }: OrbisPulsePanelProps) {
  const [orphansExpanded, setOrphansExpanded] = useState(false);
  const [hubExpanded, setHubExpanded] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestText, setSuggestText] = useState('');
  const [suggestSending, setSuggestSending] = useState(false);
  const [suggestSent, setSuggestSent] = useState(false);
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

      {/* Top Hub — prominent at the top, clickable to show neighbors, hover highlights */}
      <div
        className={`mt-3 ${METRIC_CARD_LG}`}
        onMouseEnter={() => stats.topHubNeighbors.length > 0 && onHighlight?.(new Set(stats.topHubNeighbors.map((n) => n.uid)))}
        onMouseLeave={() => !hubExpanded && onHighlight?.(new Set())}
      >
        <button
          type="button"
          onClick={() => {
            if (stats.topHubDegree === 0) return;
            setHubExpanded((v) => {
              const next = !v;
              if (next) onHighlight?.(new Set(stats.topHubNeighbors.map((n) => n.uid)));
              else onHighlight?.(new Set());
              return next;
            });
          }}
          className={`w-full text-left ${stats.topHubDegree > 0 ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <p className="text-[10px] uppercase tracking-wide text-white/40">Top Hub</p>
          <p className="mt-1 text-sm leading-tight text-white/90 truncate">{stats.topHubName}</p>
          <p className="mt-1 text-[10px] text-white/45">
            {formatTypeLabel(stats.topHubType)} {stats.topHubDegree > 0 && `\u00b7 ${stats.topHubNeighbors.length} neighbors`}
            {stats.topHubDegree > 0 && (
              <span className="ml-1 text-purple-400/70">{hubExpanded ? '▲' : '▼'}</span>
            )}
          </p>
        </button>
        {hubExpanded && <NodeDetailList nodes={stats.topHubNeighbors} />}
      </div>

      {/* Orphan Nodes — full width below top hub, highlights on hover */}
      <div
        className={`relative mt-2 ${METRIC_CARD_LG}`}
        onMouseEnter={() => stats.orphanNodes > 0 && onHighlight?.(new Set(stats.orphanNodeDetails.map((n) => n.uid)))}
        onMouseLeave={() => !orphansExpanded && onHighlight?.(new Set())}
      >
        <MetricInfo
          label="Orphan Nodes"
          description="Nodes with no connections to other nodes. Consider linking them to skills or experiences."
        />
        <button
          type="button"
          onClick={() => {
            if (stats.orphanNodes === 0) return;
            setOrphansExpanded((v) => {
              const next = !v;
              if (next) onHighlight?.(new Set(stats.orphanNodeDetails.map((n) => n.uid)));
              else onHighlight?.(new Set());
              return next;
            });
          }}
          className={`w-full text-left ${stats.orphanNodes > 0 ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <p className="pr-7 text-[10px] uppercase tracking-wide text-white/40">Orphan Nodes</p>
          <p className="mt-1 text-lg leading-none font-semibold text-white">{stats.orphanNodes}</p>
          <p className="mt-1 text-[10px] text-white/45">
            {formatPercent(stats.orphanRate)} of active
            {stats.orphanNodes > 0 && (
              <span className="ml-1 text-purple-400/70">{orphansExpanded ? '▲' : '▼'}</span>
            )}
          </p>
        </button>
        {orphansExpanded && <NodeDetailList nodes={stats.orphanNodeDetails} />}
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
            label="Avg Edges/Node"
            description="Average number of edges per node. Higher means your nodes are well connected to each other."
          />
          <p className="pr-7 text-[10px] uppercase tracking-wide text-white/40">Avg Edges/Node</p>
          <p className="mt-1 text-lg leading-none font-semibold text-white">{stats.avgLinksPerNode.toFixed(1)}</p>
          <p className="mt-1 text-[10px] text-white/45">{stats.activeLinks} total edges</p>
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

        <button
          type="button"
          onClick={() => !suggestSent && setShowSuggest(true)}
          className={`${METRIC_CARD_LG} flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center ${suggestSent ? 'border-emerald-500/30 bg-emerald-500/10' : ''}`}
        >
          {suggestSent ? (
            <>
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-[10px] text-emerald-300 font-bold leading-tight">Thanks!</p>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <p className="text-[10px] text-purple-300 font-medium leading-tight">Suggest a metric</p>
            </>
          )}
        </button>
      </div>

      {showSuggest && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          onClick={() => setShowSuggest(false)}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowSuggest(false)}
              className="absolute right-3 top-3 h-8 w-8 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors flex items-center justify-center"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-white text-base font-semibold mb-1">Suggest a Metric</h3>
            <p className="text-gray-400 text-sm mb-4">What metric would you find useful in Orbis Pulse?</p>
            <textarea
              autoFocus
              value={suggestText}
              onChange={(e) => setSuggestText(e.target.value)}
              placeholder="Describe the metric you'd like to see..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 resize-none h-28 focus:outline-none focus:border-purple-500/50"
            />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowSuggest(false)}
                className="h-9 px-4 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!suggestText.trim() || suggestSending}
                onClick={async () => {
                  setSuggestSending(true);
                  try {
                    await submitIdea(`[Metric Suggestion] ${suggestText.trim()}`, 'idea');
                    setSuggestSent(true);
                    setTimeout(() => setSuggestSent(false), 4000);
                  } catch { /* best effort */ }
                  finally {
                    setSuggestSending(false);
                    setSuggestText('');
                    setShowSuggest(false);
                  }
                }}
                className="h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {suggestSending ? 'Sending...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

    </div>
  );
}

export default function OrbisStatsOverlay({
  data,
  filteredNodeIds = new Set(),
  hiddenNodeTypes = new Set(),
  onHighlight,
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
    <>
      {isCompact && compactOpen && (
        <div
          className="fixed inset-0 z-[41] bg-black/55 backdrop-blur-sm sm:hidden"
          onClick={() => setCompactOpen(false)}
          aria-hidden="true"
        />
      )}
    <div
      ref={containerRef}
      data-tour="orbis-pulse"
      className={`pointer-events-none fixed right-4 bottom-32 sm:right-6 sm:bottom-8 sm:z-[30] ${
        isCompact && compactOpen ? 'z-[42]' : 'z-[30]'
      }`}
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
              <OrbisPulsePanel stats={stats} onHighlight={onHighlight} />
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
          <OrbisPulsePanel stats={stats} onHighlight={onHighlight} />
        </div>
      )}
    </div>
    </>
  );
}
