import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NODE_TYPE_COLORS, NODE_TYPE_LABELS } from '../graph/NodeColors';
import NodeForm from './NodeForm';

interface FloatingInputProps {
  open: boolean;
  editNode?: { type: string; values: Record<string, unknown> } | null;
  referenceNote?: string | null;
  onSubmit: (nodeType: string, properties: Record<string, unknown>) => void;
  onCancel: () => void;
  onDelete?: (uid: string) => void;
  onEnhance?: (text: string) => Promise<{ node_type: string; properties: Record<string, string> } | null>;
  onSaveDraft?: (nodeType: string, properties: Record<string, unknown>) => void;
}

export default function FloatingInput({ open, editNode, referenceNote, onSubmit, onCancel, onDelete, onEnhance, onSaveDraft }: FloatingInputProps) {
  const [currentType, setCurrentType] = useState(editNode?.type || 'skill');
  const color = NODE_TYPE_COLORS[currentType] || '#8b5cf6';
  const isEditing = !!editNode?.values?.uid;
  const label = NODE_TYPE_LABELS[currentType] || 'Entry';

  const handleTypeChange = useCallback((type: string) => {
    setCurrentType(type);
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-[3px] z-40"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 30 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
          >
            <div className="relative w-full max-w-[96vw] sm:max-w-3xl rounded-3xl border border-white/12 bg-neutral-950 shadow-[0_30px_120px_-30px_rgba(0,0,0,0.9)] overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-white/[0.07] via-white/[0.02] to-transparent" />

              <div className="h-1.5 w-full transition-colors duration-300" style={{ backgroundColor: color }} />

              <div className="relative border-b border-white/10 px-4 sm:px-6 py-4 sm:py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full transition-all duration-300" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}70` }} />
                      <p className="text-white text-base sm:text-lg font-semibold truncate">
                        {isEditing ? `Edit ${label}` : `Add ${label}`}
                      </p>
                    </div>
                    <p className="text-white/55 text-xs sm:text-sm mt-1">
                      {isEditing ? 'Update your node details with a clearer structure.' : 'Create a new node with polished, structured fields.'}
                    </p>
                  </div>
                  <button
                    onClick={onCancel}
                    className="h-9 w-9 rounded-xl border border-white/15 text-white/45 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                    aria-label="Close node form"
                  >
                    <svg className="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="relative max-h-[76vh] overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
                {referenceNote && (
                  <div className="mb-4 rounded-2xl border border-white/12 bg-white/[0.04] overflow-hidden">
                    <div className="px-3.5 py-2.5 border-b border-white/10 bg-black/25">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">Draft Note</p>
                    </div>
                    <div className="p-3.5">
                      <textarea
                        readOnly
                        value={referenceNote}
                        rows={4}
                        className="w-full bg-black/45 text-white/85 text-sm leading-relaxed border border-white/12 rounded-xl px-3 py-2.5 resize-none focus:outline-none"
                      />
                    </div>
                  </div>
                )}
                <NodeForm
                  initialType={editNode?.type}
                  initialValues={editNode?.values && Object.keys(editNode.values).length > 0 ? editNode.values : undefined}
                  onSubmit={onSubmit}
                  onCancel={onCancel}
                  onTypeChange={handleTypeChange}
                  onDelete={onDelete && editNode?.values?.uid ? () => onDelete(editNode.values.uid as string) : undefined}
                  onEnhance={onEnhance}
                  onSaveDraft={onSaveDraft}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
