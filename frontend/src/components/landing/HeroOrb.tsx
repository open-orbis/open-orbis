// Ported from print/openorbis-a3-poster.html (issue #371) — keeps the composition
// consistent with the marketing poster / DevFest handouts. CSS-animated SVG rather
// than Three.js so landing-page first paint isn't blocked on a WebGL context.

const KEYFRAMES = `
  @keyframes hero-orb-halo-pulse {
    0%, 100% { opacity: 0.85; transform: scale(1); }
    50%      { opacity: 1;    transform: scale(1.03); }
  }
  @keyframes hero-orb-core-pulse {
    0%, 100% { opacity: 0.85; }
    50%      { opacity: 1; }
  }
  @keyframes hero-orb-node-twinkle {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.55; }
  }
  .hero-orb-halo,
  .hero-orb-core,
  .hero-orb-node {
    transform-box: fill-box;
    transform-origin: center;
  }
  .hero-orb-halo { animation: hero-orb-halo-pulse 5s ease-in-out infinite; }
  .hero-orb-core { animation: hero-orb-core-pulse 4s ease-in-out infinite; }
  .hero-orb-node.delay-1 { animation: hero-orb-node-twinkle 3.2s ease-in-out infinite 0.4s; }
  .hero-orb-node.delay-2 { animation: hero-orb-node-twinkle 4.1s ease-in-out infinite 1.1s; }
  .hero-orb-node.delay-3 { animation: hero-orb-node-twinkle 3.6s ease-in-out infinite 2.0s; }
  @media (prefers-reduced-motion: reduce) {
    .hero-orb-halo,
    .hero-orb-core,
    .hero-orb-node { animation: none !important; }
  }
`;

export default function HeroOrb() {
  return (
    <>
      <style>{KEYFRAMES}</style>
      <div className="w-80 h-80 md:w-[28rem] md:h-[28rem]">
        <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" aria-hidden>
          <defs>
            <radialGradient id="hero-orb-core-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#e9d5ff" stopOpacity={1} />
              <stop offset="30%" stopColor="#a78bfa" stopOpacity={0.9} />
              <stop offset="70%" stopColor="#7c3aed" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#4c1d95" stopOpacity={0} />
            </radialGradient>
            <radialGradient id="hero-orb-halo-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
              <stop offset="70%" stopColor="#6d28d9" stopOpacity={0.05} />
              <stop offset="100%" stopColor="#000000" stopOpacity={0} />
            </radialGradient>
            <filter id="hero-orb-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>

          <circle className="hero-orb-halo" cx="200" cy="200" r="195" fill="url(#hero-orb-halo-grad)" />

          <g>
            <g strokeWidth="0.8" fill="none" opacity={0.55}>
              <ellipse cx="200" cy="200" rx="185" ry="58" stroke="#a78bfa" strokeDasharray="1 3" transform="rotate(-22 200 200)" />
              <ellipse cx="200" cy="200" rx="165" ry="48" stroke="#8b5cf6" transform="rotate(18 200 200)" />
              <ellipse cx="200" cy="200" rx="145" ry="38" stroke="#a78bfa" strokeDasharray="2 2" transform="rotate(-35 200 200)" />
              <ellipse cx="200" cy="200" rx="120" ry="30" stroke="#c4b5fd" transform="rotate(50 200 200)" />
            </g>

            <g>
              <circle className="hero-orb-node delay-1" cx="385" cy="200" r="3.5" fill="#fbbf24" />
              <circle cx="58" cy="160" r="3" fill="#a78bfa" />
              <circle className="hero-orb-node delay-2" cx="340" cy="275" r="2.5" fill="#8b5cf6" />
              <circle cx="80" cy="255" r="2.5" fill="#c4b5fd" />
              <circle cx="260" cy="60" r="3" fill="#a78bfa" />
              <circle className="hero-orb-node delay-3" cx="310" cy="115" r="2" fill="#f59e0b" />
              <circle cx="140" cy="340" r="2.5" fill="#818cf8" />
              <circle cx="135" cy="75" r="2" fill="#c4b5fd" />
            </g>

            <g stroke="#8b5cf6" strokeWidth="0.4" opacity={0.35}>
              <line x1="385" y1="200" x2="200" y2="200" />
              <line x1="58" y1="160" x2="200" y2="200" />
              <line x1="260" y1="60" x2="200" y2="200" />
              <line x1="140" y1="340" x2="200" y2="200" />
              <line x1="310" y1="115" x2="260" y2="60" />
              <line x1="80" y1="255" x2="140" y2="340" />
            </g>
          </g>

          <circle
            className="hero-orb-core"
            cx="200"
            cy="200"
            r="80"
            fill="url(#hero-orb-core-grad)"
            filter="url(#hero-orb-soft-glow)"
          />
          <circle cx="200" cy="200" r="22" fill="#e9d5ff" />
          <circle cx="200" cy="200" r="14" fill="#ffffff" />
        </svg>
      </div>
    </>
  );
}
