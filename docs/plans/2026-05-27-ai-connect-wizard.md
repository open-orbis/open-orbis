# AI Connect Wizard Implementation Plan

> **⚠️ Superseded (2026-05-27):** after review, the separate wizard modal + dedicated
> "Connect to AI" chat button described below were dropped. The content now lives in a
> **"Connect" tab inside `ConnectedAiClientsModal`** (the robot-button modal), which the
> guided tour auto-opens once. See the "Revision" section of
> `docs/specs/2026-05-27-ai-connect-wizard-design.md` for the final design. This plan is
> kept as the historical implementation record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-step wizard modal that appears once after the guided tour, teaching the user to connect their Orbis to a webchat LLM (Claude, ChatGPT, Perplexity, Gemini, Lovable) as an MCP server, ending with copy-able starter prompts.

**Architecture:** A new self-contained modal component (`AiConnectWizard`) reuses the existing modal pattern (`framer-motion` + Esc/focus-trap, mirroring `ConnectedAiClientsModal`). Platform instructions live in a typed data module. Trigger gating is a pure, unit-tested helper; `OrbViewPage` wires it to `GuidedTour`'s `onFinish` plus a once-on-mount check for users who already finished the tour. A distinct "Connect to AI" button beside the existing chat 🤖 button re-opens it; the wizard links to `ConnectedAiClientsModal` for management.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4, framer-motion, Vitest + Testing Library (jsdom).

**Spec:** `docs/specs/2026-05-27-ai-connect-wizard-design.md`

**Conventions:**
- Run a single test file: `cd frontend && npx vitest run <path>`
- Lint: `cd frontend && npm run lint` · Type-check + build: `npm run build`
- Commits: no `Co-Authored-By` lines (per project CLAUDE.md). Work happens on branch `feat/ai-connect-wizard`.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/components/ai/aiPlatforms.ts` *(new)* | Typed per-platform connection data + starter prompts + `LAST_VERIFIED` |
| `frontend/src/components/ai/aiPlatforms.test.ts` *(new)* | Data-shape guarantees |
| `frontend/src/components/ai/aiConnectSeen.ts` *(new)* | localStorage "seen" flag + pure `shouldAutoOpenAiConnect` gate |
| `frontend/src/components/ai/aiConnectSeen.test.ts` *(new)* | Flag + gate logic |
| `frontend/src/components/ai/AiConnectWizard.tsx` *(new)* | The 3-step modal |
| `frontend/src/components/ai/AiConnectWizard.test.tsx` *(new)* | Wizard behavior |
| `frontend/src/components/chat/ChatBox.tsx` *(modify)* | New "Connect to AI" button + `onConnectAi` prop |
| `frontend/src/components/chat/ChatBox.test.tsx` *(modify)* | Cover the new button + updated ordering |
| `frontend/src/pages/OrbViewPage.tsx` *(modify)* | Mount wizard, wire trigger, pass `onConnectAi`, link manage-connections |
| `docs/navigation-flow.md` *(modify)* | Document the wizard + trigger + button |
| `docs/navigation-actions.yaml` *(modify)* | Document the new actions |

---

## Task 1: Platform data module

**Files:**
- Create: `frontend/src/components/ai/aiPlatforms.ts`
- Test: `frontend/src/components/ai/aiPlatforms.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ai/aiPlatforms.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  PLATFORMS,
  STARTER_PROMPTS,
  LAST_VERIFIED,
  type PlatformId,
} from './aiPlatforms';

describe('aiPlatforms', () => {
  it('defines the five expected platforms in order', () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(ids).toEqual<PlatformId[]>([
      'claude',
      'chatgpt',
      'perplexity',
      'gemini',
      'lovable',
    ]);
  });

  it('every platform has complete, well-formed content', () => {
    for (const p of PLATFORMS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.icon.length).toBeGreaterThan(0);
      expect(p.supportHint.length).toBeGreaterThan(0);
      expect(p.authBadge.length).toBeGreaterThan(0);
      expect(p.steps.length).toBeGreaterThanOrEqual(3);
      expect(p.steps.every((s) => s.trim().length > 0)).toBe(true);
      expect(p.docsUrl).toMatch(/^https:\/\//);
    }
  });

  it('flags the platforms that need a caveat', () => {
    const byId = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));
    expect(byId.gemini.caveat).toBeTruthy();
    expect(byId.lovable.caveat).toBeTruthy();
  });

  it('exposes a YYYY-MM-DD verification date', () => {
    expect(LAST_VERIFIED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('provides starter prompts incl. a Lovable-specific one', () => {
    expect(STARTER_PROMPTS.length).toBeGreaterThanOrEqual(3);
    expect(STARTER_PROMPTS.some((p) => p.platformId === 'lovable')).toBe(true);
    expect(STARTER_PROMPTS.some((p) => !p.platformId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ai/aiPlatforms.test.ts`
Expected: FAIL — cannot resolve `./aiPlatforms`.

- [ ] **Step 3: Write the data module**

Create `frontend/src/components/ai/aiPlatforms.ts`:

```ts
// Per-platform MCP connection instructions, verified against each vendor's
// docs on the date below. When steps drift, update the copy here and bump
// LAST_VERIFIED — it is shown in the wizard footer so staleness is visible.
export const LAST_VERIFIED = '2026-05-27';

export type PlatformId =
  | 'claude'
  | 'chatgpt'
  | 'perplexity'
  | 'gemini'
  | 'lovable';

export interface Platform {
  id: PlatformId;
  name: string;
  icon: string;
  supportHint: string;
  authBadge: string;
  steps: string[];
  caveat?: string;
  docsUrl: string;
}

export const PLATFORMS: Platform[] = [
  {
    id: 'claude',
    name: 'Claude',
    icon: '🟣',
    supportHint: 'Easiest · OAuth',
    authBadge: 'OAuth · log in & consent',
    steps: [
      'In Claude, open Settings → Connectors (Pro or Max plan).',
      'Click the ＋ button, then “Add custom connector”.',
      'Paste your Orbis MCP URL above and click Add.',
      'Complete the Orbis login & consent popup, then choose Full or Restricted access.',
    ],
    caveat:
      'On Team/Enterprise, an organization Owner must add the connector org-wide first. Claude connects via OAuth — no API key needed.',
    docsUrl:
      'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: '🟢',
    supportHint: 'Developer mode',
    authBadge: 'Developer mode (beta)',
    steps: [
      'In ChatGPT, go to Settings → Apps & Connectors → Advanced settings.',
      'Turn on Developer mode and accept the beta warning.',
      'Back in Apps & Connectors, click Create (“Add custom connector”).',
      'Name it, paste your Orbis MCP URL, and create it. Enable it per chat from the ＋ menu.',
    ],
    caveat:
      'Requires a paid plan (Plus, Pro, Team, Enterprise). This is ChatGPT’s connector Developer mode — not the Apps SDK used to publish apps.',
    docsUrl:
      'https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt-beta',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    icon: '🔵',
    supportHint: 'OAuth / API key',
    authBadge: 'OAuth or API key',
    steps: [
      'Open Perplexity Settings → Connectors (Pro, Max, or Enterprise).',
      'Add a custom remote connector.',
      'Paste your Orbis MCP URL (must be HTTPS).',
      'Choose the authentication method (OAuth or API key) and confirm.',
    ],
    caveat:
      'Custom remote connectors launched March 2026; exact menu labels may vary by version.',
    docsUrl:
      'https://www.perplexity.ai/changelog/what-we-shipped---march-13-2026',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    icon: '✦',
    supportHint: 'Via Gemini CLI',
    authBadge: 'Gemini CLI',
    steps: [
      'The consumer Gemini app cannot add custom MCP servers yet — use the Gemini CLI.',
      'Install the Gemini CLI, then run:  gemini mcp add --transport http orbis <your MCP URL>',
      'Start the CLI and run /mcp to confirm Orbis is connected.',
      'For OAuth or an API-key header, configure the mcpServers block in the CLI settings.json.',
    ],
    caveat:
      'No point-and-click setup in the consumer Gemini app. (Enterprise/Agentspace admins can add a custom MCP data store separately.)',
    docsUrl: 'https://geminicli.com/docs/tools/mcp-server/',
  },
  {
    id: 'lovable',
    name: 'Lovable',
    icon: '🧡',
    supportHint: 'Build a site from your Orbis',
    authBadge: 'Build-time connector',
    steps: [
      'In Lovable, open the connectors hub (Cmd/Ctrl+K → “connectors”, or the ＋ menu).',
      'Add Orbis as a custom chat connector using your MCP URL.',
      'The Lovable Agent can now read your Orbis while it builds your app.',
      'Prompt it to build your site (see the prompts in the next step).',
    ],
    caveat:
      'Lovable’s MCP chat connectors feed the builder at build time — they are not bundled into the deployed site. For live Orbis data in the shipped site, use Lovable’s app-connector / API integration instead.',
    docsUrl: 'https://docs.lovable.dev/integrations/introduction',
  },
];

export interface StarterPrompt {
  text: string;
  // When set, the prompt is only shown after that platform is selected.
  platformId?: PlatformId;
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  {
    text: "Given my Orbis, what's the best-fitting job opportunity for me right now? Then draft a CV tuned to that job description.",
  },
  {
    text: 'Draft a short professional bio of me based on my specialities and experience.',
  },
  {
    text: 'Write a cover letter for this role, using my Orbis: [paste the job description].',
  },
  {
    text: 'Build my personal portfolio site using my Orbis as the source of truth.',
    platformId: 'lovable',
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ai/aiPlatforms.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ai/aiPlatforms.ts frontend/src/components/ai/aiPlatforms.test.ts
git commit -m "feat(ai-connect): platform data + starter prompts"
```

---

## Task 2: Seen-flag + auto-open gate

**Files:**
- Create: `frontend/src/components/ai/aiConnectSeen.ts`
- Test: `frontend/src/components/ai/aiConnectSeen.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ai/aiConnectSeen.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isAiConnectSeen,
  markAiConnectSeen,
  resetAiConnectSeen,
  shouldAutoOpenAiConnect,
} from './aiConnectSeen';

describe('aiConnectSeen', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to not seen', () => {
    expect(isAiConnectSeen()).toBe(false);
  });

  it('mark then reset toggles the flag', () => {
    markAiConnectSeen();
    expect(isAiConnectSeen()).toBe(true);
    resetAiConnectSeen();
    expect(isAiConnectSeen()).toBe(false);
  });

  it('auto-opens only when the tour is complete and it was not seen', () => {
    expect(shouldAutoOpenAiConnect(true, false)).toBe(true);
    expect(shouldAutoOpenAiConnect(true, true)).toBe(false);
    expect(shouldAutoOpenAiConnect(false, false)).toBe(false);
    expect(shouldAutoOpenAiConnect(false, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ai/aiConnectSeen.test.ts`
Expected: FAIL — cannot resolve `./aiConnectSeen`.

- [ ] **Step 3: Write the module**

Create `frontend/src/components/ai/aiConnectSeen.ts`:

```ts
// One-time "post-tour AI connect prompt" gate, mirroring the
// orbis_tour_completed pattern in GuidedTour.tsx.
const AI_CONNECT_SEEN_KEY = 'orbis_ai_connect_seen';

export function isAiConnectSeen(): boolean {
  return localStorage.getItem(AI_CONNECT_SEEN_KEY) === 'true';
}

export function markAiConnectSeen(): void {
  localStorage.setItem(AI_CONNECT_SEEN_KEY, 'true');
}

export function resetAiConnectSeen(): void {
  localStorage.removeItem(AI_CONNECT_SEEN_KEY);
}

// Pure gate used by both triggers: after the tour finishes, and once on
// mount for users who finished the tour before this feature shipped.
export function shouldAutoOpenAiConnect(
  tourCompleted: boolean,
  seen: boolean,
): boolean {
  return tourCompleted && !seen;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ai/aiConnectSeen.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ai/aiConnectSeen.ts frontend/src/components/ai/aiConnectSeen.test.ts
git commit -m "feat(ai-connect): one-time seen flag + auto-open gate"
```

---

## Task 3: The wizard modal

**Files:**
- Create: `frontend/src/components/ai/AiConnectWizard.tsx`
- Test: `frontend/src/components/ai/AiConnectWizard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ai/AiConnectWizard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AiConnectWizard from './AiConnectWizard';

describe('AiConnectWizard', () => {
  const mockWriteText = vi.fn();
  const baseProps = {
    open: true,
    onClose: () => {},
    onManageConnections: () => {},
  };

  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: mockWriteText.mockResolvedValue(undefined) },
    });
  });

  it('renders nothing when closed', () => {
    render(<AiConnectWizard {...baseProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('step 1 lists all five platforms', () => {
    render(<AiConnectWizard {...baseProps} />);
    for (const name of ['Claude', 'ChatGPT', 'Perplexity', 'Gemini', 'Lovable']) {
      expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument();
    }
  });

  it('selecting a platform shows the MCP URL and that platform’s first step', () => {
    render(<AiConnectWizard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Claude/i }));
    expect(screen.getByTestId('mcp-endpoint-url').textContent).toMatch(/\/mcp$/);
    expect(screen.getByText(/Settings → Connectors/i)).toBeInTheDocument();
    expect(screen.getByText(/log in & consent/i)).toBeInTheDocument();
  });

  it('copies the MCP URL', async () => {
    render(<AiConnectWizard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Claude/i }));
    fireEvent.click(screen.getByRole('button', { name: /^copy url$/i }));
    await waitFor(() => expect(mockWriteText).toHaveBeenCalled());
    expect(mockWriteText.mock.calls[0][0]).toMatch(/\/mcp$/);
  });

  it('reveals the API-key header behind the advanced toggle', () => {
    render(<AiConnectWizard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Claude/i }));
    expect(screen.queryByText(/X-MCP-Key/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /api key/i }));
    expect(screen.getByText(/X-MCP-Key/)).toBeInTheDocument();
  });

  it('shows the Gemini CLI caveat', () => {
    render(<AiConnectWizard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Gemini/i }));
    expect(screen.getByText(/consumer Gemini app/i)).toBeInTheDocument();
  });

  it('reaches step 3 and shows starter prompts; Lovable adds its own', () => {
    render(<AiConnectWizard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Lovable/i }));
    fireEvent.click(screen.getByRole('button', { name: /i've connected/i }));
    expect(screen.getByText(/best-fitting job opportunity/i)).toBeInTheDocument();
    expect(screen.getByText(/portfolio site using my Orbis/i)).toBeInTheDocument();
  });

  it('footer "Manage connections" calls the callback', () => {
    const onManageConnections = vi.fn();
    render(<AiConnectWizard {...baseProps} onManageConnections={onManageConnections} />);
    fireEvent.click(screen.getByRole('button', { name: /Claude/i }));
    fireEvent.click(screen.getByRole('button', { name: /i've connected/i }));
    fireEvent.click(screen.getByRole('button', { name: /manage connections/i }));
    expect(onManageConnections).toHaveBeenCalledOnce();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<AiConnectWizard {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ai/AiConnectWizard.test.tsx`
Expected: FAIL — cannot resolve `./AiConnectWizard`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/ai/AiConnectWizard.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  PLATFORMS,
  STARTER_PROMPTS,
  LAST_VERIFIED,
  type PlatformId,
} from './aiPlatforms';

interface Props {
  open: boolean;
  onClose: () => void;
  onManageConnections: () => void;
}

const MCP_URL = import.meta.env.VITE_MCP_URL ?? 'http://localhost:8081/mcp';

export default function AiConnectWizard({ open, onClose, onManageConnections }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [platformId, setPlatformId] = useState<PlatformId | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const platform = PLATFORMS.find((p) => p.id === platformId) ?? null;
  const prompts = STARTER_PROMPTS.filter(
    (p) => !p.platformId || p.platformId === platformId,
  );

  // Fresh wizard each time it opens.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPlatformId(null);
    setShowAdvanced(false);
    setCopiedUrl(false);
    setCopiedPrompt(null);
    closeRef.current?.focus();
  }, [open]);

  // Esc to close + Tab focus trap (mirrors ConnectedAiClientsModal).
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  async function copyUrl() {
    await navigator.clipboard.writeText(MCP_URL);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1800);
  }

  async function copyPrompt(idx: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedPrompt(idx);
    setTimeout(() => setCopiedPrompt((c) => (c === idx ? null : c)), 1800);
  }

  function selectPlatform(id: PlatformId) {
    setPlatformId(id);
    setShowAdvanced(false);
    setStep(2);
  }

  const stepLabel = (n: 1 | 2 | 3, text: string) => (
    <span className={n === step ? 'text-cyan-300 font-semibold' : 'text-white/40'}>
      {n}. {text}
    </span>
  );

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Connect your Orbis to an AI assistant"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative bg-gray-950 border border-white/10 rounded-2xl p-5 sm:p-6 w-[92vw] max-w-lg mx-2 sm:mx-4 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex gap-3 text-[11px]">
                {stepLabel(1, 'Choose')}
                {stepLabel(2, 'Connect')}
                {stepLabel(3, 'Try it')}
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-white/30 hover:text-white/70 transition-colors shrink-0 ml-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 rounded"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {step === 1 && (
              <div>
                <h2 className="text-white font-semibold text-base">
                  Plug your Orbis into your AI assistant
                </h2>
                <p className="text-white/50 text-xs mt-1 mb-4 leading-relaxed">
                  Your professional identity, queryable by ChatGPT, Claude, and more —
                  so they can draft a tailored CV, a bio, or even build your site. Pick
                  where you want to use it.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPlatform(p.id)}
                      className="flex items-center gap-3 text-left rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-cyan-400/40 px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                    >
                      <span className="text-lg" aria-hidden="true">{p.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-white text-sm font-medium">{p.name}</span>
                        <span className="block text-white/45 text-[11px] truncate">{p.supportHint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && platform && (
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <h2 className="text-white font-semibold text-base">
                    Connect to {platform.name}
                  </h2>
                  <span className="text-[10px] uppercase tracking-wider text-cyan-300/80 border border-cyan-500/30 rounded-full px-2 py-0.5">
                    {platform.authBadge}
                  </span>
                </div>

                <p className="text-[10px] uppercase tracking-[0.14em] text-white/30 font-semibold mb-1.5">
                  Your MCP URL
                </p>
                <div className="flex items-center gap-2 mb-4">
                  <code
                    data-testid="mcp-endpoint-url"
                    className="flex-1 min-w-0 truncate bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-cyan-200 text-[11px] font-mono"
                  >
                    {MCP_URL}
                  </code>
                  <button
                    type="button"
                    onClick={copyUrl}
                    aria-label="Copy URL"
                    className="shrink-0 h-7 px-3 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold transition-colors"
                  >
                    {copiedUrl ? 'Copied!' : 'Copy URL'}
                  </button>
                </div>

                <ol className="list-decimal list-inside space-y-1.5 text-white/75 text-[13px] leading-relaxed mb-3">
                  {platform.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>

                {platform.caveat && (
                  <p className="text-amber-200/80 text-[12px] bg-amber-500/[0.06] border border-amber-500/20 rounded-lg p-2.5 mb-3">
                    {platform.caveat}
                  </p>
                )}

                <a
                  href={platform.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 text-[12px] underline"
                >
                  {platform.name} setup docs ↗
                </a>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="text-white/50 hover:text-white/80 text-[12px]"
                  >
                    {showAdvanced ? '▾' : '▸'} Advanced: connect with an API key instead
                  </button>
                  {showAdvanced && (
                    <div className="mt-2 text-white/60 text-[12px] bg-black/30 border border-white/10 rounded-lg p-2.5 leading-relaxed">
                      <p className="mb-1.5">
                        For clients that take a custom header instead of an OAuth connector,
                        use the same URL with an API-key header:
                      </p>
                      <code className="block bg-black/50 rounded px-2 py-1 font-mono text-cyan-200 text-[11px]">
                        X-MCP-Key: orbk_…
                      </code>
                      <p className="mt-1.5">
                        See the MCP section of the API docs for creating keys.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-5">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-white/50 hover:text-white/80 text-sm"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="h-8 px-4 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors"
                  >
                    I've connected →
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-white font-semibold text-base mb-1">You're set. Try asking:</h2>
                <p className="text-white/50 text-xs mb-4">
                  Paste one of these into {platform ? platform.name : 'your AI assistant'}.
                </p>
                <ul className="space-y-2">
                  {prompts.map((p, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5"
                    >
                      <span className="flex-1 text-white/80 text-[13px] leading-relaxed">{p.text}</span>
                      <button
                        type="button"
                        onClick={() => copyPrompt(i, p.text)}
                        aria-label={`Copy prompt ${i + 1}`}
                        className="shrink-0 h-6 px-2 rounded bg-white/10 hover:bg-white/20 text-white text-[11px]"
                      >
                        {copiedPrompt === i ? '✓' : 'Copy'}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between mt-5">
                  <button
                    type="button"
                    onClick={onManageConnections}
                    className="text-cyan-400 hover:text-cyan-300 text-sm"
                  >
                    Manage connections →
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-8 px-4 rounded bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            <p className="text-white/20 text-[10px] mt-4 text-right">
              Steps verified {LAST_VERIFIED}
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ai/AiConnectWizard.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ai/AiConnectWizard.tsx frontend/src/components/ai/AiConnectWizard.test.tsx
git commit -m "feat(ai-connect): 3-step connect wizard modal"
```

---

## Task 4: "Connect to AI" button in ChatBox

**Files:**
- Modify: `frontend/src/components/chat/ChatBox.tsx`
- Test: `frontend/src/components/chat/ChatBox.test.tsx`

- [ ] **Step 1: Update/add the failing tests**

In `frontend/src/components/chat/ChatBox.test.tsx`, replace the existing
`positions the robot button between share and add` test with the version below
and add the two new tests (keep the other tests as-is):

```tsx
  it('positions buttons share → connect-AI → robot → add', () => {
    render(
      <ChatBox
        {...baseProps}
        onShare={() => {}}
        onAdd={() => {}}
        onConnectAi={() => {}}
        onConnectedAi={() => {}}
      />,
    );
    const share = screen.getByRole('button', { name: /share visibility/i });
    const connect = screen.getByRole('button', { name: /connect to ai assistant/i });
    const robot = screen.getByRole('button', { name: /connected ai clients/i });
    const add = screen.getByRole('button', { name: /^add entry$/i });
    const order = [share, connect, robot, add].map((el) =>
      Array.from(el.parentElement!.children).indexOf(el),
    );
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it('does not render the connect-AI button when onConnectAi is omitted', () => {
    render(<ChatBox {...baseProps} onShare={() => {}} onAdd={() => {}} />);
    expect(
      screen.queryByRole('button', { name: /connect to ai assistant/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the connect-AI button and fires onConnectAi on click', () => {
    const onConnectAi = vi.fn();
    render(<ChatBox {...baseProps} onConnectAi={onConnectAi} />);
    const btn = screen.getByRole('button', { name: /connect to ai assistant/i });
    fireEvent.click(btn);
    expect(onConnectAi).toHaveBeenCalledOnce();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/chat/ChatBox.test.tsx`
Expected: FAIL — `onConnectAi` not a prop; button not found.

- [ ] **Step 3: Add the prop**

In `frontend/src/components/chat/ChatBox.tsx`, add to `interface ChatBoxProps` (after line 23, the `onConnectedAi?` line):

```tsx
  onConnectAi?: () => void;
```

And add `onConnectAi,` to the destructured params (after `onConnectedAi,` near line 98).

- [ ] **Step 4: Update the action-cluster guard**

Change the cluster condition (line ~496) from:

```tsx
        {(onAdd || onShare || onConnectedAi) && (
```

to:

```tsx
        {(onAdd || onShare || onConnectAi || onConnectedAi) && (
```

- [ ] **Step 5: Add the button immediately before the robot button**

In `ChatBox.tsx`, directly above the `{onConnectedAi && (` block (line ~522), insert:

```tsx
            {onConnectAi && (
              <button
                onClick={onConnectAi}
                className="group relative w-8 h-8 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-white bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 hover:from-emerald-300 hover:via-emerald-400 hover:to-teal-500 ring-1 ring-inset ring-white/25 hover:ring-white/40 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-400/50 transition-all hover:scale-[1.06] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                title="Connect to AI assistant"
                aria-label="Connect to AI assistant"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-emerald-400/0 group-hover:bg-emerald-400/20 group-hover:animate-pulse"
                />
                <svg
                  className="relative w-5 h-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path strokeWidth="1.8" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
              </button>
            )}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/chat/ChatBox.test.tsx`
Expected: PASS (all, including the 3 updated/new).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/chat/ChatBox.tsx frontend/src/components/chat/ChatBox.test.tsx
git commit -m "feat(ai-connect): Connect-to-AI button in chat action bar"
```

---

## Task 5: Wire the wizard into OrbViewPage

No new unit test (the page is an integration shell; the gate logic is already
covered in Task 2). Verified by build + manual run at the end.

**Files:**
- Modify: `frontend/src/pages/OrbViewPage.tsx`

- [ ] **Step 1: Add imports**

Near the other component imports (`ConnectedAiClientsModal` is imported at line 21,
`GuidedTour` at line 34), add:

```tsx
import AiConnectWizard from '../components/ai/AiConnectWizard';
import { isTourCompleted } from '../components/GuidedTour';
import {
  isAiConnectSeen,
  markAiConnectSeen,
  shouldAutoOpenAiConnect,
} from '../components/ai/aiConnectSeen';
```

> Note: `isTourCompleted` is currently defined but not exported in `GuidedTour.tsx`
> (only `markTourCompleted`/`resetTour` are exported). Add `export` to its
> declaration: change `function isTourCompleted()` to `export function isTourCompleted()`.

- [ ] **Step 2: Add wizard open state**

Immediately after the `showConnectedAi` state (line 122):

```tsx
  const [showAiConnect, setShowAiConnect] = useState(false);
```

- [ ] **Step 3: Add an open helper and the once-on-mount trigger**

After the existing state declarations (e.g. just before the `startTour` effect at
line ~296), add:

```tsx
  const openAiConnect = useCallback(() => {
    markAiConnectSeen();
    setShowAiConnect(true);
  }, []);

  // Users who finished the tour before this feature shipped see the wizard once.
  useEffect(() => {
    if (shouldAutoOpenAiConnect(isTourCompleted(), isAiConnectSeen())) {
      openAiConnect();
    }
  }, [openAiConnect]);
```

- [ ] **Step 4: Open the wizard when the tour finishes**

Change the `GuidedTour` mount (line 1179) from:

```tsx
      <GuidedTour run={tourRunning} onFinish={() => setTourRunning(false)} />
```

to:

```tsx
      <GuidedTour
        run={tourRunning}
        onFinish={() => {
          setTourRunning(false);
          if (!isAiConnectSeen()) openAiConnect();
        }}
      />
```

- [ ] **Step 5: Pass the re-open callback to ChatBox**

In the `<ChatBox … />` props (the `onConnectedAi` prop is at line 1041), add beside it:

```tsx
        onConnectAi={() => setShowAiConnect(true)}
```

- [ ] **Step 6: Mount the wizard next to the connected-AI modal**

Immediately after the `ConnectedAiClientsModal` mount (line 1061), add:

```tsx
      <AiConnectWizard
        open={showAiConnect}
        onClose={() => setShowAiConnect(false)}
        onManageConnections={() => {
          setShowAiConnect(false);
          setShowConnectedAi(true);
        }}
      />
```

- [ ] **Step 7: Suppress tour tooltips while the wizard is open**

In the `tooltipEnabled` expression (line 966), add ` && !showAiConnect` to the chain
so guided-tour tooltips never render under the wizard.

- [ ] **Step 8: Build + lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: type-check passes, no eslint errors.

- [ ] **Step 9: Manual verification (servers already run locally)**

With the dev servers running (backend :8000, frontend :5173):
1. In the browser console run `localStorage.setItem('orbis_tour_completed','true'); localStorage.removeItem('orbis_ai_connect_seen');` then reload `/myorbis` → the wizard should auto-open once. Reload again → it should NOT reopen.
2. Click the green **Connect to AI** button in the chat bar → wizard opens. Pick Claude → URL + steps show; Copy URL works; advanced reveals `X-MCP-Key`. "I've connected" → prompts; "Manage connections" closes the wizard and opens the connected-clients modal.
3. Pick Gemini → CLI caveat shows. Pick Lovable → step 3 includes the "build my site" prompt.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/OrbViewPage.tsx frontend/src/components/GuidedTour.tsx
git commit -m "feat(ai-connect): trigger wizard post-tour and from chat bar"
```

---

## Task 6: Documentation

**Files:**
- Modify: `docs/navigation-flow.md`
- Modify: `docs/navigation-actions.yaml`

- [ ] **Step 1: Read both docs to match their existing format**

Run: open `docs/navigation-flow.md` and `docs/navigation-actions.yaml`; find how
`ConnectedAiClientsModal` (the chat 🤖 button) and other `/myorbis` modals are
documented, and mirror that structure.

- [ ] **Step 2: Update `docs/navigation-flow.md`**

Add the **AI Connect Wizard** modal alongside the other `/myorbis` overlays:
- Trigger 1: auto-opens once after the guided tour finishes/closes (gated by
  `orbis_ai_connect_seen`); also once on next visit for users who already finished
  the tour.
- Trigger 2: the green **Connect to AI** button in the chat action bar.
- Internal flow: ① Choose platform → ② Connect (URL + steps + advanced API-key) →
  ③ Try it (prompts). Footer **Manage connections →** opens `ConnectedAiClientsModal`.
- Note the new chat-bar button in the action-cluster description (share → connect-AI →
  robot → add).

- [ ] **Step 3: Update `docs/navigation-actions.yaml`**

Add actions, following the file's existing schema, for: open wizard (post-tour),
open wizard (chat button), close wizard, select platform, copy MCP URL, toggle
advanced/API-key, copy prompt, open manage-connections from the wizard.

- [ ] **Step 4: Commit**

```bash
git add docs/navigation-flow.md docs/navigation-actions.yaml
git commit -m "docs(nav): document the AI connect wizard modal + chat button"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all tests pass (including the new `ai/` suites and updated `ChatBox`).

- [ ] **Step 2: Lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Confirm the branch diff is scoped**

Run: `git diff main...HEAD --stat`
Expected: only the files in the File Structure table changed.

---

## Self-Review (completed during planning)

- **Spec coverage:** trigger/lifecycle → Tasks 2 & 5; 3-step wizard → Task 3; per-platform
  content → Task 1; API-key link-only → Task 3 (advanced toggle, no minting); re-open button →
  Task 4; manage-connections link → Tasks 3 & 5; prompts → Tasks 1 & 3; docs → Task 6;
  tests → every component task. ✓
- **Placeholders:** none — all code is concrete. The `[paste the job description]` text is
  intentional prompt copy, not a plan placeholder.
- **Type consistency:** `PlatformId`, `Platform`, `StarterPrompt`, `LAST_VERIFIED`,
  `shouldAutoOpenAiConnect(tourCompleted, seen)`, props `{open, onClose, onManageConnections}`
  and `onConnectAi` are used identically across tasks.
- **Known precondition:** Task 5 Step 1 exports `isTourCompleted` from `GuidedTour.tsx`
  (currently unexported) — called out inline.
```
