import { useState } from 'react';

interface Props {
  tokenId: string;
  label: string | null;
  onCopied?: () => void;
}

function normalizeLabel(label: string | null, tokenId: string): string {
  if (label) {
    const slug = label
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
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

export function CopyMcpConfigButton({ tokenId, label, onCopied }: Props) {
  const [open, setOpen] = useState(false);
  const snippet = buildSnippet(tokenId, label);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Copy MCP config"
        className="h-7 px-2 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-white text-[10px] font-medium transition-colors shrink-0"
      >
        Copy MCP config
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 mt-2 w-96 z-30 rounded-xl border border-gray-700 bg-gray-900 p-3 shadow-xl"
        >
          <p className="text-xs text-gray-400 mb-2">
            Paste this into your MCP client config (Cursor, Cline, Windsurf — any
            streamable-http client):
          </p>
          <pre
            data-testid="mcp-config-snippet"
            className="bg-gray-950 border border-gray-800 rounded p-2 text-[10px] text-gray-200 font-mono overflow-x-auto whitespace-pre"
          >
            {snippet}
          </pre>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(snippet);
                onCopied?.();
              }}
              className="h-7 px-3 rounded bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-medium"
            >
              Copy snippet
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-7 px-3 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-white text-[10px]"
            >
              Close
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">
            This token grants AI agents access to your orb. Revoke below if misused.
          </p>
        </div>
      )}
    </div>
  );
}
