import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrbStore } from '../stores/orbStore';
import { useAuthStore } from '../stores/authStore';
import { useFilterStore, computeFilteredNodeIds } from '../stores/filterStore';
import DateRangeSlider from '../components/graph/DateRangeSlider';
import { useDateFilterStore, computeDateFilteredNodeIds, getNodeDates } from '../stores/dateFilterStore';
import { claimOrbId, updateProfile, uploadProfileImage, deleteProfileImage, createFilterToken, enhanceNote, linkSkill } from '../api/orbs';
import { QRCodeSVG } from 'qrcode.react';
import OrbGraph3D from '../components/graph/OrbGraph3D';
import NodeTypeFilter from '../components/graph/NodeTypeFilter';
import FloatingInput from '../components/editor/FloatingInput';
import ChatBox from '../components/chat/ChatBox';
import type { ChatMessage } from '../components/chat/ChatBox';
import DraftNotes from '../components/drafts/DraftNotes';
import type { DraftNote } from '../components/drafts/DraftNotes';
import { loadDraftNotes, saveDraftNotes } from '../components/drafts/DraftNotes';
import Inbox from '../components/inbox/Inbox';
import ProcessingCounter from '../components/cv/ProcessingCounter';

// ── Modals ──

function SharePanel({ orbId, onClose }: { orbId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copiedFiltered, setCopiedFiltered] = useState(false);
  const [filterToken, setFilterToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const { activeKeywords } = useFilterStore();
  const hasActiveFilters = activeKeywords.length > 0;
  const shareUrl = `${window.location.origin}/${orbId}`;
  const filteredShareUrl = filterToken ? `${window.location.origin}/${orbId}?filter_token=${filterToken}` : '';
  const mcpUri = `orb://${orbId}`;

  // Generate a filter token when the panel opens if filters are active
  useEffect(() => {
    if (hasActiveFilters && orbId) {
      setGeneratingToken(true);
      createFilterToken(activeKeywords)
        .then(({ token }) => setFilterToken(token))
        .catch(() => setFilterToken(null))
        .finally(() => setGeneratingToken(false));
    } else {
      setFilterToken(null);
    }
  }, [activeKeywords, hasActiveFilters, orbId]);

  const copy = (text: string, filtered = false) => {
    navigator.clipboard.writeText(text);
    if (filtered) {
      setCopiedFiltered(true);
      setTimeout(() => setCopiedFiltered(false), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
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
        className="relative bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-6 max-w-[95vw] sm:max-w-md w-full mx-2 sm:mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-white text-lg font-semibold mb-1">Share Your Orbis</h2>
        <p className="text-gray-400 text-sm mb-5">Share your orbis link or use the MCP identifier to let AI agents access your professional graph.</p>

        {/* QR Code */}
        <div className="flex justify-center mb-5">
          <div className="bg-white p-3 rounded-xl">
            <QRCodeSVG value={filteredShareUrl || shareUrl} size={140} level="M" />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Public Link</label>
          <div className="mt-1 flex items-center gap-2">
            <input readOnly value={shareUrl} className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm font-mono" />
            <button onClick={() => copy(shareUrl)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors whitespace-nowrap">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Filtered share link — only shown when filters are active */}
        {hasActiveFilters && (
          <div className="mb-4">
            <label className="text-xs text-amber-400/80 uppercase tracking-wide font-medium">Filtered Link</label>
            <p className="text-[11px] text-gray-500 mt-0.5 mb-1">
              This link hides nodes matching {activeKeywords.map((kw, i) => (
                <span key={kw}>{i > 0 && ', '}"<span className="text-amber-400">{kw}</span>"</span>
              ))} from the viewer.
            </p>
            <div className="flex items-center gap-2">
              {generatingToken ? (
                <div className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-gray-500 text-sm">Generating...</div>
              ) : (
                <input readOnly value={filteredShareUrl} className="flex-1 bg-gray-800 border border-amber-600/30 rounded-lg px-3 py-2 text-white text-sm font-mono" />
              )}
              <button
                onClick={() => copy(filteredShareUrl, true)}
                disabled={!filterToken}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors whitespace-nowrap"
              >
                {copiedFiltered ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <div className="mb-5">
          <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">MCP Orbis ID</label>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-1">Use this ID with the OpenOrbis MCP server to let AI agents query your graph.</p>
          <div className="flex items-center gap-2">
            <input readOnly value={mcpUri} className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm font-mono" />
            <button onClick={() => copy(mcpUri)} className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors whitespace-nowrap">Copy</button>
          </div>
        </div>

        <button onClick={onClose} className="w-full border border-gray-600 text-gray-300 hover:bg-gray-800 font-medium py-2 rounded-lg transition-colors text-sm">Close</button>
      </motion.div>
    </div>
  );
}

function SettingsPanel({ orbId, onClose, onOrbIdChanged }: { orbId: string; onClose: () => void; onOrbIdChanged: () => void }) {
  const [activeTab, setActiveTab] = useState<'orb-id' | 'filters' | 'account'>('orb-id');
  const [customId, setCustomId] = useState(orbId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const { keywords, activeKeywords, addKeyword, removeKeyword, toggleKeyword } = useFilterStore();
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    const trimmed = customId.trim().toLowerCase();
    if (!trimmed) return;
    if (trimmed === orbId) { onClose(); return; }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(trimmed)) { setError('Only lowercase letters, numbers, and hyphens allowed.'); return; }
    if (trimmed.length < 3) { setError('Must be at least 3 characters.'); return; }
    setSaving(true); setError('');
    try {
      await claimOrbId(trimmed);
      setSuccess(true); onOrbIdChanged();
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to claim this ID. It may already be taken.');
    } finally { setSaving(false); }
  };

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    addKeyword(trimmed);
    setNewKeyword('');
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { deleteAccount } = await import('../api/auth');
      await deleteAccount();
      logout();
      navigate('/');
    } catch {
      setError('Failed to delete account. Please try again.');
      setDeleting(false);
    }
  };

  const TABS = [
    { id: 'orb-id' as const, label: 'Orbis ID' },
    { id: 'filters' as const, label: 'Filters' },
    { id: 'account' as const, label: 'Account' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
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
        className="relative bg-gray-900 border border-gray-700 rounded-2xl max-w-[95vw] sm:max-w-2xl w-full mx-2 sm:mx-4 shadow-2xl h-[420px] max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="p-4 sm:p-6 pb-0">
          <h2 className="text-white text-lg font-semibold mb-1">Settings</h2>
          <p className="text-gray-400 text-sm mb-4">Customize your orbis identity and visibility.</p>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Tabs sidebar */}
          <div className="w-32 sm:w-40 border-r border-gray-700 p-2 flex flex-col gap-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setError(''); setSuccess(false); }}
                className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'bg-gray-800 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 p-4 sm:p-6 overflow-hidden flex flex-col min-h-0">
            <AnimatePresence mode="wait">
            {/* ── Orb ID tab ── */}
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
                  <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Custom Orbis ID</label>
                  <p className="text-[11px] text-gray-500 mt-1 mb-5">Choose a memorable ID for your orbis. This will be your public URL and MCP identifier.</p>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm">{window.location.origin}/</span>
                    <input value={customId} onChange={(e) => { setCustomId(e.target.value); setError(''); setSuccess(false); }} placeholder="your-name" className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                  </div>
                  {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                  {success && <p className="text-green-400 text-xs mt-2">Orbis ID updated!</p>}
                </div>

                <div className="flex gap-3">
                  <button onClick={handleSave} disabled={saving} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-sm">{saving ? 'Saving...' : 'Save'}</button>
                  <button onClick={onClose} className="flex-1 border border-gray-600 text-gray-300 hover:bg-gray-800 font-medium py-2 rounded-lg transition-colors text-sm">Cancel</button>
                </div>
              </motion.div>
            )}

            {/* ── Filters tab ── */}
            {activeTab === 'filters' && (
              <motion.div
                key="filters"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15, ease: 'easeInOut' }}
                className="flex flex-col h-full"
              >
                <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Visibility Filters</label>
                <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
                  Add keywords to filter nodes. When a filter is active, nodes containing that keyword become transparent. Filtered nodes are excluded from shared links and CV exports.
                </p>

                <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                  <input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
                    placeholder="e.g. confidential, private, salary..."
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent"
                  />
                  <button
                    onClick={handleAddKeyword}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Add
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                  {keywords.length === 0 ? (
                    <p className="text-gray-600 text-xs italic">No filter keywords configured yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {keywords.map((kw) => {
                        const isActive = activeKeywords.includes(kw);
                        return (
                          <div
                            key={kw}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-all ${
                              isActive
                                ? 'bg-amber-600/15 border-amber-500/40'
                                : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'
                            }`}
                          >
                            <span className="text-white text-sm font-mono truncate">{kw}</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => toggleKeyword(kw)}
                                className={`text-[10px] font-medium px-2 py-1 rounded transition-colors ${
                                  isActive
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
                                }`}
                              >
                                {isActive ? 'Active' : 'Activate'}
                              </button>
                              <button
                                onClick={() => removeKeyword(kw)}
                                className="text-gray-500 hover:text-red-400 transition-colors"
                                title="Remove"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {activeKeywords.length > 0 && (
                  <p className="text-amber-400/70 text-[11px] mt-2 flex-shrink-0">
                    {activeKeywords.length === 1 ? 'Filter' : 'Filters'} {activeKeywords.map((kw, i) => (
                      <span key={kw}>{i > 0 && ', '}"<span className="font-semibold">{kw}</span>"</span>
                    ))} active. Matching nodes are transparent.
                  </p>
                )}
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
              >
                <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Account</label>
                <p className="text-[11px] text-gray-500 mt-0.5 mb-3">Manage your account and data.</p>

                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                  <h3 className="text-red-400 text-sm font-semibold mb-2">Delete Account</h3>
                  <p className="text-gray-400 text-xs leading-relaxed mb-4">
                    Permanently delete your account, your orbis, and all associated data. After requesting deletion, your data will be retained for 30 days in case you change your mind, then permanently erased. This action cannot be undone.
                  </p>

                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      Delete my account
                    </button>
                  ) : (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mt-2">
                      <p className="text-red-300 text-xs font-medium mb-3">
                        Are you sure? Your orbis and all data will be permanently deleted after 30 days.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="border border-gray-600 text-gray-300 hover:bg-gray-800 text-xs font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteAccount}
                          disabled={deleting}
                          className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                          {deleting ? 'Deleting...' : 'Yes, delete my account'}
                        </button>
                      </div>
                      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Social accounts config ──

const SOCIAL_ACCOUNTS = [
  { key: 'phone', label: 'Phone', icon: 'M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1.003 1.003 0 011.01-.24c1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z', color: '#22c55e' },
  { key: 'linkedin_url', label: 'LinkedIn', icon: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z', color: '#0A66C2' },
  { key: 'github_url', label: 'GitHub', icon: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12', color: '#fff' },
  { key: 'twitter_url', label: 'X / Twitter', icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z', color: '#fff' },
  { key: 'instagram_url', label: 'Instagram', icon: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z', color: '#E4405F' },
  { key: 'website_url', label: 'Website', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z', color: '#60a5fa' },
  { key: 'scholar_url', label: 'Google Scholar', icon: 'M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 100 14 7 7 0 000-14z', color: '#4285F4' },
];

function ProfilePanel({ person, onClose, onSaved }: {
  person: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const acc of SOCIAL_ACCOUNTS) {
      v[acc.key] = (person[acc.key] as string) || '';
    }
    v.headline = (person.headline as string) || '';
    v.location = (person.location as string) || '';
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profileImage = (person.profile_image as string) || '';

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image too large (max 2MB)');
      return;
    }
    setUploadingImage(true);
    try {
      await uploadProfileImage(file);
      onSaved();
    } catch { /* toast handles */ }
    finally { setUploadingImage(false); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageDelete = async () => {
    setUploadingImage(true);
    try {
      await deleteProfileImage();
      onSaved();
    } catch { /* toast handles */ }
    finally { setUploadingImage(false); }
  };

  const filledAccounts = SOCIAL_ACCOUNTS.filter((a) => values[a.key]?.trim());

  const handleSave = async () => {
    setSaving(true);
    try {
      const props: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        props[k] = v.trim();
      }
      await updateProfile(props);
      onSaved();
      setEditing(false);
    } catch { /* toast handles */ }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 24 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative bg-gray-950 border border-white/10 rounded-2xl p-6 sm:p-8 max-w-[95vw] sm:max-w-lg w-full mx-2 sm:mx-4 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center gap-5 mb-6">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            className="relative w-28 h-28 rounded-full bg-purple-600/30 border-2 border-purple-500/50 flex items-center justify-center flex-shrink-0 group cursor-pointer hover:border-purple-400/70 transition-all overflow-hidden"
            title="Click to upload profile picture"
          >
            {profileImage ? (
              <img src={profileImage} alt="Profile" className="w-full h-full object-cover rounded-full" />
            ) : (
              <span className="text-purple-300 text-xl font-bold">
                {((person.name as string) || 'O').charAt(0).toUpperCase()}
              </span>
            )}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
              {uploadingImage ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageUpload}
            />
          </button>
          <div className="min-w-0">
            <h2 className="text-white text-xl font-semibold truncate">{(person.name as string) || 'My Orbis'}</h2>
            {values.headline && !editing && (
              <p className="text-white/40 text-base truncate">{values.headline}</p>
            )}
            {values.location && !editing && (
              <p className="text-white/30 text-sm">{values.location}</p>
            )}
          </div>
          <button onClick={onClose} className="ml-auto text-white/30 hover:text-white/60 transition-colors flex-shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {editing ? (
          /* ── Edit mode ── */
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {profileImage && (
              <button
                onClick={handleImageDelete}
                disabled={uploadingImage}
                className="text-[10px] font-medium text-red-400/70 hover:text-red-400 disabled:opacity-50 transition-colors"
              >
                Remove profile photo
              </button>
            )}
            <div>
              <label className="block text-[10px] font-medium text-white/30 uppercase tracking-wide mb-1">Headline</label>
              <input value={values.headline} onChange={(e) => setValues({ ...values, headline: e.target.value })}
                placeholder="e.g. Senior Software Engineer"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/50" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-white/30 uppercase tracking-wide mb-1">Location</label>
              <input value={values.location} onChange={(e) => setValues({ ...values, location: e.target.value })}
                placeholder="e.g. San Francisco, CA"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/50" />
            </div>

            <div className="border-t border-white/5 pt-3 mt-3">
              <label className="block text-[10px] font-medium text-white/30 uppercase tracking-wide mb-2">Social Accounts</label>
              {SOCIAL_ACCOUNTS.map((acc) => (
                <div key={acc.key} className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill={acc.color}>
                      <path d={acc.icon} />
                    </svg>
                  </div>
                  <input
                    value={values[acc.key]}
                    onChange={(e) => setValues({ ...values, [acc.key]: e.target.value })}
                    placeholder={`${acc.label} URL`}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-sm">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)}
                className="flex-1 border border-white/10 text-white/50 hover:text-white/70 hover:bg-white/5 font-medium py-2 rounded-lg transition-colors text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* ── View mode ── */
          <div>
            {filledAccounts.length > 0 ? (
              <div className="space-y-2.5 mb-5">
                {filledAccounts.map((acc) => (
                  <a
                    key={acc.key}
                    href={values[acc.key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-white/5 border border-white/5 hover:border-white/15 hover:bg-white/8 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${acc.color}20` }}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill={acc.color}>
                        <path d={acc.icon} />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-white/80 text-base font-medium">{acc.label}</div>
                      <div className="text-white/30 text-xs truncate">{values[acc.key]}</div>
                    </div>
                    <svg className="w-5 h-5 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 mb-5">
                <p className="text-white/20 text-base">No social accounts linked yet</p>
              </div>
            )}

            <button onClick={() => setEditing(true)}
              className="w-full border border-white/10 text-white/50 hover:text-white/70 hover:bg-white/5 font-medium py-3 rounded-lg transition-colors text-base flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit Profile & Accounts
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Icon components ──

function IconSettings() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconNotes() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

// ── Header button ──

function HeaderBtn({ onClick, children, variant = 'ghost' }: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'ghost' | 'outline' | 'primary';
}) {
  const base = 'flex items-center gap-1.5 text-xs sm:text-sm font-medium py-1.5 px-2 sm:px-3 rounded-lg transition-all';
  const styles = {
    ghost: `${base} text-white/40 hover:text-white/70 hover:bg-white/5`,
    outline: `${base} text-white/70 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/5`,
    primary: `${base} text-white bg-purple-600 hover:bg-purple-500`,
  };
  return <button onClick={onClick} className={styles[variant]}>{children}</button>;
}

// ── Page ──

export default function OrbViewPage() {
  const navigate = useNavigate();
  const { data, loading, fetchOrb, addNode, updateNode, deleteNode } = useOrbStore();
  const { user, logout } = useAuthStore();
  const [showInput, setShowInput] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [editNode, setEditNode] = useState<{ type: string; values: Record<string, unknown> } | null>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const userId = user?.user_id ?? '';
  const [draftNotes, setDraftNotes] = useState<DraftNote[]>([]);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [pendingSkillLinks, setPendingSkillLinks] = useState<string[]>([]);
  const [pendingDraftNoteId, setPendingDraftNoteId] = useState<string | null>(null);
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<string>>(new Set());

  // ESC key closes any open panel/modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showInput) { setShowInput(false); setEditNode(null); return; }
      if (showProfile) { setShowProfile(false); return; }
      if (showSettings) { setShowSettings(false); return; }
      if (showShare) { setShowShare(false); return; }
      if (showDrafts) { setShowDrafts(false); return; }
      if (showInbox) { setShowInbox(false); return; }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showInput, showProfile, showSettings, showShare, showDrafts, showInbox]);

  // Load drafts when userId becomes available (async auth)
  useEffect(() => {
    if (!userId) return;
    const stored = loadDraftNotes(userId);
    if (stored.length > 0) {
      setDraftNotes(stored);
    } else {
      // Seed a sample note for first-time users
      setDraftNotes([{
        id: 'sample-1',
        text: '💡 This is a draft note! Jot down quick thoughts here — a new skill you learned, a project idea, or something to add to your Orbis later. You can also use the 🎙️ mic to dictate notes by voice. When ready, click "Add to graph" to turn a note into a real entry.',
        createdAt: Date.now(),
        fromVoice: false,
      }]);
    }
    setDraftsLoaded(true);
  }, [userId]);

  // Persist drafts to localStorage (user-scoped) — only after initial load
  useEffect(() => {
    if (userId && draftsLoaded) saveDraftNotes(userId, draftNotes);
  }, [draftNotes, userId, draftsLoaded]);

  useEffect(() => { fetchOrb(); }, [fetchOrb]);


  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNodeClick = useCallback((node: Record<string, unknown>) => {
    if (!node) return;
    const labels = (node._labels as string[]) || [];
    if (labels[0] === 'Person') {
      setShowProfile(true);
      return;
    }
    const typeMap: Record<string, string> = {
      Education: 'education', WorkExperience: 'work_experience', Certification: 'certification',
      Language: 'language', Publication: 'publication', Project: 'project',
      Skill: 'skill', Collaborator: 'collaborator', Patent: 'patent',
    };
    setEditNode({ type: typeMap[labels[0]] || 'skill', values: node });
    setShowInput(true);
  }, []);

  const handleSubmit = async (nodeType: string, properties: Record<string, unknown>) => {
    if (editNode?.values?.uid) {
      await updateNode(editNode.values.uid as string, properties);
    } else {
      const createdNode = await addNode(nodeType, properties);
      // Auto-link suggested skills from AI enhancement
      if (pendingSkillLinks.length > 0 && createdNode?.uid) {
        for (const skillUid of pendingSkillLinks) {
          try {
            await linkSkill(createdNode.uid, skillUid);
          } catch { /* skip failed links */ }
        }
        await fetchOrb();
      }
    }
    if (pendingDraftNoteId) {
      setDraftNotes((prev) => prev.filter((n) => n.id !== pendingDraftNoteId));
      setPendingDraftNoteId(null);
    }
    setPendingSkillLinks([]);
    setShowInput(false);
    setEditNode(null);
  };

  const handleDraftToGraph = (note: DraftNote) => {
    const text = note.text.toLowerCase();
    const detect: [RegExp, string][] = [
      [/\b(python|javascript|typescript|react|angular|vue|java|c\+\+|node\.?js|sql|docker|kubernetes|aws|git|html|css|figma|photoshop|agile|scrum|machine learning|data science|deep learning|tensorflow|pytorch)\b/i, 'skill'],
      [/\b(university|degree|bachelor|master|phd|diploma|graduated|school|college|mba|studies|thesis)\b/i, 'education'],
      [/\b(certified|certification|certificate|license|accredit|aws certified|pmp|cpa|comptia)\b/i, 'certification'],
      [/\b(english|french|spanish|german|italian|portuguese|chinese|japanese|korean|arabic|hindi|russian|dutch|fluent|native speaker|bilingual)\b/i, 'language'],
      [/\b(published|paper|article|journal|conference|proceedings|co-author|isbn|doi)\b/i, 'publication'],
      [/\b(project|built|developed|created|launched|side project|open.?source|hackathon|prototype|app|website)\b/i, 'project'],
      [/\b(patent|invention|filed|provisional|granted patent|patent number)\b/i, 'patent'],
      [/\b(worked with|colleague|collaborator|team.?mate|mentor|manager|co.?founder|partner)\b/i, 'collaborator'],
    ];
    let type = 'work_experience';
    for (const [regex, nodeType] of detect) {
      if (regex.test(text)) { type = nodeType; break; }
    }
    setPendingDraftNoteId(note.id);
    setEditNode({ type, values: { description: note.text } });
    setShowInput(true);
    setShowDrafts(false);
  };

  const handleDraftEnhance = async (note: DraftNote, targetLang: string) => {
    const existingSkills = (data?.nodes || [])
      .filter((n) => n._labels?.[0] === 'Skill' && n.name)
      .map((n) => ({ uid: n.uid, name: n.name as string }));

    const result = await enhanceNote(note.text, targetLang, existingSkills);

    setPendingDraftNoteId(note.id);
    setPendingSkillLinks(result.suggested_skill_uids);
    setEditNode({ type: result.node_type, values: result.properties });
    setShowInput(true);
    setShowDrafts(false);
  };

  const orbId = (data?.person?.orb_id as string) || '';
  const { activeKeywords } = useFilterStore();
  const { rangeStart, rangeEnd, resetRange } = useDateFilterStore();

  // Compute date bounds for the slider
  const dateBounds = useMemo(() => {
    const allDates: string[] = [];
    for (const node of data?.nodes ?? []) {
      allDates.push(...getNodeDates(node as Record<string, unknown>));
    }
    if (allDates.length === 0) return null;
    allDates.sort();
    const min = allDates[0];
    const max = allDates[allDates.length - 1];
    return min === max ? null : { min, max };
  }, [data?.nodes]);

  // Reset date filter when switching to a different orb (not on node edits)
  useEffect(() => { resetRange(); }, [orbId, resetRange]);

  // Compute which nodes match any active visibility filter (keyword + date)
  const filteredNodeIds = useMemo(() => {
    const keywordFiltered = computeFilteredNodeIds(data?.nodes ?? [], activeKeywords);
    const dateFiltered = computeDateFilteredNodeIds(
      data?.nodes ?? [],
      data?.links ?? [],
      rangeStart,
      rangeEnd,
      dateBounds?.min,
      dateBounds?.max,
    );
    // Union of both sets
    const merged = new Set(keywordFiltered);
    for (const id of dateFiltered) merged.add(id);
    return merged;
  }, [data?.nodes, data?.links, activeKeywords, rangeStart, rangeEnd, dateBounds]);

  // Node type filter handlers
  const handleToggleNodeType = useCallback((type: string) => {
    setHiddenNodeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleShowAllNodeTypes = useCallback(() => {
    setHiddenNodeTypes(new Set());
  }, []);

  const ALL_FILTERABLE_TYPES = ['Education', 'WorkExperience', 'Certification', 'Language', 'Publication', 'Project', 'Skill', 'Collaborator', 'Patent'];

  const handleHideAllNodeTypes = useCallback(() => {
    setHiddenNodeTypes(new Set(ALL_FILTERABLE_TYPES));
  }, []);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black relative">
      {/* ── Header ── */}
      <div className="absolute top-0 left-0 right-0 z-30 px-3 sm:px-5 py-2 sm:py-3">
        <div className="flex items-center justify-between">
          {/* Left: identity — click avatar to open settings */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowSettings(true)}
              className="relative w-12 h-12 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center hover:bg-purple-600/50 hover:border-purple-400/60 transition-all group overflow-hidden"
              title="Settings"
            >
              {(data.person.profile_image as string) ? (
                <>
                  <img src={data.person.profile_image as string} alt="" className="w-full h-full object-cover rounded-full group-hover:opacity-30 transition-opacity" />
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <IconSettings />
                  </span>
                </>
              ) : (
                <>
                  <span className="text-purple-300 text-xs font-bold group-hover:opacity-0 transition-opacity">
                    {((data.person.name as string) || user?.name || 'O').charAt(0).toUpperCase()}
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <IconSettings />
                  </span>
                </>
              )}
            </button>
            <div>
              <span className="text-white text-xs sm:text-sm font-semibold">{(data.person.name as string) || user?.name || 'My Orbis'}</span>
              <span className="text-white/20 text-xs ml-2 hidden sm:inline">{data.nodes.length} nodes &middot; {data.links.length} edges</span>
              {activeKeywords.length > 0 && (
                <span className="text-amber-400/70 text-[10px] ml-2 hidden sm:inline-flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {activeKeywords.join(', ')}
                </span>
              )}
            </div>
          </div>

          {/* Right: secondary actions */}
          <div className="flex items-center gap-1">
            <ProcessingCounter />
            <NodeTypeFilter
              hiddenTypes={hiddenNodeTypes}
              onToggleType={handleToggleNodeType}
              onShowAll={handleShowAllNodeTypes}
              onHideAll={handleHideAllNodeTypes}
            />
            <div className="w-px h-5 bg-white/10 mx-1" />
            <HeaderBtn onClick={() => setShowInbox(true)} variant="outline">
              <IconInbox />
              <span className="hidden sm:inline">Inbox</span>
              {unreadCount > 0 && (
                <span className="bg-green-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </HeaderBtn>
            <HeaderBtn onClick={() => setShowDrafts(true)} variant="outline">
              <IconNotes />
              <span className="hidden sm:inline">Notes</span>
              {draftNotes.length > 0 && (
                <span className="bg-purple-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {draftNotes.length}
                </span>
              )}
            </HeaderBtn>
            <button
              onClick={() => window.open('/cv-export', '_blank')}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-medium py-1.5 px-2 sm:px-3 rounded-lg text-white/40 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
            >
              <IconDownload />
              <span className="hidden sm:inline">Export CV</span>
            </button>
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="text-white/30 text-xs font-medium py-1.5 px-2 sm:px-3 rounded-lg hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* ── Empty graph hint — point to the + Add button ── */}
      {data.nodes.length === 0 && !showInput && (
        <div className="absolute inset-0 z-20 flex items-end justify-center pointer-events-none pb-28 sm:pb-32">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-center"
          >
            <p className="text-white/50 text-sm mb-3">
              Tap the <span className="text-purple-400 font-semibold">＋</span> button to start populating your Orbis
            </p>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="text-purple-400 text-2xl"
            >
              ↓
            </motion.div>
          </motion.div>
        </div>
      )}

      {/* ── Date Range Slider ── */}
      {dateBounds && (
        <DateRangeSlider minDate={dateBounds.min} maxDate={dateBounds.max} />
      )}

      {/* ── 3D Graph ── */}
      <OrbGraph3D
        data={data}
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => {
          if (chatMessages.length > 0) {
            setChatMessages([]);
            setHighlightedNodeIds(new Set());
          }
        }}
        highlightedNodeIds={highlightedNodeIds}
        filteredNodeIds={filteredNodeIds}
        hiddenNodeTypes={hiddenNodeTypes}
        width={dimensions.width}
        height={dimensions.height}
      />

      {/* NodeTypeFilter moved to header bar */}

      {/* ── Floating Input ── */}
      <FloatingInput
        open={showInput}
        editNode={editNode}
        onSubmit={handleSubmit}
        onCancel={() => { setShowInput(false); setEditNode(null); setPendingSkillLinks([]); setPendingDraftNoteId(null); }}
        onDelete={async (uid) => {
          await deleteNode(uid);
          setShowInput(false);
          setEditNode(null);
        }}
        onEnhance={async (text) => {
          const existingSkills = (data?.nodes || [])
            .filter((n) => n._labels?.[0] === 'Skill' && n.name)
            .map((n) => ({ uid: n.uid, name: n.name as string }));
          const targetLang = localStorage.getItem('orbis_note_target_lang') || 'en';
          const result = await enhanceNote(text, targetLang, existingSkills);
          setPendingSkillLinks(result.suggested_skill_uids);
          return { node_type: result.node_type, properties: result.properties };
        }}
      />

      {/* ── Chat Box ── */}
      <ChatBox
        onHighlight={setHighlightedNodeIds}
        messages={chatMessages}
        onMessagesChange={setChatMessages}
        onAdd={() => { setEditNode(null); setShowInput(true); }}
        onShare={() => setShowShare(true)}
        highlightAdd={data.nodes.length === 0 && !showInput}
      />

      {/* ── Inbox ── */}
      <Inbox
        open={showInbox}
        onClose={() => setShowInbox(false)}
        onUnreadCountChange={setUnreadCount}
      />

      {/* ── Draft Notes ── */}
      <DraftNotes
        open={showDrafts}
        onClose={() => setShowDrafts(false)}
        notes={draftNotes}
        onNotesChange={setDraftNotes}
        onAddToGraph={handleDraftToGraph}
        onEnhance={handleDraftEnhance}
      />

      {/* ── Animated Panels ── */}
      <AnimatePresence>
        {showShare && <SharePanel key="share" orbId={orbId} onClose={() => setShowShare(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showSettings && <SettingsPanel key="settings" orbId={orbId} onClose={() => setShowSettings(false)} onOrbIdChanged={fetchOrb} />}
      </AnimatePresence>
      <AnimatePresence>
        {showProfile && <ProfilePanel key="profile" person={data.person} onClose={() => setShowProfile(false)} onSaved={fetchOrb} />}
      </AnimatePresence>
    </div>
  );
}
