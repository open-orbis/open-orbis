// Gift invitation surface on /myorbis (#385).
//
// Each activated user gets a lifetime quota of 3 invite codes to share with
// friends. On desktop the trigger is a bottom-left pill showing the remaining
// count ("3/3", "2/3", ...). On mobile — where that pill would overlap the
// ChatBox search bar — the trigger collapses to a compact circular icon
// rendered inside the chat bar, level with the other action circles.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getMyInvites,
  generateMyInvite,
  type GiftInvitesState,
  type GiftInvite,
} from '../api/auth';
import { useToastStore } from '../stores/toastStore';

function GiftIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 12v9H4v-9" />
      <path d="M2 7h20v5H2z" />
      <path d="M12 22V7" />
      <path d="M12 7a4 4 0 01-4-4 2 2 0 014 0 2 2 0 014 0 4 4 0 01-4 4z" />
    </svg>
  );
}

interface GiftInviteController {
  state: GiftInvitesState | null;
  loading: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  generating: boolean;
  copiedCode: string | null;
  handleGenerate: () => Promise<void>;
  handleCopy: (code: string) => Promise<void>;
}

const GiftInviteContext = createContext<GiftInviteController | null>(null);

function useGiftInviteController(): GiftInviteController {
  const [state, setState] = useState<GiftInvitesState | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  const refresh = useCallback(async () => {
    try {
      const data = await getMyInvites();
      setState(data);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    refresh();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, refresh]);

  const handleGenerate = useCallback(async () => {
    if (!state) return;
    if (state.total_issued >= state.quota) return;
    setGenerating(true);
    try {
      await generateMyInvite();
      await refresh();
    } catch {
      addToast('Could not generate invite, try again', 'error');
    } finally {
      setGenerating(false);
    }
  }, [state, refresh, addToast]);

  const handleCopy = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      addToast('Invite code copied', 'success');
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1800);
    } catch {
      addToast('Copy failed', 'error');
    }
  }, [addToast]);

  return useMemo(
    () => ({ state, loading, open, setOpen, generating, copiedCode, handleGenerate, handleCopy }),
    [state, loading, open, generating, copiedCode, handleGenerate, handleCopy],
  );
}

function useGiftInvite(): GiftInviteController | null {
  return useContext(GiftInviteContext);
}

export function GiftInviteProvider({ children }: { children: ReactNode }) {
  const controller = useGiftInviteController();
  return (
    <GiftInviteContext.Provider value={controller}>
      {children}
      <GiftInviteModal />
    </GiftInviteContext.Provider>
  );
}

export default function GiftInviteButton() {
  const ctrl = useGiftInvite();
  if (!ctrl || ctrl.loading || !ctrl.state) return null;
  const { remaining, quota } = ctrl.state;
  return (
    <button
      type="button"
      onClick={() => ctrl.setOpen(true)}
      aria-label={`Gift Invitation ${remaining} of ${quota} remaining`}
      className="hidden sm:inline-flex fixed bottom-4 left-4 z-[45] items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-red-900/40 border border-red-400/50 bg-gradient-to-br from-rose-500 via-red-600 to-red-700 hover:brightness-110 transition-all cursor-pointer"
    >
      <GiftIcon className="w-4 h-4" />
      <span>Gift Invitation</span>
      <span className="inline-flex items-center justify-center rounded-full bg-white/20 border border-white/30 px-1.5 text-[10px] font-bold leading-none py-0.5">
        {remaining}/{quota}
      </span>
    </button>
  );
}

export function GiftInviteIconButton() {
  const ctrl = useGiftInvite();
  if (!ctrl || ctrl.loading || !ctrl.state) return null;
  const { remaining, quota } = ctrl.state;
  return (
    <button
      type="button"
      onClick={() => ctrl.setOpen(true)}
      aria-label={`Gift Invitation ${remaining} of ${quota} remaining`}
      title={`Gift Invitation · ${remaining}/${quota}`}
      className="w-8 h-8 rounded-full flex items-center justify-center border border-red-400/50 text-white shadow-lg shadow-red-900/40 bg-gradient-to-br from-rose-500 via-red-600 to-red-700 hover:brightness-110 transition-all flex-shrink-0 cursor-pointer"
    >
      <GiftIcon className="w-4 h-4" />
    </button>
  );
}

function GiftInviteModal() {
  const ctrl = useGiftInvite();
  if (!ctrl || !ctrl.state) return null;
  const { state, open, setOpen, generating, copiedCode, handleGenerate, handleCopy } = ctrl;
  const { remaining, quota } = state;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-2 sm:p-4"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 24 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative w-full max-w-md bg-neutral-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gift-invite-title"
          >
            <div className="px-5 pt-5 pb-3 border-b border-white/5">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center shrink-0 shadow-lg shadow-red-900/40">
                  <GiftIcon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 id="gift-invite-title" className="text-white text-base font-semibold leading-tight">
                    Invite friends to OpenOrbis
                  </h2>
                  <p className="text-white/50 text-xs mt-1 leading-relaxed">
                    You can invite up to <strong className="text-white/80">{quota}</strong> friends. Generate a code, copy the activation link, and share it — the counter decrements as friends join.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="-mr-1 -mt-1 h-8 w-8 rounded-lg text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.15em] text-white/40 font-semibold">Your codes</span>
                <span className="text-[11px] text-white/50">
                  {remaining} / {quota} remaining
                </span>
              </div>

              {state.codes.length === 0 ? (
                <p className="text-white/40 text-sm italic text-center py-3">
                  No codes yet — generate your first one below.
                </p>
              ) : (
                <ul className="space-y-2">
                  {state.codes.map((c) => (
                    <CodeRow
                      key={c.code}
                      code={c}
                      onCopy={handleCopy}
                      copied={copiedCode === c.code}
                    />
                  ))}
                </ul>
              )}

              {state.total_issued < state.quota && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white bg-gradient-to-br from-rose-500 via-red-600 to-red-700 hover:brightness-110 disabled:opacity-60 disabled:cursor-wait border border-red-400/50 shadow-lg shadow-red-900/30 transition-all cursor-pointer"
                >
                  <GiftIcon className="w-4 h-4" />
                  {generating ? 'Generating…' : `Generate new code (${state.quota - state.total_issued} left)`}
                </button>
              )}
              {state.total_issued >= state.quota && remaining > 0 && (
                <p className="text-[11px] text-white/40 text-center">
                  All {quota} codes issued. Share the ones above.
                </p>
              )}
              {remaining === 0 && state.total_issued >= state.quota && (
                <p className="text-[11px] text-emerald-300/80 text-center">
                  All your friends joined — thanks for bringing them on board.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function CodeRow({
  code,
  onCopy,
  copied,
}: {
  code: GiftInvite;
  onCopy: (code: string) => void;
  copied: boolean;
}) {
  const consumed = !!code.used_at;
  return (
    <li
      className={`rounded-xl border px-3 py-2.5 flex flex-col gap-2 ${
        consumed
          ? 'border-white/5 bg-white/[0.02] opacity-70'
          : 'border-red-500/30 bg-red-500/[0.06]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide font-semibold">
          {consumed ? (
            <span className="text-emerald-300/80">Redeemed</span>
          ) : (
            <span className="text-red-300/90">Active</span>
          )}
        </span>
        {consumed && code.used_by && (
          <span className="text-[10px] text-white/40 truncate">Joined by {code.used_by}</span>
        )}
      </div>
      {!consumed && (
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={code.code}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Activation code"
            className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white font-mono tracking-[0.08em]"
          />
          <button
            type="button"
            onClick={() => onCopy(code.code)}
            className="shrink-0 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white text-[11px] font-semibold py-1.5 px-3 transition-colors cursor-pointer"
          >
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>
      )}
      {consumed && (
        <code className="text-xs font-mono text-white/40 tracking-[0.08em]">{code.code}</code>
      )}
    </li>
  );
}
