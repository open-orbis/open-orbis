// Ported from print/openorbis-a3-poster.html (issue #371) — CSS-animated SVG
// rather than Three.js so landing-page first paint isn't blocked on a WebGL
// context. The main composition is static (poster-accurate); the 4 ring-bound
// satellite nodes orbit via CSS offset-path.

const KEYFRAMES = `
  @keyframes hero-orb-halo-pulse {
    0%, 100% { opacity: 0.95; transform: scale(1); }
    50%      { opacity: 0.55; transform: scale(0.99); }
  }
  @keyframes hero-orb-halo-purple-pulse {
    0%, 100% { opacity: 0;    transform: scale(0.96); }
    50%      { opacity: 0.75; transform: scale(1.015); }
  }
  @keyframes hero-orb-core-pulse {
    0%, 100% { opacity: 0.85; }
    50%      { opacity: 1; }
  }
  @keyframes hero-orb-node-twinkle {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.55; }
  }
  @keyframes hero-orb-orbit-loop {
    to { offset-distance: 100%; }
  }
  @keyframes hero-orb-constellation-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .hero-orb-halo,
  .hero-orb-halo-purple,
  .hero-orb-core,
  .hero-orb-node {
    transform-box: fill-box;
    transform-origin: center;
  }
  .hero-orb-halo        { animation: hero-orb-halo-pulse 5s ease-in-out infinite; }
  .hero-orb-halo-purple { animation: hero-orb-halo-purple-pulse 5s ease-in-out infinite; }
  .hero-orb-core { animation: hero-orb-core-pulse 4s ease-in-out infinite; }
  .hero-orb-node.delay-1 { animation: hero-orb-node-twinkle 3.2s ease-in-out infinite 0.4s; }
  .hero-orb-node.delay-2 { animation: hero-orb-node-twinkle 4.1s ease-in-out infinite 1.1s; }
  .hero-orb-node.delay-3 { animation: hero-orb-node-twinkle 3.6s ease-in-out infinite 2.0s; }

  /* Background constellation (static stars + their connection lines) rotates
     slowly around the orb centre (200,200 in view-box coordinates). */
  .hero-orb-constellation {
    transform-box: view-box;
    transform-origin: 200px 200px;
    animation: hero-orb-constellation-spin 180s linear infinite;
  }

  /* Ring-bound orbiting nodes. Each class locks its own offset-path (the
     ring's unrotated ellipse) and its own duration / starting position.
     The parent <g transform="rotate(...)"> rotates the whole orbit, so the
     node follows the tilted ring in rendered SVG space. */
  .hero-orb-orbit {
    offset-rotate: 0deg;
    animation: hero-orb-orbit-loop linear infinite;
  }
  .hero-orb-orbit-0 {
    offset-path: path('M 15 200 A 185 58 0 1 1 385 200 A 185 58 0 1 1 15 200');
    animation-duration: 42s;
  }
  .hero-orb-orbit-1 {
    offset-path: path('M 35 200 A 165 48 0 1 1 365 200 A 165 48 0 1 1 35 200');
    animation-duration: 32s;
    animation-delay: -9.6s;
  }
  .hero-orb-orbit-2 {
    offset-path: path('M 55 200 A 145 38 0 1 1 345 200 A 145 38 0 1 1 55 200');
    animation-duration: 55s;
    animation-delay: -33s;
  }
  .hero-orb-orbit-3 {
    offset-path: path('M 80 200 A 120 30 0 1 1 320 200 A 120 30 0 1 1 80 200');
    animation-duration: 24s;
    animation-delay: -3.6s;
  }

  @media (prefers-reduced-motion: reduce) {
    .hero-orb-halo,
    .hero-orb-halo-purple,
    .hero-orb-core,
    .hero-orb-node,
    .hero-orb-orbit,
    .hero-orb-constellation { animation: none !important; }
    .hero-orb-halo-purple { opacity: 0; }
  }
`;

interface RingSpec {
  rx: number;
  ry: number;
  rotation: number;
  stroke: string;
  dash?: string;
  nodeColor: string;
  nodeRadius: number;
}

const RINGS: RingSpec[] = [
  { rx: 185, ry: 58, rotation: -22, stroke: '#a78bfa', dash: '1 3', nodeColor: '#fbbf24', nodeRadius: 3.5 },
  { rx: 165, ry: 48, rotation: 18,  stroke: '#8b5cf6',               nodeColor: '#a78bfa', nodeRadius: 3 },
  { rx: 145, ry: 38, rotation: -35, stroke: '#a78bfa', dash: '2 2',  nodeColor: '#c4b5fd', nodeRadius: 2.5 },
  { rx: 120, ry: 30, rotation: 50,  stroke: '#c4b5fd',               nodeColor: '#818cf8', nodeRadius: 2.5 },
];

export default function HeroOrb() {
  return (
    <>
      <style>{KEYFRAMES}</style>
      <div className="w-96 h-96 md:w-[36rem] md:h-[36rem]">
        <svg
          viewBox="0 0 400 400"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
          aria-hidden
        >
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
            {/* Secondary halo in the myorbis top-left logo palette
                (purple-500 / purple-600). Cross-fades with the violet halo
                so the glow cools toward purple on the down-beat. */}
            <radialGradient id="hero-orb-halo-grad-purple" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.42} />
              <stop offset="55%" stopColor="#9333ea" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#000000" stopOpacity={0} />
            </radialGradient>
            <filter id="hero-orb-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>

          {/* Outer halo — two layers cross-fade so the glow shifts from violet
              on the up-beat to the myorbis-logo purple on the down-beat. */}
          <circle className="hero-orb-halo" cx="200" cy="200" r="195" fill="url(#hero-orb-halo-grad)" />
          <circle className="hero-orb-halo-purple" cx="200" cy="200" r="195" fill="url(#hero-orb-halo-grad-purple)" />

          {/* Rings + their orbiting satellite nodes. The rotation on the <g>
              tilts both the ring and the node's offset path together. */}
          {RINGS.map((ring, i) => (
            <g key={`${ring.rx}-${ring.rotation}`} transform={`rotate(${ring.rotation} 200 200)`}>
              <ellipse
                cx="200"
                cy="200"
                rx={ring.rx}
                ry={ring.ry}
                fill="none"
                stroke={ring.stroke}
                strokeWidth="0.8"
                strokeDasharray={ring.dash}
                opacity={0.55}
              />
              <circle
                className={`hero-orb-orbit hero-orb-orbit-${i}`}
                r={ring.nodeRadius}
                fill={ring.nodeColor}
              />
            </g>
          ))}

          {/* Background constellation — stars + connection lines — rotates
              slowly around the orb centre. Twinkle still plays on top. */}
          <g className="hero-orb-constellation">
            <g stroke="#8b5cf6" strokeWidth="0.4" opacity={0.35}>
              <line x1="58" y1="160" x2="200" y2="200" />
              <line x1="260" y1="60" x2="200" y2="200" />
              <line x1="140" y1="340" x2="200" y2="200" />
              <line x1="310" y1="115" x2="260" y2="60" />
              <line x1="80" y1="255" x2="140" y2="340" />
            </g>
            <circle cx="58" cy="160" r="3" fill="#a78bfa" />
            <circle cx="260" cy="60" r="3" fill="#a78bfa" />
            <circle className="hero-orb-node delay-1" cx="310" cy="115" r="2" fill="#f59e0b" />
            <circle className="hero-orb-node delay-2" cx="140" cy="340" r="2.5" fill="#818cf8" />
            <circle cx="135" cy="75" r="2" fill="#c4b5fd" />
            <circle className="hero-orb-node delay-3" cx="80" cy="255" r="2.5" fill="#c4b5fd" />
          </g>

          {/* Core glow + bright cores */}
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
