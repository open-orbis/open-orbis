import { useState, useEffect, useRef, useCallback } from 'react';
import {
  listConnectionRequests,
  acceptConnectionRequest,
  rejectConnectionRequest,
} from '../../api/orbs';
import type { ConnectionRequest } from '../../api/orbs';
import { useToastStore } from '../../stores/toastStore';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface PendingConnectionsDropdownProps {
  label?: string;
  fullWidth?: boolean;
}

export default function PendingConnectionsDropdown({ label = 'Connections', fullWidth = false }: PendingConnectionsDropdownProps = {}) {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptKeywords, setAcceptKeywords] = useState('');
  const [acceptHiddenTypes, setAcceptHiddenTypes] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const addToast = useToastStore((s) => s.addToast);

  const fetchRequests = useCallback(() => {
    setLoading(true);
    listConnectionRequests()
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch on mount and when dropdown opens
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (open) fetchRequests();
  }, [open, fetchRequests]);

  // Close on outside click or ESC
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleAccept = async (requestId: string) => {
    const kw = acceptKeywords.split(',').map(k => k.trim()).filter(Boolean);
    const ht = acceptHiddenTypes.split(',').map(t => t.trim()).filter(Boolean);
    try {
      await acceptConnectionRequest(requestId, { keywords: kw, hidden_node_types: ht });
      setRequests(prev => prev.filter(r => r.request_id !== requestId));
      setAcceptingId(null);
      setAcceptKeywords('');
      setAcceptHiddenTypes('');
      addToast('Access granted', 'success');
    } catch {
      addToast('Failed to accept request', 'error');
    }
  };

  const handleReject = async (requestId: string) => {
    setRejectingId(requestId);
    try {
      await rejectConnectionRequest(requestId);
      setRequests(prev => prev.filter(r => r.request_id !== requestId));
      addToast('Request rejected', 'success');
    } catch {
      addToast('Failed to reject request', 'error');
    } finally {
      setRejectingId(null);
    }
  };

  return (
    <div ref={containerRef} className={fullWidth ? 'relative w-full' : 'relative'}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`${fullWidth ? 'w-full justify-center' : ''} h-8 leading-none flex items-center gap-1.5 text-xs font-medium py-1.5 px-2.5 rounded-lg transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${
          open
            ? 'bg-emerald-500/15 border border-emerald-400/50 text-white'
            : 'border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
        <span>{label}</span>
        {requests.length > 0 && (
          <span className="bg-emerald-500 text-white text-[10px] font-bold leading-none w-4 h-4 rounded-full flex items-center justify-center">
            {requests.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-80 sm:w-96 bg-neutral-950/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-xs text-emerald-300 uppercase tracking-[0.12em] font-semibold">Pending Connections</h3>
              <span className="text-[11px] text-white/40">{requests.length} pending</span>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && requests.length === 0 && (
              <p className="text-[11px] text-gray-500 text-center py-6">Loading requests...</p>
            )}
            {!loading && requests.length === 0 && (
              <p className="text-[11px] text-gray-500 text-center py-6">No pending requests</p>
            )}
            <div className="p-2 space-y-2">
              {requests.map((req) => (
                <div key={req.request_id} className="border border-white/8 rounded-lg px-3 py-2.5 bg-white/[0.03] space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{req.requester_name || req.requester_email}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{req.requester_email}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{formatDate(req.created_at)}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setAcceptingId(acceptingId === req.request_id ? null : req.request_id);
                          setAcceptKeywords('');
                          setAcceptHiddenTypes('');
                        }}
                        className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(req.request_id)}
                        disabled={rejectingId === req.request_id}
                        className="h-7 px-2.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50 text-[11px] font-medium transition-colors"
                      >
                        {rejectingId === req.request_id ? '...' : 'Reject'}
                      </button>
                    </div>
                  </div>

                  {acceptingId === req.request_id && (
                    <div className="rounded-lg border border-white/8 bg-black/30 p-2.5 space-y-2">
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase tracking-wide">Filtered Keywords (comma separated)</label>
                        <input
                          type="text"
                          value={acceptKeywords}
                          onChange={(e) => setAcceptKeywords(e.target.value)}
                          placeholder="python, machine learning"
                          className="mt-1 w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase tracking-wide">Hidden Node Types (comma separated)</label>
                        <input
                          type="text"
                          value={acceptHiddenTypes}
                          onChange={(e) => setAcceptHiddenTypes(e.target.value)}
                          placeholder="Skill, Project"
                          className="mt-1 w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAccept(req.request_id)}
                          className="h-7 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium transition-colors"
                        >
                          Confirm &amp; Grant
                        </button>
                        <button
                          type="button"
                          onClick={() => setAcceptingId(null)}
                          className="h-7 px-3 rounded-lg border border-white/15 text-white/60 hover:bg-white/10 text-[11px] font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
