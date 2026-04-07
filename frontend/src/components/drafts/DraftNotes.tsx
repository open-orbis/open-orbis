import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface DraftNote {
  id: string;
  text: string;
  createdAt: number;
}

// ── Shared localStorage helpers (user-scoped, with migration) ──

const LEGACY_KEYS = ['orbis_drafts', 'orbis-draft-notes'];

function userDraftsKey(userId: string) {
  return `orbis_drafts_${userId}`;
}

/** Load drafts for a user, migrating any legacy (non-scoped) entries once. */
export function loadDraftNotes(userId: string): DraftNote[] {
  const key = userDraftsKey(userId);
  let notes: DraftNote[] = [];
  try { notes = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* ignore */ }

  // One-time migration: merge legacy keys into the user-scoped key
  let migrated = false;
  for (const legacyKey of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(legacyKey);
      if (raw) {
        const old: DraftNote[] = JSON.parse(raw);
        if (old.length > 0) {
          const existingIds = new Set(notes.map((n) => n.id));
          notes = [...notes, ...old.filter((n) => !existingIds.has(n.id))];
          migrated = true;
        }
        localStorage.removeItem(legacyKey);
      }
    } catch {
      localStorage.removeItem(legacyKey);
    }
  }
  if (migrated) localStorage.setItem(key, JSON.stringify(notes));
  return notes;
}

/** Persist drafts for a user. */
export function saveDraftNotes(userId: string, notes: DraftNote[]) {
  localStorage.setItem(userDraftsKey(userId), JSON.stringify(notes));
}

/** Remove all draft notes for a user (used on account delete). */
export function clearDraftNotes(userId: string) {
  localStorage.removeItem(userDraftsKey(userId));
}

const TARGET_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
  { code: 'fr', label: 'Francais' },
  { code: 'es', label: 'Espanol' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Portugues' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ru', label: 'Russian' },
  { code: 'nl', label: 'Dutch' },
];

function loadTargetLang(): string {
  return localStorage.getItem('orbis_note_target_lang') || 'en';
}

function saveTargetLang(lang: string) {
  localStorage.setItem('orbis_note_target_lang', lang);
}

interface DraftNotesProps {
  open: boolean;
  onClose: () => void;
  notes: DraftNote[];
  onNotesChange: (notes: DraftNote[]) => void;
  onAddToGraph: (note: DraftNote) => void;
  onEnhance?: (note: DraftNote, targetLang: string) => Promise<void>;
}

export default function DraftNotes({ open, onClose, notes, onNotesChange, onAddToGraph, onEnhance }: DraftNotesProps) {
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState(loadTargetLang);
  const [enhancingNoteId, setEnhancingNoteId] = useState<string | null>(null);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const handleLangChange = (code: string) => {
    setTargetLang(code);
    saveTargetLang(code);
    setShowLangDropdown(false);
  };

  const handleEnhance = async (note: DraftNote) => {
    if (!onEnhance || enhancingNoteId) return;
    setEnhancingNoteId(note.id);
    try {
      await onEnhance(note, targetLang);
    } finally {
      setEnhancingNoteId(null);
    }
  };

  const [enhancingInput, setEnhancingInput] = useState(false);

  const handleEnhanceFromInput = async () => {
    if (!onEnhance || !input.trim() || enhancingInput) return;
    const note: DraftNote = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: input.trim(),
      createdAt: Date.now(),
    };
    setEnhancingInput(true);
    try {
      await onEnhance(note, targetLang);
      setInput('');
    } finally {
      setEnhancingInput(false);
    }
  };

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    if (editingId) setTimeout(() => editRef.current?.focus(), 50);
  }, [editingId]);

  const addNote = (text: string) => {
    if (!text.trim()) return;
    const note: DraftNote = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: text.trim(),
      createdAt: Date.now(),
    };
    onNotesChange([note, ...notes]);
    setInput('');
  };

  const deleteNote = (id: string) => {
    onNotesChange(notes.filter((n) => n.id !== id));
    setConfirmDeleteId(null);
  };

  const startEdit = (note: DraftNote) => {
    setEditingId(note.id);
    setEditText(note.text);
  };

  const saveEdit = () => {
    if (!editingId || !editText.trim()) return;
    onNotesChange(notes.map((n) => n.id === editingId ? { ...n, text: editText.trim() } : n));
    setEditingId(null);
    setEditText('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addNote(input);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <AnimatePresence>
      {open && (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full sm:max-w-sm h-full bg-gray-950/95 backdrop-blur-lg border-l border-white/10 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-white text-base font-semibold">Draft Notes</h2>
            <p className="text-white/40 text-xs mt-0.5">Quick notes to add to your orbis later</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Language selector */}
            {onEnhance && (
              <div className="relative">
                <button
                  onClick={() => setShowLangDropdown(!showLangDropdown)}
                  className="flex items-center gap-1 text-[10px] font-medium text-white/40 hover:text-white/60 px-2 py-1 rounded-md border border-white/10 hover:border-white/20 transition-colors uppercase"
                  title="Target language for AI enhancement"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  {targetLang}
                </button>
                {showLangDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowLangDropdown(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 bg-gray-900 border border-white/10 rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto min-w-[140px]">
                      {TARGET_LANGUAGES.map(({ code, label }) => (
                        <button
                          key={code}
                          onClick={() => handleLangChange(code)}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            code === targetLang
                              ? 'text-purple-400 bg-purple-500/10'
                              : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                          }`}
                        >
                          <span className="uppercase font-medium mr-2">{code}</span>
                          <span className="text-white/30">{label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Input area */}
        <div className="px-4 py-3 border-b border-white/5">
          <form onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
              }}
              placeholder="Jot down something to add later..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/25 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30"
              rows={2}
            />
            <div className="flex items-center justify-end mt-2">
              <div className="flex items-center gap-2">
                {onEnhance && (
                  <button
                    type="button"
                    onClick={handleEnhanceFromInput}
                    disabled={!input.trim() || enhancingInput}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors flex items-center gap-1 ${
                      enhancingInput
                        ? 'bg-amber-500/20 text-amber-400/80'
                        : input.trim()
                          ? 'bg-amber-500/10 text-amber-400/70 hover:bg-amber-500/20 hover:text-amber-300 border border-amber-500/20'
                          : 'bg-white/5 text-white/15 cursor-not-allowed'
                    }`}
                  >
                    {enhancingInput ? (
                      <>
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Enhancing...
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                        Enhance
                      </>
                    )}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="text-xs font-medium px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-30 text-white rounded-full transition-colors"
                >
                  Add note
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {notes.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-white/15 text-4xl mb-3">
                <svg className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <p className="text-white/20 text-sm">No draft notes yet</p>
              <p className="text-white/10 text-xs mt-1">Type a note to add later</p>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="group bg-white/5 border border-white/5 rounded-xl px-3.5 py-3 hover:border-white/10 transition-colors"
              >
                {editingId === note.id ? (
                  /* ── Inline edit mode ── */
                  <div>
                    <textarea
                      ref={editRef}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="w-full bg-white/10 border border-purple-500/30 rounded-lg px-2.5 py-2 text-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                      rows={3}
                    />
                    <div className="flex justify-end gap-1.5 mt-1.5">
                      <button onClick={cancelEdit} className="text-[10px] text-white/40 hover:text-white/60 px-2 py-0.5 rounded-md transition-colors">Cancel</button>
                      <button onClick={saveEdit} disabled={!editText.trim()} className="text-[10px] font-medium text-purple-400 hover:text-purple-300 disabled:opacity-30 px-2 py-0.5 rounded-md hover:bg-purple-500/10 transition-colors">Save</button>
                    </div>
                  </div>
                ) : confirmDeleteId === note.id ? (
                  /* ── Delete confirmation ── */
                  <div className="flex items-center justify-between">
                    <span className="text-red-400/80 text-xs">Delete this note?</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] text-white/40 hover:text-white/60 px-2 py-0.5 rounded-md transition-colors">Cancel</button>
                      <button onClick={() => deleteNote(note.id)} className="text-[10px] font-medium text-red-400 hover:text-red-300 px-2 py-0.5 rounded-md hover:bg-red-500/10 transition-colors">Delete</button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal display ── */
                  <>
                    <p className="text-white/80 text-sm leading-relaxed">{note.text}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white/20 text-[10px]">{formatTime(note.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onAddToGraph(note)}
                          className="text-[10px] font-medium text-purple-400 hover:text-purple-300 px-2 py-0.5 rounded-md hover:bg-purple-500/10 transition-colors"
                        >
                          + Add to graph
                        </button>
                        {onEnhance && (
                          <button
                            onClick={() => handleEnhance(note)}
                            disabled={enhancingNoteId !== null}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors flex items-center gap-1 ${
                              enhancingNoteId === note.id
                                ? 'text-amber-400/80 bg-amber-500/10'
                                : enhancingNoteId
                                  ? 'text-white/15 cursor-not-allowed'
                                  : 'text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10'
                            }`}
                            title="Enhance with AI: translate, improve, and extract fields"
                          >
                            {enhancingNoteId === note.id ? (
                              <>
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Enhancing...
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                </svg>
                                Enhance
                              </>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(note)}
                          className="text-white/20 hover:text-white/60 transition-colors p-0.5"
                          title="Edit note"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(note.id)}
                          className="text-white/20 hover:text-red-400 transition-colors p-0.5"
                          title="Delete note"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
      )}
    </AnimatePresence>
  );
}
