import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useOrbStore } from '../stores/orbStore';
import { publicTextSearch } from '../api/orbs';
import OrbGraph3D from '../components/graph/OrbGraph3D';
import NodeTypeFilter from '../components/graph/NodeTypeFilter';
import ChatBox from '../components/chat/ChatBox';
import type { ChatMessage } from '../components/chat/ChatBox';
import DateRangeSlider from '../components/graph/DateRangeSlider';
import { useDateFilterStore, computeDateFilteredNodeIds, getNodeDates } from '../stores/dateFilterStore';

const ALL_FILTERABLE_TYPES = ['Education', 'WorkExperience', 'Certification', 'Language', 'Publication', 'Project', 'Skill', 'Patent', 'Award', 'Outreach'];

export default function SharedOrbPage() {
  const { orbId } = useParams<{ orbId: string }>();
  const [searchParams] = useSearchParams();
  const filterToken = searchParams.get('filter_token') || undefined;
  const { data, loading, error, fetchPublicOrb } = useOrbStore();
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<string>>(new Set());

  const handleShowAllNodeTypes = useCallback(() => {
    setHiddenNodeTypes(new Set());
  }, []);

  const handleHideAllNodeTypes = useCallback(() => {
    setHiddenNodeTypes(new Set(ALL_FILTERABLE_TYPES));
  }, []);

  const handleSetVisibleNodeTypes = useCallback((visibleTypes: Set<string>) => {
    setHiddenNodeTypes(new Set(ALL_FILTERABLE_TYPES.filter((t) => !visibleTypes.has(t))));
  }, []);

  // Public search bound to this orb — respects filter_token privacy
  const searchFn = useCallback(
    (query: string) => publicTextSearch(query, orbId || '', filterToken),
    [orbId, filterToken]
  );

  useEffect(() => {
    if (orbId) fetchPublicOrb(orbId, filterToken);
  }, [orbId, filterToken, fetchPublicOrb]);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { rangeStart, rangeEnd, resetRange } = useDateFilterStore();

  // Compute date bounds for the slider
  const dateBounds = useMemo(() => {
    const allDates: string[] = [];
    for (const node of data?.nodes ?? []) {
      allDates.push(...getNodeDates(node as Record<string, unknown>));
    }
    if (allDates.length === 0) return null;
    allDates.sort();
    const min = allDates[0];
    const max = allDates[allDates.length - 1];
    return min === max ? null : { min, max };
  }, [data?.nodes]);

  // Reset date filter when viewing a different orb
  useEffect(() => { resetRange(); }, [orbId, resetRange]);

  // Compute date-filtered node IDs
  const dateFilteredNodeIds = useMemo(
    () => computeDateFilteredNodeIds(
      data?.nodes ?? [],
      data?.links ?? [],
      rangeStart,
      rangeEnd,
      dateBounds?.min,
      dateBounds?.max,
    ),
    [data?.nodes, data?.links, rangeStart, rangeEnd, dateBounds],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Orbis not found</h1>
          <p className="text-gray-400">This orbis doesn't exist or is private.</p>
        </div>
      </div>
    );
  }

  const personName = data.person.name as string || orbId;

  return (
    <div className="min-h-screen bg-black relative">
      {/* ── Header ── */}
      <div className="absolute top-0 left-0 right-0 z-30 px-3 sm:px-5 py-2 sm:py-3">
        <div className="flex items-center justify-between">
          {/* Left: logo + name + view filter */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-purple-400" />
              </div>
              <span className="text-white font-bold text-sm tracking-tight hidden sm:inline">OpenOrbis</span>
            </div>
            <div className="hidden sm:block w-px h-5 bg-white/10" />
            <div>
              <span className="text-white text-xs sm:text-sm font-semibold">{personName}</span>
              <span className="text-white/20 text-xs ml-2 hidden sm:inline">{data.nodes.length} nodes &middot; {data.links.length} edges</span>
            </div>
            <div className="hidden sm:block w-px h-5 bg-white/10" />
            <NodeTypeFilter
              hiddenTypes={hiddenNodeTypes}
              onShowAll={handleShowAllNodeTypes}
              onHideAll={handleHideAllNodeTypes}
              onSetVisible={handleSetVisibleNodeTypes}
            />
          </div>

          {/* Right: CTA */}
          <a
            href="/"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-medium py-1.5 px-2 sm:px-3 rounded-lg text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-all"
          >
            Create your own Orbis
          </a>
        </div>
      </div>

      {/* ── Date Range Slider ── */}
      {dateBounds && (
        <DateRangeSlider minDate={dateBounds.min} maxDate={dateBounds.max} />
      )}

      {/* ── 3D Graph ── */}
      <OrbGraph3D
        data={data}
        onBackgroundClick={() => {
          setHighlightedNodeIds(new Set());
        }}
        highlightedNodeIds={highlightedNodeIds}
        filteredNodeIds={dateFilteredNodeIds}
        hiddenNodeTypes={hiddenNodeTypes}
        width={dimensions.width}
        height={dimensions.height}
      />

      {/* ── Chat Box (no Add / Share buttons) ── */}
      <ChatBox
        onHighlight={setHighlightedNodeIds}
        highlightedNodeIds={highlightedNodeIds}
        messages={chatMessages}
        onMessagesChange={setChatMessages}
        placeholder={`Query ${personName}'s orbis...`}
        searchFn={searchFn}
      />
    </div>
  );
}
