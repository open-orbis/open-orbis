import { useEffect, useState } from 'react';
import { listGrants, revokeGrant, type OAuthGrant } from '../api/oauth';
import { useToastStore } from '../stores/toastStore';

export default function ConnectedAiClientsPage() {
  const [grants, setGrants] = useState<OAuthGrant[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const { addToast } = useToastStore();

  useEffect(() => {
    listGrants()
      .then((r) => setGrants(r.grants))
      .catch((e) => setErr(e?.response?.data?.detail ?? 'Failed to load grants'));
  }, []);

  async function onRevoke(clientId: string, clientName: string) {
    setRevoking(clientId);
    try {
      await revokeGrant(clientId);
      setGrants((gs) => (gs ?? []).filter((g) => g.client_id !== clientId));
      addToast(`Revoked ${clientName}`, 'success');
    } catch {
      addToast(`Failed to revoke ${clientName}`, 'error');
    } finally {
      setRevoking(null);
    }
  }

  if (err) return <div className="p-8 text-red-400">{err}</div>;
  if (grants === null) return <div className="p-8 text-gray-400">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-white text-lg font-semibold mb-2">Connected AI clients</h1>
      <p className="text-gray-400 text-sm mb-4">
        AI agents that can read your Orbis data via OAuth.
      </p>
      {grants.length === 0 ? (
        <p className="text-gray-500 text-sm">Nothing connected yet.</p>
      ) : (
        <ul className="space-y-3">
          {grants.map((g) => (
            <li
              key={`${g.client_id}:${g.share_token_id ?? ''}`}
              className="border border-gray-700 rounded-lg p-3 bg-gray-900/60"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium truncate">{g.client_name}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {g.share_token_id
                      ? `Restricted: ${g.share_token_label ?? g.share_token_id.slice(0, 8)}`
                      : 'Full access'}
                    {' · Connected '}
                    {new Date(g.connected_at).toLocaleDateString()}
                    {g.last_used_at
                      ? ` · Last used ${new Date(g.last_used_at).toLocaleString()}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={revoking === g.client_id}
                  onClick={() => onRevoke(g.client_id, g.client_name)}
                  className="h-7 px-3 rounded border border-red-500/50 text-red-300 text-xs disabled:opacity-50"
                >
                  {revoking === g.client_id ? 'Revoking…' : 'Revoke'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
