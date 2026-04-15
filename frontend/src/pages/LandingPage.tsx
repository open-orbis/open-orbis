import { motion, useInView } from 'framer-motion';
import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '../stores/authStore';
import { hasOrbContent } from '../api/orbs';
import HeroOrb from '../components/landing/HeroOrb';
import OrbGraph3D from '../components/graph/OrbGraph3D';
import DEMO_ORB from '../data/demoOrb';
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

// ── Feature row ──
function FeatureRow({ side, color, colorName, icon, title, description }: {
  side: 'left' | 'right';
  color: string;
  colorName: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const iconSide = (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: side === 'left' ? -60 : 60 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="flex items-center justify-center"
    >
      <div
        className="w-20 h-20 sm:w-36 sm:h-36 rounded-2xl sm:rounded-3xl flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${color}20, ${color}08)`, border: `1px solid ${color}25` }}
      >
        <div className="absolute inset-0 rounded-3xl blur-[40px] opacity-30" style={{ backgroundColor: color }} />
        <svg className={`w-8 h-8 sm:w-16 sm:h-16 text-${colorName}-400 relative z-10`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {icon}
        </svg>
      </div>
    </motion.div>
  );

  const textSide = (
    <motion.div
      initial={{ opacity: 0, x: side === 'left' ? 60 : -60 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
      className={`flex flex-col justify-center ${side === 'left' ? 'sm:pl-8' : 'sm:pr-8 sm:text-right'}`}
    >
      <h3 className="text-white text-xl sm:text-2xl font-bold mb-3">{title}</h3>
      <p className="text-white/40 text-sm sm:text-base leading-relaxed max-w-md">{description}</p>
    </motion.div>
  );

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-16 items-center ${side === 'right' ? 'sm:direction-rtl' : ''}`}>
      {side === 'left' ? <>{iconSide}{textSide}</> : <>{textSide}{iconSide}</>}
    </div>
  );
}

// ── Sign-in buttons ──
function SignInButtons({ onGoogleLogin, signingInProvider, disabled }: { onGoogleLogin: () => void; signingInProvider: 'google' | 'linkedin' | 'apple' | null; disabled?: boolean }) {
  const busy = signingInProvider !== null || disabled;
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-white text-xs uppercase tracking-widest">Sign in with</p>
      <div className="flex items-center gap-3">
        {/* Google */}
        <div className="group relative flex flex-col items-center">
          <button
            onClick={onGoogleLogin}
            disabled={busy}
            className="w-14 h-14 rounded-full bg-white/[0.07] border border-white/40 hover:bg-white/[0.12] disabled:opacity-40 transition-all duration-300 flex items-center justify-center cursor-pointer"
            style={{ boxShadow: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 20px rgba(66,133,244,0.3)'; e.currentTarget.style.borderColor = 'rgba(66,133,244,0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; }}
          >
            {signingInProvider === 'google' ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
          </button>
          <span className="absolute -bottom-6 text-[10px] text-white/0 group-hover:text-white/50 transition-all duration-200">Google</span>
        </div>

        <span className="text-white/10 text-lg select-none">&middot;</span>

        {/* LinkedIn */}
        <div className="group relative flex flex-col items-center">
          <button
            onClick={() => { if (!busy) redirectToLinkedIn(); }}
            disabled={busy}
            className="w-14 h-14 rounded-full bg-white/[0.07] border border-white/40 hover:bg-white/[0.12] disabled:opacity-40 transition-all duration-300 flex items-center justify-center cursor-pointer"
            style={{ boxShadow: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 20px rgba(10,102,194,0.3)'; e.currentTarget.style.borderColor = 'rgba(10,102,194,0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; }}
          >
            {signingInProvider === 'linkedin' ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" viewBox="0 0 24 24" fill="#0A66C2">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            )}
          </button>
          <span className="absolute -bottom-6 text-[10px] text-white/0 group-hover:text-white/50 transition-all duration-200">LinkedIn</span>
        </div>

        <span className="text-white/10 text-lg select-none">&middot;</span>

        {/* Apple */}
        <div className="group relative flex flex-col items-center">
          <button
            disabled={true}
            className="w-14 h-14 rounded-full bg-white/[0.07] border border-white/40 opacity-30 transition-all duration-300 flex items-center justify-center cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
          </button>
          <span className="absolute -bottom-6 text-[10px] text-white/0 group-hover:text-white/50 transition-all duration-200">Apple</span>
        </div>
      </div>
    </div>
  );
}

function DemoOrb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 800, height: 500 });

  const measure = useCallback(() => {
    if (containerRef.current) {
      setDims({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    }
  }, []);

  useEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => { obs.disconnect(); };
  }, [measure]);

  return (
    <div ref={containerRef} className="w-full h-full" onContextMenu={(e) => e.preventDefault()}>
      <OrbGraph3D
        data={DEMO_ORB}
        width={dims.width}
        height={dims.height}
        enableZoom={false}
        enablePan={false}
        cameraDistance={180}
      />
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, loginGoogle, loading } = useAuthStore();

  const [signingInProvider, setSigningInProvider] = useState<'google' | 'linkedin' | 'apple' | null>(null);

  const handleGoogleLogin = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async (response) => {
      setSigningInProvider('google');
      try {
        await loginGoogle(response.code);
        // If the user landed here from a restricted-orb redirect, send them back.
        const returnTo = sessionStorage.getItem('orbis_return_to');
        if (returnTo) {
          sessionStorage.removeItem('orbis_return_to');
          navigate(returnTo, { replace: true });
          return;
        }
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2.5, ease: 'easeOut' }}
          className="relative z-10 mb-6"
        >
          <HeroOrb />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="text-4xl sm:text-7xl font-bold mb-4 sm:mb-8 z-10 tracking-tight text-center"
        >
          Beyond the{' '}
          <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
            CV.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="text-white/40 text-base sm:text-xl mb-8 sm:mb-16 z-10 max-w-lg text-center leading-relaxed"
        >
          <span className="text-white/60 font-semibold">Your career reimagined for the AI era.</span><br />
          Queryable, shareable, portable.
        </motion.p>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="text-sm mb-10 sm:mb-24 z-10 font-medium tracking-wide"
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
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Interactive Demo Orb ── */}
      <section className="relative px-4 sm:px-6">
        <FadeIn className="max-w-5xl mx-auto">
          {/* Text above the canvas */}
          <div className="text-center mb-4">
            <h2 className="text-3xl sm:text-4xl font-bold mb-2">
              Your career,{' '}
              <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">interconnected</span>
            </h2>
            <p className="text-white/40 text-sm max-w-md mx-auto">
              Hover over nodes to see details. Drag to rotate.
            </p>
          </div>
          {/* Canvas with clipped overflow */}
          <div className="rounded-2xl overflow-hidden border border-white/5 h-[400px] sm:h-[650px]">
            <DemoOrb />
          </div>
        </FadeIn>
      </section>

      {/* ── What makes OpenOrbis different ── */}
      <section id="orbis-difference" className="py-20 sm:py-32 px-4 sm:px-6 relative">
        <div className="max-w-5xl mx-auto relative z-10">
          <FadeIn className="text-center mb-20">
            <p className="text-purple-400/50 text-xs font-bold uppercase tracking-[0.2em] mb-4">The OpenOrbis difference</p>
            <h2 className="text-3xl sm:text-5xl font-bold text-white">
              One single{' '}
              <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">source of truth</span>
            </h2>
          </FadeIn>

          <div className="space-y-16 sm:space-y-32">
            {/* 1 — Left */}
            <FeatureRow side="left" color="#f59e0b" colorName="amber"
              icon={<><circle cx="12" cy="12" r="2.5" strokeWidth={1.5} /><circle cx="4" cy="6" r="1.5" strokeWidth={1.5} /><circle cx="20" cy="6" r="1.5" strokeWidth={1.5} /><circle cx="4" cy="18" r="1.5" strokeWidth={1.5} /><circle cx="20" cy="18" r="1.5" strokeWidth={1.5} /><circle cx="12" cy="2.5" r="1.5" strokeWidth={1.5} /><line x1="10" y1="10.5" x2="5.2" y2="7" strokeWidth={1.5} strokeLinecap="round" /><line x1="14" y1="10.5" x2="18.8" y2="7" strokeWidth={1.5} strokeLinecap="round" /><line x1="10" y1="13.5" x2="5.2" y2="17" strokeWidth={1.5} strokeLinecap="round" /><line x1="14" y1="13.5" x2="18.8" y2="17" strokeWidth={1.5} strokeLinecap="round" /><line x1="12" y1="9.5" x2="12" y2="4" strokeWidth={1.5} strokeLinecap="round" /></>}
              title="One graph, zero templates"
              description="Stop choosing templates and reformatting for every application. Build your knowledge graph once — export it as a PDF, embed it in your website, or just share the link."
            />

            {/* 2 — Right */}
            <FeatureRow side="right" color="#14b8a6" colorName="teal"
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />}
              title="Portable & machine-readable"
              description="Your orbis has a unique URL and QR code. Pass it to any LLM, embed it in your portfolio, or add it to your email signature. Humans see a 3D graph — AI agents get structured data via MCP."
            />

            {/* 3 — Left */}
            <FeatureRow side="left" color="#6366f1" colorName="indigo"
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />}
              title="Always up to date"
              description="Update your orbis in one place. Every generated CV, shared link, and agent query reflects the latest version instantly. No more outdated PDFs floating around."
            />

            {/* 4 — Right */}
            <FeatureRow side="right" color="#ec4899" colorName="pink"
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />}
              title="You control access"
              description="Your data is encrypted end-to-end. You control who can see what. Your professional identity, your rules."
            />
          </div>
        </div>
      </section>


      {/* ── Divider ── */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* ── Final CTA ── */}
      <section className="py-20 sm:py-32 px-4 sm:px-6 relative">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[400px] h-[400px] rounded-full bg-purple-600/5 blur-[120px]" />
        </div>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <FadeIn>
            <h2 className="text-4xl sm:text-5xl font-bold mb-8">
              Ready to build your{' '}
              <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">orbis</span>?
            </h2>
            <div className="flex justify-center">
              {user && !signingInProvider ? (
                <button
                  onClick={() => navigate('/myorbis')}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-4 px-12 rounded-xl transition-all shadow-xl shadow-purple-600/20 hover:shadow-purple-500/30 hover:scale-[1.02] text-lg"
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
