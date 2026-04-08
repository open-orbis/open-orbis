import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '../stores/authStore';
import { hasOrbContent } from '../api/orbs';
import HeroOrb from '../components/landing/HeroOrb';
import Footer from '../components/landing/Footer';

// ── LinkedIn OAuth helpers ──
function generateState() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

function redirectToLinkedIn() {
  const state = generateState();
  sessionStorage.setItem('linkedin_oauth_state', state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: import.meta.env.VITE_LINKEDIN_CLIENT_ID,
    redirect_uri: `${window.location.origin}/auth/linkedin/callback`,
    scope: 'openid profile email',
    state,
  });
  window.location.href = `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

// ── Animated section wrapper ──
function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Step card ──
function StepCard({ number, title, description, icon }: { number: string; title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center max-w-xs">
      <div className="w-14 h-14 rounded-2xl bg-purple-600/15 border border-purple-500/20 flex items-center justify-center mb-4">
        {icon}
      </div>
      <div className="text-purple-400/60 text-xs font-bold uppercase tracking-widest mb-2">{number}</div>
      <h3 className="text-white text-lg font-semibold mb-2">{title}</h3>
      <p className="text-white/40 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

// ── Feature card ──
function FeatureCard({ title, description, icon, color }: { title: string; description: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 sm:p-6 hover:border-white/10 hover:bg-white/[0.05] transition-all group h-full flex flex-col">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}25` }}>
        {icon}
      </div>
      <h3 className="text-white text-base font-semibold mb-2">{title}</h3>
      <p className="text-white/35 text-sm leading-relaxed flex-1">{description}</p>
    </div>
  );
}

// ── Sign-in buttons ──
function SignInButtons({ onGoogleLogin, signingInProvider, disabled }: { onGoogleLogin: () => void; signingInProvider: 'google' | 'linkedin' | null; disabled?: boolean }) {
  const busy = signingInProvider !== null || disabled;
  return (
    <div className="flex flex-col gap-3 w-full max-w-xs">
      <button
        onClick={onGoogleLogin}
        disabled={busy}
        className="flex items-center justify-center gap-3 bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-700 font-medium py-3 px-6 rounded-xl transition-all shadow-lg text-sm w-full cursor-pointer"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {signingInProvider === 'google' ? 'Signing in...' : 'Sign in with Google'}
      </button>
      <button
        onClick={() => { if (!busy) redirectToLinkedIn(); }}
        disabled={busy}
        className="flex items-center justify-center gap-3 bg-[#0A66C2] hover:bg-[#004182] disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-lg text-sm w-full cursor-pointer"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
        {signingInProvider === 'linkedin' ? 'Signing in...' : 'Sign in with LinkedIn'}
      </button>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, loginGoogle, loading } = useAuthStore();

  const [signingInProvider, setSigningInProvider] = useState<'google' | 'linkedin' | null>(null);

  const handleGoogleLogin = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async (response) => {
      setSigningInProvider('google');
      try {
        await loginGoogle(response.code);
        const hasContent = await hasOrbContent();
        navigate(hasContent ? '/myorbis' : '/create');
      } catch {
        setSigningInProvider(null);
      }
    },
    onError: () => setSigningInProvider(null),
  });

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* ── Header ── */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-black"
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-purple-400" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">OpenOrbis</span>
          </div>
          {user && !signingInProvider ? (
            <button
              onClick={() => navigate('/myorbis')}
              className="text-sm text-purple-400 hover:text-purple-300 font-medium transition-colors"
            >
              Go to My Orbis &rarr;
            </button>
          ) : null}
        </div>
      </motion.header>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6">
        {/* Background glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] rounded-full bg-purple-600/8 blur-[150px]" />
        </div>

        {/* 3D Orb */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="relative z-10 mb-6"
        >
          <HeroOrb />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="text-5xl sm:text-7xl font-bold mb-5 z-10 tracking-tight text-center"
        >
          Your CV,{' '}
          <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
            reimagined
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="text-white/40 text-lg sm:text-xl mb-10 z-10 max-w-lg text-center leading-relaxed"
        >
          Your career as a knowledge graph.<br />
          Reimagined for the AI era.
        </motion.p>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="text-sm mb-8 z-10 font-medium tracking-wide"
        >
          <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
            No more templates. No more formatting. Just your Orbis.
          </span>
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.8 }}
          className="flex flex-col items-center gap-3 z-10"
        >
          {user && !signingInProvider ? (
            <>
              <button
                onClick={() => navigate('/myorbis')}
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3.5 px-8 rounded-xl transition-all shadow-xl shadow-purple-600/20 hover:shadow-purple-500/30 hover:scale-[1.02] text-base"
              >
                View My Orbis
              </button>
              <div className="flex items-center gap-2 px-4">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-white/30 text-sm">Welcome back, {user.name?.split(' ')[0]}</span>
              </div>
            </>
          ) : (
            <SignInButtons onGoogleLogin={handleGoogleLogin} signingInProvider={signingInProvider} disabled={loading} />
          )}
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="absolute bottom-8 z-10"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="text-amber-400/60"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </motion.div>
        </motion.div>
      </section>

      {/* ── What makes OpenOrbis different ── */}
      <section id="orbis-difference" className="py-16 sm:py-28 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <FadeIn className="text-center mb-16">
            <p className="text-purple-400/60 text-xs font-bold uppercase tracking-widest mb-3">The OpenOrbis difference</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Your career, one single source of truth</h2>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FadeIn delay={0.1}>
              <FeatureCard
                title="One graph, zero templates"
                description="Stop choosing templates and reformatting for every application. Build your knowledge graph once — export it as a PDF, embed it in your website, or just share the link. It adapts to every context."
                color="#f59e0b"
                icon={
                  <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                  </svg>
                }
              />
            </FadeIn>
            <FadeIn delay={0.2}>
              <FeatureCard
                title="Portable & machine-readable"
                description="Your orbis has a unique URL and QR code. Pass it to any LLM, embed it in your portfolio, or add it to your email signature. Humans see a 3D graph — AI agents get perfectly structured data via MCP."
                color="#14b8a6"
                icon={
                  <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                }
              />
            </FadeIn>
            <FadeIn delay={0.3}>
              <FeatureCard
                title="Always up to date"
                description="Update your orbis in one place. Every generated CV, shared link, and agent query reflects the latest version instantly. No more outdated PDFs floating around."
                color="#6366f1"
                icon={
                  <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                }
              />
            </FadeIn>
            <FadeIn delay={0.4}>
              <FeatureCard
                title="You control access"
                description="Your data is encrypted end-to-end. Decide what each recruiter or AI agent can see. Your professional identity, your rules."
                color="#ec4899"
                icon={
                  <svg className="w-5 h-5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                }
              />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* ── How it Works ── */}
      <section className="py-16 sm:py-28 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <FadeIn className="text-center mb-16">
            <p className="text-purple-400/60 text-xs font-bold uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Three steps to your orbis</h2>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
            <FadeIn delay={0.1} className="flex justify-center">
              <StepCard
                number="01"
                title="Add your entries"
                description="Work experience, skills, education, patents, publications — add them one by one through a guided flow."
                icon={
                  <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                }
              />
            </FadeIn>
            <FadeIn delay={0.2} className="flex justify-center">
              <StepCard
                number="02"
                title="Watch it grow"
                description="Each entry becomes a node in your 3D knowledge graph. Skills link to experiences. Your career takes shape."
                icon={
                  <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
              />
            </FadeIn>
            <FadeIn delay={0.3} className="flex justify-center">
              <StepCard
                number="03"
                title="Share everywhere"
                description="One link, one QR code. Recruiters see your graph. AI agents query it via MCP. No more rewriting CVs."
                icon={
                  <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                }
              />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* ── Built for everyone ── */}
      <section className="py-16 sm:py-28 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <FadeIn className="text-center mb-16">
            <p className="text-purple-400/60 text-xs font-bold uppercase tracking-widest mb-3">Why OpenOrbis</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Built for everyone in the loop</h2>
            <p className="text-white/30 text-base max-w-lg mx-auto">Whether you're a professional, a recruiter, or an AI agent — OpenOrbis speaks your language.</p>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <FadeIn delay={0.1}>
              <FeatureCard
                title="For Professionals"
                description="Stop reformatting your CV for every application. Build your graph once — update it entry by entry as your career evolves."
                color="#8b5cf6"
                icon={
                  <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
              />
            </FadeIn>
            <FadeIn delay={0.2}>
              <FeatureCard
                title="For Recruiters"
                description="Explore candidates as interactive 3D graphs. See skill connections, career arcs, and project relationships at a glance."
                color="#10b981"
                icon={
                  <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                }
              />
            </FadeIn>
            <FadeIn delay={0.3}>
              <FeatureCard
                title="For AI Agents"
                description="Every orbis is queryable via MCP tools. AI agents can search skills, match roles, and retrieve structured career data."
                color="#3b82f6"
                icon={
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                }
              />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-16 sm:py-28 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <FadeIn>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to build your orbis?
            </h2>
            <p className="text-white/30 text-base mb-8 max-w-md mx-auto">
              It takes less than five minutes. No templates, no formatting, no PDFs — just you and your graph.
            </p>
            <div className="flex justify-center">
              {user && !signingInProvider ? (
                <button
                  onClick={() => navigate('/myorbis')}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3.5 px-10 rounded-xl transition-all shadow-xl shadow-purple-600/20 hover:shadow-purple-500/30 hover:scale-[1.02] text-base"
                >
                  Go to My Orbis
                </button>
              ) : (
                <SignInButtons onGoogleLogin={handleGoogleLogin} signingInProvider={signingInProvider} disabled={loading} />
              )}
            </div>
          </FadeIn>
        </div>
      </section>

      <Footer />
    </div>
  );
}
