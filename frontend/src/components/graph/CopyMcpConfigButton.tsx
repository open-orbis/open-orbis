import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface Props {
  tokenId: string;
  label: string | null;
  onCopied?: () => void;
}

function normalizeLabel(label: string | null, tokenId: string): string {
  if (label) {
    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (slug) return `orbis-${slug}`;
  }
  return `orbis-${tokenId.slice(0, 8)}`;
}

function buildSnippet(tokenId: string, label: string | null): string {
  const mcpUrl = import.meta.env.VITE_MCP_URL ?? 'http://localhost:8081/mcp';
  const name = normalizeLabel(label, tokenId);
  const cfg = {
    mcpServers: {
      [name]: {
        url: mcpUrl,
        headers: { 'X-MCP-Key': `orbs_${tokenId}` },
      },
    },
  };
  return JSON.stringify(cfg, null, 2);
}

function buildCurlExample(tokenId: string): string {
  const mcpUrl = import.meta.env.VITE_MCP_URL ?? 'http://localhost:8081/mcp';
  // MCP 2025-03 streamable-http requires:
  //   1. `initialize` first, which returns a Mcp-Session-Id response header
  //   2. Every subsequent call must echo that session id
  //   3. `Accept: application/json, text/event-stream` on every request
  // A single curl can't do tools/list; a real AI client handles this
  // handshake automatically, but for sanity-checking a token with curl
  // we have to script the two steps.
  return `# Step 1: initialize — capture Mcp-Session-Id from response headers
SESSION=$(curl -sS -D - -o /dev/null -X POST ${mcpUrl} \\
  -H 'X-MCP-Key: orbs_${tokenId}' \\
  -H 'Accept: application/json, text/event-stream' \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}' \\
  | awk 'tolower($1) == "mcp-session-id:" {print $2}' | tr -d '\\r')

# Step 2: call a tool using the captured session
curl -X POST ${mcpUrl} \\
  -H 'X-MCP-Key: orbs_${tokenId}' \\
  -H 'Accept: application/json, text/event-stream' \\
  -H 'Content-Type: application/json' \\
  -H "Mcp-Session-Id: $SESSION" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'`;
}

export function CopyMcpConfigButton({ tokenId, label, onCopied }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCurl, setShowCurl] = useState(false);
  const snippet = buildSnippet(tokenId, label);
  const curl = buildCurlExample(tokenId);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  async function doCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    onCopied?.();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Copy MCP config"
        className="h-7 px-2 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-white text-[10px] font-medium transition-colors shrink-0"
      >
        Copy MCP config
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="MCP client config"
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="relative bg-gray-950 border border-white/10 rounded-2xl p-5 sm:p-6 w-[92vw] max-w-lg mx-2 sm:mx-4 shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0">
                  <h2 className="text-white font-semibold text-base">
                    Connect your AI client
                  </h2>
                  <p className="text-white/50 text-xs mt-1">
                    Paste this snippet into your MCP client's config to grant it
                    filtered read access to your orb.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="text-white/30 hover:text-white/70 transition-colors shrink-0 ml-3"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Compatible clients */}
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/30 font-semibold mb-2">
                Compatible with
              </p>
              <p className="text-white/60 text-xs mb-4">
                Cursor · Cline · Windsurf · Claude Code CLI · any streamable-http MCP client
              </p>

              {/* Snippet */}
              <div className="relative mb-3">
                <pre
                  data-testid="mcp-config-snippet"
                  className="bg-gray-900 border border-white/10 rounded-lg p-3 text-[11px] text-gray-200 font-mono overflow-x-auto whitespace-pre leading-relaxed"
                >
                  {snippet}
                </pre>
              </div>

              {/* Primary actions */}
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => doCopy(snippet)}
                  className="flex-1 h-9 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  {copied ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy snippet
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-9 px-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 text-xs font-medium transition-colors"
                >
                  Close
                </button>
              </div>

              {/* Claude Desktop note */}
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 mb-3 text-[11px] text-amber-200/80">
                <strong className="text-amber-300">Using Claude Desktop?</strong>{' '}
                Desktop's current MCP support is stdio-oriented. Wrap this
                endpoint with{' '}
                <code className="text-amber-100 bg-black/30 px-1 rounded">mcp-proxy</code>{' '}
                to bridge streamable-http → stdio, then point Desktop at the
                proxy.
              </div>

              {/* cURL test disclosure */}
              <button
                type="button"
                onClick={() => setShowCurl((v) => !v)}
                className="text-[11px] text-white/50 hover:text-white/80 transition-colors flex items-center gap-1.5 mb-2"
              >
                <svg
                  className={`w-3 h-3 transition-transform ${showCurl ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Test with cURL first
              </button>
              {showCurl && (
                <div className="mb-3">
                  <pre
                    data-testid="mcp-curl-example"
                    className="bg-gray-900 border border-white/10 rounded-lg p-3 text-[10px] text-gray-300 font-mono overflow-x-auto whitespace-pre leading-relaxed"
                  >
                    {curl}
                  </pre>
                  <p className="text-[10px] text-white/40 mt-2">
                    MCP streamable-http uses a session handshake — the first
                    call (<code className="bg-black/30 px-1 rounded">initialize</code>)
                    returns an{' '}
                    <code className="bg-black/30 px-1 rounded">Mcp-Session-Id</code>{' '}
                    header that every subsequent call must echo back. Real AI
                    clients handle this automatically; the two-step snippet
                    above is only for ad-hoc cURL testing.
                  </p>
                  <button
                    type="button"
                    onClick={() => doCopy(curl)}
                    className="mt-2 h-7 px-3 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 text-[10px] font-medium"
                  >
                    Copy cURL
                  </button>
                </div>
              )}

              {/* Security reminder */}
              <p className="text-[10px] text-white/40 border-t border-white/5 pt-3">
                ⚠ This token grants AI agents read access to your orb (filtered
                by this share token's rules). Revoke the token to cut off
                access instantly.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
