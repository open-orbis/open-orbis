import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NODE_TYPE_LABELS, NODE_TYPE_COLORS } from '../graph/NodeColors';

// Per node type, the field that best summarizes the entry as a heading.
const HEADING_FIELDS: Record<string, string[]> = {
  work_experience: ['title', 'company'],
  education: ['degree', 'institution', 'field_of_study'],
  project: ['name', 'role'],
  certification: ['name', 'issuing_organization'],
  publication: ['title', 'venue'],
  patent: ['title', 'patent_number'],
  award: ['name', 'issuing_organization'],
  outreach: ['title', 'venue'],
  skill: ['name', 'category'],
  language: ['name', 'proficiency'],
};

function pickHeading(nodeType: string, properties: Record<string, unknown>): string {
  const fields = HEADING_FIELDS[nodeType] || [];
  const parts: string[] = [];
  for (const f of fields) {
    const v = properties[f];
    if (typeof v === 'string' && v.trim()) parts.push(v.trim());
  }
  return parts.join(' · ');
}

export interface EnhancedDraftState {
  nodeType: string;
  properties: Record<string, unknown>;
  suggestedSkillUids: string[];
  updatedAt: number;
  language?: string;
  confidence?: number;
}

export interface DraftNote {
  id: string;
  text: string;
  createdAt: number;
  enhanced?: EnhancedDraftState;
}

// ── Draft persistence helpers (API-backed with localStorage fallback) ──

import { listDrafts, createDraft, deleteDraft as apiDeleteDraft } from '../../api/drafts';

const LEGACY_KEYS = ['orbis_drafts', 'orbis-draft-notes'];

function userDraftsKey(userId: string) {
  return `orbis_drafts_${userId}`;
}

const MAX_DRAFT_NOTES = 50;

/** Load drafts from API, falling back to localStorage. Also migrates localStorage → API. */
export async function loadDraftNotesAsync(userId: string): Promise<DraftNote[]> {
  try {
    // Try API first
    const serverDrafts = await listDrafts();
    const notes: DraftNote[] = serverDrafts.map((d) => ({
      id: d.uid,
      text: d.text,
      createdAt: new Date(d.created_at).getTime(),
    }));

    // Clear localStorage unconditionally (API is the source of truth)
    localStorage.removeItem(userDraftsKey(userId));
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);

    // Trim excess drafts: keep only the most recent MAX_DRAFT_NOTES
    if (notes.length > MAX_DRAFT_NOTES) {
      notes.sort((a, b) => b.createdAt - a.createdAt);
      const toDelete = notes.splice(MAX_DRAFT_NOTES);
      for (const old of toDelete) {
        try { await apiDeleteDraft(old.id); } catch { /* ignore */ }
      }
    }

    return notes;
  } catch {
    // API unavailable — fall back to localStorage
    return _loadFromLocalStorage(userId);
  }
}

/** Synchronous load from localStorage (used as fallback and for initial render). */
export function loadDraftNotes(userId: string): DraftNote[] {
  return _loadFromLocalStorage(userId);
}

function _loadFromLocalStorage(userId: string): DraftNote[] {
  const key = userDraftsKey(userId);
  let notes: DraftNote[] = [];
  try { notes = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* ignore */ }

  // One-time migration: merge legacy keys
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

/** Save a draft — persists to API, falls back to localStorage. */
export async function saveDraftNote(text: string): Promise<DraftNote> {
  try {
    const created = await createDraft(text);
    return { id: created.uid, text: created.text, createdAt: new Date(created.created_at).getTime() };
  } catch {
    // Fallback: save locally
    const note: DraftNote = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, createdAt: Date.now() };
    return note;
  }
}

/** Persist full draft list to localStorage (backward compat for callers that batch-save). */
export function saveDraftNotes(userId: string, notes: DraftNote[]) {
  localStorage.setItem(userDraftsKey(userId), JSON.stringify(notes));
}

/** Delete a draft from API and localStorage. */
export async function deleteDraftNote(uid: string, userId: string): Promise<void> {
  try { await apiDeleteDraft(uid); } catch { /* ignore */ }
  // Also remove from localStorage if present
  const notes = _loadFromLocalStorage(userId);
  const filtered = notes.filter((n) => n.id !== uid);
  if (filtered.length !== notes.length) {
    localStorage.setItem(userDraftsKey(userId), JSON.stringify(filtered));
  }
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState(loadTargetLang);
  const [enhancingNoteId, setEnhancingNoteId] = useState<string | null>(null);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<DraftNote[] | null>(null);
  const [undoDeletedCount, setUndoDeletedCount] = useState(0);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) => note.text.toLowerCase().includes(q));
  }, [notes, searchQuery]);

  const duplicateMatch = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (q.length < 4) return null;
    return notes.find((note) => {
      const t = note.text.toLowerCase();
      return t.includes(q) || q.includes(t);
    }) || null;
  }, [input, notes]);

  const handleLangChange = (code: string) => {
    setTargetLang(code);
    saveTargetLang(code);
    setShowLangDropdown(false);
  };

  const handleEnhance = async (note: DraftNote) => {
    if (!onEnhance || enhancingNoteId) return;
    setEnhanceError(null);
    setEnhancingNoteId(note.id);
    try {
      await onEnhance(note, targetLang);
    } catch {
      setEnhanceError('Enhancement failed. Please try again.');
    } finally {
      setEnhancingNoteId(null);
    }
  };

  const [enhancingInput, setEnhancingInput] = useState(false);

  const handleEnhanceFromInput = async () => {
    if (!onEnhance || !input.trim() || enhancingInput) return;
    setEnhanceError(null);
    const note: DraftNote = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: input.trim(),
      createdAt: Date.now(),
    };
    setEnhancingInput(true);
    try {
      await onEnhance(note, targetLang);
      setInput('');
    } catch {
      setEnhanceError('Enhancement failed. Please try again.');
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

  useEffect(() => {
    if (!undoSnapshot) {
      setUndoDeletedCount(0);
      return;
    }
    const t = window.setTimeout(() => setUndoSnapshot(null), 5000);
    return () => window.clearTimeout(t);
  }, [undoSnapshot]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => notes.some((n) => n.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [notes]);

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

  const deleteByIds = (ids: Set<string>) => {
    if (ids.size === 0) return;
    const remaining = notes.filter((n) => !ids.has(n.id));
    setUndoSnapshot(notes);
    setUndoDeletedCount(notes.length - remaining.length);
    onNotesChange(remaining);
    setConfirmDeleteId(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    // Persist deletions to API
    for (const id of ids) {
      apiDeleteDraft(id).catch(() => { /* best effort */ });
    }
  };

  const deleteNote = (id: string) => {
    deleteByIds(new Set([id]));
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

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    deleteByIds(new Set(selectedIds));
  };

  const handleUndoDelete = () => {
    if (!undoSnapshot) return;
    // Find notes that were deleted (in snapshot but not in current)
    const currentIds = new Set(notes.map((n) => n.id));
    const restored = undoSnapshot.filter((n) => !currentIds.has(n.id));
    onNotesChange(undoSnapshot);
    setUndoSnapshot(null);
    setUndoDeletedCount(0);
    // Re-create deleted notes in API
    for (const note of restored) {
      createDraft(note.text).catch(() => { /* best effort */ });
    }
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

  const selectedCount = selectedIds.size;
  const filteredCount = filteredNotes.length;

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
                <p className="text-white/40 text-xs mt-0.5">
                  {filteredCount} / {notes.length} in view
                </p>
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
            <div className="px-4 py-3 border-b border-white/5 space-y-2">
              <form onSubmit={handleSubmit} className="space-y-2">
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
                <div className="flex items-center justify-between text-[10px] text-white/30">
                  <span>Enter to add · Shift+Enter newline</span>
                  <span>{input.trim().length} chars</span>
                </div>
                {duplicateMatch && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-400/20 bg-amber-500/10 px-2.5 py-1.5 text-[10px]">
                    <p className="text-amber-300/85 truncate pr-2">
                      Possible duplicate: {duplicateMatch.text}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSearchQuery(duplicateMatch.text)}
                      className="text-amber-200 hover:text-amber-100 whitespace-nowrap"
                    >
                      Find
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-end gap-2">
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
              </form>
            </div>

            {/* Search and list controls */}
            <div className="px-4 py-2.5 border-b border-white/5 space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
                  </svg>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search notes..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-8 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/40 focus:border-purple-500/30"
                  />
                  {searchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/70"
                      title="Clear search"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={selectedCount === 0}
                  className="h-7 w-7 flex items-center justify-center rounded-md border border-red-500/25 bg-red-500/10 text-red-300 disabled:opacity-30"
                  title={selectedCount > 0 ? `Delete ${selectedCount} selected notes` : 'Select notes to delete'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              {enhanceError && (
                <div className="flex items-start justify-between gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-2">
                  <p className="text-red-300 text-[11px]">{enhanceError}</p>
                  <button
                    type="button"
                    onClick={() => setEnhanceError(null)}
                    className="text-red-200/70 hover:text-red-100"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
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
              ) : filteredNotes.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/30 text-sm">No notes match "{searchQuery}"</p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-xs text-purple-300/80 hover:text-purple-200"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const isSelected = selectedIds.has(note.id);
                  const confidence = note.enhanced?.confidence;
                  const confidencePct = typeof confidence === 'number'
                    ? Math.round((confidence <= 1 ? confidence * 100 : confidence))
                    : null;

                  return (
                    <div
                      key={note.id}
                      className={`group border rounded-xl px-3.5 py-3 transition-colors ${
                        isSelected
                          ? 'border-purple-500/40 bg-purple-500/10'
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          onClick={() => toggleSelected(note.id)}
                          className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'border-purple-400 bg-purple-500/30'
                              : 'border-white/30 bg-transparent hover:border-white/50'
                          }`}
                          title={isSelected ? 'Unselect note' : 'Select note'}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-purple-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
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
                              {note.enhanced ? (
                                (() => {
                                  const typeColor = NODE_TYPE_COLORS[note.enhanced.nodeType] || '#8b5cf6';
                                  const typeLabel = NODE_TYPE_LABELS[note.enhanced.nodeType] || note.enhanced.nodeType;
                                  const heading = pickHeading(note.enhanced.nodeType, note.enhanced.properties);
                                  return (
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <span
                                          className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border"
                                          style={{
                                            color: typeColor,
                                            borderColor: `${typeColor}40`,
                                            backgroundColor: `${typeColor}15`,
                                          }}
                                        >
                                          {typeLabel}
                                        </span>
                                        <span className="text-[10px] text-purple-300/70 flex items-center gap-0.5">
                                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                          </svg>
                                          Enhanced
                                        </span>
                                      </div>
                                      {heading && (
                                        <p className="text-white/90 text-sm font-medium leading-snug">{heading}</p>
                                      )}
                                      <p className="text-white/40 text-xs leading-relaxed mt-1 line-clamp-2">{note.text}</p>
                                    </div>
                                  );
                                })()
                              ) : (
                                <p className="text-white/80 text-sm leading-relaxed">{note.text}</p>
                              )}

                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-[10px] text-white/30">
                                <span>Created {formatTime(note.createdAt)}</span>
                                {note.enhanced && (
                                  <span>Enhanced {formatTime(note.enhanced.updatedAt)}</span>
                                )}
                                {note.enhanced?.language && (
                                  <span>Language {note.enhanced.language.toUpperCase()}</span>
                                )}
                                {confidencePct !== null && (
                                  <span>Confidence {confidencePct}%</span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-1 mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
                                        {note.enhanced ? 'Refine' : 'Enhance'}
                                      </>
                                    )}
                                  </button>
                                )}
                                <button
                                  onClick={() => startEdit(note)}
                                  className="text-white/30 hover:text-white/70 transition-colors p-0.5"
                                  title="Edit note"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(note.id)}
                                  className="text-white/30 hover:text-red-400 transition-colors p-0.5"
                                  title="Delete note"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <AnimatePresence>
              {undoSnapshot && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="mx-4 mb-3 rounded-lg border border-purple-400/30 bg-purple-500/10 px-3 py-2 flex items-center justify-between gap-2"
                >
                  <p className="text-[11px] text-purple-100/90">
                    {undoDeletedCount === 1 ? '1 note removed.' : `${undoDeletedCount} notes removed.`}
                  </p>
                  <button
                    type="button"
                    onClick={handleUndoDelete}
                    className="text-[11px] font-medium text-purple-200 hover:text-white"
                  >
                    Undo
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
