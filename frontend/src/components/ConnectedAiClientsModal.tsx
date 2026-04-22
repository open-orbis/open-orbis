import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listGrants, revokeGrant, type OAuthGrant } from '../api/oauth';
import { useToastStore } from '../stores/toastStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

const MCP_URL = import.meta.env.VITE_MCP_URL ?? 'http://localhost:8081/mcp';

export default function ConnectedAiClientsModal({ open, onClose }: Props) {
  const [grants, setGrants] = useState<OAuthGrant[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { addToast } = useToastStore();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  async function copyEndpoint() {
    await navigator.clipboard.writeText(MCP_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

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
    closeRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
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
            ref={dialogRef}
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
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-white/30 hover:text-white/70 transition-colors shrink-0 ml-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 rounded"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-5 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300/70 font-semibold mb-1.5">
                Connect a new AI
              </p>
              <p className="text-white/60 text-xs mb-2.5 leading-relaxed">
                Paste this URL into your AI client's MCP / Connector settings
                (ChatGPT, Cursor, Claude Code, Cline, Windsurf). The client will
                walk you through a one-time consent prompt.
              </p>
              <div className="flex items-center gap-2">
                <code
                  data-testid="mcp-endpoint-url"
                  className="flex-1 min-w-0 truncate bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-cyan-200 text-[11px] font-mono"
                >
                  {MCP_URL}
                </code>
                <button
                  type="button"
                  onClick={copyEndpoint}
                  className="shrink-0 h-7 px-3 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold transition-colors flex items-center gap-1"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <p className="text-[10px] uppercase tracking-[0.14em] text-white/30 font-semibold mb-2">
              Already connected
            </p>

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
