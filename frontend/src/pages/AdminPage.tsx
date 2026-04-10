import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import {
  getStats,
  listAccessCodes,
  listPendingUsers,
  createAccessCode,
  createBatchAccessCodes,
  toggleAccessCode,
  deleteAccessCode,
  updateBetaConfig,
  type AdminStats,
  type AccessCode,
  type PendingUser,
} from '../api/admin';

// ── Helpers ──

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ── Stat Card ──

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex flex-col gap-1">
      <div className="text-white/40 text-xs uppercase tracking-wider font-medium">{label}</div>
      <div className="text-white text-2xl font-bold">{value}</div>
      {sub && <div className="text-white/25 text-xs">{sub}</div>}
    </div>
  );
}

// ── Confirmation Dialog ──

function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative bg-neutral-950 border border-white/10 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
      >
        <h3 className="text-white font-semibold mb-2">{title}</h3>
        <p className="text-white/40 text-sm mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="text-sm text-white/50 hover:text-white/70 px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            className="text-sm bg-purple-600 hover:bg-purple-500 text-white font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Page ──

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'codes' | 'pending'>('codes');
  const [error, setError] = useState<string | null>(null);

  // Create code form
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);

  // Batch form
  const [batchPrefix, setBatchPrefix] = useState('');
  const [batchCount, setBatchCount] = useState(10);
  const [batchLabel, setBatchLabel] = useState('');
  const [batchCreating, setBatchCreating] = useState(false);

  // Filter
  const [codeFilter, setCodeFilter] = useState<'all' | 'available' | 'used'>('all');

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, c, p] = await Promise.all([getStats(), listAccessCodes(), listPendingUsers()]);
      setStats(s);
      setCodes(c);
      setPendingUsers(p);
      setError(null);
    } catch {
      setError('Errore nel caricamento dei dati.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Toggle invite code requirement (with confirmation) ──
  const handleToggleInviteCode = () => {
    if (!stats) return;
    const turning = stats.invite_code_required ? 'off' : 'on';
    setConfirmAction({
      title: turning === 'off'
        ? 'Disattivare il codice invito?'
        : 'Attivare il codice invito?',
      message: turning === 'off'
        ? 'Tutti gli utenti potranno accedere alla piattaforma senza codice. Sei sicuro di voler aprire la piattaforma a tutti?'
        : 'Gli utenti non ancora attivati dovranno inserire un codice di invito per accedere alla piattaforma.',
      confirmLabel: turning === 'off' ? 'Apri la piattaforma' : 'Richiedi codice',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await updateBetaConfig({ invite_code_required: !stats.invite_code_required });
          await refresh();
        } catch {
          setError('Errore nel toggle.');
        }
      },
    });
  };

  const handleCreateCode = async () => {
    if (!newCode.trim()) return;
    setCreating(true);
    try {
      await createAccessCode(newCode.trim(), newLabel.trim());
      setNewCode('');
      setNewLabel('');
      await refresh();
    } catch {
      setError('Errore nella creazione del codice.');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!batchPrefix.trim() || batchCount < 1) return;
    setBatchCreating(true);
    try {
      await createBatchAccessCodes(batchPrefix.trim(), batchCount, batchLabel.trim());
      setBatchPrefix('');
      setBatchCount(10);
      setBatchLabel('');
      await refresh();
    } catch {
      setError('Errore nella creazione batch.');
    } finally {
      setBatchCreating(false);
    }
  };

  const handleToggleCode = async (code: string, active: boolean) => {
    try {
      await toggleAccessCode(code, active);
      await refresh();
    } catch {
      setError('Errore nel toggle del codice.');
    }
  };

  const handleDeleteCode = async (code: string) => {
    try {
      await deleteAccessCode(code);
      await refresh();
    } catch {
      setError('Errore nella cancellazione del codice.');
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const filteredCodes = codes.filter((c) => {
    if (codeFilter === 'available') return c.used_at === null && c.active;
    if (codeFilter === 'used') return c.used_at !== null;
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar center={<span className="text-white/50 text-sm font-medium">Admin Dashboard</span>} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-20">
        {error && (
          <div className="mb-4 text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-300">x</button>
          </div>
        )}

        {/* ── Stats Overview ── */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-lg font-semibold">Overview</h2>
              <button
                onClick={handleToggleInviteCode}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  stats.invite_code_required
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                    : 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20'
                }`}
              >
                {stats.invite_code_required ? 'Codice invito: OBBLIGATORIO' : 'Piattaforma: APERTA A TUTTI'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Utenti registrati" value={stats.registered} />
              <StatCard label="In attesa di codice" value={stats.pending_activation} />
              <StatCard label="Codici disponibili" value={stats.invite_codes.available} sub={`${stats.invite_codes.used} usati su ${stats.invite_codes.total}`} />
              <StatCard label="Codici totali" value={stats.invite_codes.total} />
            </div>
          </motion.div>
        )}

        {/* ── Tab Selector ── */}
        <div className="flex gap-1 mb-6 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('codes')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'codes' ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white/60'
            }`}
          >
            Codici invito ({codes.length})
          </button>
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'pending' ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white/60'
            }`}
          >
            Utenti in attesa ({pendingUsers.length})
          </button>
        </div>

        {/* ── Codes Tab ── */}
        {tab === 'codes' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Create single */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-4">
              <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-3">Crea codice singolo</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="text" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Codice (es. invito-mario)" className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-purple-500/40 text-white text-sm rounded-lg px-3 py-2 outline-none placeholder:text-white/20" />
                <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (opz.)" className="sm:w-40 bg-white/[0.04] border border-white/[0.08] focus:border-purple-500/40 text-white text-sm rounded-lg px-3 py-2 outline-none placeholder:text-white/20" />
                <button onClick={handleCreateCode} disabled={creating || !newCode.trim()} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap">{creating ? '...' : 'Crea'}</button>
              </div>
            </div>

            {/* Create batch */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-4">
              <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-3">Genera codici in batch</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="text" value={batchPrefix} onChange={(e) => setBatchPrefix(e.target.value)} placeholder="Prefisso (es. launch)" className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-purple-500/40 text-white text-sm rounded-lg px-3 py-2 outline-none placeholder:text-white/20" />
                <input type="number" value={batchCount} onChange={(e) => setBatchCount(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={500} className="sm:w-24 bg-white/[0.04] border border-white/[0.08] focus:border-purple-500/40 text-white text-sm rounded-lg px-3 py-2 outline-none" />
                <input type="text" value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="Label (opz.)" className="sm:w-36 bg-white/[0.04] border border-white/[0.08] focus:border-purple-500/40 text-white text-sm rounded-lg px-3 py-2 outline-none placeholder:text-white/20" />
                <button onClick={handleCreateBatch} disabled={batchCreating || !batchPrefix.trim()} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap">{batchCreating ? '...' : `Genera ${batchCount}`}</button>
              </div>
            </div>

            {/* Filter */}
            <div className="flex gap-2 mb-3">
              {(['all', 'available', 'used'] as const).map((f) => (
                <button key={f} onClick={() => setCodeFilter(f)} className={`text-xs px-3 py-1 rounded-md border transition-colors ${codeFilter === f ? 'bg-white/[0.08] border-white/[0.15] text-white' : 'border-white/[0.06] text-white/30 hover:text-white/50'}`}>
                  {f === 'all' ? `Tutti (${codes.length})` : f === 'available' ? `Disponibili (${codes.filter((c) => !c.used_at && c.active).length})` : `Usati (${codes.filter((c) => c.used_at).length})`}
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Codice</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Label</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Stato</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Usato da</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Creato</th>
                      <th className="text-right text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCodes.length === 0 && (
                      <tr><td colSpan={6} className="text-center text-white/20 py-8">Nessun codice trovato.</td></tr>
                    )}
                    {filteredCodes.map((c) => (
                      <tr key={c.code} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 font-mono text-xs text-purple-300">
                          <button onClick={() => handleCopy(c.code)} title="Copia codice" className="hover:text-purple-200 transition-colors">{c.code}</button>
                        </td>
                        <td className="px-4 py-2.5 text-white/40">{c.label || '—'}</td>
                        <td className="px-4 py-2.5">
                          {c.used_at ? (
                            <span className="text-xs bg-white/[0.06] text-white/40 px-2 py-0.5 rounded-md">usato</span>
                          ) : c.active ? (
                            <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-md">disponibile</span>
                          ) : (
                            <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-md">disattivato</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-white/30 text-xs font-mono">{c.used_by || '—'}</td>
                        <td className="px-4 py-2.5 text-white/30 text-xs">{formatDate(c.created_at)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!c.used_at && (
                              <button onClick={() => handleToggleCode(c.code, !c.active)} className="text-xs text-white/30 hover:text-white/60 px-2 py-1 rounded transition-colors">{c.active ? 'Disattiva' : 'Attiva'}</button>
                            )}
                            {!c.used_at && (
                              <button onClick={() => handleDeleteCode(c.code)} className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1 rounded transition-colors">Elimina</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Pending Users Tab ── */}
        {tab === 'pending' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Nome</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Email</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Provider</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Registrato il</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingUsers.length === 0 && (
                      <tr><td colSpan={4} className="text-center text-white/20 py-8">Nessun utente in attesa di attivazione.</td></tr>
                    )}
                    {pendingUsers.map((u) => (
                      <tr key={u.user_id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-white/70">{u.name || '—'}</td>
                        <td className="px-4 py-2.5 text-white/50 text-xs">{u.email || '—'}</td>
                        <td className="px-4 py-2.5 text-white/40 text-xs">{u.provider}</td>
                        <td className="px-4 py-2.5 text-white/30 text-xs">{formatDate(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Confirmation Dialog ── */}
      <AnimatePresence>
        {confirmAction && (
          <ConfirmDialog
            title={confirmAction.title}
            message={confirmAction.message}
            confirmLabel={confirmAction.confirmLabel}
            onConfirm={confirmAction.onConfirm}
            onCancel={() => setConfirmAction(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
