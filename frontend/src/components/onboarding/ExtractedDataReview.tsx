import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { confirmCV } from '../../api/cv';
import { enhanceNote, getMyOrb } from '../../api/orbs';
import type { ExtractedData, ExtractedRelationship } from '../../api/cv';
import { NODE_TYPE_COLORS, NODE_TYPE_LABELS } from '../graph/NodeColors';
import NodeForm from '../editor/NodeForm';
import { useAuthStore } from '../../stores/authStore';
import { useToastStore } from '../../stores/toastStore';

interface ExtractedDataReviewProps {
  initialNodes: ExtractedData['nodes'];
  initialRelationships: ExtractedRelationship[];
  cvOwnerName: string | null;
  unmatchedCount: number;
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
  ) => Promise<void>;
  /** Extra content rendered below the header (e.g., checkbox) */
  children?: React.ReactNode;
}

export default function ExtractedDataReview({
  initialNodes,
  initialRelationships,
  cvOwnerName,
  unmatchedCount,
  skippedCount,
  truncated,
  onReset,
  resetLabel = 'Try another file',
  documentId,
  originalFilename,
  fileSizeBytes,
  pageCount,
  onConfirm: onConfirmOverride,
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
        await onConfirmOverride(extractedNodes, relationships, cvOwnerName, documentId, originalFilename, fileSizeBytes, pageCount);
      } else {
        await confirmCV(extractedNodes, relationships, cvOwnerName, documentId, originalFilename, fileSizeBytes, pageCount);
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

  const grouped = extractedNodes.reduce<Record<string, Array<{ index: number; props: Record<string, unknown> }>>>((acc, node, i) => {
    const type = node.node_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push({ index: i, props: node.properties });
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-black flex flex-col items-center px-3 sm:px-4 py-10 sm:py-16">
      <div className="w-full max-w-[95vw] sm:max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-white text-xl font-semibold">
            Found {extractedNodes.length} entries
          </h2>
          <p className="text-white/30 text-sm mt-1">Review, edit, or remove entries, then add them all to your orb.</p>
          {truncated && (
            <p className="text-amber-400/80 text-xs mt-2">
              Your CV was too long and was partially truncated. Some entries at the end may have been missed.
            </p>
          )}
          {unmatchedCount > 0 && (
            <p className="text-amber-400/80 text-xs mt-2">
              {unmatchedCount} entr{unmatchedCount === 1 ? 'y' : 'ies'} couldn't be classified and {unmatchedCount === 1 ? 'was' : 'were'} added to your Draft Notes for manual review.
            </p>
          )}
          {skippedCount > 0 && (
            <p className="text-amber-400/60 text-xs mt-1">
              {skippedCount} entr{skippedCount === 1 ? 'y was' : 'ies were'} skipped due to missing required fields or unknown types.
            </p>
          )}
          {children}
        </div>

        <div className="space-y-6 mb-8">
          {Object.entries(grouped).map(([type, items]) => {
            const color = NODE_TYPE_COLORS[type] || '#8b5cf6';
            const label = NODE_TYPE_LABELS[type] || type;
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-white/50 text-xs font-bold uppercase tracking-widest">{label}</span>
                  <span className="text-white/20 text-xs">({items.length})</span>
                </div>
                <div className="space-y-2">
                  {items.map(({ index, props }) => {
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
                                .filter(n => n.node_type === 'Skill' && n.properties.name)
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
                        className="flex items-center gap-2 sm:gap-3 bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-white/80 text-sm font-medium truncate">{title}</div>
                          {subtitle && subtitle !== title && (
                            <div className="text-white/30 text-xs truncate">{subtitle}</div>
                          )}
                        </div>
                        <button
                          onClick={() => setEditingIndex(index)}
                          className="text-white/15 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => removeNode(index)}
                          className="text-white/15 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
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
              </div>
            );
          })}
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
