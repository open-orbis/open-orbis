import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../stores/authStore';
import { grantGdprConsent } from '../../api/auth';

export default function ConsentGate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (user?.gdpr_consent) {
    return <>{children}</>;
  }

  const handleConsent = async () => {
    setSubmitting(true);
    setError('');
    try {
      await grantGdprConsent();
      await fetchUser();
    } catch {
      setError('Failed to save consent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-white text-xl font-semibold">Before we start</h2>
          <p className="text-white/30 text-sm mt-2">
            We need your consent to process and store your personal data.
          </p>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 focus:ring-1"
            />
            <span className="text-white/60 text-sm leading-relaxed">
              I consent to OpenOrbis processing and storing my personal data as described in the{' '}
              <a href="/privacy" target="_blank" className="text-purple-400 hover:text-purple-300 underline">
                Privacy Policy
              </a>.
            </span>
          </label>
        </div>

        {error && <p className="text-red-400 text-sm text-center mt-3">{error}</p>}

        <button
          onClick={handleConsent}
          disabled={!checked || submitting}
          className="w-full mt-5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white font-semibold py-3 rounded-xl transition-all text-base"
        >
          {submitting ? 'Saving...' : 'Continue'}
        </button>
      </motion.div>
    </div>
  );
}
