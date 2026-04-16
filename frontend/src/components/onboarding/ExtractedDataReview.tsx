import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { confirmCV } from '../../api/cv';
import { enhanceNote, getMyOrb } from '../../api/orbs';
import type { ExtractedData, ExtractedProfile, ExtractedRelationship } from '../../api/cv';
import { NODE_TYPE_COLORS, NODE_TYPE_LABELS } from '../graph/NodeColors';
import NodeForm from '../editor/NodeForm';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';
import { saveDraftNote } from '../drafts/DraftNotes';

const REVIEW_REQUIRED_FIELDS: Record<string, string[]> = {
  skill: ['name'],
  language: ['name'],
  work_experience: ['company', 'title'],
  education: ['institution', 'degree'],
  certification: ['name', 'issuing_organization'],
  publication: ['title'],
  project: ['name'],
  patent: ['title'],
  award: ['name'],
  outreach: ['title', 'venue'],
  training: ['title', 'provider'],
};

function normalizeNodeType(type: string) {
  return type.toLowerCase();
}

function getMissingFields(nodeType: string, props: Record<string, unknown>): string[] {
  const required = REVIEW_REQUIRED_FIELDS[normalizeNodeType(nodeType)] || [];
  return required.filter((field) => !String(props[field] ?? '').trim());
}

function parseConfidence(props: Record<string, unknown>): number | null {
  const raw = props.confidence;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw <= 1 ? raw : raw / 100;
  }
  if (typeof raw === 'string') {
    const num = Number(raw.trim());
    if (Number.isFinite(num)) return num <= 1 ? num : num / 100;
  }
  return null;
}

interface ExtractedDataReviewProps {
  initialNodes: ExtractedData['nodes'];
  initialRelationships: ExtractedRelationship[];
  cvOwnerName: string | null;
  profile?: ExtractedProfile | null;
  unmatchedCount: number;
  unmatchedEntries?: string[];
  skippedCount: number;
  truncated: boolean;
  onReset: () => void;
  resetLabel?: string;
  documentId?: string | null;
  originalFilename?: string | null;
  fileSizeBytes?: number | null;
  pageCount?: number | null;
  /** Override the confirm function (default: confirmCV which wipes existing data) */
  onConfirm?: (
    nodes: ExtractedData['nodes'],
    relationships: ExtractedRelationship[],
    cvOwnerName: string | null,
    documentId?: string | null,
    originalFilename?: string | null,
    fileSizeBytes?: number | null,
    pageCount?: number | null,
    profile?: ExtractedProfile | null,
  ) => Promise<void>;
  /** Fired after confirm + unmatched drafts save completes, before navigation. */
  onComplete?: () => void | Promise<void>;
  /** Extra content rendered below the header (e.g., checkbox) */
  children?: React.ReactNode;
}

export default function ExtractedDataReview({
  initialNodes,
  initialRelationships,
  cvOwnerName,
  profile,
  unmatchedCount,
  unmatchedEntries,
  truncated,
  onReset,
  resetLabel = 'Try another file',
  documentId,
  originalFilename,
  fileSizeBytes,
  pageCount,
  onConfirm: onConfirmOverride,
  onComplete,
  children,
}: ExtractedDataReviewProps) {
  const navigate = useNavigate();
  const { fetchUser } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const [extractedNodes, setExtractedNodes] = useState(initialNodes);
  const [relationships, setRelationships] = useState(initialRelationships);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'attention'>('all');
  const [existingNodeCount, setExistingNodeCount] = useState<number | null>(null);
  const [showReplaceWarning, setShowReplaceWarning] = useState(false);
  const isReplaceMode = !onConfirmOverride;

  // Check how many nodes the user already has so we can show accurate import messaging
  useEffect(() => {
    getMyOrb()
      .then((orb) => setExistingNodeCount(orb.nodes.length))
      .catch(() => setExistingNodeCount(0));
  }, []);

  const removeNode = (index: number) => {
    setExtractedNodes(prev => prev.filter((_, i) => i !== index));
    setRelationships(prev =>
      prev
        .filter(r => r.from_index !== index && r.to_index !== index)
        .map(r => ({
          ...r,
          from_index: r.from_index > index ? r.from_index - 1 : r.from_index,
          to_index: r.to_index > index ? r.to_index - 1 : r.to_index,
        }))
    );
    if (editingIndex === index) setEditingIndex(null);
    else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1);
  };

  const handleConfirmClick = () => {
    if (extractedNodes.length === 0) return;
    // If using default confirmCV (which wipes the graph), warn the user
    // If using a custom confirm (import mode — merge), skip the warning
    if (isReplaceMode && (existingNodeCount ?? 0) > 0) {
      setShowReplaceWarning(true);
      return;
    }
    void handleConfirm();
  };

  const handleConfirm = async () => {
    setShowReplaceWarning(false);
    setConfirming(true);
    try {
      const replaced = existingNodeCount ?? 0;
      if (onConfirmOverride) {
        await onConfirmOverride(extractedNodes, relationships, cvOwnerName, documentId, originalFilename, fileSizeBytes, pageCount, profile);
      } else {
        await confirmCV(extractedNodes, relationships, cvOwnerName, documentId, originalFilename, fileSizeBytes, pageCount, profile);
      }
      // Save unmatched entries as draft notes
      if (unmatchedEntries && unmatchedEntries.length > 0) {
        for (const text of unmatchedEntries) {
          if (text.trim()) {
            try {
              await saveDraftNote(text.trim());
            } catch { /* best effort */ }
          }
        }
      }
      if (onComplete) {
        try { await onComplete(); } catch { /* best effort */ }
      }
      await fetchUser();
      if (isReplaceMode && replaced > 0) {
        addToast(
          `Imported ${extractedNodes.length} entries (replaced ${replaced} existing)`,
          'success',
        );
      } else {
        addToast(`Imported ${extractedNodes.length} entries into your orb`, 'success');
      }
      navigate('/myorbis');
    } catch {
      setError('Failed to save entries. Please try again.');
      addToast('Failed to import CV data', 'error');
    } finally {
      setConfirming(false);
    }
  };

  const reviewed = extractedNodes.map((node, i) => {
    const missingFields = getMissingFields(node.node_type, node.properties);
    const confidence = parseConfidence(node.properties);
    const lowConfidence = confidence !== null && confidence < 0.6;
    return {
      index: i,
      type: node.node_type,
      props: node.properties,
      missingFields,
      confidence,
      lowConfidence,
      ready: missingFields.length === 0 && !lowConfidence,
    };
  });

  const readyCount = reviewed.filter((r) => r.ready).length;
  const missingCount = reviewed.filter((r) => r.missingFields.length > 0).length;
  const lowCount = reviewed.filter((r) => r.lowConfidence).length;
  const edgesCount = relationships.length;

  const groupedConfidence = reviewed.reduce<Record<string, { sum: number; count: number }>>((acc, row) => {
    if (row.confidence === null) return acc;
    const key = normalizeNodeType(row.type);
    if (!acc[key]) acc[key] = { sum: 0, count: 0 };
    acc[key].sum += row.confidence;
    acc[key].count += 1;
    return acc;
  }, {});

  const filteredReviewed = reviewed.filter((row) => {
    if (statusFilter === 'ready') return row.ready;
    if (statusFilter === 'attention') return row.missingFields.length > 0 || row.lowConfidence;
    return true;
  });

  const grouped = filteredReviewed.reduce<Record<string, Array<{
    index: number;
    props: Record<string, unknown>;
    missingFields: string[];
    confidence: number | null;
    lowConfidence: boolean;
    ready: boolean;
  }>>>((acc, row) => {
    if (!acc[row.type]) acc[row.type] = [];
    acc[row.type].push(row);
    return acc;
  }, {});

  const typeKeys = Object.keys(grouped);
  const [activeTypeTab, setActiveTypeTab] = useState<string | null>(null);
  const currentTab = activeTypeTab && typeKeys.includes(activeTypeTab) ? activeTypeTab : typeKeys[0] || null;

  return (
    <div className="min-h-screen bg-black flex flex-col items-center px-3 sm:px-4 py-10 sm:py-16">
      <div className="w-full max-w-[95vw] sm:max-w-2xl">
        <div className="text-center mb-8">
          {children && <div className="mb-5">{children}</div>}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 text-left space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-white/45">Review snapshot</p>
              <p className="text-[11px] text-white/35">{reviewed.length} extracted</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <StatusTile
                label="Ready"
                value={String(readyCount)}
                tone="success"
                emphasis="primary"
                className="sm:col-span-6"
                active={statusFilter === 'ready'}
                onClick={() => setStatusFilter((prev) => (prev === 'ready' ? 'all' : 'ready'))}
              />
              <StatusTile
                label="Needs attention"
                value={String(missingCount + lowCount)}
                tone="warn"
                emphasis="primary"
                className="sm:col-span-6"
                active={statusFilter === 'attention'}
                onClick={() => setStatusFilter((prev) => (prev === 'attention' ? 'all' : 'attention'))}
              />
              <StatusTile
                label="Nodes"
                value={String(extractedNodes.length)}
                tone="neutral"
                className="sm:col-span-6"
                active={statusFilter === 'all'}
                onClick={() => setStatusFilter('all')}
              />
              <StatusTile label="Edges" value={String(edgesCount)} tone="neutral" className="sm:col-span-6" />
            </div>

            {(truncated || unmatchedCount > 0) && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-amber-300/80 mb-1">Processing notes</p>
                <div className="space-y-1.5">
                  {truncated && (
                    <p className="text-amber-200/90 text-xs">
                      Your CV was partially truncated. Some entries at the end may have been missed.
                    </p>
                  )}
                  {unmatchedCount > 0 && (
                    <p className="text-amber-200/90 text-xs">
                      {unmatchedCount} entr{unmatchedCount === 1 ? 'y was' : 'ies were'} not classified and moved to Draft Notes.
                    </p>
                  )}
                </div>
              </div>
            )}

            {Object.keys(groupedConfidence).length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-[10px] uppercase tracking-wide text-white/45 mb-1">Section Confidence</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(groupedConfidence).map(([type, data]) => {
                    const label = NODE_TYPE_LABELS[type] || type;
                    const avg = Math.round((data.sum / data.count) * 100);
                    return (
                      <span key={type} className="text-xs text-white/65 border border-white/10 rounded-full px-2 py-0.5">
                        {label}: {avg}%
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {statusFilter !== 'all' && (
            <p className="text-[11px] text-white/35 mt-2">
              Showing {filteredReviewed.length} of {reviewed.length} entries.
            </p>
          )}
        </div>

        <div className="mb-8">
          {typeKeys.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
              <p className="text-white/55 text-sm">No entries match the selected filter.</p>
            </div>
          )}
          {typeKeys.length > 0 && (
            <>
              {/* Type tabs */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {typeKeys.map((type) => {
                  const color = NODE_TYPE_COLORS[type] || '#8b5cf6';
                  const label = NODE_TYPE_LABELS[type] || type;
                  const count = grouped[type].length;
                  const isActive = currentTab === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setActiveTypeTab(type)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-white/10 text-white border border-white/20'
                          : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:text-white/60 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      {label}
                      <span className={`text-[10px] ${isActive ? 'text-white/60' : 'text-white/25'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active tab content */}
              {currentTab && grouped[currentTab] && (
                <div className="space-y-2">
                  {grouped[currentTab].map(({ index, props, missingFields, confidence, lowConfidence, ready }) => {
                    const type = currentTab;
                    if (editingIndex === index) {
                      return (
                        <motion.div
                          key={index}
                          layout
                          className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 sm:px-4 py-3 sm:py-4"
                        >
                          <NodeForm
                            initialType={type}
                            initialValues={props as Record<string, unknown>}
                            onSubmit={(nodeType, newProps) => {
                              setExtractedNodes(prev => {
                                const updated = [...prev];
                                updated[index] = { node_type: nodeType, properties: newProps };
                                return updated;
                              });
                              setEditingIndex(null);
                            }}
                            onCancel={() => setEditingIndex(null)}
                            onEnhance={async (text) => {
                              const existingSkills = extractedNodes
                                .filter(n => normalizeNodeType(n.node_type) === 'skill' && n.properties.name)
                                .map((n, i) => ({ uid: `cv-${i}`, name: n.properties.name as string }));
                              const targetLang = localStorage.getItem('orbis_note_target_lang') || 'en';
                              const result = await enhanceNote(text, targetLang, existingSkills);
                              return { node_type: result.node_type, properties: result.properties };
                            }}
                          />
                        </motion.div>
                      );
                    }
                    const title = (props.name || props.title || props.company || props.institution || 'Untitled') as string;
                    const subtitle = (props.company || props.degree || props.issuing_organization || props.category || '') as string;
                    return (
                      <motion.div
                        key={index}
                        layout
                        className="flex items-center gap-2 sm:gap-3 bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            {ready && (
                              <span className="text-[10px] rounded-full px-1.5 py-0.5 border border-emerald-500/35 bg-emerald-500/10 text-emerald-200">
                                Ready
                              </span>
                            )}
                            {missingFields.length > 0 && (
                              <span className="text-[10px] rounded-full px-1.5 py-0.5 border border-red-500/35 bg-red-500/10 text-red-200">
                                Missing required
                              </span>
                            )}
                            {lowConfidence && (
                              <span className="text-[10px] rounded-full px-1.5 py-0.5 border border-amber-500/35 bg-amber-500/10 text-amber-200">
                                Low confidence
                              </span>
                            )}
                            {confidence !== null && (
                              <span className="text-[10px] rounded-full px-1.5 py-0.5 border border-white/15 bg-white/[0.03] text-white/55">
                                {(confidence * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                          <div className="text-white/80 text-sm font-medium truncate">{title}</div>
                          {subtitle && subtitle !== title && (
                            <div className="text-white/30 text-xs truncate">{subtitle}</div>
                          )}
                          {missingFields.length > 0 && (
                            <div className="text-red-300/80 text-[11px] mt-1">
                              Missing: {missingFields.map((f) => f.replace(/_/g, ' ')).join(', ')}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setEditingIndex(index)}
                          className="text-blue-400/50 hover:text-blue-400 transition-colors flex-shrink-0 p-1.5 rounded-lg hover:bg-blue-400/10"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => removeNode(index)}
                          className="text-red-400/50 hover:text-red-400 transition-colors flex-shrink-0 p-1.5 rounded-lg hover:bg-red-400/10"
                          title="Remove"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

        {(existingNodeCount ?? 0) > 0 && (
          <p className="text-amber-400/80 text-xs text-center mb-3">
            You currently have {existingNodeCount} entries in your orb.{' '}
            {isReplaceMode
              ? 'Importing will replace them.'
              : 'Importing will merge with your existing entries.'}
          </p>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={handleConfirmClick}
            disabled={confirming || extractedNodes.length === 0}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-xl shadow-purple-600/20 text-base cursor-pointer"
          >
            {confirming ? 'Adding...' : `Add ${extractedNodes.length} entries to graph`}
          </button>
          <button
            onClick={onReset}
            className="border border-white/10 text-white/40 hover:text-white/70 font-medium py-3 px-6 rounded-xl transition-colors text-base cursor-pointer"
          >
            {resetLabel}
          </button>
        </div>
      </div>

      {/* Replace confirmation modal */}
      <AnimatePresence>
        {showReplaceWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
            onClick={() => setShowReplaceWarning(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-950 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white text-lg font-semibold mb-1">Replace existing orb?</h3>
                  <p className="text-white/50 text-sm leading-relaxed">
                    You currently have <span className="text-white font-semibold">{existingNodeCount}</span> entries in your orb.
                    Importing this CV will <span className="text-red-300">delete all of them</span> and replace them with
                    the {extractedNodes.length} new entries. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-5">
                <button
                  onClick={() => setShowReplaceWarning(false)}
                  className="border border-white/10 text-white/60 hover:text-white hover:bg-white/5 font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 font-semibold py-2 px-4 rounded-lg transition-colors cursor-pointer"
                >
                  Replace
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusTile({
  label,
  value,
  tone,
  emphasis = 'default',
  className = '',
  active = false,
  onClick,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'success' | 'warn';
  emphasis?: 'default' | 'primary';
  className?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClass = tone === 'success'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : tone === 'warn'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-white/10 bg-white/[0.03] text-white/65';

  const valueClass = emphasis === 'primary' ? 'text-xl font-semibold mt-1 leading-none' : 'text-sm font-semibold mt-0.5';
  const paddingClass = emphasis === 'primary' ? 'py-3' : 'py-2';
  const activeClass = active ? 'ring-1 ring-purple-400/60 border-purple-400/50' : '';
  const interactiveClass = onClick
    ? 'cursor-pointer transition-all hover:-translate-y-px hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60'
    : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-3 ${paddingClass} ${toneClass} ${activeClass} ${interactiveClass} ${className}`}
    >
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      <p className={valueClass}>{value}</p>
    </button>
  );
}
