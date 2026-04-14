import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFilterStore } from '../../stores/filterStore';
import { useToastStore } from '../../stores/toastStore';
import {
  createAccessGrant,
  createShareToken,
  getPublicFilters,
  listAccessGrants,
  listConnectionRequests,
  listShareTokens,
  acceptConnectionRequest,
  rejectConnectionRequest,
  revokeAccessGrant,
  revokeShareToken,
  updateAccessGrantFilters,
  updatePublicFilters,
} from '../../api/orbs';
import type { AccessGrant, ConnectionRequest, OrbVisibility, ShareToken } from '../../api/orbs';

const ALL_FILTERABLE_TYPES = ['Education', 'WorkExperience', 'Certification', 'Language', 'Publication', 'Project', 'Skill', 'Patent', 'Award', 'Outreach', 'Training'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function SharePanel({
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
  const [shareTokens, setShareTokens] = useState<ShareToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [creatingToken, setCreatingToken] = useState(false);
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [expandedTokenId, setExpandedTokenId] = useState<string | null>(null);
  const [revokeTokenTarget, setRevokeTokenTarget] = useState<ShareToken | null>(null);
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantSearch, setGrantSearch] = useState('');
  const [grantEmail, setGrantEmail] = useState('');
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantSubmitting, setGrantSubmitting] = useState(false);
  const [applyFiltersOnInvite, setApplyFiltersOnInvite] = useState(true);
  const [editingGrantId, setEditingGrantId] = useState<string | null>(null);
  const [editingGrantKeywords, setEditingGrantKeywords] = useState('');
  const [editingGrantHiddenTypes, setEditingGrantHiddenTypes] = useState('');
  const [updatingGrantFiltersId, setUpdatingGrantFiltersId] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<ConnectionRequest[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [acceptingRequestId, setAcceptingRequestId] = useState<string | null>(null);
  const [acceptKeywords, setAcceptKeywords] = useState('');
  const [acceptHiddenTypes, setAcceptHiddenTypes] = useState('');
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const addToast = useToastStore((s) => s.addToast);
  const { keywords, activeKeywords, addKeyword, removeKeyword, toggleKeyword, deactivateAll } = useFilterStore();
  const [inlineFilterKeyword, setInlineFilterKeyword] = useState('');
  const [privacyHiddenTypes, setPrivacyHiddenTypes] = useState<Set<string>>(new Set());
  const privacyHiddenTypesArray = useMemo(() => Array.from(privacyHiddenTypes), [privacyHiddenTypes]);
  const hiddenTypesArray = useMemo(() => Array.from(hiddenNodeTypes), [hiddenNodeTypes]);
  const hasActiveFilters = activeKeywords.length > 0 || privacyHiddenTypesArray.length > 0;
  const [savingPublicFilters, setSavingPublicFilters] = useState(false);
  const isRestricted = visibility === 'restricted';
  const isPublic = visibility === 'public';
  const bareUrl = `${window.location.origin}/${orbId}`;
  const filteredGrants = useMemo(() => {
    const query = grantSearch.trim().toLowerCase();
    if (!query) return grants;
    return grants.filter((g) => g.email.toLowerCase().includes(query));
  }, [grantSearch, grants]);

  useEffect(() => {
    if (!hasActiveFilters) setApplyFiltersOnInvite(false);
  }, [hasActiveFilters]);

  const handleSavePublicFilters = async () => {
    setSavingPublicFilters(true);
    try {
      await updatePublicFilters(activeKeywords, privacyHiddenTypesArray);
      addToast('Public filters saved', 'success');
    } catch {
      addToast('Failed to save filters', 'error');
    } finally {
      setSavingPublicFilters(false);
    }
  };

  // Load saved public filters when the modal opens in public mode
  useEffect(() => {
    if (!isPublic) return;
    getPublicFilters().then((f) => {
      f.keywords.forEach((kw) => { if (!keywords.includes(kw)) addKeyword(kw); });
      setPrivacyHiddenTypes(new Set(f.hidden_node_types));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublic]);

  // Fetch existing share tokens when share panel is open in restricted mode
  useEffect(() => {
    if (!isRestricted) return;
    setTokensLoading(true);
    listShareTokens()
      .then((data) => setShareTokens(data.tokens.filter(t => !t.revoked)))
      .catch(() => {})
      .finally(() => setTokensLoading(false));
  }, [isRestricted]);

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
    if (!isRestricted) return;
    setPendingLoading(true);
    listConnectionRequests()
      .then(setPendingRequests)
      .catch(() => {})
      .finally(() => setPendingLoading(false));
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

  const handleCreateToken = useCallback(async () => {
    if (creatingToken) return;
    setCreatingToken(true);
    try {
      const token = await createShareToken(activeKeywords, privacyHiddenTypesArray, newTokenLabel || undefined);
      setShareTokens(prev => [token, ...prev]);
      setNewTokenLabel('');
      addToast('Token created', 'success');
    } catch {
      addToast('Failed to create token', 'error');
    } finally {
      setCreatingToken(false);
    }
  }, [creatingToken, activeKeywords, privacyHiddenTypesArray, newTokenLabel, addToast]);

  const confirmRevokeToken = useCallback(async () => {
    if (!revokeTokenTarget) return;
    setRevokingTokenId(revokeTokenTarget.token_id);
    try {
      await revokeShareToken(revokeTokenTarget.token_id);
      setShareTokens(prev => prev.filter(t => t.token_id !== revokeTokenTarget.token_id));
      addToast('Token revoked', 'success');
    } catch {
      addToast('Failed to revoke token', 'error');
    } finally {
      setRevokingTokenId(null);
      setRevokeTokenTarget(null);
    }
  }, [revokeTokenTarget, addToast]);

  const parseCommaSeparated = useCallback((value: string, lowerCase = false): string[] => {
    const items = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const normalized = lowerCase ? items.map((item) => item.toLowerCase()) : items;
    return Array.from(new Set(normalized));
  }, []);

  const openGrantEditor = useCallback((grant: AccessGrant) => {
    setEditingGrantId(grant.grant_id);
    setEditingGrantKeywords((grant.keywords || []).join(', '));
    setEditingGrantHiddenTypes((grant.hidden_node_types || []).join(', '));
    setGrantError(null);
  }, []);

  const closeGrantEditor = useCallback(() => {
    setEditingGrantId(null);
    setEditingGrantKeywords('');
    setEditingGrantHiddenTypes('');
  }, []);

  const saveGrantFilters = useCallback(async (
    grantId: string,
    keywordsRaw: string,
    hiddenTypesRaw: string,
  ) => {
    const keywords = parseCommaSeparated(keywordsRaw, true);
    const hiddenNodeTypes = parseCommaSeparated(hiddenTypesRaw, false);
    setUpdatingGrantFiltersId(grantId);
    setGrantError(null);
    try {
      const updated = await updateAccessGrantFilters(grantId, {
        keywords,
        hidden_node_types: hiddenNodeTypes,
      });
      setGrants((prev) => prev.map((g) => (g.grant_id === grantId ? updated : g)));
      addToast('Filters updated for invited user', 'success');
      closeGrantEditor();
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setGrantError(msg || 'Failed to update filters');
      addToast(msg || 'Failed to update filters', 'error');
    } finally {
      setUpdatingGrantFiltersId(null);
    }
  }, [addToast, closeGrantEditor, parseCommaSeparated]);

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
      const grant = await createAccessGrant({
        email,
        keywords: applyFiltersOnInvite ? activeKeywords : [],
        hidden_node_types: applyFiltersOnInvite ? hiddenTypesArray : [],
      });
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

  const [revokeTarget, setRevokeTarget] = useState<AccessGrant | null>(null);
  const [revoking, setRevoking] = useState(false);

  const handleRevokeGrant = (grant: AccessGrant) => {
    setRevokeTarget(grant);
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeAccessGrant(revokeTarget.grant_id);
      setGrants((prev) => prev.filter((g) => g.grant_id !== revokeTarget.grant_id));
      addToast(`Access revoked for ${revokeTarget.email}`, 'info');
    } catch {
      setGrantError('Failed to revoke access');
      addToast('Failed to revoke access', 'error');
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  };

  const handleApplyCurrentFiltersToGrant = async (grant: AccessGrant) => {
    await saveGrantFilters(
      grant.grant_id,
      activeKeywords.join(', '),
      hiddenTypesArray.join(', '),
    );
  };

  const handleClearGrantFilters = async (grant: AccessGrant) => {
    await saveGrantFilters(grant.grant_id, '', '');
  };

  const handleAcceptRequest = async (requestId: string) => {
    const keywords = acceptKeywords.split(',').map(k => k.trim()).filter(Boolean);
    const hiddenTypes = acceptHiddenTypes.split(',').map(t => t.trim()).filter(Boolean);
    try {
      await acceptConnectionRequest(requestId, { keywords, hidden_node_types: hiddenTypes });
      setPendingRequests(prev => prev.filter(r => r.request_id !== requestId));
      setAcceptingRequestId(null);
      setAcceptKeywords('');
      setAcceptHiddenTypes('');
      // Refresh grants list
      listAccessGrants().then(g => setGrants(g.grants));
      addToast('Access granted', 'success');
    } catch {
      addToast('Failed to accept request', 'error');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    setRejectingRequestId(requestId);
    try {
      await rejectConnectionRequest(requestId);
      setPendingRequests(prev => prev.filter(r => r.request_id !== requestId));
      addToast('Request rejected', 'success');
    } catch {
      addToast('Failed to reject request', 'error');
    } finally {
      setRejectingRequestId(null);
    }
  };

  const [pendingVisibility, setPendingVisibility] = useState<OrbVisibility | null>(null);

  const handleVisibilityClick = (next: OrbVisibility) => {
    if (next === visibility || updatingVisibility) return;
    setPendingVisibility(next);
  };

  const confirmVisibilityChange = async () => {
    if (!pendingVisibility) return;
    setUpdatingVisibility(true);
    try {
      await onVisibilityChange(pendingVisibility);
    } finally {
      setUpdatingVisibility(false);
      setPendingVisibility(null);
    }
  };

  const visibilityOptions: {
    value: OrbVisibility;
    label: string;
    description: string;
  }[] = [
    { value: 'restricted', label: 'Restricted', description: 'Share via invite links' },
    { value: 'public', label: 'Public', description: 'Anyone with the link can view' },
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
        <p className="text-gray-400 text-sm mb-5">Choose visibility, then share with a direct link.</p>

        {/* Visibility selector */}
        <div className="mb-4">
          <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Visibility</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {visibilityOptions.map((opt) => {
              const selected = visibility === opt.value;
              const selectedClass = opt.value === 'private'
                ? 'border-red-500/70 bg-red-500/15 text-red-100 shadow-[0_0_0_1px_rgba(239,68,68,0.2)]'
                : opt.value === 'public'
                  ? 'border-orange-500/70 bg-orange-500/15 text-orange-100 shadow-[0_0_0_1px_rgba(249,115,22,0.2)]'
                  : 'border-emerald-500/70 bg-emerald-500/15 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]';
              const descriptionClass = selected && opt.value === 'private'
                ? 'text-red-200/80'
                : selected && opt.value === 'public'
                  ? 'text-orange-200/80'
                  : selected && opt.value === 'restricted'
                    ? 'text-emerald-200/80'
                  : 'text-gray-400';
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleVisibilityClick(opt.value)}
                  disabled={updatingVisibility}
                  className={`text-left rounded-xl border px-3 py-3 transition-colors disabled:opacity-60 ${
                    selected
                      ? selectedClass
                      : 'border-gray-700 bg-gray-800/40 text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div className={`text-[10px] mt-0.5 leading-tight ${descriptionClass}`}>{opt.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Orbis Link</label>
            <p className="text-[11px] text-gray-500 mt-0.5 mb-2">Link to your orbis.</p>
            <div className="flex items-center gap-2">
              <input readOnly value={bareUrl} className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono" />
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(bareUrl); addToast('Orbis link copied', 'success'); }}
                className="h-10 px-4 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white text-sm font-medium transition-colors shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
          {isPublic && (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">MCP URI</label>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-2">Use this URI to connect AI agents to your orbis.</p>
              <div className="flex items-center gap-2">
                <input readOnly value={`orb://${orbId}`} className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono" />
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(`orb://${orbId}`); addToast('MCP URI copied', 'success'); }}
                  className="h-10 px-4 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white text-sm font-medium transition-colors shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>

          <div className="space-y-4 mt-4">

              <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 space-y-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Privacy Filters</label>
                  <p className="text-[11px] text-gray-500 mt-0.5 mb-3">Active filters are applied to share tokens and excluded from exports.</p>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={inlineFilterKeyword}
                      onChange={(e) => setInlineFilterKeyword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = inlineFilterKeyword.trim(); if (t) { addKeyword(t); setInlineFilterKeyword(''); } } }}
                      placeholder="e.g. confidential, private..."
                      className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs placeholder-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => { const t = inlineFilterKeyword.trim(); if (t) { addKeyword(t); setInlineFilterKeyword(''); } }}
                      className="h-9 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors shrink-0"
                    >
                      Add
                    </button>
                    <button type="button" onClick={deactivateAll} disabled={activeKeywords.length === 0} className="h-9 px-3 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white/70 text-xs font-medium transition-colors shrink-0 whitespace-nowrap">
                      Deactivate All
                    </button>
                  </div>
                  {keywords.length === 0 ? (
                    <p className="text-white/20 text-xs italic">No filter keywords configured.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {keywords.map((kw) => {
                        const isActive = activeKeywords.includes(kw);
                        return (
                          <div
                            key={kw}
                            className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                              isActive
                                ? 'bg-amber-600/15 border-amber-500/40'
                                : 'bg-white/5 border-white/5 hover:border-white/10'
                            }`}
                          >
                            <span className="text-white text-xs font-mono truncate">{kw}</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => toggleKeyword(kw)}
                                className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors cursor-pointer ${
                                  isActive
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-white/10 text-white/40 hover:text-white hover:bg-white/20'
                                }`}
                              >
                                {isActive ? 'Active' : 'Activate'}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeKeyword(kw)}
                                className="text-white/20 hover:text-red-400 transition-colors cursor-pointer"
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
                  {activeKeywords.length > 0 && (
                    <p className="text-amber-400/70 text-[11px] mt-2">
                      {activeKeywords.length} keyword filter{activeKeywords.length !== 1 ? 's' : ''} active.
                    </p>
                  )}

                  <div className="mt-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Hidden Node Types</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_FILTERABLE_TYPES.map((type) => {
                        const hidden = privacyHiddenTypes.has(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setPrivacyHiddenTypes((prev) => {
                              const next = new Set(prev);
                              if (hidden) next.delete(type);
                              else next.add(type);
                              return next;
                            })}
                            className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                              hidden
                                ? 'bg-red-500/15 border-red-500/40 text-red-300'
                                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            }`}
                          >
                            {hidden ? '✕ ' : '✓ '}{type}
                          </button>
                        );
                      })}
                    </div>
                    {privacyHiddenTypesArray.length > 0 && (
                      <p className="text-red-400/70 text-[11px] mt-2">
                        {privacyHiddenTypesArray.length} type{privacyHiddenTypesArray.length !== 1 ? 's' : ''} hidden from shares.
                      </p>
                    )}
                  </div>
                </div>

                {isPublic && (
                  <div className="border-t border-gray-700/50 pt-3">
                    <button
                      type="button"
                      onClick={handleSavePublicFilters}
                      disabled={savingPublicFilters}
                      className="w-full h-10 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                    >
                      {savingPublicFilters ? 'Saving...' : 'Save Public Filters'}
                    </button>
                    <p className="text-[11px] text-gray-500 mt-2 text-center">
                      These filters are automatically applied to anyone viewing your public orbis.
                    </p>
                  </div>
                )}

                {isRestricted && (
                  <div className="border-t border-gray-700/50 pt-3">
                    <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Share Tokens</label>
                    <p className="text-[11px] text-gray-500 mt-0.5 mb-3">Create named tokens with your current filters. Each token has its own MCP URI.</p>

                    {/* Create new token */}
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        value={newTokenLabel}
                        onChange={(e) => setNewTokenLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateToken(); } }}
                        placeholder="Token label (e.g. Recruiter view)"
                        className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs placeholder-gray-500"
                      />
                      <button
                        type="button"
                        onClick={handleCreateToken}
                        disabled={creatingToken}
                        className="h-9 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shrink-0"
                      >
                        {creatingToken ? 'Creating...' : 'Create Token'}
                      </button>
                    </div>

                    {/* Token list */}
                    {tokensLoading && <p className="text-[11px] text-gray-500">Loading tokens...</p>}
                    {!tokensLoading && shareTokens.length === 0 && (
                      <p className="text-white/20 text-xs italic">No tokens created yet. Create one to get an MCP URI.</p>
                    )}
                    {shareTokens.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {shareTokens.map((token) => (
                          <div key={token.token_id} className="border border-gray-700 rounded-lg px-3 py-2.5 bg-gray-900/60 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm text-white font-medium truncate">{token.label || 'Unnamed token'}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                  {token.keywords.length} keyword{token.keywords.length !== 1 ? 's' : ''} · {(token.hidden_node_types || []).length} hidden type{(token.hidden_node_types || []).length !== 1 ? 's' : ''}
                                  {' · '}{formatDate(token.created_at)}
                                </p>
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setExpandedTokenId(expandedTokenId === token.token_id ? null : token.token_id)}
                                  className={`h-7 px-2 rounded-lg border text-[10px] font-medium transition-colors ${
                                    expandedTokenId === token.token_id
                                      ? 'border-purple-500/40 text-purple-300 bg-purple-500/10'
                                      : 'border-gray-600 text-gray-400 hover:text-white hover:bg-gray-700'
                                  }`}
                                >
                                  Filters
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRevokeTokenTarget(token)}
                                  className="h-7 px-2 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-[10px] font-medium transition-colors"
                                >
                                  Revoke
                                </button>
                              </div>
                            </div>
                            {expandedTokenId === token.token_id && (
                              <div className="rounded-lg border border-gray-700/70 bg-gray-900/60 px-3 py-2 space-y-1.5">
                                <div>
                                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Keywords</p>
                                  {token.keywords.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {token.keywords.map((kw) => (
                                        <span key={kw} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-200">{kw}</span>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[10px] text-gray-600 italic mt-0.5">None</p>
                                  )}
                                </div>
                                <div>
                                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Hidden Node Types</p>
                                  {(token.hidden_node_types || []).length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {(token.hidden_node_types || []).map((t) => (
                                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-300">{t}</span>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[10px] text-gray-600 italic mt-0.5">None</p>
                                  )}
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <input
                                readOnly
                                value={token.token_id}
                                className="flex-1 min-w-0 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-white text-[10px] font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => { navigator.clipboard.writeText(`${bareUrl}?token=${token.token_id}`); addToast('URL copied', 'success'); }}
                                className="h-7 px-2 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-white text-[10px] font-medium transition-colors shrink-0"
                              >
                                Copy URL
                              </button>
                              <button
                                type="button"
                                onClick={() => { navigator.clipboard.writeText(`orb://${orbId}+${token.token_id}`); addToast('MCP URI copied', 'success'); }}
                                className="h-7 px-2 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-white text-[10px] font-medium transition-colors shrink-0"
                              >
                                Copy MCP
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

            {isRestricted && (
              <>
                {(pendingLoading || pendingRequests.length > 0) && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <label className="text-xs text-amber-200/80 uppercase tracking-wide font-medium">Pending Requests</label>
                      <span className="text-[11px] text-amber-200/60">{pendingRequests.length}</span>
                    </div>
                    {pendingLoading && <p className="text-[11px] text-gray-500">Loading requests...</p>}
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {pendingRequests.map((req) => (
                        <div key={req.request_id} className="border border-gray-700 rounded-lg px-3 py-2.5 bg-gray-900/60 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-white truncate">{req.requester_name || req.requester_email}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">{req.requester_email}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">{formatDate(req.created_at)}</p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setAcceptingRequestId(acceptingRequestId === req.request_id ? null : req.request_id);
                                  setAcceptKeywords('');
                                  setAcceptHiddenTypes('');
                                }}
                                className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectRequest(req.request_id)}
                                disabled={rejectingRequestId === req.request_id}
                                className="h-8 px-3 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50 text-xs font-medium transition-colors"
                              >
                                {rejectingRequestId === req.request_id ? 'Rejecting...' : 'Reject'}
                              </button>
                            </div>
                          </div>

                          {acceptingRequestId === req.request_id && (
                            <div className="rounded-lg border border-gray-700/70 bg-gray-900/60 p-2.5 space-y-2">
                              <div>
                                <label className="text-[10px] text-gray-500 uppercase tracking-wide">Filtered Keywords (comma separated)</label>
                                <input
                                  type="text"
                                  value={acceptKeywords}
                                  onChange={(e) => setAcceptKeywords(e.target.value)}
                                  placeholder="python, machine learning"
                                  className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-white text-xs placeholder-gray-500"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500 uppercase tracking-wide">Hidden Node Types (comma separated)</label>
                                <input
                                  type="text"
                                  value={acceptHiddenTypes}
                                  onChange={(e) => setAcceptHiddenTypes(e.target.value)}
                                  placeholder="Skill, Project"
                                  className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-white text-xs placeholder-gray-500"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleAcceptRequest(req.request_id)}
                                  className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                                >
                                  Confirm &amp; Grant Access
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAcceptingRequestId(null)}
                                  className="h-8 px-3 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4">
                  <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Invite By Email</label>
                  <p className="text-[11px] text-gray-500 mt-0.5 mb-2">Invite people who can view this orbis after signing in according to the filters selected.</p>
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
                          <li key={grant.grant_id} className="border border-gray-700 rounded-lg px-3 py-2.5 bg-gray-900/60 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm text-white truncate">{grant.email}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  {(grant.keywords || []).length} keyword filter(s) • {(grant.hidden_node_types || []).length} hidden type filter(s)
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRevokeGrant(grant)}
                                className="h-9 px-3 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-xs font-medium transition-colors whitespace-nowrap"
                              >
                                Revoke Access
                              </button>
                            </div>

                            {editingGrantId === grant.grant_id ? (
                              <div className="rounded-lg border border-gray-700/70 bg-gray-900/60 p-2.5 space-y-2">
                                <div>
                                  <label className="text-[10px] text-gray-500 uppercase tracking-wide">Filtered Keywords (comma separated)</label>
                                  <input
                                    type="text"
                                    value={editingGrantKeywords}
                                    onChange={(e) => setEditingGrantKeywords(e.target.value)}
                                    placeholder="python, machine learning"
                                    className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-white text-xs placeholder-gray-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 uppercase tracking-wide">Hidden Node Types (comma separated)</label>
                                  <input
                                    type="text"
                                    value={editingGrantHiddenTypes}
                                    onChange={(e) => setEditingGrantHiddenTypes(e.target.value)}
                                    placeholder="Skill, Project"
                                    className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-white text-xs placeholder-gray-500"
                                  />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void saveGrantFilters(grant.grant_id, editingGrantKeywords, editingGrantHiddenTypes)}
                                    disabled={updatingGrantFiltersId === grant.grant_id}
                                    className="h-8 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                                  >
                                    {updatingGrantFiltersId === grant.grant_id ? 'Saving...' : 'Save Filters'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={closeGrantEditor}
                                    disabled={updatingGrantFiltersId === grant.grant_id}
                                    className="h-8 px-3 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleApplyCurrentFiltersToGrant(grant)}
                                  disabled={updatingGrantFiltersId === grant.grant_id}
                                  className="h-8 px-3 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50 text-xs font-medium transition-colors"
                                >
                                  Apply Current Filters
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleClearGrantFilters(grant)}
                                  disabled={updatingGrantFiltersId === grant.grant_id}
                                  className="h-8 px-3 rounded-lg border border-orange-500/40 text-orange-300 hover:bg-orange-500/10 disabled:opacity-50 text-xs font-medium transition-colors"
                                >
                                  Clear Filters
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openGrantEditor(grant)}
                                  className="h-8 px-3 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
                                >
                                  Manage Filters
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

      </motion.div>

      {/* Visibility change confirmation modal */}
      <AnimatePresence>
        {pendingVisibility && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 z-[60] rounded-2xl"
              onClick={() => setPendingVisibility(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="absolute inset-0 z-[61] flex items-center justify-center p-6"
            >
              <div className={`bg-gray-900 border rounded-xl p-5 max-w-sm w-full shadow-2xl ${
                pendingVisibility === 'restricted'
                  ? 'border-emerald-500/30'
                  : 'border-orange-500/30'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    pendingVisibility === 'restricted'
                      ? 'bg-emerald-500/15 border border-emerald-500/30'
                      : 'bg-orange-500/15 border border-orange-500/30'
                  }`}>
                    {pendingVisibility === 'restricted' ? (
                      <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h3 className="text-white text-sm font-semibold">Switch to {pendingVisibility === 'restricted' ? 'Restricted' : 'Public'}</h3>
                    <p className={`text-[11px] mt-0.5 ${
                      pendingVisibility === 'restricted' ? 'text-emerald-400/70' : 'text-orange-400/70'
                    }`}>
                      {visibility === 'public' ? 'Public' : 'Restricted'} → {pendingVisibility === 'restricted' ? 'Restricted' : 'Public'}
                    </p>
                  </div>
                </div>

                <div className={`rounded-lg px-3 py-2.5 mb-4 text-xs leading-relaxed ${
                  pendingVisibility === 'restricted'
                    ? 'bg-emerald-500/8 border border-emerald-500/15 text-emerald-100/80'
                    : 'bg-orange-500/8 border border-orange-500/15 text-orange-100/80'
                }`}>
                  {pendingVisibility === 'restricted' ? (
                    <>Only people you explicitly invite will be able to view your orbis. Public access will be disabled.</>
                  ) : (
                    <>Anyone visiting your orbis link will be able to view it. You can still control what they see using privacy filters.</>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingVisibility(null)}
                    className="h-9 px-4 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmVisibilityChange}
                    disabled={updatingVisibility}
                    className={`h-9 px-4 rounded-lg text-white text-xs font-medium transition-colors disabled:opacity-50 ${
                      pendingVisibility === 'restricted'
                        ? 'bg-emerald-600 hover:bg-emerald-500'
                        : 'bg-orange-600 hover:bg-orange-500'
                    }`}
                  >
                    {updatingVisibility ? 'Switching...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Revoke access confirmation modal */}
      <AnimatePresence>
        {revokeTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 z-[60] rounded-2xl"
              onClick={() => setRevokeTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="absolute inset-0 z-[61] flex items-center justify-center p-6"
            >
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 max-w-sm w-full shadow-2xl">
                <h3 className="text-white text-sm font-semibold mb-2">Revoke Access</h3>
                <p className="text-gray-400 text-xs mb-1">
                  Remove access for <span className="font-semibold text-white">{revokeTarget.email}</span>?
                </p>
                <p className="text-gray-500 text-[11px] mb-4">They will no longer be able to view your orbis.</p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRevokeTarget(null)}
                    className="h-9 px-4 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmRevoke}
                    disabled={revoking}
                    className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                  >
                    {revoking ? 'Revoking...' : 'Revoke'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Revoke token confirmation modal */}
      <AnimatePresence>
        {revokeTokenTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 z-[60] rounded-2xl"
              onClick={() => setRevokeTokenTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="absolute inset-0 z-[61] flex items-center justify-center p-6"
            >
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 max-w-sm w-full shadow-2xl">
                <h3 className="text-white text-sm font-semibold mb-2">Revoke Token</h3>
                <p className="text-gray-400 text-xs mb-1">
                  Revoke <span className="font-semibold text-white">{revokeTokenTarget.label || 'this token'}</span>?
                </p>
                <p className="text-gray-500 text-[11px] mb-4">Anyone using this MCP URI will lose access immediately.</p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRevokeTokenTarget(null)}
                    className="h-9 px-4 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmRevokeToken}
                    disabled={revokingTokenId === revokeTokenTarget.token_id}
                    className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                  >
                    {revokingTokenId === revokeTokenTarget.token_id ? 'Revoking...' : 'Revoke'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
