# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the OpenOrbis landing page hero as a split layout, replace "How it works" cards with a connected timeline, remove the "Built for everyone" section, and merge the subtitle/tagline.

**Architecture:** Single-file change to `LandingPage.tsx`. The hero switches from stacked-center to a flex row (text left, HeroOrb right). The "How it works" section replaces icon cards with numbered circles connected by a gradient line. The "Built for everyone" section and divider lines are removed entirely.

**Tech Stack:** React 19, Tailwind CSS 4, Framer Motion (existing `FadeIn` wrapper)

---

### Task 1: Redesign the hero section as a split layout

**Files:**
- Modify: `frontend/src/pages/LandingPage.tsx:100-211`

- [ ] **Step 1: Replace the hero section**

Replace everything between `{/* ── Hero ── */}` and `</section>` (lines 100-211) with the split layout. Keep the background glow, scroll indicator, and all Framer Motion animations:

```tsx
      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6">
        {/* Background glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] rounded-full bg-purple-600/8 blur-[150px]" />
        </div>

        {/* Split layout: text left, orb right */}
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 md:gap-12 max-w-6xl w-full mx-auto">
          {/* Orb — shows first on mobile, second on desktop */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="md:order-2 md:flex-[0_0_40%] flex items-center justify-center"
          >
            <HeroOrb />
          </motion.div>

          {/* Text */}
          <div className="md:order-1 md:flex-[0_0_60%] text-center md:text-left">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="text-5xl sm:text-7xl font-bold mb-5 tracking-tight"
            >
              Your CV,{' '}
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
                reimagined
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="text-white/40 text-lg sm:text-xl mb-10 max-w-lg leading-relaxed"
            >
              Build a living knowledge graph from your career.
              No more templates, no more formatting — just share your orb
              with recruiters, AI agents, and the world.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.8 }}
              className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start"
            >
              {user && !signingIn ? (
                <>
                  <button
                    onClick={() => navigate('/orb')}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3.5 px-8 rounded-xl transition-all shadow-xl shadow-purple-600/20 hover:shadow-purple-500/30 hover:scale-[1.02] text-base"
                  >
                    View My Orb
                  </button>
                  <div className="flex items-center gap-2 px-4">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-white/30 text-sm">Welcome back, {user.name?.split(' ')[0]}</span>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={handleGetStarted}
                    disabled={loading || signingIn}
                    className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-3.5 px-8 rounded-xl transition-all shadow-xl shadow-purple-600/20 hover:shadow-purple-500/30 hover:scale-[1.02] text-base flex items-center gap-2"
                  >
                    {loading || signingIn ? 'Signing in...' : 'Create Your Orb'}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                  <button
                    onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                    className="border border-white/10 hover:border-white/20 text-white/50 hover:text-white/70 font-medium py-3.5 px-8 rounded-xl transition-all text-base"
                  >
                    Learn more
                  </button>
                </>
              )}
            </motion.div>
          </div>
        </div>

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
```

- [ ] **Step 2: Verify the hero renders correctly**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

Open http://localhost:5173 and verify:
- Desktop: text on the left, animated 3D orb on the right
- The subtitle is a single merged paragraph (no amber tagline)
- CTAs are left-aligned on desktop, centered on mobile
- Scroll indicator still at bottom center

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/LandingPage.tsx
git commit -m "feat: redesign hero as split layout with text left, orb right"
```

---

### Task 2: Replace "How it works" with connected timeline

**Files:**
- Modify: `frontend/src/pages/LandingPage.tsx` — the "How it Works" section (currently lines 279-326) and the "Learn more" scroll target

- [ ] **Step 1: Update the scroll target ID**

In the "What makes OpenOrbis different" section header (around line 214), change:

```tsx
// OLD
<section id="orbis-difference" className="py-16 sm:py-28 px-4 sm:px-6">
```

The "Learn more" button in the hero now scrolls to `#how-it-works`, so the How it Works section needs that ID. Find the How it Works section and add the ID:

```tsx
// Find this (around line 280):
<section className="py-16 sm:py-28 px-4 sm:px-6">
// On the How it Works section, change to:
<section id="how-it-works" className="py-16 sm:py-28 px-4 sm:px-6">
```

Also remove `id="orbis-difference"` from the features section since nothing links to it anymore.

- [ ] **Step 2: Replace the How it Works section content**

Replace the entire grid inside the How it Works section (the `<div className="grid grid-cols-1 md:grid-cols-3 ...">` with the three `StepCard` components) with the connected timeline:

```tsx
          {/* Timeline */}
          <div className="relative">
            {/* ── Desktop: horizontal ── */}
            <div className="hidden md:block">
              {/* Connecting line */}
              <div className="absolute top-6 left-[calc(16.67%-0px)] right-[calc(16.67%-0px)] h-px bg-gradient-to-r from-purple-500/20 via-purple-500/10 to-indigo-500/20" />

              <div className="grid grid-cols-3 gap-8">
                {[
                  { num: '1', title: 'Upload or build', desc: 'Drop a PDF of your CV and we extract everything — or add entries one by one through a guided flow.' },
                  { num: '2', title: 'Watch it grow', desc: 'Each entry becomes a node in your 3D knowledge graph. Skills link to experiences. Your career takes shape.' },
                  { num: '3', title: 'Share everywhere', desc: 'One link, one QR code. Recruiters see your graph. AI agents query it via MCP. No more rewriting CVs.' },
                ].map((step, i) => (
                  <FadeIn key={step.num} delay={i * 0.15} className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full bg-purple-600/10 border border-purple-500/30 flex items-center justify-center mb-5 relative z-10 bg-black">
                      <span className="text-purple-400 text-sm font-bold">{step.num}</span>
                    </div>
                    <h3 className="text-white text-lg font-semibold mb-2">{step.title}</h3>
                    <p className="text-white/40 text-sm leading-relaxed">{step.desc}</p>
                  </FadeIn>
                ))}
              </div>
            </div>

            {/* ── Mobile: vertical ── */}
            <div className="md:hidden relative pl-10">
              {/* Vertical connecting line */}
              <div className="absolute left-[23px] top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/20 via-purple-500/10 to-indigo-500/20" />

              <div className="space-y-10">
                {[
                  { num: '1', title: 'Upload or build', desc: 'Drop a PDF of your CV and we extract everything — or add entries one by one through a guided flow.' },
                  { num: '2', title: 'Watch it grow', desc: 'Each entry becomes a node in your 3D knowledge graph. Skills link to experiences. Your career takes shape.' },
                  { num: '3', title: 'Share everywhere', desc: 'One link, one QR code. Recruiters see your graph. AI agents query it via MCP. No more rewriting CVs.' },
                ].map((step, i) => (
                  <FadeIn key={step.num} delay={i * 0.15} className="relative flex gap-5">
                    <div className="w-12 h-12 rounded-full bg-purple-600/10 border border-purple-500/30 flex items-center justify-center flex-shrink-0 relative z-10 bg-black -ml-10">
                      <span className="text-purple-400 text-sm font-bold">{step.num}</span>
                    </div>
                    <div>
                      <h3 className="text-white text-lg font-semibold mb-2">{step.title}</h3>
                      <p className="text-white/40 text-sm leading-relaxed">{step.desc}</p>
                    </div>
                  </FadeIn>
                ))}
              </div>
            </div>
          </div>
```

- [ ] **Step 3: Verify timeline renders correctly**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

Open http://localhost:5173 and verify:
- Desktop: three numbered circles connected by a horizontal gradient line
- Circles have bg-black so the line appears to pass behind them
- Mobile: vertical layout with line on the left
- "Learn more" button scrolls to this section

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LandingPage.tsx
git commit -m "feat: replace How it Works cards with connected timeline"
```

---

### Task 3: Remove "Built for everyone" section and divider lines

**Files:**
- Modify: `frontend/src/pages/LandingPage.tsx` — remove the "Built for everyone" section and both divider `<div>`s

- [ ] **Step 1: Remove the two divider lines**

Delete both divider blocks (each looks like this):

```tsx
      {/* ── Divider ── */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
```

There are two of them — one between features and How it Works, one between How it Works and Built for everyone.

- [ ] **Step 2: Remove the "Built for everyone" section**

Delete the entire section from `{/* ── Built for everyone ── */}` through its closing `</section>` tag (currently lines 333-381). This removes the three audience cards (professionals, recruiters, AI agents).

- [ ] **Step 3: Verify the page renders correctly**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

Open http://localhost:5173 and verify:
- Page flows: Hero → How it Works → Why OpenOrbis (features) → Final CTA → Footer
- No horizontal divider lines between sections
- No "Built for everyone" section visible
- Scroll is smooth with adequate spacing between sections

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LandingPage.tsx
git commit -m "feat: remove Built for Everyone section and divider lines"
```

---

### Task 4: Final verification

**Files:**
- None modified — verification only

- [ ] **Step 1: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Build check**

Run: `cd frontend && npx vite build`
Expected: build succeeds

- [ ] **Step 3: Visual verification**

Open http://localhost:5173 and verify all spec requirements:
- Hero: split layout, text left, orb right, merged subtitle, no amber tagline
- How it Works: connected timeline with numbered circles (1, 2, 3)
- Features: 2x2 grid unchanged
- Final CTA: unchanged
- Footer: unchanged
- No "Built for everyone" section
- No divider lines
- Mobile responsive: hero stacks (orb on top), timeline goes vertical
