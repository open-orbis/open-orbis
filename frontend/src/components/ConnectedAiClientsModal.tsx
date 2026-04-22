import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listGrants, revokeGrant, type OAuthGrant } from '../api/oauth';
import { useToastStore } from '../stores/toastStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ConnectedAiClientsModal({ open, onClose }: Props) {
  const [grants, setGrants] = useState<OAuthGrant[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const { addToast } = useToastStore();

  useEffect(() => {
    if (!open) return;
    setGrants(null);
    setErr(null);
    listGrants()
      .then((r) => setGrants(r.grants))
      .catch((e) => setErr(e?.response?.data?.detail ?? 'Failed to load grants'));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  async function onRevoke(clientId: string, clientName: string) {
    setRevoking(clientId);
    try {
      await revokeGrant(clientId);
      setGrants((gs) => (gs ?? []).filter((g) => g.client_id !== clientId));
      addToast(`Revoked ${clientName}`, 'success');
    } catch {
      addToast(`Failed to revoke ${clientName}`, 'error');
    } finally {
      setRevoking(null);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Connected AI clients"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative bg-gray-950 border border-white/10 rounded-2xl p-5 sm:p-6 w-[92vw] max-w-lg mx-2 sm:mx-4 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="min-w-0">
                <h2 className="text-white font-semibold text-base">
                  Connected AI clients
                </h2>
                <p className="text-white/50 text-xs mt-1">
                  AI agents that can read your Orbis data via OAuth.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-white/30 hover:text-white/70 transition-colors shrink-0 ml-3"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {err && <p className="text-red-400 text-sm py-3">{err}</p>}
            {!err && grants === null && (
              <p className="text-gray-400 text-sm py-3">Loading…</p>
            )}
            {!err && grants !== null && grants.length === 0 && (
              <p className="text-gray-500 text-sm py-3">Nothing connected yet.</p>
            )}
            {!err && grants !== null && grants.length > 0 && (
              <ul className="space-y-3">
                {grants.map((g) => (
                  <li
                    key={`${g.client_id}:${g.share_token_id ?? ''}`}
                    className="border border-gray-700 rounded-lg p-3 bg-gray-900/60"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-medium truncate">{g.client_name}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {g.share_token_id
                            ? `Restricted: ${g.share_token_label ?? g.share_token_id.slice(0, 8)}`
                            : 'Full access'}
                          {' · Connected '}
                          {new Date(g.connected_at).toLocaleDateString()}
                          {g.last_used_at
                            ? ` · Last used ${new Date(g.last_used_at).toLocaleString()}`
                            : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={revoking === g.client_id}
                        onClick={() => onRevoke(g.client_id, g.client_name)}
                        className="h-7 px-3 rounded border border-red-500/50 text-red-300 text-xs disabled:opacity-50"
                      >
                        {revoking === g.client_id ? 'Revoking…' : 'Revoke'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
