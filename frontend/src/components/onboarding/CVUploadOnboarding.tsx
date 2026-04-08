import { useState, useCallback, useEffect, useRef } from 'react';
import { uploadCV, getCVProgress } from '../../api/cv';
import type { ExtractedData, ExtractedRelationship, CVProgressData } from '../../api/cv';
import { useAuthStore } from '../../stores/authStore';
import { loadDraftNotes, saveDraftNotes } from '../drafts/DraftNotes';
import ExtractedDataReview from './ExtractedDataReview';

export default function CVUploadOnboarding() {
  const { user } = useAuthStore();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [progressData, setProgressData] = useState<CVProgressData | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf') {
      setError('Please upload a PDF file.');
      return;
    }

    setUploading(true);
    setError('');
    try {
      const data = await uploadCV(file);

      // Save unmatched entries to draft notes (user-scoped)
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
        });
      }
    } catch {
      setError('Failed to parse CV. Please try again or use manual entry.');
    } finally {
      setUploading(false);
    }
  }, [user]);

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
      />
    );
  }

  // ── Upload mode ──
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-3 sm:px-4">
      <div className="w-full max-w-[95vw] sm:max-w-lg">
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-white text-xl font-semibold">Import from your CV</h2>
          <p className="text-white/30 text-sm mt-1">Upload a PDF and we'll extract your entries automatically.</p>
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
              <p className="text-white/50 text-sm mb-1">
                <span className="text-purple-400 font-medium">Click to browse</span> or drag & drop
              </p>
              <p className="text-white/20 text-xs">PDF only, up to 10MB</p>
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-center gap-2">
                <svg className="w-8 h-8 text-[#0A66C2] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                <span className="text-white/30 text-[11px] leading-snug">
                  Tip: If your LinkedIn profile is up to date, you can export it as a PDF. Go to <span className="text-white/50">View my profile</span> &rarr; <span className="text-white/50">Resources</span> &rarr; <span className="text-white/50">Save as PDF</span>, then upload it here.
                </span>
              </div>
            </>
          )}
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileInput}
            className="hidden"
            disabled={uploading}
          />
        </label>

        {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}
      </div>
    </div>
  );
}

// ── Progress steps display ──

const STEPS = [
  { key: 'reading_pdf', label: 'Reading PDF' },
  { key: 'extracting_text', label: 'Extracting text' },
  { key: 'classifying', label: 'Classifying entries' },
  { key: 'parsing_response', label: 'Building graph' },
];

function ProgressSteps({ progress }: { progress: CVProgressData | null }) {
  const currentStep = progress?.step || 'reading_pdf';
  const percent = progress?.percent || 5;
  const detail = progress?.detail || '';
  const elapsed = progress?.elapsed_seconds || 0;

  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  const formatTime = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  return (
    <div className="flex flex-col items-center gap-4 py-2">
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
          <span className="text-white/20 text-[10px]">{formatTime(elapsed)}</span>
        </div>
      </div>

      {/* Detail */}
      {detail && (
        <p className="text-white/30 text-xs text-center">{detail}</p>
      )}
    </div>
  );
}
