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

type Phase = 'recording' | 'transcribing' | 'editing' | 'classifying' | 'reviewing';

export default function VoiceOnboarding() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('recording');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState('');

  // Single continuous recording — chunks accumulate the whole session
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const hasRecordedRef = useRef(false);

  // Transcription & editing
  const [fullTranscript, setFullTranscript] = useState('');
  const [transcribeProgress, setTranscribeProgress] = useState(0);

  // Classification & review
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [confirming, setConfirming] = useState(false);

  const currentQ = QUESTIONS[questionIndex];
  const isDone = questionIndex >= QUESTIONS.length;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // Audio analyser for voice visualization
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const sampleVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const normalized = Math.min(1, (sum / dataArray.length) / 100);
        setAudioLevel(normalized);
        rafRef.current = requestAnimationFrame(sampleVolume);
      };
      rafRef.current = requestAnimationFrame(sampleVolume);

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(1000); // collect data every second for smooth blob building
      setRecording(true);
      setPaused(false);
      hasRecordedRef.current = true;
    } catch {
      setError('Microphone access denied. Please allow microphone permissions.');
    }
  }, []);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
      setPaused(true);
      setAudioLevel(0);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'paused') {
      recorder.resume();
      setPaused(false);
    }
  }, []);

  const toggleMic = useCallback(() => {
    if (!recording) {
      startRecording();
    } else if (paused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  }, [recording, paused, startRecording, pauseRecording, resumeRecording]);

  // Next question — does NOT stop recording
  const handleNextQuestion = useCallback(() => {
    setQuestionIndex((prev) => prev + 1);
    setError('');
  }, []);

  // Skip — does NOT stop recording
  const skipQuestion = useCallback(() => {
    setQuestionIndex((prev) => prev + 1);
    setError('');
  }, []);

  // Stop recording and get the full blob
  const stopAndGetBlob = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        // Build blob from whatever chunks we have
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        resolve(blob.size > 100 ? blob : null);
        return;
      }
      recorder.onstop = () => {
        cancelAnimationFrame(rafRef.current);
        analyserRef.current = null;
        audioCtxRef.current?.close();
        audioCtxRef.current = null;
        setAudioLevel(0);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setPaused(false);

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        resolve(blob.size > 100 ? blob : null);
      };
      recorder.stop();
    });
  }, []);

  // When all questions done — stop recording and transcribe
  const handleFinish = useCallback(async () => {
    if (!hasRecordedRef.current) {
      navigate('/orb');
      return;
    }

    const blob = await stopAndGetBlob();
    if (!blob) {
      navigate('/orb');
      return;
    }

    setPhase('transcribing');
    setTranscribeProgress(0);

    try {
      setTranscribeProgress(30);
      const text = await voiceTranscribe(blob);
      setTranscribeProgress(100);

      if (!text?.trim()) {
        setError("Couldn't transcribe the audio. Please try again.");
        setPhase('recording');
        setQuestionIndex(0);
        return;
      }

      setFullTranscript(text.trim());
      setPhase('editing');
    } catch {
      setError('Transcription failed. Please try again.');
      setPhase('recording');
      setQuestionIndex(0);
    }
  }, [stopAndGetBlob, navigate]);

  const handleClassify = async () => {
    if (!fullTranscript.trim()) {
      navigate('/orb');
      return;
    }

    setPhase('classifying');
    try {
      const data = await voiceClassify(fullTranscript);

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
      setPhase('reviewing');
    } catch {
      setError('Failed to analyze your answers. Please try again.');
      setPhase('editing');
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

  // ━━━ PHASE: Reviewing classified entries ━━━
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

  // ━━━ PHASE: Classifying ━━━
  if (phase === 'classifying') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-6" />
        <p className="text-white/60 text-lg">Analyzing your answers...</p>
        <p className="text-white/30 text-sm mt-2">Matching entries to your knowledge graph</p>
      </div>
    );
  }

  // ━━━ PHASE: Editing transcript ━━━
  if (phase === 'editing') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center px-4 py-12">
        <div className="w-full max-w-[95vw] sm:max-w-2xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
              <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h2 className="text-white text-xl font-semibold mb-1">Review your transcript</h2>
            <p className="text-white/30 text-sm">
              Fix any transcription errors before we analyze it. The more accurate, the better the results.
            </p>
          </div>

          <textarea
            value={fullTranscript}
            onChange={(e) => setFullTranscript(e.target.value)}
            className="w-full h-64 sm:h-80 bg-white/[0.04] border border-white/[0.1] rounded-2xl px-5 py-4 text-white/80 text-sm leading-relaxed focus:outline-none focus:border-purple-500/40 resize-none font-[inherit] placeholder:text-white/20"
            placeholder="Your transcribed text will appear here..."
          />

          <div className="flex items-center justify-between mt-4">
            <p className="text-white/20 text-xs">
              {fullTranscript.split(/\s+/).filter(Boolean).length} words
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setPhase('recording'); setQuestionIndex(0); hasRecordedRef.current = false; }}
                className="border border-white/10 text-white/40 hover:text-white/70 font-medium py-2.5 px-5 rounded-xl transition-colors text-sm"
              >
                Start over
              </button>
              <button
                onClick={handleClassify}
                disabled={!fullTranscript.trim()}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-2.5 px-8 rounded-xl transition-all shadow-xl shadow-purple-600/20"
              >
                Build My Graph
              </button>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm text-center mt-3">{error}</p>}
        </div>
      </div>
    );
  }

  // ━━━ PHASE: Transcribing ━━━
  if (phase === 'transcribing') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6" />
        <p className="text-white/60 text-lg">Transcribing your voice...</p>
        <p className="text-white/30 text-sm mt-2">This may take a moment</p>
        <div className="w-48 h-1.5 bg-white/10 rounded-full mt-4 overflow-hidden">
          <motion.div
            className="h-full bg-blue-500 rounded-full"
            animate={{ width: `${transcribeProgress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>
    );
  }

  // ━━━ PHASE: Recording ━━━
  const isActive = recording && !paused; // mic is actively capturing

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg flex flex-col items-center">

        {/* Progress */}
        <div className="w-full mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/30 text-xs font-medium">
              {isDone ? 'All done!' : `Question ${questionIndex + 1} of ${QUESTIONS.length}`}
            </span>
            {recording && (
              <span className="flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${paused ? 'bg-yellow-400' : 'bg-red-400 animate-pulse'}`} />
                <span className="text-white/30">{paused ? 'Paused' : 'Recording'}</span>
              </span>
            )}
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

        {/* Mic button */}
        {!isDone && (
          <div className="flex flex-col items-center gap-5">
            <button
              onClick={toggleMic}
              className="group relative"
            >
              {/* Voice-reactive outer rings */}
              {isActive && (
                <>
                  <div
                    className="absolute inset-0 rounded-full bg-red-500/15 transition-transform duration-75"
                    style={{
                      margin: '-16px',
                      transform: `scale(${1 + audioLevel * 0.6})`,
                      opacity: 0.3 + audioLevel * 0.5,
                    }}
                  />
                  <div
                    className="absolute inset-0 rounded-full border-2 border-red-400/30 transition-transform duration-100"
                    style={{
                      margin: '-8px',
                      transform: `scale(${1 + audioLevel * 0.3})`,
                    }}
                  />
                </>
              )}
              <div
                className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-75 ${
                  isActive
                    ? 'bg-red-500'
                    : paused
                      ? 'bg-yellow-500/80 hover:bg-yellow-500 shadow-lg shadow-yellow-500/20'
                      : 'bg-red-500/80 hover:bg-red-500 shadow-lg shadow-red-500/20 hover:shadow-red-500/40 hover:scale-105'
                }`}
                style={isActive ? {
                  transform: `scale(${1 + audioLevel * 0.15})`,
                  boxShadow: `0 0 ${20 + audioLevel * 40}px ${audioLevel * 12}px rgba(239, 68, 68, ${0.3 + audioLevel * 0.4})`,
                } : undefined}
              >
                {isActive ? (
                  <div className="flex items-center gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-1 bg-white rounded-full transition-all duration-75"
                        style={{
                          height: `${8 + audioLevel * 20 * (Math.sin(Date.now() / 150 + i * 1.2) * 0.5 + 0.5)}px`,
                        }}
                      />
                    ))}
                  </div>
                ) : paused ? (
                  // Paused — show play icon
                  <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                ) : (
                  // Not started — show mic icon
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </div>
            </button>

            {!recording && (
              <p className="text-white/20 text-xs">Tap the mic to start speaking</p>
            )}
            {isActive && (
              <p className="text-white/30 text-sm">Listening... tap mic to pause</p>
            )}
            {paused && (
              <p className="text-yellow-400/60 text-sm">Paused — tap mic to resume</p>
            )}

            {/* Skip / Next buttons — always visible once started or on any question */}
            <div className="flex items-center gap-3 mt-1">
              <button
                onClick={skipQuestion}
                className="bg-white/[0.06] hover:bg-white/10 border border-white/[0.08] text-white/40 hover:text-white/60 font-medium py-2.5 px-5 rounded-xl transition-all text-sm"
              >
                Skip this question
              </button>
              <button
                onClick={handleNextQuestion}
                className="bg-green-600 hover:bg-green-500 text-white font-medium py-2.5 px-5 rounded-xl transition-all text-sm flex items-center gap-2 shadow-lg shadow-green-600/20"
              >
                Next question
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* All done — proceed to transcription */}
        {isDone && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <span className="text-5xl mb-6 block">🎉</span>
            <h2 className="text-white text-2xl font-semibold mb-2">Great job!</h2>
            <p className="text-white/40 text-sm mb-8">
              {!hasRecordedRef.current
                ? "You didn't record anything. Let's skip to your orb."
                : "Now let's transcribe and review your answers."}
            </p>
            <button
              onClick={handleFinish}
              className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-10 rounded-xl transition-all shadow-xl shadow-purple-600/20 text-lg"
            >
              {!hasRecordedRef.current ? 'Go to My Orb' : 'Transcribe & Review'}
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
