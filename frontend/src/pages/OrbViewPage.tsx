import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrbStore } from '../stores/orbStore';
import { useAuthStore } from '../stores/authStore';
import { useFilterStore, computeFilteredNodeIds } from '../stores/filterStore';
import DateRangeSlider from '../components/graph/DateRangeSlider';
import { useDateFilterStore, computeDateFilteredNodeIds, getNodeDates } from '../stores/dateFilterStore';
import {
  createAccessGrant,
  createShareToken,
  enhanceNote,
  linkSkill,
  listAccessGrants,
  revokeAccessGrant,
} from '../api/orbs';
import type { AccessGrant, OrbVisibility } from '../api/orbs';
import { QRCodeCanvas } from 'qrcode.react';
import OrbGraph3D from '../components/graph/OrbGraph3D';
import NodeTypeFilter from '../components/graph/NodeTypeFilter';
import FloatingInput from '../components/editor/FloatingInput';
import ChatBox from '../components/chat/ChatBox';
import type { ChatMessage } from '../components/chat/ChatBox';
import DiscoverUsesModal from '../components/DiscoverUsesModal';
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

const SHARE_QR_SIZE = 160;

// ── Modals ──

function SharePanel({
  orbId,
  onClose,
  hiddenNodeTypes,
  visibility,
  onVisibilityChange,
}: {
  orbId: string;
  onClose: () => void;
  hiddenNodeTypes: Set<string>;
  visibility: OrbVisibility;
  onVisibilityChange: (v: OrbVisibility) => Promise<void>;
}) {
  const [shareTokenId, setShareTokenId] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantSearch, setGrantSearch] = useState('');
  const [grantEmail, setGrantEmail] = useState('');
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantSubmitting, setGrantSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const addToast = useToastStore((s) => s.addToast);
  const { activeKeywords } = useFilterStore();
  const hiddenTypesArray = useMemo(() => Array.from(hiddenNodeTypes), [hiddenNodeTypes]);
  const hasActiveFilters = activeKeywords.length > 0 || hiddenTypesArray.length > 0;
  const isPrivate = visibility === 'private';
  const isRestricted = visibility === 'restricted';
  const isPublic = visibility === 'public';
  const bareUrl = `${window.location.origin}/${orbId}`;
  const shareUrl = isRestricted
    ? bareUrl
    : (shareTokenId ? `${bareUrl}?token=${shareTokenId}` : '');
  const shareableUrl = isPrivate ? '' : shareUrl;
  const qrValue = shareableUrl || bareUrl;
  const canDownloadQr = !isPrivate && (isRestricted || Boolean(shareTokenId));
  const canCopyShareLink = !isPrivate && Boolean(shareableUrl);
  const mcpUri = `orb://${orbId}`;
  const shareSummary = hasActiveFilters && isPublic ? 'Filtered View' : 'Full Orbis';
  const filteredGrants = useMemo(() => {
    const query = grantSearch.trim().toLowerCase();
    if (!query) return grants;
    return grants.filter((g) => g.email.toLowerCase().includes(query));
  }, [grantSearch, grants]);

  // Generate a share token only in public mode
  useEffect(() => {
    let active = true;
    if (orbId && isPublic) {
      setShareTokenId(null);
      setGeneratingToken(true);
      createShareToken(activeKeywords, hiddenTypesArray)
        .then((token) => {
          if (!active) return;
          setShareTokenId(token.token_id);
        })
        .catch(() => {
          if (!active) return;
          setShareTokenId(null);
          addToast('Failed to generate share link', 'error');
        })
        .finally(() => {
          if (!active) return;
          setGeneratingToken(false);
        });
    } else {
      setShareTokenId(null);
      setGeneratingToken(false);
    }
    return () => {
      active = false;
    };
  }, [activeKeywords, addToast, hiddenTypesArray, orbId, isPublic]);

  // Load access grants when restricted mode is active
  useEffect(() => {
    let active = true;
    if (!isRestricted) {
      setGrants([]);
      setGrantSearch('');
      return;
    }
    setGrantsLoading(true);
    listAccessGrants()
      .then((res) => {
        if (!active) return;
        setGrants(res.grants);
      })
      .catch(() => {
        if (!active) return;
        setGrants([]);
      })
      .finally(() => {
        if (!active) return;
        setGrantsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isRestricted]);

  useEffect(() => {
    const panel = modalRef.current;
    if (!panel) return;
    const selector = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    const getFocusable = () => Array.from(panel.querySelectorAll<HTMLElement>(selector));
    const initial = getFocusable();
    initial[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (!activeEl || !panel.contains(activeEl)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && activeEl === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const copyText = useCallback(async (text: string, label: string) => {
    if (!navigator.clipboard?.writeText) {
      addToast('Clipboard is not available in this browser', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      addToast(`${label} copied`, 'success');
    } catch {
      addToast(`Failed to copy ${label.toLowerCase()}`, 'error');
    }
  }, [addToast]);

  const handleCopyShareLink = useCallback(() => {
    if (!canCopyShareLink || !shareableUrl) return;
    void copyText(shareableUrl, 'Share link');
  }, [canCopyShareLink, copyText, shareableUrl]);

  const handleCopyMcp = useCallback(() => {
    if (!isPublic) return;
    void copyText(mcpUri, 'MCP Orbis ID');
  }, [copyText, isPublic, mcpUri]);

  const handleDownloadQr = useCallback(() => {
    if (!canDownloadQr || !qrCanvasRef.current) return;
    try {
      const link = document.createElement('a');
      link.href = qrCanvasRef.current.toDataURL('image/png');
      link.download = `orbis-${orbId}-${isRestricted ? 'restricted' : 'public'}-qr.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addToast('QR code downloaded', 'success');
    } catch {
      addToast('Failed to download QR code', 'error');
    }
  }, [addToast, canDownloadQr, isRestricted, orbId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
      if (isTyping) return;
      const key = event.key.toLowerCase();
      const hasModifier = event.metaKey || event.ctrlKey;
      if (hasModifier && key === 'c' && canCopyShareLink) {
        event.preventDefault();
        handleCopyShareLink();
        return;
      }
      if (hasModifier && key === 'd' && canDownloadQr) {
        event.preventDefault();
        handleDownloadQr();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [canCopyShareLink, canDownloadQr, handleCopyShareLink, handleDownloadQr]);

  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = grantEmail.trim();
    if (!email) return;
    // Simple email shape check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setGrantError('Enter a valid email address');
      return;
    }
    setGrantSubmitting(true);
    setGrantError(null);
    try {
      const grant = await createAccessGrant(email);
      setGrants((prev) => [grant, ...prev]);
      setGrantEmail('');
      addToast(`Access granted to ${email}`, 'success');
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setGrantError(msg || 'Failed to grant access');
      addToast(msg || 'Failed to grant access', 'error');
    } finally {
      setGrantSubmitting(false);
    }
  };

  const handleRevokeGrant = async (grant: AccessGrant) => {
    const confirmed = window.confirm(`Revoke access for ${grant.email}?`);
    if (!confirmed) return;
    try {
      await revokeAccessGrant(grant.grant_id);
      setGrants((prev) => prev.filter((g) => g.grant_id !== grant.grant_id));
      addToast(`Access revoked for ${grant.email}`, 'info');
    } catch {
      setGrantError('Failed to revoke access');
      addToast('Failed to revoke access', 'error');
    }
  };

  const handleVisibilityClick = async (next: OrbVisibility) => {
    if (next === visibility || updatingVisibility) return;
    setUpdatingVisibility(true);
    try {
      await onVisibilityChange(next);
    } finally {
      setUpdatingVisibility(false);
    }
  };

  const visibilityOptions: {
    value: OrbVisibility;
    label: string;
    description: string;
  }[] = [
    { value: 'private', label: 'Private', description: 'Only you can view your orbis' },
    { value: 'public', label: 'Public', description: 'Anyone with the link can view' },
    { value: 'restricted', label: 'Restricted', description: 'Share via invite links' },
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
        role="dialog"
        aria-modal="true"
        aria-label="Share your orbis"
        ref={modalRef}
        className="relative bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-6 max-w-[95vw] sm:max-w-2xl w-full mx-2 sm:mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 h-9 w-9 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
          aria-label="Close share modal"
        >
          <svg className="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-white text-lg font-semibold mb-1">Share Your Orbis</h2>
        <p className="text-gray-400 text-sm mb-5">Choose visibility, then share with a direct link or QR code.</p>

        {/* Visibility selector */}
        <div className="mb-4">
          <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Visibility</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {visibilityOptions.map((opt) => {
              const selected = visibility === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleVisibilityClick(opt.value)}
                  disabled={updatingVisibility}
                  className={`text-left rounded-xl border px-3 py-3 transition-colors disabled:opacity-60 ${
                    selected
                      ? 'border-purple-500/70 bg-purple-500/15 text-white shadow-[0_0_0_1px_rgba(168,85,247,0.2)]'
                      : 'border-gray-700 bg-gray-800/40 text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{opt.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {isPrivate && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
              <p className="text-sm text-gray-200 font-medium mb-1">This orbis is currently private</p>
              <p className="text-xs text-gray-400">No link or QR is available until you switch to Public or Restricted.</p>
            </div>
            <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4">
              <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">MCP Orbis ID</label>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-2">MCP access is available only in Public mode.</p>
              <input readOnly value={mcpUri} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-400 text-sm font-mono" />
            </div>
          </div>
        )}

        {!isPrivate && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-700/80 bg-gradient-to-br from-gray-800/65 to-gray-900/70 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <label className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">Shared Content</label>
                  <p className="text-sm text-gray-200 mt-1">
                    {isPublic ? 'Public link preview' : 'Restricted link preview'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className={`text-[10px] px-2.5 py-1 rounded-full border ${hasActiveFilters && isPublic ? 'border-amber-500/40 text-amber-200 bg-amber-500/10' : 'border-emerald-500/40 text-emerald-200 bg-emerald-500/10'}`}>
                    {shareSummary}
                  </span>
                  {isRestricted && (
                    <span className="text-[10px] px-2.5 py-1 rounded-full border border-blue-500/40 text-blue-200 bg-blue-500/10">
                      Invite-Only
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-400 mt-2.5">
                {isPublic && generatingToken ? 'Generating secure link...' : 'Recipients will open exactly the view shown by your current sharing settings.'}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-gray-700/70 bg-gray-900/45 px-3 py-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Visibility</p>
                  <p className="text-xs text-gray-200 mt-1">{isRestricted ? 'Restricted' : 'Public'}</p>
                </div>
                <div className="rounded-lg border border-gray-700/70 bg-gray-900/45 px-3 py-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Active Filters</p>
                  <p className="text-xs text-gray-200 mt-1">
                    {hasActiveFilters && isPublic ? `${activeKeywords.length + hiddenTypesArray.length}` : '0'}
                  </p>
                </div>
              </div>

              {hasActiveFilters && isPublic && (
                <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 space-y-2">
                  {hiddenTypesArray.length > 0 && (
                    <div>
                      <p className="text-[10px] text-amber-200/80 uppercase tracking-wide mb-1">Hidden node types</p>
                      <div className="flex flex-wrap gap-1.5">
                        {hiddenTypesArray.map((type) => (
                          <span key={type} className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-200">{type}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeKeywords.length > 0 && (
                    <div>
                      <p className="text-[10px] text-amber-200/80 uppercase tracking-wide mb-1">Filtered keywords</p>
                      <div className="flex flex-wrap gap-1.5">
                        {activeKeywords.map((keyword) => (
                          <span key={keyword} className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-200">"{keyword}"</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4">
              <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">QR Code</label>
              <p className="text-[11px] text-gray-500 mb-3">Use this code on printed material for instant access.</p>
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-xl">
                  <QRCodeCanvas ref={qrCanvasRef} value={qrValue} size={SHARE_QR_SIZE} level="M" marginSize={2} />
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-3">Scans to your current share link.</p>
            </div>

            {isPublic && (
              <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4">
                <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">MCP Orbis ID</label>
                <p className="text-[11px] text-gray-500 mt-0.5 mb-2">Use this with the OpenOrbis MCP server for AI agent access.</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={mcpUri} className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono" />
                  <button
                    type="button"
                    onClick={handleCopyMcp}
                    className="h-10 px-4 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white text-sm font-medium transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            {isRestricted && (
              <>
                <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4">
                  <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Invite By Email</label>
                  <p className="text-[11px] text-gray-500 mt-0.5 mb-2">Invite people who can view this orbis after signing in.</p>
                  <form onSubmit={handleGrantSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="email"
                      value={grantEmail}
                      onChange={(e) => { setGrantEmail(e.target.value); setGrantError(null); }}
                      placeholder="name@example.com"
                      disabled={grantSubmitting}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500"
                    />
                    <button
                      type="submit"
                      disabled={grantSubmitting || !grantEmail.trim()}
                      className="h-11 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                    >
                      {grantSubmitting ? 'Granting...' : 'Grant Access'}
                    </button>
                  </form>
                  {grantError && <p className="text-[11px] text-red-400 mt-2">{grantError}</p>}
                </div>

                <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">People With Access</label>
                    <span className="text-[11px] text-gray-500">{filteredGrants.length}/{grants.length}</span>
                  </div>
                  <input
                    type="search"
                    value={grantSearch}
                    onChange={(e) => setGrantSearch(e.target.value)}
                    placeholder="Search by email"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 mb-3"
                  />
                  <div className="max-h-48 overflow-y-auto">
                    {grantsLoading && <p className="text-[11px] text-gray-500">Loading access list...</p>}
                    {!grantsLoading && grants.length === 0 && <p className="text-[11px] text-gray-500">No invited users yet.</p>}
                    {!grantsLoading && grants.length > 0 && filteredGrants.length === 0 && <p className="text-[11px] text-gray-500">No results for this search.</p>}
                    {!grantsLoading && filteredGrants.length > 0 && (
                      <ul className="space-y-2">
                        {filteredGrants.map((grant) => (
                          <li key={grant.grant_id} className="flex items-center justify-between gap-3 border border-gray-700 rounded-lg px-3 py-2.5 bg-gray-900/60">
                            <span className="text-sm text-white truncate">{grant.email}</span>
                            <button
                              type="button"
                              onClick={() => handleRevokeGrant(grant)}
                              className="h-9 px-3 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-xs font-medium transition-colors whitespace-nowrap"
                            >
                              Revoke Access
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {!isPrivate && (
          <div className="sticky bottom-0 -mx-4 sm:-mx-6 mt-6 px-4 sm:px-6 py-3 border-t border-gray-800 bg-gray-900/95 backdrop-blur">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyShareLink}
                disabled={!canCopyShareLink || generatingToken}
                className="h-11 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
              >
                {generatingToken ? 'Generating Link...' : 'Copy Share Link'}
              </button>
              <button
                type="button"
                onClick={handleDownloadQr}
                disabled={!canDownloadQr || generatingToken}
                className="h-11 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
              >
                Download QR (.png)
              </button>
            </div>
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
  const { data, loading, fetchOrb, addNode, updateNode, deleteNode, updateVisibility } = useOrbStore();
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const undoStack = useUndoStore((s) => s.undoStack);
  const redoStack = useUndoStore((s) => s.redoStack);
  const undo = useUndoStore((s) => s.undo);
  const redo = useUndoStore((s) => s.redo);
  const isPendingDeletion = user?.deletion_days_remaining != null;
  const [showInput, setShowInput] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showDiscoverUses, setShowDiscoverUses] = useState(false);
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
      if (showShare) { setShowShare(false); return; }
      if (showDiscoverUses) { setShowDiscoverUses(false); return; }
      if (showDrafts) { setShowDrafts(false); return; }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showInput, showShare, showDiscoverUses, showDrafts, showToolsMenu]);

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
      // Profile editing now lives in the top-right user menu.
      return;
    }
    const typeMap: Record<string, string> = {
      Education: 'education', WorkExperience: 'work_experience', Certification: 'certification',
      Language: 'language', Publication: 'publication', Project: 'project',
      Skill: 'skill', Patent: 'patent', Award: 'award', Outreach: 'outreach',
    };
    const nodeType = typeMap[labels[0]];
    if (!nodeType) return;
    setEditNode({ type: nodeType, values: node });
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
                <UserMenu
                  orbId={data.person.orb_id as string}
                  person={data.person}
                  onOrbIdChanged={fetchOrb}
                  onProfileSaved={fetchOrb}
                  label={(data.person.name as string) || user?.name || 'My Orbis'}
                  onStartTour={startTour}
                />
              </div>
            </div>
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
        onDiscover={() => setShowDiscoverUses(true)}
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
      <DiscoverUsesModal open={showDiscoverUses} onClose={() => setShowDiscoverUses(false)} orbId={orbId} />
      <AnimatePresence>
        {showShare && (
          <SharePanel
            key="share"
            orbId={orbId}
            hiddenNodeTypes={hiddenNodeTypes}
            visibility={((data?.person?.visibility as OrbVisibility) || 'private')}
            onVisibilityChange={updateVisibility}
            onClose={() => setShowShare(false)}
          />
        )}
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
