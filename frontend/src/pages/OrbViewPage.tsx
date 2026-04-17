import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrbStore } from '../stores/orbStore';
import { useAuthStore } from '../stores/authStore';
import { useFilterStore, computeFilteredNodeIds } from '../stores/filterStore';
import DateRangeSlider from '../components/graph/DateRangeSlider';
import { useDateFilterStore, computeDateFilteredNodeIds, getNodeDates } from '../stores/dateFilterStore';
import {
  enhanceNote,
  linkSkill,
} from '../api/orbs';
import type { OrbVisibility } from '../api/orbs';
import OrbGraph3D from '../components/graph/OrbGraph3D';
import OrbisStatsOverlay from '../components/graph/OrbisStatsOverlay';
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
import { getDocuments, confirmImport, getJob } from '../api/cv';
import GuidedTour from '../components/GuidedTour';
import type { DocumentMetadata } from '../api/cv';


const ALL_FILTERABLE_TYPES = ['Education', 'WorkExperience', 'Certification', 'Language', 'Publication', 'Project', 'Skill', 'Patent', 'Award', 'Outreach', 'Training'];

import SharePanel from '../components/graph/SharePanel';
import PendingConnectionsDropdown from '../components/graph/PendingConnectionsDropdown';


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
  const navigate = useNavigate();
  const location = useLocation();
  const [showInput, setShowInput] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [orbSearchValue, setOrbSearchValue] = useState('');
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_documents, setDocuments] = useState<DocumentMetadata[]>([]);
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
    profile: import('../api/cv').ExtractedProfile | null;
    unmatchedCount: number;
    unmatchedEntries: string[];
    skippedCount: number;
    file: File;
    documentId: string | null;
  } | null>(null);

  const [pendingReviewJobId, setPendingReviewJobId] = useState<string | null>(null);

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

  // Handle ?review=<job_id> deep link from email
  const reviewHandledRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const reviewJobId = params.get('review');
    if (reviewJobId) {
      reviewHandledRef.current = true;
      getJob(reviewJobId).then((job) => {
        if (job.status === 'succeeded' && job.result) {
          setExtractedImport({
            nodes: job.result.nodes,
            relationships: job.result.relationships || [],
            cvOwnerName: job.result.cv_owner_name || null,
            profile: job.result.profile || null,
            unmatchedCount: job.result.unmatched?.length || 0,
            unmatchedEntries: job.result.unmatched || [],
            skippedCount: job.result.skipped_nodes?.length || 0,
            file: new File([], job.filename || 'document'),
            documentId: job.result.document_id || null,
          });
          window.history.replaceState({}, '', '/myorbis');
        }
      }).catch(() => {
        // Job expired or not found — ignore silently
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Note: pending job detection removed — the email deep link (?review=)
  // handles the notification case. The banner is only shown when triggered
  // by an explicit import action within this session.

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
  const locationState = (location.state as { allowEmpty?: boolean; startTour?: boolean } | null) ?? null;
  const searchParams = new URLSearchParams(location.search);
  const allowEmpty = locationState?.allowEmpty === true || searchParams.has('discarded') || searchParams.has('review');
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
      Skill: 'skill', Patent: 'patent', Award: 'award', Outreach: 'outreach', Training: 'training',
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
    setImportStatus('Uploading document...');

    try {
      const { importDocument, getJob } = await import('../api/cv');
      const { job_id: importJobId } = await importDocument(file);

      // Poll the specific job by ID (not getCVProgress which may return an old job)
      setImportStatus('Processing — we\'ll email you when ready. Feel free to close this page.');
      const pollId = setInterval(async () => {
        try {
          const job = await getJob(importJobId);
          if (job.status === 'succeeded') {
            clearInterval(pollId);
            if (job.result && job.result.nodes.length > 0) {
              setExtractedImport({
                nodes: job.result.nodes,
                relationships: job.result.relationships || [],
                cvOwnerName: job.result.cv_owner_name || null,
                profile: job.result.profile || null,
                unmatchedCount: job.result.unmatched?.length || 0,
                unmatchedEntries: job.result.unmatched || [],
                skippedCount: job.result.skipped_nodes?.length || 0,
                file,
                documentId: job.result.document_id || null,
              });
            } else {
              addToast('No entries extracted from document.', 'error');
            }
            setImporting(false);
            setImportStatus('');
          } else if (job.status === 'failed') {
            clearInterval(pollId);
            addToast('Document processing failed. Please try again.', 'error');
            setImporting(false);
            setImportStatus('');
          } else if (job.status === 'running' || job.status === 'queued') {
            const msg = job.progress_detail || 'Processing your document...';
            setImportStatus(`${msg} We'll email you when ready.`);
          }
        } catch { /* ignore */ }
      }, 3000);
    } catch {
      addToast('Failed to upload document', 'error');
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

      {/* ── Pending CV review banner ── */}
      {pendingReviewJobId && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-purple-600/90 backdrop-blur-sm border border-purple-400/30 rounded-xl px-5 py-3 shadow-xl flex items-center gap-3">
          <p className="text-white text-sm">
            Your CV processing is complete! Review your extracted entries.
          </p>
          <button
            onClick={() => {
              getJob(pendingReviewJobId).then((job) => {
                if (job.result) {
                  setExtractedImport({
                    nodes: job.result.nodes,
                    relationships: job.result.relationships || [],
                    cvOwnerName: job.result.cv_owner_name || null,
                    profile: job.result.profile || null,
                    unmatchedCount: job.result.unmatched?.length || 0,
                    unmatchedEntries: job.result.unmatched || [],
                    skippedCount: job.result.skipped_nodes?.length || 0,
                    file: new File([], job.filename || 'document'),
                    documentId: job.result.document_id || null,
                  });
                }
                setPendingReviewJobId(null);
              }).catch(() => {
                setPendingReviewJobId(null);
              });
            }}
            className="h-8 px-4 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition-colors whitespace-nowrap"
          >
            Review now
          </button>
          <button
            onClick={() => setPendingReviewJobId(null)}
            className="text-white/50 hover:text-white"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className={`absolute left-0 right-0 z-[50] px-3 sm:px-5 py-2 sm:py-3 ${isPendingDeletion ? 'top-8' : 'top-0'}`}>
        <div className="rounded-xl border border-white/10 bg-black/45 backdrop-blur-md shadow-lg shadow-black/30">
          <div className="flex items-center justify-between gap-2 px-2.5 sm:px-3 py-2 min-h-[44px]">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-purple-400" />
                </div>
                <span className="text-white font-bold text-sm tracking-tight hidden sm:inline">OpenOrbis</span>
              </div>
              {/* Tools hamburger — visible below lg */}
              {!isPendingDeletion && (
                <div className="relative xl:hidden" ref={toolsMenuRef}>
                  <button
                    onClick={() => setShowToolsMenu((v) => !v)}
                    className="h-10 sm:h-8 leading-none flex items-center gap-1 text-xs font-medium py-1.5 px-3 sm:px-2 rounded-lg text-white/55 hover:text-white hover:bg-white/8 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    Tools
                  </button>

                  {showToolsMenu && (
                    <div className="absolute left-0 top-full mt-2 w-64 bg-neutral-950/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-3 space-y-2 z-50">
                      {/* Undo / Redo */}
                      <div className="flex items-center gap-1 mb-2">
                        <button
                          onClick={handleUndo}
                          disabled={undoStack.length === 0}
                          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2.5 sm:py-2 rounded-lg border transition-all ${
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
                          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2.5 sm:py-2 rounded-lg border transition-all ${
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
                      <NodeTypeFilter
                        hiddenTypes={hiddenNodeTypes}
                        onShowAll={handleShowAllNodeTypes}
                        onHideAll={handleHideAllNodeTypes}
                        onSetVisible={handleSetVisibleNodeTypes}
                        label="Node types"
                        fullWidth
                      />
                      <KeywordFilterDropdown label="Filters" fullWidth />
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
                        <span>{importing ? 'Processing...' : 'Import document'}</span>
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt"
                          className="hidden"
                          disabled={importing}
                          onChange={handleImportInputChange}
                        />
                      </label>
                      {/* Connections + Notes */}
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <PendingConnectionsDropdown label="Connection" fullWidth />
                        </div>
                        <button
                          onClick={() => { setShowDrafts(true); setShowToolsMenu(false); }}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border border-white/10 text-white/70 hover:text-purple-300 hover:border-purple-400/30 hover:bg-purple-500/10 transition-all"
                        >
                          <IconNotes />
                          Notes
                          {draftNotes.length > 0 && (
                            <span className="bg-purple-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                              {draftNotes.length}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!isPendingDeletion && (
                <div className="hidden xl:flex items-center gap-1.5 ml-2">
                  <div data-tour="node-types">
                    <NodeTypeFilter
                      hiddenTypes={hiddenNodeTypes}
                      onShowAll={handleShowAllNodeTypes}
                      onHideAll={handleHideAllNodeTypes}
                      onSetVisible={handleSetVisibleNodeTypes}
                    />
                  </div>
                  <div data-tour="keyword-filter">
                    <KeywordFilterDropdown />
                  </div>
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
                  {/* Undo / Redo */}
                  <div className="flex items-center">
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
                </div>
              )}
            </div>

            <div className="h-8 flex items-center gap-1">
              <ProcessingCounter />

              <div data-tour="connections" className="hidden xl:block">
                <PendingConnectionsDropdown />
              </div>

              <div data-tour="notes" className="hidden xl:block">
                <HeaderBtn onClick={() => setShowDrafts(true)} variant="outline">
                  <IconNotes />
                  <span>Notes</span>
                  {draftNotes.length > 0 && (
                    <span className="bg-purple-500 text-white text-[10px] font-bold leading-none w-4 h-4 rounded-full flex items-center justify-center">
                      {draftNotes.length}
                    </span>
                  )}
                </HeaderBtn>
              </div>
              <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" />
              <form
                data-tour="search-orbis-id"
                onSubmit={(e) => { e.preventDefault(); const v = orbSearchValue.trim(); if (v) { navigate(`/${v}`); setOrbSearchValue(''); } }}
                className="hidden sm:flex items-center"
              >
                <div className="flex items-center bg-white/10 border border-white/15 rounded-lg px-2.5 py-1.5 focus-within:border-purple-500/50 focus-within:bg-white/15 transition-all">
                  <svg className="w-3.5 h-3.5 text-white/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={orbSearchValue}
                    onChange={(e) => setOrbSearchValue(e.target.value)}
                    placeholder="Search Orbis ID..."
                    className="bg-transparent text-white text-xs placeholder-white/30 focus:outline-none ml-2 w-28 sm:w-36"
                  />
                </div>
              </form>
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
        <div className="fixed bottom-28 sm:bottom-36 left-1/2 z-20 pointer-events-none" style={{ transform: 'translateX(calc(-50% + min(45vw, 16rem)))' }}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-center"
          >
            <p className="text-white/50 text-sm mb-3 whitespace-nowrap">
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
          tooltipEnabled={!showToolsMenu && !showInput && !showShare && !showDiscoverUses && !showDrafts && !extractedImport && !showImportLimitWarning}
        />
      </div>
      {!isPendingDeletion && (
        <OrbisStatsOverlay
          data={data}
          filteredNodeIds={filteredNodeIds}
          hiddenNodeTypes={hiddenNodeTypes}
          onHighlight={setHighlightedNodeIds}
        />
      )}

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
        visibility={((data?.person?.visibility as OrbVisibility) || 'public')}
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
            visibility={((data?.person?.visibility as OrbVisibility) || 'public')}
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
            profile={extractedImport.profile}
            unmatchedCount={extractedImport.unmatchedCount}
            unmatchedEntries={extractedImport.unmatchedEntries}
            skippedCount={extractedImport.skippedCount}
            truncated={false}
            onReset={() => setExtractedImport(null)}
            resetLabel="Cancel import"
            onConfirm={async (nodes, rels, name, documentId, originalFilename, fileSizeBytes, pageCount, profile) => {
              await confirmImport(nodes, rels, name, documentId, originalFilename, fileSizeBytes, pageCount, profile);
              setExtractedImport(null);
              fetchDocuments();
            }}
            onComplete={async () => {
              if (!userId) return;
              try {
                const notes = await loadDraftNotesAsync(userId);
                setDraftNotes(notes);
              } catch { /* best effort */ }
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
