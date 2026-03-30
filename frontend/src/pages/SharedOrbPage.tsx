import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useOrbStore } from '../stores/orbStore';
import { publicTextSearch } from '../api/orbs';
import OrbGraph3D from '../components/graph/OrbGraph3D';
import ChatBox from '../components/chat/ChatBox';
import type { ChatMessage } from '../components/chat/ChatBox';

export default function SharedOrbPage() {
  const { orbId } = useParams<{ orbId: string }>();
  const [searchParams] = useSearchParams();
  const filterToken = searchParams.get('filter_token') || undefined;
  const { data, loading, error, fetchPublicOrb } = useOrbStore();
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());

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
          <h1 className="text-2xl font-bold mb-2">Orb not found</h1>
          <p className="text-gray-400">This orb doesn't exist or is private.</p>
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
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
              <span className="text-purple-300 text-xs font-bold">
                {personName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <span className="text-white text-xs sm:text-sm font-semibold">{personName}</span>
              <span className="text-white/20 text-xs ml-2 hidden sm:inline">{data.nodes.length} nodes</span>
            </div>
          </div>

          <a
            href="/"
            className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
          >
            Create your own Orb
          </a>
        </div>
      </div>

      {/* ── 3D Graph ── */}
      <OrbGraph3D
        data={data}
        onBackgroundClick={() => {
          if (chatMessages.length > 0) {
            setChatMessages([]);
            setHighlightedNodeIds(new Set());
          }
        }}
        highlightedNodeIds={highlightedNodeIds}
        width={dimensions.width}
        height={dimensions.height}
      />

      {/* ── Chat Box (no Add / Share buttons) ── */}
      <ChatBox
        onHighlight={setHighlightedNodeIds}
        messages={chatMessages}
        onMessagesChange={setChatMessages}
        placeholder={`Query ${personName}'s orb...`}
        searchFn={searchFn}
      />
    </div>
  );
}
