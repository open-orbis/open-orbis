import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ nodeUid: string; seq: number } | null>(null);

  const handleFocusNode = useCallback((nodeUid: string) => {
    setFocusRequest((prev) => ({
      nodeUid,
      seq: (prev?.seq ?? 0) + 1,
    }));
  }, []);

  const personNodeId = ((data?.person?.user_id || data?.person?.orb_id) as string) || '';
  const handleChatClear = useCallback(() => {
    if (!personNodeId) return;
    handleFocusNode(personNodeId);
  }, [personNodeId, handleFocusNode]);
  const viewMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!showViewMenu) return;
    const handleOutside = (e: PointerEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setShowViewMenu(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowViewMenu(false);
    };
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showViewMenu]);

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
        <div className="rounded-xl border border-white/10 bg-black/45 backdrop-blur-md shadow-lg shadow-black/30">
          <div className="flex items-center justify-between gap-2 px-2.5 sm:px-3 py-2 min-h-[44px]">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-purple-400" />
                </div>
                <span className="text-white font-bold text-sm tracking-tight hidden sm:inline">OpenOrbis</span>
              </div>
              <div className="hidden sm:block w-px h-5 bg-white/10" />
              <div className="min-w-0">
                <span className="text-white text-xs sm:text-sm font-semibold truncate">{personName}</span>
                <span className="text-white/20 text-xs ml-2 hidden sm:inline">{data.nodes.length} nodes &middot; {data.links.length} edges</span>
              </div>
              <div className="hidden sm:block w-px h-5 bg-white/10" />
              <div className="hidden sm:block">
                <NodeTypeFilter
                  hiddenTypes={hiddenNodeTypes}
                  onShowAll={handleShowAllNodeTypes}
                  onHideAll={handleHideAllNodeTypes}
                  onSetVisible={handleSetVisibleNodeTypes}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative sm:hidden" ref={viewMenuRef}>
                <button
                  onClick={() => setShowViewMenu((v) => !v)}
                  className="h-8 leading-none flex items-center gap-1 text-xs font-medium py-1.5 px-2 rounded-lg text-white/55 hover:text-white hover:bg-white/8 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  View
                </button>
                {showViewMenu && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-neutral-950/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-semibold px-1 mb-2">View Settings</p>
                    <NodeTypeFilter
                      hiddenTypes={hiddenNodeTypes}
                      onShowAll={handleShowAllNodeTypes}
                      onHideAll={handleHideAllNodeTypes}
                      onSetVisible={handleSetVisibleNodeTypes}
                    />
                  </div>
                )}
              </div>

              <a
                href="/"
                className="h-8 leading-none flex items-center gap-1.5 text-xs sm:text-sm font-medium py-1.5 px-2 sm:px-3 rounded-lg text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-all"
              >
                Create your own Orbis
              </a>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-2.5 sm:px-3 pb-2">
          </div>
        </div>
      </div>

      {/* ── Date Range Slider ── */}
      {dateBounds && (
        <DateRangeSlider
          minDate={dateBounds.min}
          maxDate={dateBounds.max}
          filteredCount={dateFilteredNodeIds.size}
          totalCount={data.nodes.length}
        />
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
        focusNodeId={focusRequest?.nodeUid || null}
        focusNodeToken={focusRequest?.seq ?? 0}
      />

      {/* ── Chat Box (no Add / Share buttons) ── */}
      <ChatBox
        onHighlight={setHighlightedNodeIds}
        onClearResults={handleChatClear}
        highlightedNodeIds={highlightedNodeIds}
        messages={chatMessages}
        onMessagesChange={setChatMessages}
        placeholder={`Query ${personName}'s orbis...`}
        searchFn={searchFn}
        onFocusNode={handleFocusNode}
        onRecenter={() => handleFocusNode(personNodeId)}
      />
    </div>
  );
}
