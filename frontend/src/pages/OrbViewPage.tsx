import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrbStore } from '../stores/orbStore';
import { useAuthStore } from '../stores/authStore';
import { claimOrbId, updateProfile } from '../api/orbs';
import { QRCodeSVG } from 'qrcode.react';
import OrbGraph3D from '../components/graph/OrbGraph3D';
import FloatingInput from '../components/editor/FloatingInput';
import ChatBox from '../components/chat/ChatBox';
import type { ChatMessage } from '../components/chat/ChatBox';
import DraftNotes from '../components/drafts/DraftNotes';
import type { DraftNote } from '../components/drafts/DraftNotes';
import Inbox from '../components/inbox/Inbox';

// ── Modals ──

function SharePanel({ orbId, onClose }: { orbId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/${orbId}`;
  const mcpUri = `orb://${orbId}`;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
      >
        <h2 className="text-white text-lg font-semibold mb-1">Share Your Orb</h2>
        <p className="text-gray-400 text-sm mb-5">Share your orb link or use the MCP identifier to let AI agents access your professional graph.</p>

        {/* QR Code */}
        <div className="flex justify-center mb-5">
          <div className="bg-white p-3 rounded-xl">
            <QRCodeSVG value={shareUrl} size={140} level="M" />
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

        <div className="mb-5">
          <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">MCP Orb ID</label>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-1">Use this ID with the Orbis MCP server to let AI agents query your graph.</p>
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
  const [customId, setCustomId] = useState(orbId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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
        className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
      >
        <h2 className="text-white text-lg font-semibold mb-1">Settings</h2>
        <p className="text-gray-400 text-sm mb-5">Customize your orb identity.</p>
        <div className="mb-5">
          <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Custom Orb ID</label>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-2">Choose a memorable ID for your orb. This will be your public URL and MCP identifier.</p>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">{window.location.origin}/</span>
            <input value={customId} onChange={(e) => { setCustomId(e.target.value); setError(''); setSuccess(false); }} placeholder="your-name" className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
          </div>
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          {success && <p className="text-green-400 text-xs mt-2">Orb ID updated!</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-sm">{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={onClose} className="flex-1 border border-gray-600 text-gray-300 hover:bg-gray-800 font-medium py-2 rounded-lg transition-colors text-sm">Cancel</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Social accounts config ──

const SOCIAL_ACCOUNTS = [
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

  const filledAccounts = SOCIAL_ACCOUNTS.filter((a) => values[a.key]?.trim());
  const emptyAccounts = SOCIAL_ACCOUNTS.filter((a) => !values[a.key]?.trim());

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
        className="relative bg-gray-950 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-purple-600/30 border-2 border-purple-500/50 flex items-center justify-center flex-shrink-0">
            <span className="text-purple-300 text-xl font-bold">
              {((person.name as string) || 'O').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-white text-lg font-semibold truncate">{(person.name as string) || 'My Orb'}</h2>
            {values.headline && !editing && (
              <p className="text-white/40 text-sm truncate">{values.headline}</p>
            )}
            {values.location && !editing && (
              <p className="text-white/30 text-xs">{values.location}</p>
            )}
          </div>
          <button onClick={onClose} className="ml-auto text-white/30 hover:text-white/60 transition-colors flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {editing ? (
          /* ── Edit mode ── */
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
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
              <div className="space-y-1.5 mb-4">
                {filledAccounts.map((acc) => (
                  <a
                    key={acc.key}
                    href={values[acc.key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-white/15 hover:bg-white/8 transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${acc.color}20` }}>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill={acc.color}>
                        <path d={acc.icon} />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-white/80 text-sm font-medium">{acc.label}</div>
                      <div className="text-white/30 text-[10px] truncate">{values[acc.key]}</div>
                    </div>
                    <svg className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 mb-4">
                <p className="text-white/20 text-sm">No social accounts linked yet</p>
              </div>
            )}

            <button onClick={() => setEditing(true)}
              className="w-full border border-white/10 text-white/50 hover:text-white/70 hover:bg-white/5 font-medium py-2 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

function IconShare() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  );
}

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

function IconPlus() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
  const base = 'flex items-center gap-1.5 text-sm font-medium py-1.5 px-3 rounded-lg transition-all';
  const styles = {
    ghost: `${base} text-white/40 hover:text-white/70 hover:bg-white/5`,
    outline: `${base} text-white/70 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/5`,
    primary: `${base} text-white bg-purple-600 hover:bg-purple-500`,
  };
  return <button onClick={onClick} className={styles[variant]}>{children}</button>;
}

// ── Page ──

export default function OrbViewPage() {
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
  const [draftNotes, setDraftNotes] = useState<DraftNote[]>(() => {
    try { return JSON.parse(localStorage.getItem('orbis_drafts') || '[]'); } catch { return []; }
  });

  // Persist drafts to localStorage
  useEffect(() => {
    localStorage.setItem('orbis_drafts', JSON.stringify(draftNotes));
  }, [draftNotes]);

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
      await addNode(nodeType, properties);
    }
    setShowInput(false);
    setEditNode(null);
  };

  const handleDraftToGraph = (note: DraftNote) => {
    // Pre-fill the entry form with the note text as description
    setEditNode({ type: 'work_experience', values: { description: note.text } });
    setShowInput(true);
    setShowDrafts(false);
  };

  const orbId = (data?.person?.orb_id as string) || '';

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
      <div className="absolute top-0 left-0 right-0 z-30 px-5 py-3">
        <div className="flex items-center justify-between">
          {/* Left: identity — click avatar to open settings */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSettings(true)}
              className="relative w-8 h-8 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center hover:bg-purple-600/50 hover:border-purple-400/60 transition-all group"
              title="Settings"
            >
              <span className="text-purple-300 text-xs font-bold group-hover:opacity-0 transition-opacity">
                {(user?.name || 'O').charAt(0).toUpperCase()}
              </span>
              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <IconSettings />
              </span>
            </button>
            <div>
              <span className="text-white text-sm font-semibold">{user?.name || 'My Orb'}</span>
              <span className="text-white/20 text-xs ml-2">{data.nodes.length} nodes</span>
            </div>
          </div>

          {/* Right: secondary actions */}
          <div className="flex items-center gap-1.5">
            <HeaderBtn onClick={() => setShowInbox(true)} variant="outline">
              <IconInbox />
              <span className="hidden sm:inline">Inbox</span>
              {unreadCount > 0 && (
                <span className="bg-purple-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
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
            <HeaderBtn onClick={() => {
              if (orbId) window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/export/${orbId}?format=pdf`, '_blank');
            }} variant="ghost">
              <IconDownload />
              <span className="hidden sm:inline">Export CV</span>
            </HeaderBtn>
            <HeaderBtn onClick={logout} variant="ghost">
              <span className="text-white/30 text-xs">Logout</span>
            </HeaderBtn>
          </div>
        </div>
      </div>

      {/* ── Onboarding overlay for empty graphs ── */}
      {data.nodes.length === 0 && !showInput && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto text-center max-w-md px-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h2 className="text-white text-xl font-semibold mb-2">Your orb is empty</h2>
            <p className="text-white/40 text-sm mb-6 leading-relaxed">
              Start building your professional knowledge graph by adding entries.
              Each entry becomes a node — work experiences, skills, education, and more.
            </p>
            <div className="flex flex-col gap-2 items-center">
              <button
                onClick={() => { setEditNode({ type: 'work_experience', values: {} }); setShowInput(true); }}
                className="bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 px-6 rounded-lg transition-colors text-sm"
              >
                + Add Work Experience
              </button>
              <button
                onClick={() => { setEditNode({ type: 'skill', values: {} }); setShowInput(true); }}
                className="text-white/40 hover:text-white/70 font-medium py-2 px-6 rounded-lg transition-colors text-sm"
              >
                or add a Skill
              </button>
            </div>
          </div>
        </div>
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
        width={dimensions.width}
        height={dimensions.height}
      />

      {/* ── Floating Action Buttons ── */}
      <div className="fixed bottom-28 right-6 z-30 flex flex-col gap-3 items-end">
        {/* Share FAB */}
        <button
          onClick={() => setShowShare(true)}
          className="group flex items-center gap-2 bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/15 hover:border-white/25 text-white/70 hover:text-white font-medium py-2.5 px-4 rounded-full transition-all shadow-lg"
        >
          <IconShare />
          <span className="text-sm">Share</span>
        </button>

        {/* Add FAB */}
        <button
          onClick={() => { setEditNode(null); setShowInput(true); }}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-5 rounded-full transition-all shadow-xl shadow-purple-600/30 hover:shadow-purple-500/40 hover:scale-105"
        >
          <IconPlus />
          <span className="text-sm">Add Entry</span>
        </button>
      </div>

      {/* ── Floating Input ── */}
      <FloatingInput
        open={showInput}
        editNode={editNode}
        onSubmit={handleSubmit}
        onCancel={() => { setShowInput(false); setEditNode(null); }}
        onDelete={async (uid) => {
          await deleteNode(uid);
          setShowInput(false);
          setEditNode(null);
        }}
      />

      {/* ── Chat Box ── */}
      <ChatBox
        onHighlight={setHighlightedNodeIds}
        messages={chatMessages}
        onMessagesChange={setChatMessages}
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
