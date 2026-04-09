import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadCV, getCVProgress, getDocuments } from '../../api/cv';
import type { ExtractedData, ExtractedRelationship, CVProgressData } from '../../api/cv';
import { useAuthStore } from '../../stores/authStore';
import { loadDraftNotes, saveDraftNotes } from '../drafts/DraftNotes';
import ExtractedDataReview from './ExtractedDataReview';

export default function CVUploadOnboarding() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [progressData, setProgressData] = useState<CVProgressData | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll progress while uploading
  useEffect(() => {
    if (!uploading) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const poll = async () => {
      try {
        const data = await getCVProgress();
        setProgressData(data);
      } catch { /* ignore */ }
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [uploading]);

  const [extractedData, setExtractedData] = useState<{
    nodes: ExtractedData['nodes'];
    relationships: ExtractedRelationship[];
    cvOwnerName: string | null;
    unmatchedCount: number;
    skippedCount: number;
    truncated: boolean;
    documentId: string | null;
    originalFilename: string | null;
    fileSizeBytes: number | null;
    pageCount: number | null;
  } | null>(null);

  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [oldestDoc, setOldestDoc] = useState<{ name: string; date: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const doUpload = useCallback(async (file: File) => {
    setUploading(true);
    setError('');
    setErrorDetails('');
    setShowTechDetails(false);
    try {
      const data = await uploadCV(file);

      let unmatchedCount = 0;
      if (data.unmatched && data.unmatched.length > 0 && user?.user_id) {
        const existing = loadDraftNotes(user.user_id);
        const newNotes = data.unmatched.map((text: string) => ({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          text: `[From CV] ${text}`,
          createdAt: Date.now(),
          fromVoice: false,
        }));
        saveDraftNotes(user.user_id, [...newNotes, ...existing]);
        unmatchedCount = data.unmatched.length;
      }

      if (data.nodes.length === 0 && (!data.unmatched || data.unmatched.length === 0)) {
        setError('No entries could be extracted from this file. Try a different CV or use manual entry.');
      } else {
        setExtractedData({
          nodes: data.nodes,
          relationships: data.relationships || [],
          cvOwnerName: data.cv_owner_name || null,
          unmatchedCount,
          skippedCount: data.skipped_nodes?.length || 0,
          truncated: data.truncated || false,
          documentId: data.document_id || null,
          originalFilename: file.name,
          fileSizeBytes: file.size,
          pageCount: null,
        });
      }
    } catch (e) {
      setError('Failed to parse CV. Please try again or use manual entry.');
      setErrorDetails(e instanceof Error ? e.message : 'Unknown upload error');
    } finally {
      setUploading(false);
    }
  }, [user]);

  const handleFile = useCallback(async (file: File) => {
    setLastFile(file);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf') {
      setError('Please upload a PDF file.');
      setErrorDetails(`Unsupported file extension: .${ext || 'unknown'}`);
      return;
    }

    // Check document limit
    try {
      const docs = await getDocuments();
      if (docs.length >= 3) {
        const oldest = docs[docs.length - 1]; // list is ordered desc, last = oldest
        setOldestDoc({
          name: oldest.original_filename,
          date: new Date(oldest.uploaded_at).toLocaleDateString(),
        });
        setPendingFile(file);
        setShowLimitWarning(true);
        return;
      }
    } catch {
      // If check fails, proceed anyway — cap is also enforced server-side
    }

    await doUpload(file);
  }, [doUpload]);

  const handleLimitConfirm = useCallback(async () => {
    setShowLimitWarning(false);
    if (pendingFile) {
      await doUpload(pendingFile);
      setPendingFile(null);
    }
  }, [pendingFile, doUpload]);

  const handleRetry = useCallback(async () => {
    if (!lastFile || uploading) return;
    await doUpload(lastFile);
  }, [lastFile, uploading, doUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Review mode (shared component) ──
  if (extractedData) {
    return (
      <ExtractedDataReview
        initialNodes={extractedData.nodes}
        initialRelationships={extractedData.relationships}
        cvOwnerName={extractedData.cvOwnerName}
        unmatchedCount={extractedData.unmatchedCount}
        skippedCount={extractedData.skippedCount}
        truncated={extractedData.truncated}
        onReset={() => setExtractedData(null)}
        resetLabel="Try another file"
        documentId={extractedData.documentId}
        originalFilename={extractedData.originalFilename}
        fileSizeBytes={extractedData.fileSizeBytes}
        pageCount={extractedData.pageCount}
      >
        <div className="mt-4">
          <OnboardingStages current="review" />
        </div>
      </ExtractedDataReview>
    );
  }

  // ── Upload mode ──
  return (
    <div className="min-h-screen bg-black flex flex-col items-center px-3 sm:px-4 py-8 pb-28">
      <div className="w-full max-w-[95vw] sm:max-w-xl">
        <OnboardingStages current={uploading ? 'process' : 'upload'} />

        <div className="text-center mt-6 mb-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-white text-xl font-semibold">Import from your CV</h2>
          <p className="text-white/30 text-sm mt-1">Upload a CV and review extracted entries before publishing to your orbis.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55 mb-1">Import behavior</p>
            <p className="text-xs text-white/35 leading-relaxed">
              Entries are reviewed first, then merged into your orbis when you confirm.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55 mb-1">Storage policy</p>
            <p className="text-xs text-white/35 leading-relaxed">
              If you already have 3 documents, we ask confirmation before replacing the oldest one.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200">You can continue later</span>
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-200">Processing can continue in background</span>
        </div>

        {/* Dropzone */}
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`block border-2 border-dashed rounded-2xl p-6 sm:p-12 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-purple-500/60 bg-purple-500/10'
              : 'border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.04]'
          }`}
        >
          {uploading ? (
            <ProgressSteps progress={progressData} />
          ) : (
            <>
              <svg className="w-10 h-10 mx-auto text-white/15 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-white/70 text-sm mb-1 font-medium">
                Click to browse or drag and drop your CV
              </p>
              <div className="flex items-center justify-center gap-2 text-[11px] text-white/35">
                <span className="rounded-full border border-white/10 px-2 py-0.5">Format: PDF</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5">Size: up to 10MB</span>
              </div>
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-center gap-2">
                <svg className="w-8 h-8 text-[#0A66C2] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                <span className="text-white/30 text-[11px] leading-snug text-left">
                  Tip: Export your LinkedIn profile as PDF: <span className="text-white/50">View profile</span> → <span className="text-white/50">Resources</span> → <span className="text-white/50">Save as PDF</span>.
                </span>
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileInput}
            className="hidden"
            disabled={uploading}
          />
        </label>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-3">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-red-300 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="text-red-200 text-sm font-medium">{error}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={!lastFile || uploading}
                    className="rounded-md border border-red-400/40 bg-red-500/20 px-2.5 py-1 text-xs text-red-100 disabled:opacity-40"
                  >
                    Retry
                  </button>
                  {errorDetails && (
                    <button
                      type="button"
                      onClick={() => setShowTechDetails((prev) => !prev)}
                      className="text-xs text-red-200/80 hover:text-red-100"
                    >
                      {showTechDetails ? 'Hide technical details' : 'Show technical details'}
                    </button>
                  )}
                </div>
                {showTechDetails && errorDetails && (
                  <pre className="mt-2 text-[11px] text-red-100/80 bg-black/30 border border-red-400/20 rounded p-2 overflow-x-auto">{errorDetails}</pre>
                )}
              </div>
            </div>
          </div>
        )}

        {showLimitWarning && (
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
                    You already have 3 documents stored. Uploading this file will remove the oldest document
                    {oldestDoc && (
                      <> (<span className="text-white font-medium">{oldestDoc.name}</span>, uploaded {oldestDoc.date})</>
                    )}.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-5">
                <button
                  onClick={() => { setShowLimitWarning(false); setPendingFile(null); }}
                  className="border border-white/10 text-white/60 hover:text-white hover:bg-white/5 font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLimitConfirm}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors cursor-pointer"
                >
                  Replace &amp; upload
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky actions */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-black/90 backdrop-blur px-3 py-3">
        <div className="w-full max-w-[95vw] sm:max-w-xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/create')}
            className="border border-white/15 hover:border-white/30 text-white/65 hover:text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Progress steps display ──

const STAGES = [
  { key: 'upload', label: 'Upload' },
  { key: 'process', label: 'Process' },
  { key: 'review', label: 'Review' },
  { key: 'publish', label: 'Publish' },
];

function OnboardingStages({ current }: { current: 'upload' | 'process' | 'review' | 'publish' }) {
  const currentIdx = STAGES.findIndex((s) => s.key === current);
  return (
    <div className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto">
        {STAGES.map((stage, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <div key={stage.key} className="flex items-center gap-2 shrink-0">
              <div
                className={`w-5 h-5 rounded-full border text-[10px] font-semibold flex items-center justify-center ${
                  done
                    ? 'bg-green-500/20 border-green-500/40 text-green-300'
                    : active
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                      : 'bg-white/[0.03] border-white/15 text-white/40'
                }`}
              >
                {done ? '✓' : idx + 1}
              </div>
              <span className={`text-xs ${active ? 'text-white' : done ? 'text-white/70' : 'text-white/35'}`}>
                {stage.label}
              </span>
              {idx < STAGES.length - 1 && <span className="text-white/15">→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STEPS = [
  { key: 'reading_pdf', label: 'Reading PDF' },
  { key: 'extracting_text', label: 'Extracting text' },
  { key: 'classifying', label: 'Classifying entries' },
  { key: 'parsing_response', label: 'Building graph' },
];

function ProgressSteps({ progress }: { progress: CVProgressData | null }) {
  const currentStep = progress?.step || 'reading_pdf';
  const percent = progress?.percent || 5;
  const detail = progress?.detail || progress?.message || '';

  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  const completedChecks = currentStep === 'done'
    ? STEPS.length
    : currentIdx >= 0
      ? currentIdx
      : 0;

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="w-full max-w-xs flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-white/45">Processing state</span>
        <span className="text-[11px] text-purple-300 font-medium">{detail || 'Working...'}</span>
      </div>

      {/* Steps */}
      <div className="w-full max-w-xs space-y-2">
        {STEPS.map((step, i) => {
          const isDone = i < currentIdx || currentStep === 'done';
          const isCurrent = i === currentIdx && currentStep !== 'done';
          const isPending = i > currentIdx && currentStep !== 'done';

          return (
            <div key={step.key} className="flex items-center gap-3">
              {/* Icon */}
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {isDone ? (
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isCurrent ? (
                  <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                ) : isPending ? (
                  <div className="w-3 h-3 rounded-full bg-white/10" />
                ) : null}
              </div>
              {/* Label */}
              <span className={`text-sm ${
                isDone ? 'text-white/40' :
                isCurrent ? 'text-white font-medium' :
                'text-white/20'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs">
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${percent}%`,
              background: percent >= 90
                ? 'linear-gradient(to right, #a855f6, #22c55e)'
                : 'linear-gradient(to right, #7c3aed, #a855f6)',
            }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-white/20 text-[10px]">{percent}%</span>
          <span className="text-white/20 text-[10px]">{completedChecks}/{STEPS.length} checks completed</span>
        </div>
      </div>
    </div>
  );
}
