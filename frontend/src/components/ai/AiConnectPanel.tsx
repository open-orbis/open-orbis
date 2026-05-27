import { useState } from 'react';
import {
  PLATFORMS,
  STARTER_PROMPTS,
  LAST_VERIFIED,
  type PlatformId,
} from './aiPlatforms';

const MCP_URL = import.meta.env.VITE_MCP_URL ?? 'http://localhost:8081/mcp';

/**
 * The "Connect" tab body of ConnectedAiClientsModal: the MCP URL, a platform
 * picker, and — once a platform is chosen — its connection steps and a few
 * starter prompts. Pure content (no modal chrome); the hosting modal owns the
 * backdrop, focus trap, and close affordances.
 */
export default function AiConnectPanel() {
  const [platformId, setPlatformId] = useState<PlatformId | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const platform = PLATFORMS.find((p) => p.id === platformId) ?? null;
  const prompts = STARTER_PROMPTS.filter(
    (p) => !p.platformId || p.platformId === platformId,
  );

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
  }

  return (
    <div>
      <p className="text-white/55 text-xs mb-4 leading-relaxed">
        Connect your Orbis to an AI assistant as an MCP server — so it can draft a
        tailored CV, a bio, or even build your site from your data.
      </p>

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

      <p className="text-[10px] uppercase tracking-[0.14em] text-white/30 font-semibold mb-2">
        Pick your AI
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={platformId === p.id}
            onClick={() => selectPlatform(p.id)}
            className={`flex items-center gap-3 text-left rounded-lg border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
              platformId === p.id
                ? 'border-cyan-400/60 bg-cyan-500/[0.08]'
                : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-cyan-400/40'
            }`}
          >
            <span className="text-lg" aria-hidden="true">{p.icon}</span>
            <span className="min-w-0">
              <span className="block text-white text-sm font-medium">{p.name}</span>
              <span className="block text-white/45 text-[11px] truncate">{p.supportHint}</span>
            </span>
          </button>
        ))}
      </div>

      {platform && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h3 className="text-white font-semibold text-sm">Connect to {platform.name}</h3>
            <span className="text-[10px] uppercase tracking-wider text-cyan-300/80 border border-cyan-500/30 rounded-full px-2 py-0.5">
              {platform.authBadge}
            </span>
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

          <p className="text-[10px] uppercase tracking-[0.14em] text-white/30 font-semibold mt-4 mb-2">
            Then try asking
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
        </div>
      )}

      <p className="text-white/20 text-[10px] mt-4 text-right">Steps verified {LAST_VERIFIED}</p>
    </div>
  );
}
