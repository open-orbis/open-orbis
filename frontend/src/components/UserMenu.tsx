import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { deleteAccount } from '../api/auth';
import { claimOrbId } from '../api/orbs';
import { getDocuments, downloadCV } from '../api/cv';
import type { DocumentMetadata } from '../api/cv';

interface UserMenuProps {
  orbId?: string;
  onOrbIdChanged?: () => void;
  /** Display name next to avatar — makes the whole thing a clickable pill */
  label?: string;
}

export default function UserMenu({ orbId, onOrbIdChanged, label }: UserMenuProps) {
  const { user, logout } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showCVs, setShowCVs] = useState(false);
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const docs = await getDocuments();
      setDocuments(docs);
    } catch { /* ignore */ }
    finally { setDocsLoading(false); }
  }, []);

  useEffect(() => {
    if (showCVs) fetchDocs();
  }, [showCVs, fetchDocs]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!user) return null;

  const avatarSrc = user.profile_image || user.picture || '';
  const initial = (user.name || 'O').charAt(0).toUpperCase();

  const handleLogout = () => {
    logout();
    addToast('Signed out', 'info');
    navigate('/', { replace: true });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={
          label
            ? 'h-8 flex items-center gap-2 leading-none bg-white/5 border border-white/10 rounded-full pl-2.5 pr-1 hover:bg-white/10 hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black transition-all cursor-pointer'
            : 'relative w-10 h-10 rounded-full bg-purple-600/30 border border-purple-500/40 hover:bg-purple-600/50 hover:border-purple-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black transition-all overflow-hidden cursor-pointer flex items-center justify-center'
        }
        title="Account menu"
      >
        {label && <span className="text-white/80 text-xs font-medium leading-none">{label}</span>}
        <div className={`rounded-full bg-purple-600/30 border border-purple-500/40 overflow-hidden flex items-center justify-center flex-shrink-0 ${label ? 'w-7 h-7' : 'w-10 h-10'}`}>
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="text-purple-200 text-sm font-bold">{initial}</span>
          )}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-[18rem] sm:w-72 bg-neutral-950/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl z-50 p-2"
          >
            {/* User header */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 mb-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/35 font-semibold mb-2">Profile</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-600/30 border border-purple-500/40 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-purple-200 text-sm font-bold">{initial}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-white text-sm font-semibold truncate">{user.name || 'User'}</div>
                  <div className="text-white/45 text-xs truncate">{user.email}</div>
                </div>
              </div>
            </div>

            <div className="px-1 pb-1">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/30 font-semibold px-2">Account</p>
              <div className="mt-1 space-y-1">
                <button
                  onClick={() => { setOpen(false); setShowAccountSettings(true); }}
                  className="group w-full h-10 flex items-center gap-3 px-2.5 rounded-lg text-sm text-white/75 hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 text-white/45 group-hover:text-purple-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="flex-1 text-left">Account settings</span>
                </button>
                <button
                  onClick={() => setShowCVs((v) => !v)}
                  className="group w-full h-10 flex items-center gap-3 px-2.5 rounded-lg text-sm text-white/75 hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 text-white/45 group-hover:text-purple-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="flex-1 text-left">My uploaded CVs</span>
                  {documents.length > 0 && (
                    <span className="text-[10px] font-semibold text-white/70 bg-white/10 border border-white/10 rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center">
                      {documents.length}
                    </span>
                  )}
                  <svg className={`w-3.5 h-3.5 text-white/40 transition-transform ${showCVs ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {showCVs && (
              <div className="mx-1 mb-2 rounded-xl border border-white/10 bg-white/[0.02] p-2">
                {docsLoading ? (
                  <p className="text-white/35 text-xs px-1 py-2">Loading uploaded CVs...</p>
                ) : documents.length === 0 ? (
                  <p className="text-white/35 text-xs px-1 py-2">No documents uploaded yet.</p>
                ) : (
                  <div className="space-y-1">
                    {documents.map((doc) => (
                      <button
                        key={doc.document_id}
                        onClick={async () => {
                          try {
                            await downloadCV(doc.document_id);
                          } catch {
                            addToast('Failed to download document', 'error');
                          }
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 transition-colors text-left cursor-pointer group"
                      >
                        <svg className="w-3.5 h-3.5 flex-shrink-0 text-white/20 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-white/60 text-xs truncate group-hover:text-white/80 transition-colors">{doc.original_filename}</div>
                          <div className="text-white/25 text-[10px]">
                            {new Date(doc.uploaded_at).toLocaleDateString()}
                            {doc.entities_count != null ? ` · ${doc.entities_count} nodes` : ''}
                            {doc.edges_count != null ? ` · ${doc.edges_count} edges` : ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mx-1 my-1 h-px bg-white/10" />

            <div className="px-1 pb-1">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/30 font-semibold px-2">Session</p>
              <button
                onClick={handleLogout}
                className="mt-1 w-full h-10 flex items-center gap-3 px-2.5 rounded-lg text-sm text-red-300/85 hover:bg-red-500/15 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 text-red-300/75" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account Settings Modal */}
      <AnimatePresence>
        {showAccountSettings && (
          <AccountSettingsModal
            orbId={orbId}
            onOrbIdChanged={onOrbIdChanged}
            onClose={() => setShowAccountSettings(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Account Settings Modal ──

function AccountSettingsModal({ orbId, onOrbIdChanged, onClose }: {
  orbId?: string;
  onOrbIdChanged?: () => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'orb-id' | 'account'>('orb-id');
  const { user, logout } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();

  // Orbis ID state
  const [customId, setCustomId] = useState(orbId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSaveOrbId = async () => {
    const trimmed = customId.trim().toLowerCase();
    if (!trimmed) return;
    if (trimmed === orbId) { onClose(); return; }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(trimmed)) { setError('Only lowercase letters, numbers, and hyphens allowed.'); return; }
    if (trimmed.length < 3) { setError('Must be at least 3 characters.'); return; }
    setSaving(true); setError('');
    try {
      await claimOrbId(trimmed);
      setSuccess(true);
      onOrbIdChanged?.();
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to claim this ID. It may already be taken.');
    } finally { setSaving(false); }
  };

  const [recovering, setRecovering] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      logout();
      addToast('Account scheduled for deletion. You have 30 days to recover it.', 'info');
      navigate('/', { replace: true });
    } catch {
      setError('Failed to delete account. Please try again.');
      setDeleting(false);
    }
  };

  const handleRecoverAccount = async () => {
    setRecovering(true);
    try {
      const { recoverAccount } = await import('../api/auth');
      await recoverAccount();
      addToast('Account restored successfully!', 'success');
      onClose();
      window.location.reload();
    } catch {
      setError('Failed to recover account. Please try again.');
      setRecovering(false);
    }
  };

  const TABS = [
    { id: 'orb-id' as const, label: 'Orbis ID', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
      </svg>
    )},
    { id: 'account' as const, label: 'Account', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )},
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 24 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative bg-neutral-950 border border-white/10 rounded-2xl max-w-[95vw] sm:max-w-2xl w-full shadow-2xl h-[calc(100vh-1rem)] sm:h-[440px] max-h-[calc(100vh-1rem)] sm:max-h-[90vh] overflow-hidden flex flex-col my-auto"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg border border-white/10 text-white/50 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 transition-colors cursor-pointer flex items-center justify-center"
          aria-label="Close account settings"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-4 sm:p-6 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/35 font-semibold mb-1">Preferences</p>
          <h2 className="text-white text-lg font-semibold mb-1">Account settings</h2>
          <p className="text-white/50 text-sm">Manage your Orbis ID and account lifecycle.</p>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Tabs sidebar */}
          <div className="w-36 sm:w-44 border-r border-white/10 p-2.5 sm:p-3 flex flex-col gap-1 bg-black/30">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setError(''); setSuccess(false); setShowDeleteConfirm(false); }}
                className={`flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 ${
                  activeTab === tab.id
                    ? 'bg-purple-500/15 border border-purple-400/30 text-white font-medium'
                    : 'border border-transparent text-white/55 hover:text-white hover:bg-white/8'
                }`}
              >
                <span className={`${activeTab === tab.id ? 'text-purple-300' : 'text-white/45'}`}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 p-4 sm:p-6 overflow-hidden flex flex-col min-h-0 bg-black/10">
            <AnimatePresence mode="wait">
              {/* ── Orbis ID tab ── */}
              {activeTab === 'orb-id' && (
                <motion.div
                  key="orb-id"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15, ease: 'easeInOut' }}
                  className="flex flex-col justify-between h-full"
                >
                  <div>
                    <label className="text-xs text-white/45 uppercase tracking-[0.12em] font-medium">Custom Orbis ID</label>
                    <p className="text-[11px] text-white/45 mt-1 mb-5">Choose a memorable ID for your orbis. This will be your public URL and MCP identifier.</p>
                    <div className="flex items-center gap-2">
                      <span className="text-white/40 text-sm">{window.location.origin}/</span>
                      <input
                        value={customId}
                        onChange={(e) => { setCustomId(e.target.value); setError(''); setSuccess(false); }}
                        placeholder="your-name"
                        className="flex-1 bg-white/[0.04] border border-white/15 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-400/70 focus:border-transparent"
                      />
                    </div>
                    {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                    {success && <p className="text-green-400 text-xs mt-2">Orbis ID updated!</p>}
                  </div>

                  <div className="flex gap-3">
                    <button onClick={handleSaveOrbId} disabled={saving} className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300">{saving ? 'Saving...' : 'Save'}</button>
                    <button onClick={onClose} className="flex-1 border border-white/15 text-white/75 hover:bg-white/10 font-medium py-2 rounded-lg transition-colors text-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">Cancel</button>
                  </div>
                </motion.div>
              )}

              {/* ── Account tab ── */}
              {activeTab === 'account' && (
                <motion.div
                  key="account"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15, ease: 'easeInOut' }}
                  className="space-y-3"
                >
                  <label className="text-xs text-white/45 uppercase tracking-[0.12em] font-medium">Account</label>
                  <p className="text-[11px] text-white/45 mt-0.5">Manage your account and data.</p>

                  {user?.deletion_days_remaining != null ? (
                    /* ── Account pending deletion — show recovery ── */
                    <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl p-4">
                      <h3 className="text-amber-300 text-sm font-semibold mb-2">Account Scheduled for Deletion</h3>
                      <p className="text-white/65 text-xs leading-relaxed mb-2">
                        Your account will be permanently deleted in{' '}
                        <span className="text-amber-300 font-semibold">{user.deletion_days_remaining} day{user.deletion_days_remaining !== 1 ? 's' : ''}</span>.
                      </p>
                      <p className="text-white/45 text-xs leading-relaxed mb-4">
                        All your data, orbis, and profile will be removed. You can recover your account before then.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleRecoverAccount}
                          disabled={recovering}
                          className="bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-500/40 text-xs font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300/70"
                        >
                          {recovering ? 'Recovering...' : 'Recover my account'}
                        </button>
                      </div>
                      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                    </div>
                  ) : (
                    /* ── Normal state — show delete option ── */
                    <div className="bg-red-500/8 border border-red-500/25 rounded-xl p-4">
                      <h3 className="text-red-300 text-sm font-semibold mb-2">Delete Account</h3>
                      <p className="text-white/65 text-xs leading-relaxed mb-4">
                        Your account will be scheduled for deletion. You have 30 days to recover it before all data is permanently removed.
                      </p>

                      {!showDeleteConfirm ? (
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 text-xs font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70"
                        >
                          Delete my account
                        </button>
                      ) : (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mt-2">
                          <p className="text-red-300 text-xs font-medium mb-3">
                            Are you sure? You'll have 30 days to recover your account before permanent deletion.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowDeleteConfirm(false)}
                              className="border border-white/20 text-white/75 hover:bg-white/10 text-xs font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleDeleteAccount}
                              disabled={deleting}
                              className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70"
                            >
                              {deleting ? 'Scheduling...' : 'Yes, delete my account'}
                            </button>
                          </div>
                          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
