import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { uploadCV, confirmCV } from '../../api/cv';
import type { ExtractedData, ExtractedRelationship } from '../../api/cv';
import { NODE_TYPE_COLORS, NODE_TYPE_LABELS } from '../graph/NodeColors';
import NodeForm from '../editor/NodeForm';

export default function CVUploadOnboarding() {
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [extractedNodes, setExtractedNodes] = useState<ExtractedData['nodes'] | null>(null);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [relationships, setRelationships] = useState<ExtractedRelationship[]>([]);
  const [cvOwnerName, setCvOwnerName] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

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

      // Save unmatched entries to draft notes
      if (data.unmatched && data.unmatched.length > 0) {
        const existing = JSON.parse(localStorage.getItem('orbis-draft-notes') || '[]');
        const newNotes = data.unmatched.map((text: string) => ({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          text: `[From CV] ${text}`,
          createdAt: Date.now(),
          fromVoice: false,
        }));
        localStorage.setItem('orbis-draft-notes', JSON.stringify([...newNotes, ...existing]));
        setUnmatchedCount(data.unmatched.length);
      }

      setSkippedCount(data.skipped_nodes?.length || 0);
      setTruncated(data.truncated || false);
      setRelationships(data.relationships || []);
      setCvOwnerName(data.cv_owner_name || null);

      if (data.nodes.length === 0 && (!data.unmatched || data.unmatched.length === 0)) {
        setError('No entries could be extracted from this file. Try a different CV or use manual entry.');
      } else {
        setExtractedNodes(data.nodes);
      }
    } catch {
      setError('Failed to parse CV. Please try again or use manual entry.');
    } finally {
      setUploading(false);
    }
  }, []);

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

  const removeNode = (index: number) => {
    if (!extractedNodes) return;
    setExtractedNodes(extractedNodes.filter((_, i) => i !== index));
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

  const handleConfirm = async () => {
    if (!extractedNodes || extractedNodes.length === 0) return;
    setConfirming(true);
    try {
      await confirmCV(extractedNodes, relationships, cvOwnerName);
      navigate('/orb');
    } catch {
      setError('Failed to save entries. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  // ── Review mode ──
  if (extractedNodes) {
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
                                  if (!prev) return prev;
                                  const updated = [...prev];
                                  updated[index] = { node_type: nodeType, properties: newProps };
                                  return updated;
                                });
                                setEditingIndex(null);
                              }}
                              onCancel={() => setEditingIndex(null)}
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

          <div className="flex gap-3 justify-center">
            <button
              onClick={handleConfirm}
              disabled={confirming || extractedNodes.length === 0}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-xl shadow-purple-600/20 text-base"
            >
              {confirming ? 'Adding...' : `Add ${extractedNodes.length} entries to graph`}
            </button>
            <button
              onClick={() => setExtractedNodes(null)}
              className="border border-white/10 text-white/40 hover:text-white/70 font-medium py-3 px-6 rounded-xl transition-colors text-base"
            >
              Try another file
            </button>
          </div>
        </div>
      </div>
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
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-white/50 text-sm">Parsing your CV...</p>
            </div>
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
