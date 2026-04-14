import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { activateAccount, deleteAccount, getMe } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import { hasOrbContent } from '../api/orbs';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_access_code: 'Invalid invite code. Please check and try again.',
};

const POLL_INTERVAL = 5000;

export default function ActivatePage() {
  const navigate = useNavigate();
  const { user, fetchUser, logout } = useAuthStore();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountRemovalError, setAccountRemovalError] = useState<string | null>(null);
  const navigatingRef = useRef(false);

  const goToApp = useCallback(async () => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    await fetchUser();
    const hasContent = await hasOrbContent();
    navigate(hasContent ? '/myorbis' : '/create', { replace: true });
  }, [navigate, fetchUser]);

  // Silent poll: check activation status without touching store/UI
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const me = await getMe();
        if (me.activated) goToApp();
      } catch {
        // ignore — network blips shouldn't break the page
      }
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [goToApp]);

  const handleSubmit = async () => {
    if (!code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await activateAccount(code.trim());
      await goToApp();
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 403) {
        const detail = e.response.data?.detail;
        setError(ERROR_MESSAGES[detail] ?? 'Invalid code.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  const handleRemoveWaitlistAndDelete = async () => {
    if (deletingAccount) return;
    setAccountRemovalError(null);
    setDeletingAccount(true);
    try {
      await deleteAccount();
      await logout();
      navigate('/', { replace: true });
    } catch {
      setAccountRemovalError('Could not remove your account right now. Please try again.');
      setDeletingAccount(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
      {/* Background glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[500px] rounded-full bg-purple-600/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-md w-full text-center"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
            <div className="w-3.5 h-3.5 rounded-full bg-purple-400" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">OpenOrbis</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold mb-3">
          Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
        </h1>
        <p className="text-white/40 text-sm mb-8 leading-relaxed">
          OpenOrbis is currently in <span className="text-purple-400 font-medium">closed beta</span>.
          <br />
          Enter your invite code to access the platform.
        </p>

        {/* Code input */}
        <div className="flex flex-col gap-3 mb-6">
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="Enter your invite code"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            className="bg-white/[0.04] border border-white/[0.08] focus:border-purple-500/40 text-white text-sm rounded-xl px-4 py-3 outline-none transition-colors placeholder:text-white/20 text-center font-mono tracking-wider"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !code.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold py-3 px-6 rounded-xl transition-all text-sm"
          >
            {submitting ? 'Verifying...' : 'Activate my account'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-amber-300/90 text-xs leading-relaxed bg-amber-500/5 border border-amber-500/15 rounded-lg px-4 py-3 mb-6"
          >
            {error}
          </motion.div>
        )}

        {/* Waitlist status */}
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-transparent px-5 py-5 mb-5 text-left backdrop-blur-sm">
          <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_45%)]" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              <span className="text-[10px] font-semibold tracking-[0.14em] text-white/65">WAITLIST</span>
            </div>

            <p className="text-white/70 text-sm leading-relaxed mb-4">
              You&apos;ve been automatically added to the waiting list. We&apos;ll notify you when your account is activated.
            </p>

            <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-500/12 px-3.5 py-2.5">
              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              <span className="text-emerald-100 text-sm font-medium">You&apos;re on the waiting list</span>
            </div>

            <button
              type="button"
              onClick={handleRemoveWaitlistAndDelete}
              disabled={deletingAccount}
              className="w-full mt-4 flex items-center justify-center rounded-xl border border-red-300/35 bg-gradient-to-r from-red-500/90 to-orange-500/90 hover:from-red-400 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-red-50 text-sm font-semibold px-5 py-2.5 shadow-[0_10px_28px_-14px_rgba(248,113,113,0.9)] transition-all"
            >
              {deletingAccount ? 'Removing and deleting...' : 'Remove from waitlist and delete my account'}
            </button>

            {accountRemovalError && (
              <p className="text-amber-300/90 text-xs mt-3">{accountRemovalError}</p>
            )}
          </div>
        </div>

        {/* Logout link */}
        <button
          onClick={handleLogout}
          className="text-white/25 text-xs hover:text-white/40 transition-colors underline underline-offset-2"
        >
          Log out and return to home
        </button>
      </motion.div>
    </div>
  );
}
