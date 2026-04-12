import { useState, useCallback, useEffect, useRef } from 'react';
import { uploadCV, getCVProgress, getDocuments, discardCVProgress } from '../../api/cv';
import type { ExtractedData, ExtractedProfile, ExtractedRelationship, CVProgressData } from '../../api/cv';
import { useAuthStore } from '../../stores/authStore';
import { loadDraftNotes, saveDraftNotes } from '../drafts/DraftNotes';
import ExtractedDataReview from './ExtractedDataReview';

export default function CVUploadOnboarding() {
  const { user } = useAuthStore();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processingUiActive, setProcessingUiActive] = useState(false);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [progressData, setProgressData] = useState<CVProgressData | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const activeUploadRunRef = useRef(0);
  const isProcessing = uploading && processingUiActive;

  useEffect(() => {
    return () => {
      uploadAbortControllerRef.current?.abort();
    };
  }, []);

  // Poll progress while uploading
  useEffect(() => {
    if (!isProcessing) {
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
  }, [isProcessing]);

  const [extractedData, setExtractedData] = useState<{
    nodes: ExtractedData['nodes'];
    relationships: ExtractedRelationship[];
    cvOwnerName: string | null;
    profile: ExtractedProfile | null;
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

  const resetToUploadStep = useCallback(() => {
    // Invalidate any in-flight upload response so it won't overwrite UI state.
    activeUploadRunRef.current += 1;
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = null;
    void discardCVProgress().catch(() => {
      // Keep UI reset even if backend discard call fails.
    });
    setProcessingUiActive(false);
    setUploading(false);
    setProgressData(null);
    setError('');
    setErrorDetails('');
    setShowTechDetails(false);
    setShowLimitWarning(false);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Hard reset on page load/refresh: never restore in-progress CV processing in onboarding.
  useEffect(() => {
    resetToUploadStep();
  }, [resetToUploadStep]);

  // Also reset when the page is restored from browser cache/history.
  useEffect(() => {
    const onPageShow = () => {
      resetToUploadStep();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [resetToUploadStep]);

  const doUpload = useCallback(async (file: File) => {
    const runId = activeUploadRunRef.current + 1;
    activeUploadRunRef.current = runId;
    uploadAbortControllerRef.current?.abort();
    const controller = new AbortController();
    uploadAbortControllerRef.current = controller;
    setProcessingUiActive(true);
    setUploading(true);
    setError('');
    setErrorDetails('');
    setShowTechDetails(false);
    try {
      const data = await uploadCV(file, controller.signal);
      if (runId !== activeUploadRunRef.current) return;

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
          profile: data.profile || null,
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
      if (runId !== activeUploadRunRef.current) return;
      setError('Failed to parse CV. Please try again or use manual entry.');
      setErrorDetails(e instanceof Error ? e.message : 'Unknown upload error');
    } finally {
      if (runId === activeUploadRunRef.current) {
        setProcessingUiActive(false);
        setUploading(false);
      }
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

  const handleBackToUpload = useCallback(() => {
    resetToUploadStep();
  }, [resetToUploadStep]);

  // ── Review mode (shared component) ──
  if (extractedData) {
    return (
      <ExtractedDataReview
        initialNodes={extractedData.nodes}
        initialRelationships={extractedData.relationships}
        cvOwnerName={extractedData.cvOwnerName}
        profile={extractedData.profile}
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
        <OnboardingStages current="review" />
      </ExtractedDataReview>
    );
  }

  // ── Upload mode ──
  return (
    <div className="min-h-screen bg-black flex flex-col items-center px-3 sm:px-4 pb-28">
      <div className="w-full max-w-[95vw] sm:max-w-xl my-auto">
        <OnboardingStages current={isProcessing ? 'process' : 'upload'} />

        <div className="text-center mt-6 mb-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-white text-xl font-semibold">Import from your CV</h2>
          <p className="text-white/30 text-sm mt-1">Upload a CV and review extracted entries before getting your orbis.</p>
        </div>

        {/* Dropzone */}
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`block rounded-2xl text-center transition-all ${
            isProcessing
              ? 'border border-white/10 bg-white/[0.03] px-4 py-6 sm:px-6 sm:py-8 cursor-default'
              : `border-2 border-dashed p-6 sm:p-12 cursor-pointer ${
                  dragOver
                    ? 'border-purple-500/60 bg-purple-500/10'
                    : 'border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.04]'
                }`
          }`}
        >
          {isProcessing ? (
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
            disabled={isProcessing}
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
                    disabled={!lastFile || isProcessing}
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
        <div className={`w-full max-w-[95vw] sm:max-w-xl mx-auto flex items-center gap-3 ${isProcessing ? 'justify-between' : 'justify-end'}`}>
          {isProcessing && (
            <button
              type="button"
              onClick={handleBackToUpload}
              className="border border-white/15 hover:border-white/30 text-white/65 hover:text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
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
  { key: 'publish', label: 'Get your orbis' },
];

function OnboardingStages({ current }: { current: 'upload' | 'process' | 'review' | 'publish' }) {
  const currentIdx = STAGES.findIndex((s) => s.key === current);
  return (
    <div className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="grid grid-cols-4 items-center">
        {STAGES.map((stage, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <div key={stage.key} className="relative flex items-center justify-center gap-2 min-w-0">
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
              <span className={`text-xs truncate ${active ? 'text-white' : done ? 'text-white/70' : 'text-white/35'}`}>
                {stage.label}
              </span>
              {idx < STAGES.length - 1 && (
                <span className="hidden sm:block absolute -right-1 text-white/15 pointer-events-none">→</span>
              )}
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
  { key: 'parsing_response', label: 'Building your orbis' },
];

function ProgressSteps({ progress }: { progress: CVProgressData | null }) {
  const currentStep = progress?.step || 'reading_pdf';
  const detail = progress?.detail || progress?.message || '';

  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  const completedSteps = currentStep === 'done'
    ? STEPS.length
    : currentIdx >= 0
      ? currentIdx
      : 0;
  const currentStepLabel = currentStep === 'done'
    ? 'Ready to review'
    : STEPS.find((s) => s.key === currentStep)?.label || 'Working...';
  const statusText = detail || currentStepLabel;

  // Smooth progress: 50% → 99% over 7 minutes during classifying/parsing
  const [classifyStart, setClassifyStart] = useState<number | null>(null);
  const [smoothExtra, setSmoothExtra] = useState(0);
  const prevStep = useRef(currentStep);

  useEffect(() => {
    if (prevStep.current !== currentStep) {
      prevStep.current = currentStep;
      if (currentStep === 'classifying' || currentStep === 'parsing_response') {
        if (!classifyStart) setClassifyStart(Date.now());
      } else {
        setClassifyStart(null);
        setSmoothExtra(0);
      }
    }
  }, [currentStep, classifyStart]);

  useEffect(() => {
    if (!classifyStart || currentStep === 'done') return;
    const maxMs = 7 * 60 * 1000; // 7 minutes
    const maxExtra = 49; // 50% → 99%
    const timer = setInterval(() => {
      const elapsed = Date.now() - classifyStart;
      const progress = Math.min(elapsed / maxMs, 1);
      // Ease-out curve so it starts faster and slows down
      const eased = 1 - Math.pow(1 - progress, 2);
      setSmoothExtra(Math.round(eased * maxExtra));
    }, 1000);
    return () => clearInterval(timer);
  }, [classifyStart, currentStep]);

  const basePercent = currentStep === 'done'
    ? 100
    : Math.round((completedSteps / STEPS.length) * 100);
  const displayPercent = currentStep === 'done'
    ? 100
    : Math.min(basePercent + (currentStep === 'classifying' || currentStep === 'parsing_response' ? smoothExtra : 0), 99);

  return (
    <div className="w-full max-w-md mx-auto rounded-xl border border-white/10 bg-black/20 px-4 py-4 sm:px-5 sm:py-5">
      <div className="text-left">
        <p className="text-sm font-semibold text-white">Processing your CV</p>
        <p className="text-[11px] text-white/45 mt-0.5">We are preparing your orbis from the uploaded document.</p>
        <p className="text-[10px] text-white/30 mt-1 italic">Processing time varies depending on the length of your CV.</p>
      </div>

      {/* Steps */}
      <div className="mt-4 space-y-2.5 text-left">
        {STEPS.map((step, i) => {
          const isDone = i < currentIdx || currentStep === 'done';
          const isCurrent = i === currentIdx && currentStep !== 'done';

          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${
                isCurrent ? 'border border-purple-500/25 bg-purple-500/10' : 'border border-transparent'
              }`}
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {isDone ? (
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isCurrent ? (
                  <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <div className="w-3 h-3 rounded-full bg-white/10" />
                )}
              </div>
              {/* Label */}
              <span className={`text-sm ${
                isDone ? 'text-white/60' :
                isCurrent ? 'text-white font-medium' :
                'text-white/35'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-purple-500 via-fuchsia-500 to-emerald-400"
            style={{
              width: `${displayPercent}%`,
            }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-white/45 text-[11px]">{displayPercent}%</span>
          <span className="text-white/45 text-[11px]">{completedSteps}/{STEPS.length} steps completed</span>
        </div>
        <p className="mt-2 text-[11px] text-purple-200 font-medium text-right">
          {statusText}
        </p>
      </div>
    </div>
  );
}
