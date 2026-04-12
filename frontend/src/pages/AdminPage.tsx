import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { useAuthStore } from '../stores/authStore';
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
  getFunnelMetrics,
  getInsights,
  listIdeas,
  deleteIdea,
  type AdminStats,
  type AccessCode,
  type PendingUser,
  type AdminUser,
  type AdminUserDetail,
  type Idea,
  type FunnelMetrics,
  type Insights,
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

function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
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

// ── Funnel Chart ──

function FunnelChart({ signups, activations }: { signups: { date: string; count: number }[]; activations: { date: string; count: number }[] }) {
  // Build a merged day-by-day map for the last 30 days
  const activationMap = new Map(activations.map((a) => [a.date, a.count]));
  const days = signups.length > 0 ? signups : activations;
  const maxCount = Math.max(1, ...days.map((d) => d.count), ...activations.map((a) => a.count));

  if (days.length === 0) {
    return <div className="text-white/20 text-sm text-center py-8">No data in the last 30 days.</div>;
  }

  return (
    <div className="flex items-end gap-[2px] h-40">
      {days.map((d) => {
        const signupH = (d.count / maxCount) * 100;
        const actH = ((activationMap.get(d.date) || 0) / maxCount) * 100;
        const shortDate = d.date.slice(5); // MM-DD
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative min-w-0">
            <div className="w-full flex flex-col items-center justify-end h-32">
              <div
                className="w-full bg-purple-500/30 rounded-t-sm relative"
                style={{ height: `${signupH}%`, minHeight: d.count > 0 ? '2px' : '0px' }}
              >
                {actH > 0 && (
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-green-500/50 rounded-t-sm"
                    style={{ height: `${(actH / signupH) * 100}%`, minHeight: '2px' }}
                  />
                )}
              </div>
            </div>
            <span className="text-[8px] text-white/20 leading-none truncate w-full text-center">{shortDate}</span>
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-neutral-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              <div className="text-white/60 mb-0.5">{d.date}</div>
              <div className="text-purple-300">Signups: {d.count}</div>
              <div className="text-green-300">Activations: {activationMap.get(d.date) || 0}</div>
            </div>
          </div>
        );
      })}
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
            Cancel
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
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [funnel, setFunnel] = useState<FunnelMetrics | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'codes' | 'pending' | 'users' | 'ideas' | 'funnel'>('codes');
  const [ideas, setIdeas] = useState<Idea[]>([]);
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

  const isPendingWaitlistUser = (
    u: Pick<AdminUser, 'signup_code' | 'is_admin' | 'waitlist_joined'>,
  ) => !u.signup_code && !u.is_admin && u.waitlist_joined;

  const refresh = useCallback(async () => {
    try {
      const [s, c, p, u, id, f, ins] = await Promise.all([
        getStats(),
        listAccessCodes(),
        listPendingUsers(),
        listUsers(),
        listIdeas(),
        getFunnelMetrics(30),
        getInsights(),
      ]);
      setStats(s);
      setCodes(c);
      setPendingUsers(p);
      setUsers(u);
      setIdeas(id);
      setFunnel(f);
      setInsights(ins);
      setError(null);
    } catch {
      setError('Error loading data.');
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
        ? 'Disable invite code requirement?'
        : 'Enable invite code requirement?',
      message: turning === 'off'
        ? 'All users will be able to access the platform without a code. Are you sure you want to open the platform to everyone?'
        : 'Unactivated users will need to enter an invite code to access the platform.',
      confirmLabel: turning === 'off' ? 'Open platform' : 'Require code',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await updateBetaConfig({ invite_code_required: !stats.invite_code_required });
          await refresh();
        } catch {
          setError('Error toggling setting.');
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
      setError('Error creating code.');
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
      setError('Error creating batch.');
    } finally {
      setBatchCreating(false);
    }
  };

  const handleToggleCode = (code: string, active: boolean) => {
    setConfirmAction({
      title: active ? 'Enable code?' : 'Disable code?',
      message: active
        ? `Code "${code}" will become usable again.`
        : `Code "${code}" will not be usable until re-enabled.`,
      confirmLabel: active ? 'Enable' : 'Disable',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await toggleAccessCode(code, active);
          await refresh();
        } catch {
          setError('Error toggling code.');
        }
      },
    });
  };

  const handleDeleteCode = (code: string) => {
    setConfirmAction({
      title: 'Delete code?',
      message: `Code "${code}" will be permanently deleted.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await deleteAccessCode(code);
          await refresh();
        } catch {
          setError('Error deleting code.');
        }
      },
    });
  };

  const handleBatchDeleteCodes = () => {
    if (selectedCodes.size === 0) return;
    setConfirmAction({
      title: `Delete ${selectedCodes.size} codes?`,
      message: 'All selected codes will be permanently deleted.',
      confirmLabel: `Delete ${selectedCodes.size}`,
      onConfirm: async () => {
        setConfirmAction(null);
        const deleted: string[] = [];
        const failed: { name: string; reason: string }[] = [];
        for (const code of selectedCodes) {
          try {
            await deleteAccessCode(code);
            deleted.push(code);
          } catch (err: unknown) {
            let reason = 'Unknown error';
            if (err && typeof err === 'object' && 'response' in err) {
              const resp = (err as { response?: { data?: { detail?: string } } }).response;
              if (resp?.data?.detail) reason = resp.data.detail;
            }
            failed.push({ name: code, reason });
          }
        }
        setSelectedCodes(new Set());
        await refresh();
        setBatchReport({ title: 'Code deletion results', deleted, failed });
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
      title: 'Activate user?',
      message: `An invite code will be generated and automatically assigned to ${userName || userId}.`,
      confirmLabel: 'Activate',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await activateUser(userId);
          await refresh();
        } catch {
          setError('Error activating user.');
        }
      },
    });
  };

  const handleBatchActivate = () => {
    const pending = Array.from(selectedUsers).filter((id) =>
      users.find((u) => u.user_id === id && isPendingWaitlistUser(u)),
    );
    if (pending.length === 0) return;
    setConfirmAction({
      title: `Activate ${pending.length} users?`,
      message: 'An invite code will be generated for each selected user.',
      confirmLabel: `Activate ${pending.length}`,
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await activateUsersBatch(pending);
          setSelectedUsers(new Set());
          await refresh();
        } catch {
          setError('Error in batch activation.');
        }
      },
    });
  };

  const handleBatchDelete = () => {
    if (selectedUsers.size === 0) return;
    setConfirmAction({
      title: `Delete ${selectedUsers.size} users?`,
      message: 'All selected accounts and their data will be permanently deleted. This action is irreversible.',
      confirmLabel: `Delete ${selectedUsers.size}`,
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
            let reason = 'Unknown error';
            if (err && typeof err === 'object' && 'response' in err) {
              const resp = (err as { response?: { data?: { detail?: string } } }).response;
              if (resp?.data?.detail) {
                reason = resp.data.detail === 'Cannot delete yourself'
                  ? 'Cannot delete yourself'
                  : resp.data.detail;
              }
            }
            failed.push({ name, reason });
          }
        }
        setSelectedUsers(new Set());
        await refresh();
        setBatchReport({
          title: 'Deletion results',
          deleted,
          failed,
        });
      },
    });
  };

  const handlePromoteUser = (userId: string, userName: string) => {
    setConfirmAction({
      title: 'Promote to admin?',
      message: `${userName || userId} will have full access to the admin dashboard.`,
      confirmLabel: 'Promote',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await promoteUser(userId);
          await refresh();
        } catch {
          setError('Error promoting user.');
        }
      },
    });
  };

  const handleDemoteUser = (userId: string, userName: string) => {
    setConfirmAction({
      title: 'Revoke admin?',
      message: `${userName || userId} will lose admin privileges.`,
      confirmLabel: 'Revoke',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await demoteUser(userId);
          await refresh();
        } catch {
          setError('Error revoking admin.');
        }
      },
    });
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    setConfirmAction({
      title: 'Delete user?',
      message: `The account of ${userName || userId} and all their data will be permanently deleted. This action is irreversible.`,
      confirmLabel: 'Delete permanently',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await deleteUser(userId);
          setShowDetail(false);
          setUserDetail(null);
          await refresh();
        } catch {
          setError('Error deleting user.');
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
      setError('Error loading user details.');
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
    users.find((u) => u.user_id === id && isPendingWaitlistUser(u)),
  );

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !userSearch ||
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.user_id.toLowerCase().includes(userSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (userFilter === 'active') return u.signup_code !== null || u.is_admin;
    if (userFilter === 'pending') return isPendingWaitlistUser(u);
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
      <Navbar center={
        <div className="flex items-center gap-3">
          <span className="text-white/50 text-sm font-medium">Admin Dashboard</span>
          {user?.name && <span className="text-green-400/70 text-xs">Logged as {user.name}</span>}
        </div>
      } />

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
                {stats.invite_code_required ? 'Invite code: REQUIRED' : 'Platform: OPEN TO ALL'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Registered users" value={stats.registered} />
              <StatCard label="Pending activation" value={stats.pending_activation} />
              <StatCard label="Available codes" value={stats.invite_codes.available} sub={`${stats.invite_codes.used} used of ${stats.invite_codes.total}`} />
              <StatCard label="Total codes" value={stats.invite_codes.total} />
              <StatCard label="Pending deletion" value={stats.pending_deletion} />
              <StatCard label="Deleted accounts" value={stats.deleted_accounts} />
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
            Invite codes ({codes.length})
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
            Users ({users.length})
          </button>
          <button
            onClick={() => setTab('ideas')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'ideas' ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white/60'
            }`}
          >
            Ideas ({ideas.length})
          </button>
          <button
            onClick={() => setTab('funnel')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'funnel' ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white/60'
            }`}
          >
            Funnel
          </button>
        </div>

        {/* ── Codes Tab ── */}
        {tab === 'codes' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Create single */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-4">
              <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-3">Create single code</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="text" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Code (e.g. invite-john)" className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-purple-500/40 text-white text-sm rounded-lg px-3 py-2 outline-none placeholder:text-white/20" />
                <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (opt.)" className="sm:w-40 bg-white/[0.04] border border-white/[0.08] focus:border-purple-500/40 text-white text-sm rounded-lg px-3 py-2 outline-none placeholder:text-white/20" />
                <button onClick={handleCreateCode} disabled={creating || !newCode.trim()} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap">{creating ? '...' : 'Create'}</button>
              </div>
            </div>

            {/* Create batch */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-4">
              <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-3">Generate batch codes</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="text" value={batchPrefix} onChange={(e) => setBatchPrefix(e.target.value)} placeholder="Prefix (e.g. launch)" className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-purple-500/40 text-white text-sm rounded-lg px-3 py-2 outline-none placeholder:text-white/20" />
                <input type="number" value={batchCount} onChange={(e) => setBatchCount(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={500} className="sm:w-24 bg-white/[0.04] border border-white/[0.08] focus:border-purple-500/40 text-white text-sm rounded-lg px-3 py-2 outline-none" />
                <input type="text" value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="Label (opt.)" className="sm:w-36 bg-white/[0.04] border border-white/[0.08] focus:border-purple-500/40 text-white text-sm rounded-lg px-3 py-2 outline-none placeholder:text-white/20" />
                <button onClick={handleCreateBatch} disabled={batchCreating || !batchPrefix.trim()} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap">{batchCreating ? '...' : `Generate ${batchCount}`}</button>
              </div>
            </div>

            {/* Filter */}
            <div className="flex gap-2 mb-3">
              {(['all', 'available', 'used'] as const).map((f) => (
                <button key={f} onClick={() => setCodeFilter(f)} className={`text-xs px-3 py-1 rounded-md border transition-colors ${codeFilter === f ? 'bg-white/[0.08] border-white/[0.15] text-white' : 'border-white/[0.06] text-white/30 hover:text-white/50'}`}>
                  {f === 'all' ? `All (${codes.length})` : f === 'available' ? `Available (${codes.filter((c) => !c.used_at && c.active).length})` : `Used (${codes.filter((c) => c.used_at).length})`}
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
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Code</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Label</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Status</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Used by</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Created</th>
                      <th className="text-right text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                    {selectedCodes.size > 0 && (
                      <tr className="border-b border-purple-500/20 bg-purple-500/[0.06]">
                        <td colSpan={7} className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-purple-300">{selectedCodes.size} selected</span>
                            <button
                              onClick={handleBatchDeleteCodes}
                              className="text-xs bg-red-600 hover:bg-red-500 text-white font-medium px-3 py-1 rounded-md transition-colors"
                            >
                              Delete selected
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {filteredCodes.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-white/20 py-8">No codes found.</td></tr>
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
                          <button onClick={() => handleCopy(c.code)} title="Copy code" className="hover:text-purple-200 transition-colors">
                            {copiedCode === c.code ? <span className="text-green-400">Copied!</span> : c.code}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-white/40">{c.label || '—'}</td>
                        <td className="px-4 py-2.5">
                          {c.used_at ? (
                            <span className="text-xs bg-white/[0.06] text-white/40 px-2 py-0.5 rounded-md">used</span>
                          ) : c.active ? (
                            <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-md">available</span>
                          ) : (
                            <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-md">disabled</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-white/30 text-xs font-mono">{c.used_by || '—'}</td>
                        <td className="px-4 py-2.5 text-white/30 text-xs">{formatDate(c.created_at)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!c.used_at && (
                              <button onClick={() => handleToggleCode(c.code, !c.active)} className="text-xs text-white/30 hover:text-white/60 px-2 py-1 rounded transition-colors">{c.active ? 'Disable' : 'Enable'}</button>
                            )}
                            <button onClick={() => handleDeleteCode(c.code)} className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1 rounded transition-colors">Delete</button>
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
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Name</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Email</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Provider</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Registered on</th>
                      <th className="text-right text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingUsers.length === 0 && (
                      <tr><td colSpan={5} className="text-center text-white/20 py-8">No users pending activation.</td></tr>
                    )}
                    {pendingUsers.map((u) => (
                      <tr key={u.user_id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-white/70">{u.name || '—'}</td>
                        <td className="px-4 py-2.5 text-white/50 text-xs">{u.email || '—'}</td>
                        <td className="px-4 py-2.5 text-white/40 text-xs">{u.provider}</td>
                        <td className="px-4 py-2.5 text-white/30 text-xs">{formatDate(u.created_at)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleActivateUser(u.user_id, u.name)} className="text-xs text-green-400/70 hover:text-green-400 px-2 py-1 rounded transition-colors">Activate</button>
                            <button onClick={() => handleDeleteUser(u.user_id, u.name)} className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1 rounded transition-colors">Delete</button>
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
                placeholder="Search by name, email or ID..."
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
                    {f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'pending' ? 'Pending' : 'Admin'}
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
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Name</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Email</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Status</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Code</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Provider</th>
                      <th className="text-left text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Registered</th>
                      <th className="text-right text-white/40 font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                    {selectedUsers.size > 0 && (
                      <tr className="border-b border-purple-500/20 bg-purple-500/[0.06]">
                        <td colSpan={8} className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-purple-300">{selectedUsers.size} selected</span>
                            {hasPendingSelected && (
                              <button
                                onClick={handleBatchActivate}
                                className="text-xs bg-green-600 hover:bg-green-500 text-white font-medium px-3 py-1 rounded-md transition-colors"
                              >
                                Activate selected
                              </button>
                            )}
                            <button
                              onClick={handleBatchDelete}
                              className="text-xs bg-red-600 hover:bg-red-500 text-white font-medium px-3 py-1 rounded-md transition-colors"
                            >
                              Delete selected
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={8} className="text-center text-white/20 py-8">No users found.</td></tr>
                    )}
                    {filteredUsers.map((u) => {
                      const isPending = isPendingWaitlistUser(u);
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
                              <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-md">active</span>
                            ) : isPending ? (
                              <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md">pending</span>
                            ) : (
                              <span className="text-xs bg-white/[0.06] text-white/40 px-2 py-0.5 rounded-md">registered</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-white/30 font-mono text-xs">{u.signup_code || '—'}</td>
                          <td className="px-4 py-2.5 text-white/40 text-xs">{u.provider}</td>
                          <td className="px-4 py-2.5 text-white/30 text-xs">{formatDate(u.created_at)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isPending && (
                                <button onClick={() => handleActivateUser(u.user_id, u.name)} className="text-xs text-green-400/70 hover:text-green-400 px-2 py-1 rounded transition-colors">Activate</button>
                              )}
                              {!u.is_admin ? (
                                <button onClick={() => handlePromoteUser(u.user_id, u.name)} className="text-xs text-purple-400/70 hover:text-purple-400 px-2 py-1 rounded transition-colors">Admin</button>
                              ) : (
                                <button onClick={() => handleDemoteUser(u.user_id, u.name)} className="text-xs text-amber-400/70 hover:text-amber-400 px-2 py-1 rounded transition-colors">Revoke</button>
                              )}
                              <button onClick={() => handleDeleteUser(u.user_id, u.name)} className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1 rounded transition-colors">Delete</button>
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

        {/* ── Ideas Tab ── */}
        {tab === 'ideas' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {ideas.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-8">No ideas submitted yet.</p>
            ) : (
              <div className="space-y-2">
                {ideas.map((idea) => (
                  <div key={idea.idea_id} className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm whitespace-pre-wrap">{idea.text}</p>
                      <p className="text-white/30 text-xs mt-1.5">
                        {idea.user_id} &middot; {formatDate(idea.created_at)}
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        await deleteIdea(idea.idea_id);
                        setIdeas((prev) => prev.filter((i) => i.idea_id !== idea.idea_id));
                      }}
                      className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                      title="Delete idea"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Funnel Tab ── */}
        {tab === 'funnel' && funnel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

            {/* ── Row 1: Key metrics ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Signups (30d)" value={funnel.total_signups} />
              <StatCard label="Activations (30d)" value={funnel.total_activations} />
              <StatCard label="Conversion" value={`${(funnel.conversion_rate * 100).toFixed(1)}%`} sub={`${funnel.total_activations} of ${funnel.total_signups}`} />
              <StatCard label="Active (7d)" value={insights?.recently_active_7d ?? '—'} />
            </div>

            {/* ── Row 2: Activation funnel stages ── */}
            {insights?.activation_stages && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-5">Activation funnel</h3>
                <div className="flex items-center gap-2">
                  {[
                    { label: 'Registered', value: insights.activation_stages.registered, color: 'bg-white/20' },
                    { label: 'Activated', value: insights.activation_stages.activated, color: 'bg-purple-500/60' },
                    { label: 'Built orb', value: insights.activation_stages.built_orb, color: 'bg-indigo-500/60' },
                    { label: 'Rich orb (10+)', value: insights.activation_stages.rich_orb, color: 'bg-green-500/60' },
                  ].map((stage, i) => {
                    const maxVal = insights.activation_stages.registered || 1;
                    const pct = Math.max(8, (stage.value / maxVal) * 100);
                    return (
                      <div key={stage.label} className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-2">
                          {i > 0 && <div className="text-white/15 text-xs">→</div>}
                          <span className="text-white/50 text-xs truncate">{stage.label}</span>
                        </div>
                        <div className={`${stage.color} rounded-lg text-center py-3 transition-all`} style={{ width: `${pct}%`, minWidth: '40px' }}>
                          <span className="text-white font-bold text-lg">{stage.value}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Row 3: Charts side by side ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Daily signups chart */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">
                  Daily signups &amp; activations
                </h3>
                <FunnelChart signups={funnel.signups} activations={funnel.activations} />
                <div className="flex gap-4 mt-3 justify-center">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-purple-500/50" /><span className="text-white/30 text-xs">Signups</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-green-500/50" /><span className="text-white/30 text-xs">Activations</span></div>
                </div>
              </div>

              {/* Cumulative growth */}
              {insights?.cumulative_growth && insights.cumulative_growth.length > 0 && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                  <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Cumulative user growth</h3>
                  <div className="flex items-end gap-[2px] h-40">
                    {insights.cumulative_growth.map((d) => {
                      const maxC = insights.cumulative_growth[insights.cumulative_growth.length - 1]?.count || 1;
                      const h = (d.count / maxC) * 100;
                      return (
                        <div key={d.date} className="flex-1 flex flex-col items-center justify-end group relative min-w-0 h-32">
                          <div className="w-full bg-gradient-to-t from-purple-600/40 to-indigo-500/30 rounded-t-sm" style={{ height: `${h}%`, minHeight: '2px' }} />
                          <span className="text-[8px] text-white/20 mt-0.5 truncate w-full text-center">{d.date.slice(5)}</span>
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-neutral-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            <div className="text-white/60">{d.date}</div>
                            <div className="text-purple-300">Total: {d.count}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Row 4: Provider + Activation time + Graph richness ── */}
            {insights && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Providers */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                  <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Providers</h3>
                  {insights.providers.length === 0 ? <div className="text-white/20 text-sm">No data.</div> : (
                    <div className="space-y-3">
                      {insights.providers.map((p) => {
                        const total = insights.providers.reduce((s, x) => s + x.count, 0);
                        const pct = total > 0 ? (p.count / total) * 100 : 0;
                        return (
                          <div key={p.provider}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-white/70 capitalize">{p.provider}</span>
                              <span className="text-white/40">{p.count} <span className="text-white/20">({pct.toFixed(0)}%)</span></span>
                            </div>
                            <div className="w-full bg-white/[0.04] rounded-full h-1.5">
                              <div className="bg-purple-500/60 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Activation time */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                  <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Activation time</h3>
                  {insights.activation_time.total === 0 ? <div className="text-white/20 text-sm">No activations yet.</div> : (
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-white text-3xl font-bold">{formatHours(insights.activation_time.avg_hours)}</div>
                        <div className="text-white/30 text-xs mt-1">average wait</div>
                      </div>
                      <div className="flex justify-between text-xs">
                        <div className="text-center"><div className="text-green-400 font-semibold">{formatHours(insights.activation_time.min_hours)}</div><div className="text-white/25 mt-0.5">fastest</div></div>
                        <div className="text-center"><div className="text-white/60 font-semibold">{insights.activation_time.total}</div><div className="text-white/25 mt-0.5">activated</div></div>
                        <div className="text-center"><div className="text-amber-400 font-semibold">{formatHours(insights.activation_time.max_hours)}</div><div className="text-white/25 mt-0.5">slowest</div></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Graph richness */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                  <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Graph richness</h3>
                  {insights.graph_richness.total_users === 0 ? <div className="text-white/20 text-sm">No data.</div> : (
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-white text-3xl font-bold">{insights.graph_richness.avg_nodes}</div>
                        <div className="text-white/30 text-xs mt-1">avg nodes per user</div>
                      </div>
                      <div className="flex justify-between text-xs">
                        <div className="text-center"><div className="text-white/60 font-semibold">{insights.graph_richness.min_nodes}</div><div className="text-white/25 mt-0.5">min</div></div>
                        <div className="text-center"><div className="text-white/60 font-semibold">{insights.graph_richness.median_nodes}</div><div className="text-white/25 mt-0.5">median</div></div>
                        <div className="text-center"><div className="text-white/60 font-semibold">{insights.graph_richness.max_nodes}</div><div className="text-white/25 mt-0.5">max</div></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Row 5: Node types + Top skills ── */}
            {insights && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Node type distribution */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                  <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Node types</h3>
                  {insights.node_type_distribution.length === 0 ? <div className="text-white/20 text-sm">No data.</div> : (
                    <div className="space-y-2">
                      {insights.node_type_distribution.map((n) => {
                        const maxN = insights.node_type_distribution[0]?.count || 1;
                        const pct = (n.count / maxN) * 100;
                        const colors: Record<string, string> = { Skill: 'bg-teal-500/50', WorkExperience: 'bg-indigo-500/50', Collaborator: 'bg-pink-500/50', Education: 'bg-amber-500/50', Project: 'bg-purple-500/50' };
                        return (
                          <div key={n.label}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-white/70">{n.label}</span>
                              <span className="text-white/40 tabular-nums">{n.count}</span>
                            </div>
                            <div className="w-full bg-white/[0.04] rounded-full h-1.5">
                              <div className={`${colors[n.label] || 'bg-white/20'} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Top skills */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                  <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Top skills</h3>
                  {insights.top_skills.length === 0 ? <div className="text-white/20 text-sm">No skills yet.</div> : (
                    <div className="flex flex-wrap gap-1.5">
                      {insights.top_skills.map((s, i) => (
                        <span key={s.name} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors ${i < 3 ? 'bg-purple-500/10 border-purple-500/20 text-purple-300' : i < 7 ? 'bg-white/[0.04] border-white/[0.08] text-white/60' : 'bg-white/[0.02] border-white/[0.05] text-white/40'}`}>
                          {s.name}
                          <span className="text-white/25">{s.count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Row 6: Profile completeness + Engagement + Code efficiency ── */}
            {insights && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Profile completeness */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                  <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Profile completeness</h3>
                  <div className="space-y-2">
                    {[
                      { label: 'Complete (5/5)', value: insights.profile_completeness.complete, color: 'bg-green-500/50' },
                      { label: 'Good (3-4)', value: insights.profile_completeness.good, color: 'bg-teal-500/50' },
                      { label: 'Partial (1-2)', value: insights.profile_completeness.partial, color: 'bg-amber-500/50' },
                      { label: 'Empty (0)', value: insights.profile_completeness.empty, color: 'bg-red-500/40' },
                    ].map((s) => {
                      const total = insights.profile_completeness.complete + insights.profile_completeness.good + insights.profile_completeness.partial + insights.profile_completeness.empty || 1;
                      const pct = (s.value / total) * 100;
                      return (
                        <div key={s.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-white/60">{s.label}</span>
                            <span className="text-white/30">{s.value}</span>
                          </div>
                          <div className="w-full bg-white/[0.04] rounded-full h-1.5">
                            <div className={`${s.color} h-1.5 rounded-full transition-all`} style={{ width: `${Math.max(pct, s.value > 0 ? 4 : 0)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Engagement buckets */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                  <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">User engagement</h3>
                  {insights.engagement.length === 0 ? <div className="text-white/20 text-sm">No data.</div> : (
                    <div className="space-y-2">
                      {insights.engagement.map((e) => {
                        const total = insights.engagement.reduce((s, x) => s + x.count, 0) || 1;
                        const pct = (e.count / total) * 100;
                        const label = e.bucket === '0' ? 'No nodes' : `${e.bucket} nodes`;
                        return (
                          <div key={e.bucket}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-white/60">{label}</span>
                              <span className="text-white/30">{e.count} ({pct.toFixed(0)}%)</span>
                            </div>
                            <div className="w-full bg-white/[0.04] rounded-full h-1.5">
                              <div className="bg-green-500/50 h-1.5 rounded-full transition-all" style={{ width: `${Math.max(pct, e.count > 0 ? 4 : 0)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Code efficiency */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                  <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium mb-4">Code efficiency</h3>
                  {insights.code_efficiency.length === 0 ? <div className="text-white/20 text-sm">No codes yet.</div> : (
                    <div className="space-y-2.5">
                      {insights.code_efficiency.map((c) => (
                        <div key={c.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-white/60 font-mono truncate mr-2">{c.label}</span>
                            <span className="text-white/30 shrink-0">{c.used}/{c.created} ({(c.rate * 100).toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-white/[0.04] rounded-full h-1.5">
                            <div className="bg-indigo-500/50 h-1.5 rounded-full transition-all" style={{ width: `${c.rate * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── LLM Usage ── */}
            {insights.llm_usage && insights.llm_usage.total_calls > 0 && (
              <div className="bg-neutral-900/60 rounded-xl p-4 border border-white/5">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">LLM Usage</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div>
                    <p className="text-[10px] text-white/30">Total Calls</p>
                    <p className="text-lg font-bold text-white">{insights.llm_usage.total_calls}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/30">Total Cost</p>
                    <p className="text-lg font-bold text-green-400">${insights.llm_usage.total_cost_usd.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/30">Avg Cost / Call</p>
                    <p className="text-lg font-bold text-white">${insights.llm_usage.cost_stats.mean?.toFixed(4) ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/30">Avg Duration</p>
                    <p className="text-lg font-bold text-white">{insights.llm_usage.duration_stats.mean_ms?.toFixed(0) ?? '—'}ms</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <p className="text-[10px] text-white/30 mb-1">Cost Variance</p>
                    <p className="text-sm text-white/70">{insights.llm_usage.cost_stats.variance?.toFixed(6) ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/30 mb-1">Duration Variance</p>
                    <p className="text-sm text-white/70">{insights.llm_usage.duration_stats.variance_ms?.toFixed(0) ?? '—'}ms²</p>
                  </div>
                </div>
                {insights.llm_usage.by_model.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-white/30 mb-1">By Model</p>
                    {insights.llm_usage.by_model.map((m) => (
                      <div key={m.model} className="flex justify-between text-xs text-white/60 py-0.5">
                        <span>{m.model}</span>
                        <span>{m.count} calls · ${m.total_cost.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {insights.llm_usage.by_endpoint.length > 0 && (
                  <div>
                    <p className="text-[10px] text-white/30 mb-1">By Endpoint</p>
                    {insights.llm_usage.by_endpoint.map((e) => (
                      <div key={e.endpoint} className="flex justify-between text-xs text-white/60 py-0.5">
                        <span>{e.endpoint.replace('_', ' ')}</span>
                        <span>{e.count} calls · ${e.total_cost.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Status</div>
                  <div>
                    {userDetail.is_admin ? (
                      <span className="text-xs bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-md">admin</span>
                    ) : userDetail.signup_code ? (
                      <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-md">active</span>
                    ) : userDetail.waitlist_joined ? (
                      <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md">pending</span>
                    ) : (
                      <span className="text-xs bg-white/[0.06] text-white/40 px-2 py-0.5 rounded-md">registered</span>
                    )}
                  </div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Graph nodes</div>
                  <div className="text-white text-lg font-bold">{userDetail.node_count}</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">GDPR</div>
                  <div className="text-white/70">{userDetail.gdpr_consent ? 'Consent given' : 'Not given'}</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Registered</div>
                  <div className="text-white/70 text-xs">{formatDate(userDetail.created_at)}</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Activated</div>
                  <div className="text-white/70 text-xs">{formatDate(userDetail.activated_at)}</div>
                </div>
                {userDetail.signup_code && (
                  <div className="bg-white/[0.03] rounded-lg p-3 col-span-2">
                    <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Code used</div>
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
                    <div className="text-red-400 text-xs uppercase tracking-wider mb-1">Deletion requested</div>
                    <div className="text-red-300 text-xs">{formatDate(userDetail.deletion_requested_at)}</div>
                  </div>
                )}
              </div>

              {/* Processing History */}
              <div className="mt-5 pt-4 border-t border-white/[0.06]">
                <p className="text-white/40 text-xs uppercase tracking-wider font-medium mb-3">Processing History</p>
                {userDetail.processing_records.length === 0 ? (
                  <p className="text-white/20 text-xs">No processing records.</p>
                ) : (
                  <div className="space-y-2">
                    {userDetail.processing_records.map((pr, i) => (
                      <div key={i} className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-white/70 font-medium truncate">{pr.original_filename}</span>
                          <span className="text-white/30 flex-shrink-0 ml-2">{formatDate(pr.processed_at)}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-white/40">
                          <span>Model: <span className="text-white/60">{pr.llm_provider}/{pr.llm_model}</span></span>
                          <span>Method: <span className={pr.extraction_method === 'primary' ? 'text-green-400/70' : 'text-amber-400/70'}>{pr.extraction_method}</span></span>
                          {pr.ontology_version != null && <span>Ontology: <span className="text-white/60">v{pr.ontology_version}</span></span>}
                          <span>Nodes: <span className="text-white/60">{pr.nodes_extracted}</span></span>
                          <span>Edges: <span className="text-white/60">{pr.edges_extracted}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── LLM Usage ── */}
              {userDetail.llm_usage && userDetail.llm_usage.length > 0 && (
                <>
                  <div className="mt-4 border-t border-white/5 pt-3">
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">LLM Usage Summary</h4>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      <div>
                        <p className="text-[10px] text-white/30">Calls</p>
                        <p className="text-sm font-bold text-white">{userDetail.llm_usage_summary.total_calls}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-white/30">Total Cost</p>
                        <p className="text-sm font-bold text-green-400">${userDetail.llm_usage_summary.total_cost_usd.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-white/30">Avg Cost</p>
                        <p className="text-sm font-bold text-white">${userDetail.llm_usage_summary.avg_cost_usd.toFixed(4)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-white/30">Avg Duration</p>
                        <p className="text-sm font-bold text-white">{userDetail.llm_usage_summary.avg_duration_ms.toFixed(0)}ms</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">Usage History</h4>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {userDetail.llm_usage.map((u) => (
                        <div key={u.usage_id} className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-white/3">
                          <div className="flex items-center gap-2">
                            <span className="text-white/40">{u.endpoint.replace('_', ' ')}</span>
                            <span className="text-white/60">{u.llm_model}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {u.cost_usd != null && <span className="text-green-400">${u.cost_usd.toFixed(4)}</span>}
                            {u.duration_ms != null && <span className="text-white/40">{u.duration_ms}ms</span>}
                            <span className="text-white/20">{formatDate(u.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-5 pt-4 border-t border-white/[0.06]">
                {isPendingWaitlistUser(userDetail) && (
                  <button
                    onClick={() => { setShowDetail(false); handleActivateUser(userDetail.user_id, userDetail.name); }}
                    className="text-xs bg-green-600 hover:bg-green-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Activate
                  </button>
                )}
                {!userDetail.is_admin ? (
                  <button
                    onClick={() => { setShowDetail(false); handlePromoteUser(userDetail.user_id, userDetail.name); }}
                    className="text-xs bg-purple-600 hover:bg-purple-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Promote to admin
                  </button>
                ) : (
                  <button
                    onClick={() => { setShowDetail(false); handleDemoteUser(userDetail.user_id, userDetail.name); }}
                    className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Revoke admin
                  </button>
                )}
                <button
                  onClick={() => { setShowDetail(false); handleDeleteUser(userDetail.user_id, userDetail.name); }}
                  className="text-xs bg-red-600 hover:bg-red-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  Delete user
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
                    Deleted ({batchReport.deleted.length})
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
                    Not deleted ({batchReport.failed.length})
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
                  Close
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
