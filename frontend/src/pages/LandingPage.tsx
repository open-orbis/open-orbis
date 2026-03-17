import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import HeroOrb from '../components/landing/HeroOrb';

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, loginDev, loading } = useAuthStore();

  const handleGetStarted = async () => {
    await loginDev();
    navigate('/create');
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[500px] rounded-full bg-purple-600/10 blur-[120px]" />
      </div>

      {/* 3D Orb */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        className="relative z-10 mb-8"
      >
        <HeroOrb />
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className="text-6xl font-bold mb-4 z-10 tracking-tight"
      >
        Orbis
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.8 }}
        className="text-gray-400 text-lg mb-12 z-10 max-w-md text-center"
      >
        Your CV as a living knowledge graph. Create once, share everywhere.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.8 }}
        className="flex gap-4 z-10"
      >
        {user ? (
          <button
            onClick={() => navigate('/orb')}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors shadow-lg shadow-purple-600/25"
          >
            View My Orb
          </button>
        ) : (
          <>
            <button
              onClick={() => navigate('/about')}
              className="border border-gray-600 hover:border-gray-400 text-gray-300 font-medium py-3 px-8 rounded-lg transition-colors"
            >
              What is an Orb?
            </button>
            <button
              onClick={handleGetStarted}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 px-8 rounded-lg transition-colors shadow-lg shadow-purple-600/25"
            >
              {loading ? 'Signing in...' : 'Create Your Orb'}
            </button>
          </>
        )}
      </motion.div>

      {/* Why section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 1 }}
        className="absolute bottom-12 z-10 text-center"
      >
        <p className="text-gray-500 text-sm max-w-lg">
          Stop wasting time picking templates and rewriting your CV. Create your graph once and share it with anyone — humans, AI agents, and recruiters.
        </p>
      </motion.div>
    </div>
  );
}
