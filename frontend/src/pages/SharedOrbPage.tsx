import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useOrbStore } from '../stores/orbStore';
import { publicTextSearch, requestAccess, getMyConnectionRequest } from '../api/orbs';
import OrbGraph3D from '../components/graph/OrbGraph3D';
import NodeTypeFilter from '../components/graph/NodeTypeFilter';
import ChatBox from '../components/chat/ChatBox';
import type { ChatMessage } from '../components/chat/ChatBox';
import DateRangeSlider from '../components/graph/DateRangeSlider';
import OrbisStatsOverlay from '../components/graph/OrbisStatsOverlay';
import { useDateFilterStore, computeDateFilteredNodeIds, getNodeDates } from '../stores/dateFilterStore';

const ALL_FILTERABLE_TYPES = ['Education', 'WorkExperience', 'Certification', 'Language', 'Publication', 'Project', 'Skill', 'Patent', 'Award', 'Outreach', 'Training'];

export default function SharedOrbPage() {
  const { orbId } = useParams<{ orbId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { user } = useAuthStore();
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

  const [initialFetchDone, setInitialFetchDone] = useState(false);

  const isNoAccess = !!error && error.toLowerCase().includes("don't have access");
  const [requestPending, setRequestPending] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestChecked, setRequestChecked] = useState(false);

  const handleNodeClick = useCallback((node: Record<string, unknown>) => {
    const url = (node.url || node.company_url || node.credential_url || node.doi) as string | undefined;
    if (url) {
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  }, []);

  // Search bound to this orb — token for public, Bearer auth for restricted
  const searchFn = useCallback(
    (query: string) => publicTextSearch(query, orbId || '', token || undefined),
    [orbId, token]
  );

  useEffect(() => {
    if (orbId) {
      setInitialFetchDone(false);
      fetchPublicOrb(orbId, token).finally(() => setInitialFetchDone(true));
    }
  }, [orbId, token, fetchPublicOrb]);

  // 401 → not logged in but the orb is restricted. Save return-to and bounce to landing.
  const isUnauthorizedError = !!error && (
    error.includes('401') || error.toLowerCase().includes('authentication required')
  );
  useEffect(() => {
    if (!isUnauthorizedError || !orbId) return;
    if (!user) {
      sessionStorage.setItem('orbis_return_to', window.location.pathname + window.location.search);
      navigate('/', { replace: true });
    }
  }, [isUnauthorizedError, orbId, user, navigate]);

  useEffect(() => {
    if (!isNoAccess || !user || !orbId || requestChecked) return;
    getMyConnectionRequest(orbId).then((req) => {
      if (req) setRequestPending(true);
      setRequestChecked(true);
    });
  }, [isNoAccess, user, orbId, requestChecked]);

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

  // Show spinner while the initial fetch is in flight (avoids a catchall flash on first render)
  if (loading || !initialFetchDone) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 401 → redirect-in-progress: render nothing instead of flashing the catchall
  if (isUnauthorizedError && !user) {
    return null;
  }

  if (error || !data) {
    const isPrivate = error?.toLowerCase().includes('private');
    const isForbidden = !isPrivate && !isNoAccess && (error?.includes('403') || error?.includes('share token'));
    let title: string;
    let message: string;
    if (isPrivate) {
      title = 'This Orbis is Private';
      message = 'The owner has restricted access to their orbis.';
    } else if (isNoAccess) {
      title = "You don't have access";
      message = "The owner hasn't granted you access to this orbis. Ask them to invite your email.";
    } else if (isForbidden) {
      title = 'Link Expired or Revoked';
      message = 'This share link is no longer valid. Ask the owner for a new link.';
    } else if (isUnauthorizedError) {
      title = 'Sign in required';
      message = 'You need to sign in to view this orbis.';
    } else {
      title = 'Orbis not found';
      message = "This orbis doesn't exist or is private.";
    }
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{title}</h1>
          <p className="text-gray-400 mb-6">{message}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => navigate(user ? '/myorbis' : '/')}
              className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
            >
              {user ? 'Back to My Orbis' : 'Go to Home'}
            </button>
            {isNoAccess && user && (
              <button
                onClick={async () => {
                  if (!orbId || requestPending || requestSubmitting) return;
                  setRequestSubmitting(true);
                  try {
                    await requestAccess(orbId);
                    setRequestPending(true);
                  } catch {
                    // Already pending or failed
                  } finally {
                    setRequestSubmitting(false);
                  }
                }}
                disabled={requestPending || requestSubmitting}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  requestPending
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                {requestSubmitting ? 'Sending...' : requestPending ? 'Request Pending' : 'Request Access'}
              </button>
            )}
          </div>
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

              <button
                onClick={() => navigate(user ? '/myorbis' : '/')}
                className="h-8 leading-none flex items-center gap-1.5 text-xs sm:text-sm font-medium py-1.5 px-2 sm:px-3 rounded-lg text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-all"
              >
                {user ? 'Go to your Orbis' : 'Create your own Orbis'}
              </button>
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
        onNodeClick={handleNodeClick}
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

      <OrbisStatsOverlay
        data={data}
        filteredNodeIds={dateFilteredNodeIds}
        hiddenNodeTypes={hiddenNodeTypes}
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
