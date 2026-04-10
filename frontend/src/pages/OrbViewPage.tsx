import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrbStore } from '../stores/orbStore';
import { useAuthStore } from '../stores/authStore';
import { useFilterStore, computeFilteredNodeIds } from '../stores/filterStore';
import DateRangeSlider from '../components/graph/DateRangeSlider';
import { useDateFilterStore, computeDateFilteredNodeIds, getNodeDates } from '../stores/dateFilterStore';
import { updateProfile, uploadProfileImage, deleteProfileImage, createFilterToken, enhanceNote, linkSkill } from '../api/orbs';
import { QRCodeSVG } from 'qrcode.react';
import OrbGraph3D from '../components/graph/OrbGraph3D';
import NodeTypeFilter from '../components/graph/NodeTypeFilter';
import FloatingInput from '../components/editor/FloatingInput';
import ChatBox from '../components/chat/ChatBox';
import type { ChatMessage } from '../components/chat/ChatBox';
import DraftNotes from '../components/drafts/DraftNotes';
import ExtractedDataReview from '../components/onboarding/ExtractedDataReview';
import type { DraftNote } from '../components/drafts/DraftNotes';
import { loadDraftNotes, loadDraftNotesAsync } from '../components/drafts/DraftNotes';
import ProcessingCounter from '../components/cv/ProcessingCounter';
import KeywordFilterDropdown from '../components/cv/KeywordFilterDropdown';
import UserMenu from '../components/UserMenu';
import { useToastStore } from '../stores/toastStore';
import { useUndoStore } from '../stores/undoStore';
import { getDocuments, confirmImport } from '../api/cv';
import GuidedTour from '../components/GuidedTour';
import type { DocumentMetadata } from '../api/cv';

const IMPORT_PROGRESS_STEP_LABELS: Record<string, string> = {
  reading_pdf: 'Reading PDF',
  extracting_text: 'Extracting text',
  classifying: 'Classifying entries',
  parsing_response: 'Building graph',
  done: 'Finalizing',
};

function resolveImportStepLabel(step: string | null | undefined, detail: string | null | undefined, message: string | null | undefined): string {
  if (step && IMPORT_PROGRESS_STEP_LABELS[step]) return IMPORT_PROGRESS_STEP_LABELS[step];
  if (detail?.trim()) return detail.trim();
  if (message?.trim()) return message.trim();
  return 'Reading PDF';
}

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

// ── Social accounts config ──

const SOCIAL_ACCOUNTS = [
  { key: 'linkedin_url', label: 'LinkedIn', icon: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z', color: '#0A66C2' },
  { key: 'github_url', label: 'GitHub', icon: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12', color: '#fff' },
  { key: 'twitter_url', label: 'X / Twitter', icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z', color: '#fff' },
  { key: 'instagram_url', label: 'Instagram', icon: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z', color: '#E4405F' },
  { key: 'website_url', label: 'Website', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z', color: '#60a5fa' },
  { key: 'scholar_url', label: 'Google Scholar', icon: 'M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 100 14 7 7 0 000-14z', color: '#4285F4' },
  { key: 'orcid_url', label: 'ORCID', icon: 'M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378a.869.869 0 110 1.738.869.869 0 010-1.738zm-.78 3.451h1.56v11.561H6.59V7.829zm3.921 0h4.21c4.518 0 6.758 2.906 6.758 5.78 0 3.12-2.602 5.78-6.758 5.78h-4.21V7.83zm1.56 1.387v8.787h2.65c3.483 0 5.198-2.263 5.198-4.393 0-2.39-1.86-4.394-5.197-4.394h-2.65z', color: '#A6CE39' },
];

function ProfilePanel({ person, onClose, onSaved }: {
  person: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const addToast = useToastStore((s) => s.addToast);
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
  const [showDeleteConfirmPhoto, setShowDeleteConfirmPhoto] = useState(false);

  // Sync values when person data refreshes (e.g. after save + re-fetch)
  useEffect(() => {
    const v: Record<string, string> = {};
    for (const acc of SOCIAL_ACCOUNTS) {
      v[acc.key] = (person[acc.key] as string) || '';
    }
    v.headline = (person.headline as string) || '';
    v.location = (person.location as string) || '';
    setValues(v);
  }, [person]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profileImage = (person.profile_image as string) || (person.picture as string) || '';

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast('Please select an image file', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      addToast('Image too large (max 2MB)', 'error');
      return;
    }
    setUploadingImage(true);
    try {
      await uploadProfileImage(file);
      addToast('Profile picture updated', 'success');
      onSaved();
    } catch {
      addToast('Failed to upload profile picture', 'error');
    } finally { setUploadingImage(false); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageDelete = async () => {
    setUploadingImage(true);
    try {
      await deleteProfileImage();
      addToast('Profile picture removed', 'info');
      onSaved();
    } catch {
      addToast('Failed to remove profile picture', 'error');
    } finally { setUploadingImage(false); setShowDeleteConfirmPhoto(false); }
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
      addToast('Profile updated', 'success');
      onSaved();
      setEditing(false);
    } catch {
      addToast('Failed to update profile', 'error');
    } finally { setSaving(false); }
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
          <div className="max-h-[60vh] overflow-y-auto pr-1 -mr-1">
            {/* Photo actions */}
            {profileImage && (
              <div className="mb-4">
                {showDeleteConfirmPhoto ? (
                  <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                    <span className="text-xs text-red-400">Remove photo?</span>
                    <button onClick={handleImageDelete} disabled={uploadingImage}
                      className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors cursor-pointer">
                      {uploadingImage ? 'Removing...' : 'Yes'}
                    </button>
                    <button onClick={() => setShowDeleteConfirmPhoto(false)}
                      className="text-xs font-medium text-white/40 hover:text-white/60 transition-colors cursor-pointer">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowDeleteConfirmPhoto(true)}
                    className="text-xs font-medium text-red-400/60 hover:text-red-400 transition-colors cursor-pointer">
                    Remove profile photo
                  </button>
                )}
              </div>
            )}

            {/* Profile fields */}
            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-[10px] font-medium text-white/30 uppercase tracking-wide mb-1.5">Headline</label>
                <input value={values.headline} onChange={(e) => setValues({ ...values, headline: e.target.value })}
                  placeholder="e.g. Senior Software Engineer"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/50" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-white/30 uppercase tracking-wide mb-1.5">Location</label>
                <input value={values.location} onChange={(e) => setValues({ ...values, location: e.target.value })}
                  placeholder="e.g. San Francisco, CA"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/50" />
              </div>
            </div>

            {/* Social accounts */}
            <div className="border-t border-white/5 pt-4">
              <label className="block text-[10px] font-medium text-white/30 uppercase tracking-wide mb-3">Social Accounts</label>
              <div className="space-y-2">
                {SOCIAL_ACCOUNTS.map((acc) => (
                  <div key={acc.key} className="flex items-center gap-2.5 bg-white/[0.02] rounded-lg px-2 py-1 hover:bg-white/[0.04] transition-colors">
                    <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${acc.color}15` }}>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill={acc.color}>
                        <path d={acc.icon} />
                      </svg>
                    </div>
                    <input
                      value={values[acc.key]}
                      onChange={(e) => setValues({ ...values, [acc.key]: e.target.value })}
                      placeholder={`${acc.label} URL`}
                      className="flex-1 bg-transparent border-none text-white text-xs placeholder:text-white/20 focus:outline-none min-w-0"
                    />
                    {values[acc.key]?.trim() && (
                      <button onClick={() => setValues({ ...values, [acc.key]: '' })}
                        className="text-white/15 hover:text-white/40 transition-colors flex-shrink-0 cursor-pointer">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-5 sticky bottom-0 bg-gray-950 pb-1">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm cursor-pointer">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)}
                className="flex-1 border border-white/10 text-white/50 hover:text-white/70 hover:bg-white/5 font-medium py-2.5 rounded-lg transition-colors text-sm cursor-pointer">
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

// ── Header button ──

function HeaderBtn({ onClick, children, variant = 'ghost' }: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'ghost' | 'outline' | 'primary';
}) {
  const base = 'h-8 leading-none flex items-center gap-1.5 text-xs sm:text-sm font-medium py-1.5 px-2 sm:px-3 rounded-lg transition-all';
  const styles = {
    ghost: `${base} text-white/40 hover:text-white/70 hover:bg-white/5`,
    outline: `${base} text-white/70 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/5`,
    primary: `${base} text-white bg-purple-600 hover:bg-purple-500`,
  };
  return <button onClick={onClick} className={styles[variant]}>{children}</button>;
}

// ── Constants ──

const ALL_FILTERABLE_TYPES = ['Education', 'WorkExperience', 'Certification', 'Language', 'Publication', 'Project', 'Skill', 'Patent', 'Award', 'Outreach'];
const DEFAULT_CAMERA_DISTANCE = 200;
const CAMERA_DISTANCE_KEY = 'orbis_camera_distance';

function getSavedCameraDistance(): number {
  try {
    const saved = localStorage.getItem(CAMERA_DISTANCE_KEY);
    if (saved) {
      const val = parseInt(saved, 10);
      if (val > 50 && val < 2000) return val;
    }
  } catch { /* ignore */ }
  return DEFAULT_CAMERA_DISTANCE;
}

const LABEL_TO_TYPE: Record<string, string> = {
  Education: 'education',
  WorkExperience: 'work_experience',
  Certification: 'certification',
  Language: 'language',
  Publication: 'publication',
  Project: 'project',
  Skill: 'skill',
  Patent: 'patent',
  Award: 'award',
  Outreach: 'outreach',
};

// ── Page ──

export default function OrbViewPage() {
  const { data, loading, fetchOrb, addNode, updateNode, deleteNode } = useOrbStore();
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const undoStack = useUndoStore((s) => s.undoStack);
  const redoStack = useUndoStore((s) => s.redoStack);
  const undo = useUndoStore((s) => s.undo);
  const redo = useUndoStore((s) => s.redo);
  const isPendingDeletion = user?.deletion_days_remaining != null;
  const [showInput, setShowInput] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [cameraDistance] = useState(getSavedCameraDistance);

  const handleCameraDistanceChange = useCallback((dist: number) => {
    try { localStorage.setItem(CAMERA_DISTANCE_KEY, String(dist)); } catch { /* ignore */ }
  }, []);
  const [tourRunning, setTourRunning] = useState(false);
  const [editNode, setEditNode] = useState<{ type: string; values: Record<string, unknown> } | null>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const userId = user?.user_id ?? '';
  const [draftNotes, setDraftNotes] = useState<DraftNote[]>([]);
  const [pendingSkillLinks, setPendingSkillLinks] = useState<string[]>([]);
  const [pendingDraftNoteId, setPendingDraftNoteId] = useState<string | null>(null);
  const [pendingDraftRawText, setPendingDraftRawText] = useState<string>('');
  const [draftReferenceText, setDraftReferenceText] = useState<string | null>(null);
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<string>>(new Set());
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [showImportLimitWarning, setShowImportLimitWarning] = useState(false);
  const [importOldestDoc, setImportOldestDoc] = useState<{ name: string; date: string } | null>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [focusRequest, setFocusRequest] = useState<{ nodeUid: string; seq: number } | null>(null);
  const startTour = useCallback(() => {
    // Always restart cleanly, even if a previous run state is still true.
    setTourRunning(false);
    requestAnimationFrame(() => setTourRunning(true));
  }, []);
  const [extractedImport, setExtractedImport] = useState<{
    nodes: Array<{ node_type: string; properties: Record<string, unknown> }>;
    relationships: Array<{ from_index: number; to_index: number; type: string }>;
    cvOwnerName: string | null;
    unmatchedCount: number;
    skippedCount: number;
    file: File;
    documentId: string | null;
  } | null>(null);

  // ESC key closes any open panel/modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showToolsMenu) { setShowToolsMenu(false); return; }
      if (showInput) {
        setShowInput(false);
        setEditNode(null);
        setPendingSkillLinks([]);
        setPendingDraftNoteId(null);
        setPendingDraftRawText('');
        setDraftReferenceText(null);
        return;
      }
      if (showProfile) { setShowProfile(false); return; }
      if (showShare) { setShowShare(false); return; }
      if (showDrafts) { setShowDrafts(false); return; }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showInput, showProfile, showShare, showDrafts, showToolsMenu]);

  useEffect(() => {
    if (!showToolsMenu) return;
    const handleOutside = (e: PointerEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setShowToolsMenu(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [showToolsMenu]);

  const fetchDocuments = useCallback(async () => {
    try {
      const docs = await getDocuments();
      setDocuments(docs);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Load drafts when userId becomes available — API is the source of truth
  useEffect(() => {
    if (!userId) return;
    loadDraftNotesAsync(userId).then((notes) => {
      if (notes.length > 0) {
        setDraftNotes(notes);
      } else {
        // Seed a sample note for first-time users
        const local = loadDraftNotes(userId);
        if (local.length > 0) {
          setDraftNotes(local);
        } else {
          setDraftNotes([{
            id: 'sample-1',
            text: '💡 This is a draft note! Jot down quick thoughts here — a new skill you learned, a project idea, or something to add to your Orbis later. When ready, click "Add to graph" to turn a note into a real entry.',
            createdAt: Date.now(),
          }]);
        }
      }
    });
  }, [userId]);

  useEffect(() => { fetchOrb(); }, [fetchOrb]);

  // If the orb is empty (only Person node, no career entries), redirect to the
  // create flow — UNLESS the user explicitly chose "Build from scratch" (in which
  // case they passed `state.allowEmpty` and we let them stay on the empty view).
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as { allowEmpty?: boolean; startTour?: boolean } | null) ?? null;
  const allowEmpty = locationState?.allowEmpty === true;
  const hasRedirectedRef = useRef(false);
  const consumedStartTourRef = useRef(false);
  useEffect(() => {
    // Only redirect on the very first successful load, never on subsequent refetches
    if (hasRedirectedRef.current) return;
    if (!loading && data && data.nodes.length === 0 && !allowEmpty) {
      hasRedirectedRef.current = true;
      navigate('/create', { replace: true });
    }
    if (!loading && data && data.nodes.length > 0) {
      hasRedirectedRef.current = true; // Had content on first load, never redirect
    }
  }, [loading, data, allowEmpty, navigate]);

  useEffect(() => {
    if (!locationState?.startTour || consumedStartTourRef.current) return;
    consumedStartTourRef.current = true;
    setTourRunning(true);

    const nextState: { allowEmpty?: boolean; startTour?: boolean } = { ...locationState };
    delete nextState.startTour;

    navigate(location.pathname, {
      replace: true,
      state: Object.keys(nextState).length > 0 ? nextState : null,
    });
  }, [location.pathname, locationState, navigate]);


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
      Skill: 'skill', Patent: 'patent',
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
    setPendingDraftRawText('');
    setPendingSkillLinks([]);
    setDraftReferenceText(null);
    setShowInput(false);
    setEditNode(null);
  };

  const handleDraftToGraph = (note: DraftNote) => {
    setPendingDraftNoteId(note.id);
    setPendingDraftRawText(note.text);
    setPendingSkillLinks([]);
    setDraftReferenceText(note.text);
    setEditNode({ type: 'work_experience', values: {} });
    setShowInput(true);
    setShowDrafts(false);
  };

  const handleDraftEnhance = async (note: DraftNote, targetLang: string) => {
    // Already enhanced: re-open the form with the saved structured data so
    // the user can keep refining without spending another LLM call.
    if (note.enhanced) {
      setDraftReferenceText(null);
      setPendingDraftNoteId(note.id);
      setPendingDraftRawText(note.text);
      setPendingSkillLinks(note.enhanced.suggestedSkillUids);
      setEditNode({ type: note.enhanced.nodeType, values: note.enhanced.properties });
      setShowInput(true);
      setShowDrafts(false);
      return;
    }

    const existingSkills = (data?.nodes || [])
      .filter((n) => n._labels?.[0] === 'Skill' && n.name)
      .map((n) => ({ uid: n.uid, name: n.name as string }));

    const result = await enhanceNote(note.text, targetLang, existingSkills);

    setDraftReferenceText(null);
    setPendingDraftNoteId(note.id);
    setPendingDraftRawText(note.text);
    setPendingSkillLinks(result.suggested_skill_uids);
    setEditNode({ type: result.node_type, values: result.properties });
    setShowInput(true);
    setShowDrafts(false);
  };

  const handleSaveDraftEnhanced = (nodeType: string, properties: Record<string, unknown>) => {
    if (!pendingDraftNoteId) return;
    const draftId = pendingDraftNoteId;
    const rawText = pendingDraftRawText;
    const skillUids = pendingSkillLinks;
    setDraftNotes((prev) => {
      const existing = prev.find((n) => n.id === draftId);
      if (existing) {
        return prev.map((n) =>
          n.id === draftId
            ? { ...n, enhanced: { nodeType, properties, suggestedSkillUids: skillUids, updatedAt: Date.now() } }
            : n,
        );
      }
      // The draft was created on the fly from the input field — persist it now.
      return [
        {
          id: draftId,
          text: rawText,
          createdAt: Date.now(),
          enhanced: { nodeType, properties, suggestedSkillUids: skillUids, updatedAt: Date.now() },
        },
        ...prev,
      ];
    });
    setPendingDraftNoteId(null);
    setPendingDraftRawText('');
    setPendingSkillLinks([]);
    setDraftReferenceText(null);
    setShowInput(false);
    setEditNode(null);
    setShowDrafts(true);
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

  const dateFilteredNodeIds = useMemo(
    () => computeDateFilteredNodeIds(
      data?.nodes ?? [],
      data?.links ?? [],
      rangeStart,
      rangeEnd,
      dateBounds?.min,
      dateBounds?.max,
    ),
    [data?.nodes, data?.links, rangeStart, rangeEnd, dateBounds],
  );

  // Compute which nodes match any active visibility filter (keyword + date)
  const filteredNodeIds = useMemo(() => {
    const keywordFiltered = computeFilteredNodeIds(data?.nodes ?? [], activeKeywords);
    // Union of both sets
    const merged = new Set(keywordFiltered);
    for (const id of dateFilteredNodeIds) merged.add(id);
    return merged;
  }, [data?.nodes, activeKeywords, dateFilteredNodeIds]);

  // Node type filter handlers
  const handleShowAllNodeTypes = useCallback(() => {
    setHiddenNodeTypes(new Set());
  }, []);

  const handleHideAllNodeTypes = useCallback(() => {
    setHiddenNodeTypes(new Set(ALL_FILTERABLE_TYPES));
  }, []);

  const handleSetVisibleNodeTypes = useCallback((visibleTypes: Set<string>) => {
    setHiddenNodeTypes(new Set(ALL_FILTERABLE_TYPES.filter((t) => !visibleTypes.has(t))));
  }, []);

  const handleFocusNode = useCallback((nodeUid: string) => {
    setFocusRequest((prev) => ({
      nodeUid,
      seq: (prev?.seq ?? 0) + 1,
    }));
  }, []);
  const personNodeId = ((data?.person?.user_id || data?.person?.orb_id) as string) || '';
  const handleChatClear = useCallback(() => {
    if (!personNodeId) return;
    handleFocusNode(personNodeId);
  }, [personNodeId, handleFocusNode]);

  const handleUndo = useCallback(async () => {
    try {
      await undo();
      await fetchOrb();
    } catch {
      addToast('Failed to undo', 'error');
    }
  }, [undo, fetchOrb, addToast]);

  const handleRedo = useCallback(async () => {
    try {
      await redo();
      await fetchOrb();
    } catch {
      addToast('Failed to redo', 'error');
    }
  }, [redo, fetchOrb, addToast]);

  const doImport = useCallback(async (file: File) => {
    setImporting(true);
    setImportStatus('Reading PDF');
    const pollId = setInterval(async () => {
      try {
        const { getCVProgress } = await import('../api/cv');
        const p = await getCVProgress();
        if (p.active && p.message) {
          setImportStatus(resolveImportStepLabel(p.step, p.detail, p.message));
        }
      } catch { /* ignore */ }
    }, 2000);

    try {
      const { importDocument } = await import('../api/cv');
      const result = await importDocument(file);
      clearInterval(pollId);
      if (result.nodes.length > 0) {
        setExtractedImport({
          nodes: result.nodes,
          relationships: result.relationships || [],
          cvOwnerName: result.cv_owner_name || null,
          unmatchedCount: result.unmatched?.length || 0,
          skippedCount: result.skipped_nodes?.length || 0,
          file,
          documentId: result.document_id || null,
        });
      } else {
        addToast('Error processing document. Please try again.', 'error');
      }
    } catch {
      clearInterval(pollId);
      addToast('Failed to import document', 'error');
    } finally {
      setImporting(false);
      setImportStatus('');
    }
  }, [addToast]);

  const handleImportFile = useCallback(async (file: File) => {
    try {
      const docs = await getDocuments();
      if (docs.length >= 3) {
        const oldest = docs[docs.length - 1];
        setImportOldestDoc({
          name: oldest.original_filename,
          date: new Date(oldest.uploaded_at).toLocaleDateString(),
        });
        setPendingImportFile(file);
        setShowImportLimitWarning(true);
        return;
      }
    } catch { /* proceed — server enforces cap too */ }

    await doImport(file);
  }, [doImport]);

  const handleImportInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImportFile(file);
    e.target.value = '';
  }, [handleImportFile]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black relative">
      {/* ── Deletion countdown banner ── */}
      {isPendingDeletion && (
        <div className="absolute top-0 left-0 right-0 z-40 bg-amber-600/90 text-white text-center py-1.5 px-4 text-xs font-medium">
          Your account is scheduled for deletion in{' '}
          <span className="font-bold">{user.deletion_days_remaining} day{user.deletion_days_remaining !== 1 ? 's' : ''}</span>.
          Go to Account Settings to recover it.
        </div>
      )}

      {/* ── Header ── */}
      <div className={`absolute left-0 right-0 z-30 px-3 sm:px-5 py-2 sm:py-3 ${isPendingDeletion ? 'top-8' : 'top-0'}`}>
        <div className="rounded-xl border border-white/10 bg-black/45 backdrop-blur-md shadow-lg shadow-black/30">
          <div className="flex items-center justify-between gap-2 px-2.5 sm:px-3 py-2 min-h-[44px]">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-purple-400" />
                </div>
                <span className="text-white font-bold text-sm tracking-tight hidden sm:inline">OpenOrbis</span>
              </div>
              <div className="hidden sm:block w-px h-5 bg-white/10" />
              <span data-tour="node-count" className="text-white text-xs hidden sm:inline">{data.nodes.length} nodes &middot; {data.links.length} edges</span>

              {!isPendingDeletion && (
                <div className="hidden sm:flex items-center gap-1.5 ml-2">
                  {/* Undo / Redo */}
                  <div data-tour="undo-redo" className="flex items-center">
                    <button
                      onClick={handleUndo}
                      disabled={undoStack.length === 0}
                      className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                        undoStack.length === 0
                          ? 'text-teal-500/20 cursor-default'
                          : 'text-teal-400 hover:text-teal-300 hover:bg-teal-500/10'
                      }`}
                      title="Undo"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                      </svg>
                    </button>
                    <button
                      onClick={handleRedo}
                      disabled={redoStack.length === 0}
                      className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                        redoStack.length === 0
                          ? 'text-sky-500/20 cursor-default'
                          : 'text-sky-400 hover:text-sky-300 hover:bg-sky-500/10'
                      }`}
                      title="Redo"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
                      </svg>
                    </button>
                  </div>
                  <div data-tour="node-types">
                    <NodeTypeFilter
                      hiddenTypes={hiddenNodeTypes}
                      onShowAll={handleShowAllNodeTypes}
                      onHideAll={handleHideAllNodeTypes}
                      onSetVisible={handleSetVisibleNodeTypes}
                    />
                  </div>
                  <KeywordFilterDropdown />
                  <button
                    data-tour="export"
                    onClick={() => window.open('/cv-export', '_blank')}
                    className="h-8 leading-none flex items-center gap-1.5 text-xs sm:text-sm font-medium py-1.5 px-2 sm:px-3 rounded-lg text-white/40 hover:text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer"
                  >
                    <IconDownload />
                    <span>Export</span>
                  </button>
                  <label
                    data-tour="import"
                    className={`h-8 leading-none flex items-center gap-1.5 text-xs sm:text-sm font-medium py-1.5 px-2 sm:px-3 rounded-lg transition-all ${
                      importing
                        ? 'text-purple-300 bg-purple-500/15 cursor-wait'
                      : 'text-white/40 hover:text-purple-300 hover:bg-purple-500/10 cursor-pointer'
                    }`}
                    title="Import a document (PDF, DOCX, TXT) to enrich your orbis"
                  >
                    {importing ? (
                      <div className="w-4 h-4 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    )}
                    <span>{importing ? 'Processing...' : 'Import new document'}</span>
                    {importing && importStatus && (
                      <span className="text-[10px] text-purple-200/80 whitespace-nowrap">{importStatus}</span>
                    )}
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                      disabled={importing}
                      onChange={handleImportInputChange}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="h-8 flex items-center gap-1">
              <ProcessingCounter />
              <div data-tour="notes">
                <HeaderBtn onClick={() => setShowDrafts(true)} variant="outline">
                  <IconNotes />
                  <span className="hidden sm:inline">Notes</span>
                  {draftNotes.length > 0 && (
                    <span className="bg-purple-500 text-white text-[10px] font-bold leading-none w-4 h-4 rounded-full flex items-center justify-center">
                      {draftNotes.length}
                    </span>
                  )}
                </HeaderBtn>
              </div>

              {!isPendingDeletion && (
                <div className="relative sm:hidden" ref={toolsMenuRef}>
                  <button
                    onClick={() => setShowToolsMenu((v) => !v)}
                    className="h-8 leading-none flex items-center gap-1 text-xs font-medium py-1.5 px-2 rounded-lg text-white/55 hover:text-white hover:bg-white/8 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    Tools
                  </button>

                  {showToolsMenu && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-neutral-950/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-3 space-y-2">
                      {/* Undo / Redo (mobile) */}
                      <div className="flex items-center gap-1 mb-2">
                        <button
                          onClick={handleUndo}
                          disabled={undoStack.length === 0}
                          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border transition-all ${
                            undoStack.length === 0
                              ? 'border-teal-500/10 text-teal-500/20 cursor-default'
                              : 'border-teal-500/30 text-teal-400 hover:text-teal-300 hover:bg-teal-500/10 cursor-pointer'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                          </svg>
                          Undo
                        </button>
                        <button
                          onClick={handleRedo}
                          disabled={redoStack.length === 0}
                          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border transition-all ${
                            redoStack.length === 0
                              ? 'border-sky-500/10 text-sky-500/20 cursor-default'
                              : 'border-sky-500/30 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 cursor-pointer'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
                          </svg>
                          Redo
                        </button>
                      </div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-semibold px-1">View & Data</p>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs text-white/65">Node types</span>
                        <NodeTypeFilter
                          hiddenTypes={hiddenNodeTypes}
                          onShowAll={handleShowAllNodeTypes}
                          onHideAll={handleHideAllNodeTypes}
                          onSetVisible={handleSetVisibleNodeTypes}
                        />
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs text-white/65">Keywords</span>
                        <KeywordFilterDropdown />
                      </div>
                      <button
                        onClick={() => window.open('/cv-export', '_blank')}
                        className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border border-white/10 text-white/70 hover:text-amber-300 hover:border-amber-400/30 hover:bg-amber-500/10 transition-all"
                      >
                        <IconDownload />
                        Export Orbis
                      </button>
                      <label
                        className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border transition-all ${
                          importing
                            ? 'border-purple-400/30 text-purple-300 bg-purple-500/15 cursor-wait'
                            : 'border-white/10 text-white/70 hover:text-purple-300 hover:border-purple-400/30 hover:bg-purple-500/10 cursor-pointer'
                        }`}
                      >
                        {importing ? (
                          <div className="w-3.5 h-3.5 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        )}
                        <span>{importing ? 'Processing...' : 'Import new document'}</span>
                        {importing && importStatus && (
                          <span className="text-[10px] text-purple-200/80 whitespace-nowrap">{importStatus}</span>
                        )}
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt"
                          className="hidden"
                          disabled={importing}
                          onChange={handleImportInputChange}
                        />
                      </label>
                      {/* Document history */}
                      {documents.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Documents ({documents.length}/3)</span>
                          {documents.map((doc) => (
                            <div
                              key={doc.document_id}
                              className="flex items-center gap-1.5 text-[11px] text-white/50 bg-white/[0.03] rounded-lg px-2 py-1.5"
                            >
                              <svg className="w-3 h-3 flex-shrink-0 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <div className="flex-1 min-w-0">
                                <div className="truncate">{doc.original_filename}</div>
                                <div className="text-white/25 text-[10px]">
                                  {new Date(doc.uploaded_at).toLocaleDateString()}
                                  {doc.entities_count != null && ` · ${doc.entities_count} nodes`}
                                  {doc.edges_count != null && ` · ${doc.edges_count} edges`}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" />
              <div data-tour="user-menu">
                <UserMenu orbId={data.person.orb_id as string} onOrbIdChanged={fetchOrb} label={(data.person.name as string) || user?.name || 'My Orbis'} onStartTour={startTour} />
              </div>
            </div>
          </div>

          {!isPendingDeletion && (
            <div className="flex flex-wrap items-center gap-1.5 px-2.5 sm:px-3 pb-2">
              {activeKeywords.length > 0 && (
                <span className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-amber-500/12 border border-amber-500/30 text-amber-200">
                  Filters: {activeKeywords.length}
                </span>
              )}
            </div>
          )}
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
      {dateBounds && !isPendingDeletion && (
        <DateRangeSlider
          minDate={dateBounds.min}
          maxDate={dateBounds.max}
          filteredCount={dateFilteredNodeIds.size}
          totalCount={data.nodes.length}
        />
      )}

      {/* ── 3D Graph ── */}
      <div data-tour="graph" className={isPendingDeletion ? 'opacity-60 grayscale pointer-events-none' : ''}>
        <OrbGraph3D
          data={data}
          onNodeClick={isPendingDeletion ? undefined : handleNodeClick}
          onBackgroundClick={isPendingDeletion ? undefined : () => {
            setHighlightedNodeIds(new Set());
          }}
          highlightedNodeIds={highlightedNodeIds}
          filteredNodeIds={filteredNodeIds}
          hiddenNodeTypes={hiddenNodeTypes}
          width={dimensions.width}
          height={dimensions.height}
          cameraDistance={cameraDistance}
          focusNodeId={focusRequest?.nodeUid || null}
          focusNodeToken={focusRequest?.seq ?? 0}
          onCameraDistanceChange={handleCameraDistanceChange}
        />
      </div>

      {/* NodeTypeFilter moved to header bar */}

      {/* ── Floating Input ── */}
      {!isPendingDeletion && <FloatingInput
        open={showInput}
        editNode={editNode}
        referenceNote={draftReferenceText}
        onSubmit={handleSubmit}
        onCancel={() => {
          setShowInput(false);
          setEditNode(null);
          setPendingSkillLinks([]);
          setPendingDraftNoteId(null);
          setPendingDraftRawText('');
          setDraftReferenceText(null);
        }}
        onDelete={async (uid) => {
          const nodeToDelete = data?.nodes.find(n => n.uid === uid);
          const nodeTypeKey = nodeToDelete?._labels?.[0] ? LABEL_TO_TYPE[nodeToDelete._labels[0]] || '' : '';
          const nodeProps: Record<string, unknown> = {};
          if (nodeToDelete) {
            for (const [k, v] of Object.entries(nodeToDelete)) {
              if (!['uid', '_labels', 'score', 'embedding'].includes(k)) nodeProps[k] = v;
            }
          }
          const nodeRelationships = data?.links
            .filter(l => l.type === 'USED_SKILL' && (l.source === uid || l.target === uid))
            .map(l => ({ source: l.source, target: l.target, type: l.type }));
          await deleteNode(uid, nodeTypeKey, nodeProps, nodeRelationships);
          setShowInput(false);
          setEditNode(null);
          setDraftReferenceText(null);
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
        onSaveDraft={pendingDraftNoteId ? handleSaveDraftEnhanced : undefined}
      />}

      {/* ── Chat Box ── */}
      {!isPendingDeletion && <ChatBox
        onHighlight={setHighlightedNodeIds}
        onFocusNode={handleFocusNode}
        onClearResults={handleChatClear}
        highlightedNodeIds={highlightedNodeIds}
        messages={chatMessages}
        onMessagesChange={setChatMessages}
        onAdd={() => { setEditNode(null); setDraftReferenceText(null); setShowInput(true); }}
        onShare={() => setShowShare(true)}
        highlightAdd={data.nodes.length === 0 && !showInput}
        onRecenter={() => handleFocusNode(personNodeId)}
      />}

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
        {showProfile && <ProfilePanel key="profile" person={data.person} onClose={() => setShowProfile(false)} onSaved={fetchOrb} />}
      </AnimatePresence>

      {/* ── Import review overlay ── */}
      {extractedImport && (
        <div className="fixed inset-0 z-50 bg-black overflow-y-auto">
          <ExtractedDataReview
            initialNodes={extractedImport.nodes}
            initialRelationships={extractedImport.relationships}
            cvOwnerName={extractedImport.cvOwnerName}
            unmatchedCount={extractedImport.unmatchedCount}
            skippedCount={extractedImport.skippedCount}
            truncated={false}
            onReset={() => setExtractedImport(null)}
            resetLabel="Cancel import"
            onConfirm={async (nodes, rels, name, documentId, originalFilename, fileSizeBytes, pageCount) => {
              await confirmImport(nodes, rels, name, documentId, originalFilename, fileSizeBytes, pageCount);
              fetchDocuments();
            }}
            documentId={extractedImport.documentId}
            originalFilename={extractedImport.file.name}
            fileSizeBytes={extractedImport.file.size}
            pageCount={null}
          />
        </div>
      )}

      {/* ── Import limit warning modal ── */}
      {showImportLimitWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="bg-neutral-950 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-white text-lg font-semibold mb-1">Document limit reached</h3>
                <p className="text-white/50 text-sm leading-relaxed">
                  You already have 3 documents stored. Importing this file will remove the oldest document
                  {importOldestDoc && (
                    <> (<span className="text-white font-medium">{importOldestDoc.name}</span>, uploaded {importOldestDoc.date})</>
                  )}.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => { setShowImportLimitWarning(false); setPendingImportFile(null); }}
                className="border border-white/10 text-white/60 hover:text-white hover:bg-white/5 font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowImportLimitWarning(false);
                  if (pendingImportFile) {
                    await doImport(pendingImportFile);
                    setPendingImportFile(null);
                  }
                }}
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors cursor-pointer"
              >
                Replace &amp; import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Guided Tour ── */}
      <GuidedTour run={tourRunning} onFinish={() => setTourRunning(false)} />
    </div>
  );
}
