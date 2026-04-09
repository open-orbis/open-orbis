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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 30 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-[95vw] sm:max-w-xl overflow-hidden"
          >
            {/* Colored top accent bar */}
            <div className="h-1 w-full transition-colors duration-300" style={{ backgroundColor: color }} />

            <div className="bg-gray-950 border border-white/10 border-t-0 rounded-b-2xl shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-2 sm:pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full transition-all duration-300" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }} />
                  <span className="text-white/90 text-sm font-semibold">
                    {isEditing ? `Edit ${label}` : `Add ${label}`}
                  </span>
                </div>
                <button
                  onClick={onCancel}
                  className="text-white/25 hover:text-white/60 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Form */}
              <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                {referenceNote && (
                  <div className="mb-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Draft note</p>
                    </div>
                    <div className="p-3">
                      <textarea
                        readOnly
                        value={referenceNote}
                        rows={3}
                        className="w-full bg-white text-slate-900 text-sm leading-relaxed border border-slate-300 rounded-lg px-3 py-2 resize-none focus:outline-none"
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
