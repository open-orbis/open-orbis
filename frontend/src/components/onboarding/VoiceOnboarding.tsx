import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { voiceTranscribe, voiceClassify, confirmCV } from '../../api/cv';
import type { ExtractedData } from '../../api/cv';
import { NODE_TYPE_COLORS, NODE_TYPE_LABELS } from '../graph/NodeColors';

const QUESTIONS = [
  { question: "Tell me about yourself — what's your name and what do you do?", emoji: '👤' },
  { question: "What's your current role? Where do you work and since when?", emoji: '💼' },
  { question: 'Tell me about your previous work experience.', emoji: '📋' },
  { question: 'What about your education?', emoji: '🎓' },
  { question: 'What are your main skills and technologies?', emoji: '⚡' },
  { question: 'Do you speak any languages besides English?', emoji: '🌍' },
  { question: 'Any certifications, patents, or publications?', emoji: '📜' },
  { question: "Anything else you'd like to add? Projects, hobbies, achievements?", emoji: '✨' },
];

type Phase = 'recording' | 'reviewing' | 'confirming';

interface Transcript {
  questionIndex: number;
  text: string;
}

export default function VoiceOnboarding() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('recording');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const currentQ = QUESTIONS[questionIndex];
  const isDone = questionIndex >= QUESTIONS.length;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size < 100) {
          setError('Recording was too short. Try again.');
          return;
        }
        await handleTranscribe(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError('Microphone access denied. Please allow microphone permissions.');
    }
  }, [questionIndex]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, []);

  const handleTranscribe = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const text = await voiceTranscribe(blob);
      if (!text || !text.trim()) {
        setError("Couldn't hear anything. Try speaking louder or closer to the mic.");
        setTranscribing(false);
        return;
      }
      // Save transcript
      setTranscripts((prev) => [...prev, { questionIndex, text }]);
      // Move to next question
      const next = questionIndex + 1;
      setQuestionIndex(next);
    } catch {
      setError('Transcription failed. Please try again.');
    } finally {
      setTranscribing(false);
    }
  };

  const skipQuestion = () => {
    setQuestionIndex((prev) => prev + 1);
    setError('');
  };

  // When all questions are done, classify
  const handleClassify = async () => {
    const fullText = transcripts.map((t) => {
      const q = QUESTIONS[t.questionIndex];
      return `Question: ${q.question}\nAnswer: ${t.text}`;
    }).join('\n\n');

    if (!fullText.trim()) {
      navigate('/orb');
      return;
    }

    setClassifying(true);
    setPhase('reviewing');
    try {
      const data = await voiceClassify(fullText);

      // Save unmatched to draft notes
      if (data.unmatched && data.unmatched.length > 0) {
        const existing = JSON.parse(localStorage.getItem('orbis-draft-notes') || '[]');
        const newNotes = data.unmatched.map((text: string) => ({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          text: `[From voice] ${text}`,
          createdAt: Date.now(),
          fromVoice: true,
        }));
        localStorage.setItem('orbis-draft-notes', JSON.stringify([...newNotes, ...existing]));
      }

      if (data.nodes.length === 0) {
        navigate('/orb');
        return;
      }

      setExtractedData(data);
    } catch {
      setError('Failed to analyze your answers. Please try again.');
      setPhase('recording');
    } finally {
      setClassifying(false);
    }
  };

  const handleConfirm = async () => {
    if (!extractedData || extractedData.nodes.length === 0) return;
    setConfirming(true);
    try {
      await confirmCV(extractedData.nodes);
      navigate('/orb');
    } catch {
      setError('Failed to save entries. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const removeNode = (index: number) => {
    if (!extractedData) return;
    setExtractedData({
      ...extractedData,
      nodes: extractedData.nodes.filter((_, i) => i !== index),
    });
  };

  // ── Review phase ──
  if (phase === 'reviewing' && extractedData) {
    const grouped = extractedData.nodes.reduce<Record<string, Array<{ index: number; props: Record<string, unknown> }>>>((acc, node, i) => {
      if (!acc[node.node_type]) acc[node.node_type] = [];
      acc[node.node_type].push({ index: i, props: node.properties });
      return acc;
    }, {});

    return (
      <div className="min-h-screen bg-black flex flex-col items-center px-4 py-12">
        <div className="w-full max-w-[95vw] sm:max-w-2xl">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-white text-xl font-semibold">
              Found {extractedData.nodes.length} entries from your voice
            </h2>
            <p className="text-white/30 text-sm mt-1">Review and remove any you don't want, then add them to your orb.</p>
            {extractedData.unmatched.length > 0 && (
              <p className="text-amber-400/80 text-xs mt-2">
                {extractedData.unmatched.length} item{extractedData.unmatched.length > 1 ? 's' : ''} added to Draft Notes for manual review.
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
                      const title = (props.name || props.title || props.company || props.institution || 'Untitled') as string;
                      const subtitle = (props.company || props.degree || props.issuing_organization || props.category || '') as string;
                      return (
                        <motion.div
                          key={index}
                          layout
                          className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 group"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-white/80 text-sm font-medium truncate">{title}</div>
                            {subtitle && subtitle !== title && (
                              <div className="text-white/30 text-xs truncate">{subtitle}</div>
                            )}
                          </div>
                          <button
                            onClick={() => removeNode(index)}
                            className="text-white/15 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
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
              disabled={confirming || extractedData.nodes.length === 0}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-xl shadow-purple-600/20"
            >
              {confirming ? 'Adding...' : `Add ${extractedData.nodes.length} entries to graph`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Classifying phase ──
  if (classifying) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-6" />
        <p className="text-white/60 text-lg">Analyzing your answers...</p>
        <p className="text-white/30 text-sm mt-2">Matching entries to your knowledge graph</p>
      </div>
    );
  }

  // ── Recording phase ──
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg flex flex-col items-center">

        {/* Progress */}
        <div className="w-full mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/30 text-xs font-medium">
              {isDone ? 'All done!' : `Question ${questionIndex + 1} of ${QUESTIONS.length}`}
            </span>
            <span className="text-white/20 text-xs">
              {transcripts.length} answered
            </span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
              animate={{ width: `${(questionIndex / QUESTIONS.length) * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Question card */}
        {!isDone && currentQ && (
          <AnimatePresence mode="wait">
            <motion.div
              key={questionIndex}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="text-center mb-10"
            >
              <span className="text-4xl mb-4 block">{currentQ.emoji}</span>
              <h2 className="text-white text-2xl sm:text-3xl font-semibold leading-snug max-w-md mx-auto">
                {currentQ.question}
              </h2>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Last transcript preview */}
        {transcripts.length > 0 && !isDone && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 max-w-md w-full"
          >
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3">
              <p className="text-white/20 text-[10px] uppercase tracking-widest mb-1">Your last answer</p>
              <p className="text-white/50 text-sm leading-relaxed line-clamp-2">
                "{transcripts[transcripts.length - 1].text}"
              </p>
            </div>
          </motion.div>
        )}

        {/* Mic button */}
        {!isDone && (
          <div className="flex flex-col items-center gap-4">
            {transcribing ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-white/50 text-sm">Transcribing...</p>
              </div>
            ) : (
              <>
                <button
                  onClick={recording ? stopRecording : startRecording}
                  disabled={transcribing}
                  className="group relative"
                >
                  {/* Outer pulsing ring when recording */}
                  {recording && (
                    <motion.div
                      className="absolute inset-0 rounded-full bg-red-500/20"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      style={{ margin: '-12px' }}
                    />
                  )}
                  <div className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                    recording
                      ? 'bg-red-500 shadow-lg shadow-red-500/40'
                      : 'bg-red-500/80 hover:bg-red-500 shadow-lg shadow-red-500/20 hover:shadow-red-500/40 hover:scale-105'
                  }`}>
                    {recording ? (
                      <div className="w-6 h-6 bg-white rounded-sm" />
                    ) : (
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                  </div>
                </button>
                <p className="text-white/30 text-sm">
                  {recording ? 'Tap to stop' : 'Tap to speak'}
                </p>
              </>
            )}

            {/* Skip button */}
            {!recording && !transcribing && (
              <button
                onClick={skipQuestion}
                className="text-white/20 hover:text-white/50 text-xs font-medium transition-colors mt-2"
              >
                Skip this question →
              </button>
            )}
          </div>
        )}

        {/* Done — classify */}
        {isDone && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <span className="text-5xl mb-6 block">🎉</span>
            <h2 className="text-white text-2xl font-semibold mb-2">Great job!</h2>
            <p className="text-white/40 text-sm mb-8">
              You answered {transcripts.length} of {QUESTIONS.length} questions.
              {transcripts.length === 0
                ? " Let's skip to your orb."
                : " Let's analyze your answers and build your graph."}
            </p>
            <button
              onClick={handleClassify}
              className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-10 rounded-xl transition-all shadow-xl shadow-purple-600/20 text-lg"
            >
              {transcripts.length === 0 ? 'Go to My Orb' : 'Build My Graph'}
            </button>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-red-400 text-sm text-center mt-4"
          >
            {error}
          </motion.p>
        )}
      </div>
    </div>
  );
}
