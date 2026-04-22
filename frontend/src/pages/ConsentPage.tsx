import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAuthorizeContext, submitConsent, type AuthorizeContext } from '../api/oauth';
import { listShareTokens, type ShareToken } from '../api/orbs';

export default function ConsentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);

  const [ctx, setCtx] = useState<AuthorizeContext | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'full' | 'restricted'>('full');
  const [tokens, setTokens] = useState<ShareToken[]>([]);
  const [pickedTokenId, setPickedTokenId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getAuthorizeContext(params)
      .then((c) => {
        if (c.login_required) {
          navigate(`/login?next=${encodeURIComponent(c.next ?? '/myorbis')}`);
          return;
        }
        setCtx(c);
      })
      .catch((e) => setErr(e?.response?.data?.detail ?? 'Authorization failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === 'restricted' && tokens.length === 0) {
      listShareTokens().then((r) => setTokens(r.tokens.filter((t) => !t.revoked)));
    }
  }, [mode, tokens.length]);

  async function onAllow() {
    if (!ctx) return;
    setSubmitting(true);
    try {
      const result = await submitConsent({
        client_id: ctx.client_id!,
        redirect_uri: ctx.redirect_uri!,
        state: params.get('state') ?? '',
        code_challenge: params.get('code_challenge') ?? '',
        code_challenge_method: 'S256',
        scope: ctx.scope,
        access_mode: mode,
        share_token_id: mode === 'restricted' ? pickedTokenId : undefined,
      });
      const u = new URL(result.redirect_uri);
      u.searchParams.set('code', result.code);
      u.searchParams.set('state', result.state);
      window.location.assign(u.toString());
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { detail?: string } } };
      setErr(axiosErr?.response?.data?.detail ?? 'Consent failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (err) return <div className="p-8 text-red-400">{err}</div>;
  if (!ctx) return <div className="p-8 text-gray-400">Loading…</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="max-w-md w-full p-6 rounded-xl border border-gray-700 bg-gray-900 shadow-xl">
        <h1 className="text-white text-lg font-semibold mb-2">
          {ctx.client_name} wants to access your Orbis data.
        </h1>
        <p className="text-gray-400 text-sm mb-4">
          Choose how much of your data {ctx.client_name} can read.
        </p>

        <label className="flex items-start gap-2 mb-3 text-white cursor-pointer">
          <input
            type="radio"
            checked={mode === 'full'}
            onChange={() => setMode('full')}
            className="mt-1"
          />
          <span>
            <strong>Full access.</strong>{' '}
            <span className="text-gray-400 text-sm">
              {ctx.client_name} reads your own orb, shared orbs, and any public orbs.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 mb-4 text-white cursor-pointer">
          <input
            type="radio"
            checked={mode === 'restricted'}
            onChange={() => setMode('restricted')}
            className="mt-1"
          />
          <span className="flex-1">
            <strong>Restricted access.</strong>{' '}
            <span className="text-gray-400 text-sm">
              Use a share token to limit what {ctx.client_name} sees.
            </span>
            {mode === 'restricted' && (
              <select
                value={pickedTokenId}
                onChange={(e) => setPickedTokenId(e.target.value)}
                className="mt-2 w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-white text-xs"
              >
                <option value="">— pick a share token —</option>
                {tokens.map((t) => (
                  <option key={t.token_id} value={t.token_id}>
                    {t.label ?? `Token ${t.token_id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            )}
          </span>
        </label>

        <p className="text-[10px] text-gray-500 mb-4">
          Registered: {new Date(ctx.registered_at ?? '').toLocaleString()} ·
          from IP {ctx.registered_from_ip ?? '—'} · client id {ctx.client_id}
        </p>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="h-8 px-3 rounded border border-gray-700 bg-gray-800 text-white text-xs"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={onAllow}
            disabled={submitting || (mode === 'restricted' && !pickedTokenId)}
            className="h-8 px-3 rounded bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium disabled:opacity-50"
          >
            {submitting ? 'Approving…' : 'Allow'}
          </button>
        </div>
      </div>
    </div>
  );
}
