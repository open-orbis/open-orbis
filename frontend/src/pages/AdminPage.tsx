import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import {
  getStats,
  listAccessCodes,
  listPendingUsers,
  listUsers,
  getUser,
  activateUser,
  activateUsersBatch,
  promoteUser,
  demoteUser,
  deleteUser,
  createAccessCode,
  createBatchAccessCodes,
  toggleAccessCode,
  deleteAccessCode,
  updateBetaConfig,
  type AdminStats,
  type AccessCode,
  type PendingUser,
  type AdminUser,
  type AdminUserDetail,
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
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'codes' | 'pending' | 'users'>('codes');
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

  // Copy feedback
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Code selection
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  // Users tab state
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'active' | 'pending' | 'admin'>('all');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [batchReport, setBatchReport] = useState<{
    title: string;
    deleted: string[];
    failed: { name: string; reason: string }[];
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, c, p, u] = await Promise.all([
        getStats(),
        listAccessCodes(),
        listPendingUsers(),
        listUsers(),
      ]);
      setStats(s);
      setCodes(c);
      setPendingUsers(p);
      setUsers(u);
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

  const handleToggleCode = (code: string, active: boolean) => {
    setConfirmAction({
      title: active ? 'Attivare codice?' : 'Disattivare codice?',
      message: active
        ? `Il codice "${code}" tornerà utilizzabile.`
        : `Il codice "${code}" non potrà essere utilizzato finché non verrà riattivato.`,
      confirmLabel: active ? 'Attiva' : 'Disattiva',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await toggleAccessCode(code, active);
          await refresh();
        } catch {
          setError('Errore nel toggle del codice.');
        }
      },
    });
  };

  const handleDeleteCode = (code: string) => {
    setConfirmAction({
      title: 'Eliminare codice?',
      message: `Il codice "${code}" verrà eliminato permanentemente.`,
      confirmLabel: 'Elimina',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await deleteAccessCode(code);
          await refresh();
        } catch {
          setError('Errore nella cancellazione del codice.');
        }
      },
    });
  };

  const handleBatchDeleteCodes = () => {
    if (selectedCodes.size === 0) return;
    setConfirmAction({
      title: `Eliminare ${selectedCodes.size} codici?`,
      message: 'Tutti i codici selezionati verranno eliminati permanentemente.',
      confirmLabel: `Elimina ${selectedCodes.size}`,
      onConfirm: async () => {
        setConfirmAction(null);
        const deleted: string[] = [];
        const failed: { name: string; reason: string }[] = [];
        for (const code of selectedCodes) {
          try {
            await deleteAccessCode(code);
            deleted.push(code);
          } catch (err: unknown) {
            let reason = 'Errore sconosciuto';
            if (err && typeof err === 'object' && 'response' in err) {
              const resp = (err as { response?: { data?: { detail?: string } } }).response;
              if (resp?.data?.detail) reason = resp.data.detail;
            }
            failed.push({ name: code, reason });
          }
        }
        setSelectedCodes(new Set());
        await refresh();
        setBatchReport({ title: 'Risultato eliminazione codici', deleted, failed });
      },
    });
  };

  const toggleCodeSelection = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode((prev) => (prev === code ? null : prev)), 1500);
  };

  // ── User management handlers ──

  const handleActivateUser = (userId: string, userName: string) => {
    setConfirmAction({
      title: 'Attivare utente?',
      message: `Verrà generato un codice invito e assegnato automaticamente a ${userName || userId}.`,
      confirmLabel: 'Attiva',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await activateUser(userId);
          await refresh();
        } catch {
          setError("Errore nell'attivazione dell'utente.");
        }
      },
    });
  };

  const handleBatchActivate = () => {
    const pending = Array.from(selectedUsers).filter((id) =>
      users.find((u) => u.user_id === id && !u.signup_code && !u.is_admin),
    );
    if (pending.length === 0) return;
    setConfirmAction({
      title: `Attivare ${pending.length} utenti?`,
      message: 'Verrà generato un codice invito per ciascun utente selezionato.',
      confirmLabel: `Attiva ${pending.length}`,
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await activateUsersBatch(pending);
          setSelectedUsers(new Set());
          await refresh();
        } catch {
          setError("Errore nell'attivazione batch.");
        }
      },
    });
  };

  const handleBatchDelete = () => {
    if (selectedUsers.size === 0) return;
    setConfirmAction({
      title: `Eliminare ${selectedUsers.size} utenti?`,
      message: 'Tutti gli account selezionati e i loro dati verranno eliminati permanentemente. Questa azione è irreversibile.',
      confirmLabel: `Elimina ${selectedUsers.size}`,
      onConfirm: async () => {
        setConfirmAction(null);
        const deleted: string[] = [];
        const failed: { name: string; reason: string }[] = [];
        for (const uid of selectedUsers) {
          const user = users.find((u) => u.user_id === uid);
          const name = user?.name || uid;
          try {
            await deleteUser(uid);
            deleted.push(name);
          } catch (err: unknown) {
            let reason = 'Errore sconosciuto';
            if (err && typeof err === 'object' && 'response' in err) {
              const resp = (err as { response?: { data?: { detail?: string } } }).response;
              if (resp?.data?.detail) {
                reason = resp.data.detail === 'Cannot delete yourself'
                  ? 'Non puoi eliminare te stesso'
                  : resp.data.detail;
              }
            }
            failed.push({ name, reason });
          }
        }
        setSelectedUsers(new Set());
        await refresh();
        setBatchReport({
          title: 'Risultato eliminazione',
          deleted,
          failed,
        });
      },
    });
  };

  const handlePromoteUser = (userId: string, userName: string) => {
    setConfirmAction({
      title: 'Promuovere ad admin?',
      message: `${userName || userId} avrà accesso completo alla dashboard di amministrazione.`,
      confirmLabel: 'Promuovi',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await promoteUser(userId);
          await refresh();
        } catch {
          setError('Errore nella promozione.');
        }
      },
    });
  };

  const handleDemoteUser = (userId: string, userName: string) => {
    setConfirmAction({
      title: 'Revocare admin?',
      message: `${userName || userId} perderà i privilegi di amministrazione.`,
      confirmLabel: 'Revoca',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await demoteUser(userId);
          await refresh();
        } catch {
          setError('Errore nella revoca.');
        }
      },
    });
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    setConfirmAction({
      title: 'Eliminare utente?',
      message: `L'account di ${userName || userId} e tutti i suoi dati verranno eliminati permanentemente. Questa azione è irreversibile.`,
      confirmLabel: 'Elimina definitivamente',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await deleteUser(userId);
          setShowDetail(false);
          setUserDetail(null);
          await refresh();
        } catch {
          setError("Errore nell'eliminazione dell'utente.");
        }
      },
    });
  };

  const handleShowDetail = async (userId: string) => {
    try {
      const detail = await getUser(userId);
      setUserDetail(detail);
      setShowDetail(true);
    } catch {
      setError('Errore nel caricamento dei dettagli utente.');
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const hasPendingSelected = Array.from(selectedUsers).some((id) =>
    users.find((u) => u.user_id === id && !u.signup_code && !u.is_admin),
  );

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !userSearch ||
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.user_id.toLowerCase().includes(userSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (userFilter === 'active') return u.signup_code !== null || u.is_admin;
    if (userFilter === 'pending') return u.signup_code === null && !u.is_admin;
    if (userFilter === 'admin') return u.is_admin;
    return true;
  });

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
            Waiting List ({pendingUsers.length})
          </button>
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'users' ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white/60'
            }`}
          >
            Utenti ({users.length})
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
                      <th className="w-8 px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={filteredCodes.length > 0 && filteredCodes.every((c) => selectedCodes.has(c.code))}
                          onChange={() => {
                            const allSelected = filteredCodes.every((c) => selectedCodes.has(c.code));
                            setSelectedCodes(allSelected ? new Set() : new Set(filteredCodes.map((c) => c.code)));
                          }}
                          className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-purple-500"
                        />
                      </th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Codice</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Label</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Stato</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Usato da</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Creato</th>
                      <th className="text-right text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Azioni</th>
                    </tr>
                    {selectedCodes.size > 0 && (
                      <tr className="border-b border-purple-500/20 bg-purple-500/[0.06]">
                        <td colSpan={7} className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-purple-300">{selectedCodes.size} selezionati</span>
                            <button
                              onClick={handleBatchDeleteCodes}
                              className="text-xs bg-red-600 hover:bg-red-500 text-white font-medium px-3 py-1 rounded-md transition-colors"
                            >
                              Elimina selezionati
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {filteredCodes.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-white/20 py-8">Nessun codice trovato.</td></tr>
                    )}
                    {filteredCodes.map((c) => (
                      <tr key={c.code} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={selectedCodes.has(c.code)}
                            onChange={() => toggleCodeSelection(c.code)}
                            className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-purple-500"
                          />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-purple-300">
                          <button onClick={() => handleCopy(c.code)} title="Copia codice" className="hover:text-purple-200 transition-colors">
                            {copiedCode === c.code ? <span className="text-green-400">Copiato!</span> : c.code}
                          </button>
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
                            <button onClick={() => handleDeleteCode(c.code)} className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1 rounded transition-colors">Elimina</button>
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
                      <th className="text-right text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingUsers.length === 0 && (
                      <tr><td colSpan={5} className="text-center text-white/20 py-8">Nessun utente in attesa di attivazione.</td></tr>
                    )}
                    {pendingUsers.map((u) => (
                      <tr key={u.user_id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-white/70">{u.name || '—'}</td>
                        <td className="px-4 py-2.5 text-white/50 text-xs">{u.email || '—'}</td>
                        <td className="px-4 py-2.5 text-white/40 text-xs">{u.provider}</td>
                        <td className="px-4 py-2.5 text-white/30 text-xs">{formatDate(u.created_at)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleActivateUser(u.user_id, u.name)} className="text-xs text-green-400/70 hover:text-green-400 px-2 py-1 rounded transition-colors">Attiva</button>
                            <button onClick={() => handleDeleteUser(u.user_id, u.name)} className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1 rounded transition-colors">Elimina</button>
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

        {/* ── Users Tab ── */}
        {tab === 'users' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Cerca per nome, email o ID..."
                className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-purple-500/40 text-white text-sm rounded-lg px-3 py-2 outline-none placeholder:text-white/20"
              />
              <div className="flex gap-2">
                {(['all', 'active', 'pending', 'admin'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setUserFilter(f)}
                    className={`text-xs px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
                      userFilter === f
                        ? 'bg-white/[0.08] border-white/[0.15] text-white'
                        : 'border-white/[0.06] text-white/30 hover:text-white/50'
                    }`}
                  >
                    {f === 'all' ? 'Tutti' : f === 'active' ? 'Attivi' : f === 'pending' ? 'In attesa' : 'Admin'}
                  </button>
                ))}
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="w-8 px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={filteredUsers.length > 0 && filteredUsers.every((u) => selectedUsers.has(u.user_id))}
                          onChange={() => {
                            const allSelected = filteredUsers.every((u) => selectedUsers.has(u.user_id));
                            setSelectedUsers(allSelected ? new Set() : new Set(filteredUsers.map((u) => u.user_id)));
                          }}
                          className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-purple-500"
                        />
                      </th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Nome</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Email</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Stato</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Codice</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Provider</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Registrato</th>
                      <th className="text-right text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Azioni</th>
                    </tr>
                    {selectedUsers.size > 0 && (
                      <tr className="border-b border-purple-500/20 bg-purple-500/[0.06]">
                        <td colSpan={8} className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-purple-300">{selectedUsers.size} selezionati</span>
                            {hasPendingSelected && (
                              <button
                                onClick={handleBatchActivate}
                                className="text-xs bg-green-600 hover:bg-green-500 text-white font-medium px-3 py-1 rounded-md transition-colors"
                              >
                                Attiva selezionati
                              </button>
                            )}
                            <button
                              onClick={handleBatchDelete}
                              className="text-xs bg-red-600 hover:bg-red-500 text-white font-medium px-3 py-1 rounded-md transition-colors"
                            >
                              Elimina selezionati
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={8} className="text-center text-white/20 py-8">Nessun utente trovato.</td></tr>
                    )}
                    {filteredUsers.map((u) => {
                      const isPending = !u.signup_code && !u.is_admin;
                      return (
                        <tr key={u.user_id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="px-4 py-2.5">
                            <input
                              type="checkbox"
                              checked={selectedUsers.has(u.user_id)}
                              onChange={() => toggleUserSelection(u.user_id)}
                              className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-purple-500"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => handleShowDetail(u.user_id)}
                              className="text-white/70 hover:text-purple-300 transition-colors text-left"
                            >
                              {u.name || '—'}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-white/50 text-xs">{u.email || '—'}</td>
                          <td className="px-4 py-2.5">
                            {u.is_admin ? (
                              <span className="text-xs bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-md">admin</span>
                            ) : u.signup_code ? (
                              <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-md">attivo</span>
                            ) : (
                              <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md">in attesa</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-white/30 font-mono text-xs">{u.signup_code || '—'}</td>
                          <td className="px-4 py-2.5 text-white/40 text-xs">{u.provider}</td>
                          <td className="px-4 py-2.5 text-white/30 text-xs">{formatDate(u.created_at)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isPending && (
                                <button onClick={() => handleActivateUser(u.user_id, u.name)} className="text-xs text-green-400/70 hover:text-green-400 px-2 py-1 rounded transition-colors">Attiva</button>
                              )}
                              {!u.is_admin ? (
                                <button onClick={() => handlePromoteUser(u.user_id, u.name)} className="text-xs text-purple-400/70 hover:text-purple-400 px-2 py-1 rounded transition-colors">Admin</button>
                              ) : (
                                <button onClick={() => handleDemoteUser(u.user_id, u.name)} className="text-xs text-amber-400/70 hover:text-amber-400 px-2 py-1 rounded transition-colors">Revoca</button>
                              )}
                              <button onClick={() => handleDeleteUser(u.user_id, u.name)} className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1 rounded transition-colors">Elimina</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* ── User Detail Dialog ── */}
      <AnimatePresence>
        {showDetail && userDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={() => { setShowDetail(false); setUserDetail(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-neutral-950 border border-white/10 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-white font-semibold text-lg">{userDetail.name || '—'}</h3>
                  <p className="text-white/40 text-sm">{userDetail.email}</p>
                </div>
                <button
                  onClick={() => { setShowDetail(false); setUserDetail(null); }}
                  className="text-white/30 hover:text-white/60 text-lg"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">User ID</div>
                  <div className="text-white/70 font-mono text-xs break-all">{userDetail.user_id}</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Orb ID</div>
                  <div className="text-white/70 font-mono text-xs">{userDetail.orb_id || '—'}</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Provider</div>
                  <div className="text-white/70">{userDetail.provider}</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Stato</div>
                  <div>
                    {userDetail.is_admin ? (
                      <span className="text-xs bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-md">admin</span>
                    ) : userDetail.signup_code ? (
                      <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-md">attivo</span>
                    ) : (
                      <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md">in attesa</span>
                    )}
                  </div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Nodi nel grafo</div>
                  <div className="text-white text-lg font-bold">{userDetail.node_count}</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">GDPR</div>
                  <div className="text-white/70">{userDetail.gdpr_consent ? 'Consenso dato' : 'Non dato'}</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Registrato</div>
                  <div className="text-white/70 text-xs">{formatDate(userDetail.created_at)}</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Attivato</div>
                  <div className="text-white/70 text-xs">{formatDate(userDetail.activated_at)}</div>
                </div>
                {userDetail.signup_code && (
                  <div className="bg-white/[0.03] rounded-lg p-3 col-span-2">
                    <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Codice usato</div>
                    <div className="text-purple-300 font-mono text-xs">{userDetail.signup_code}</div>
                  </div>
                )}
                {userDetail.headline && (
                  <div className="bg-white/[0.03] rounded-lg p-3 col-span-2">
                    <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Headline</div>
                    <div className="text-white/70">{userDetail.headline}</div>
                  </div>
                )}
                {userDetail.location && (
                  <div className="bg-white/[0.03] rounded-lg p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Location</div>
                    <div className="text-white/70">{userDetail.location}</div>
                  </div>
                )}
                {userDetail.deletion_requested_at && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 col-span-2">
                    <div className="text-red-400 text-xs uppercase tracking-wider mb-1">Cancellazione richiesta</div>
                    <div className="text-red-300 text-xs">{formatDate(userDetail.deletion_requested_at)}</div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-5 pt-4 border-t border-white/[0.06]">
                {!userDetail.signup_code && !userDetail.is_admin && (
                  <button
                    onClick={() => { setShowDetail(false); handleActivateUser(userDetail.user_id, userDetail.name); }}
                    className="text-xs bg-green-600 hover:bg-green-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Attiva
                  </button>
                )}
                {!userDetail.is_admin ? (
                  <button
                    onClick={() => { setShowDetail(false); handlePromoteUser(userDetail.user_id, userDetail.name); }}
                    className="text-xs bg-purple-600 hover:bg-purple-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Promuovi admin
                  </button>
                ) : (
                  <button
                    onClick={() => { setShowDetail(false); handleDemoteUser(userDetail.user_id, userDetail.name); }}
                    className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Revoca admin
                  </button>
                )}
                <button
                  onClick={() => { setShowDetail(false); handleDeleteUser(userDetail.user_id, userDetail.name); }}
                  className="text-xs bg-red-600 hover:bg-red-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  Elimina utente
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Batch Report Dialog ── */}
      <AnimatePresence>
        {batchReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={() => setBatchReport(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-neutral-950 border border-white/10 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
            >
              <h3 className="text-white font-semibold mb-4">{batchReport.title}</h3>

              {batchReport.deleted.length > 0 && (
                <div className="mb-4">
                  <div className="text-green-400 text-xs uppercase tracking-wider font-medium mb-2">
                    Eliminati ({batchReport.deleted.length})
                  </div>
                  <ul className="space-y-1">
                    {batchReport.deleted.map((name) => (
                      <li key={name} className="text-white/60 text-sm flex items-center gap-2">
                        <span className="text-green-400 text-xs">&#10003;</span> {name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {batchReport.failed.length > 0 && (
                <div className="mb-4">
                  <div className="text-red-400 text-xs uppercase tracking-wider font-medium mb-2">
                    Non eliminati ({batchReport.failed.length})
                  </div>
                  <ul className="space-y-1">
                    {batchReport.failed.map((f) => (
                      <li key={f.name} className="text-sm flex items-start gap-2">
                        <span className="text-red-400 text-xs mt-0.5">&#10007;</span>
                        <span>
                          <span className="text-white/60">{f.name}</span>
                          <span className="text-white/30"> — {f.reason}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setBatchReport(null)}
                  className="text-sm bg-white/[0.06] hover:bg-white/[0.1] text-white/70 font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Chiudi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
