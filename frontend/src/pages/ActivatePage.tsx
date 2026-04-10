import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { activateAccount, getMe } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import { hasOrbContent } from '../api/orbs';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_access_code: 'Codice di invito non valido. Controlla e riprova.',
  code_already_used: 'Questo codice di invito è già stato utilizzato. Ogni codice può essere usato una sola volta.',
};

const POLL_INTERVAL = 5000;

export default function ActivatePage() {
  const navigate = useNavigate();
  const { user, fetchUser, logout } = useAuthStore();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
        setError(ERROR_MESSAGES[detail] ?? 'Codice non valido.');
      } else {
        setError('Qualcosa è andato storto. Riprova.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
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
          Benvenuto{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
        </h1>
        <p className="text-white/40 text-sm mb-8 leading-relaxed">
          OpenOrbis è attualmente in <span className="text-purple-400 font-medium">beta chiusa</span>.
          <br />
          Inserisci il tuo codice di invito per accedere alla piattaforma.
        </p>

        {/* Code input */}
        <div className="flex flex-col gap-3 mb-6">
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="Inserisci il codice di invito"
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
            {submitting ? 'Verifica in corso...' : 'Attiva il mio account'}
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

        {/* Waitlist info */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-5 py-4 mb-4 text-left">
          <p className="text-white/50 text-xs leading-relaxed">
            Non hai un codice? Nessun problema — registrandoti sei stato aggiunto alla nostra waiting list. Ti contatteremo non appena il tuo accesso sarà abilitato.
          </p>
        </div>

        {/* Logout link */}
        <button
          onClick={handleLogout}
          className="text-white/25 text-xs hover:text-white/40 transition-colors underline underline-offset-2"
        >
          Esci e torna alla home
        </button>
      </motion.div>
    </div>
  );
}
