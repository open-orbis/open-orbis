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
