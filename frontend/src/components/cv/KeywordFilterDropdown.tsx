import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFilterStore } from '../../stores/filterStore';

interface KeywordFilterDropdownProps {
  label?: string;
  fullWidth?: boolean;
}

export default function KeywordFilterDropdown({ label, fullWidth = false }: KeywordFilterDropdownProps = {}) {
  const { keywords, activeKeywords, addKeyword, removeKeyword, toggleKeyword, deactivateAll } = useFilterStore();
  const [open, setOpen] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  const handleAdd = () => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    addKeyword(trimmed);
    setNewKeyword('');
  };

  return (
    <div ref={ref} className={`${fullWidth ? 'w-full' : ''} relative`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`${fullWidth ? 'w-full justify-between' : ''} h-8 leading-none flex items-center gap-1.5 text-xs sm:text-sm font-medium py-1.5 px-2 sm:px-3 rounded-lg transition-all cursor-pointer ${
          activeKeywords.length > 0
            ? 'text-amber-400 bg-amber-500/10'
            : 'text-white/40 hover:text-white hover:bg-white/5'
        }`}
        title="Keyword filters"
      >
        {label && <span className="text-white/65">{label}</span>}
        <span className="flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {!label && <span className="hidden sm:inline">Filters</span>}
          {activeKeywords.length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {activeKeywords.length}
            </span>
          )}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Mobile backdrop — makes the popover feel like a modal on narrow viewports */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[41] bg-black/60 backdrop-blur-sm sm:hidden"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-[42] max-h-[85vh] overflow-y-auto sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:translate-y-0 sm:mt-2 sm:w-80 sm:max-h-none sm:overflow-hidden sm:z-50 bg-neutral-950/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-white/5">
              <h3 className="text-white text-sm font-semibold">Keyword Filters</h3>
              <p className="text-white/40 text-[11px] mt-0.5">
                Nodes matching active filters become transparent and are excluded from shares and exports.
              </p>
            </div>

            <div className="px-4 py-3">
              <input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="e.g. confidential, private..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent mb-2"
              />
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={handleAdd}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                >
                  Add
                </button>
                <button
                  onClick={deactivateAll}
                  disabled={activeKeywords.length === 0}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white/70 text-xs font-medium py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                >
                  Deactivate All
                </button>
              </div>

              {keywords.length === 0 ? (
                <p className="text-white/20 text-xs italic">No filter keywords configured.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
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
                  {activeKeywords.length} filter{activeKeywords.length !== 1 ? 's' : ''} active.
                </p>
              )}
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
