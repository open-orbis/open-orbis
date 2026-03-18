import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useOrbStore } from '../../stores/orbStore';
import { NODE_TYPE_COLORS } from '../graph/NodeColors';

interface Message {
  role: 'orbis' | 'user';
  text: string;
  nodeType?: string;
  added?: boolean;
}

const QUESTIONS = [
  { question: "What's your current role and company?", hint: "e.g. Senior Engineer at Google", nodeType: 'work_experience' },
  { question: 'When did you start? Is it your current role?', hint: "e.g. January 2022, yes it's current", nodeType: 'work_experience' },
  { question: 'Any previous roles you want to add?', hint: "e.g. Software Developer at Startup Inc, 2019-2022", nodeType: 'work_experience' },
  { question: 'Tell me about your education.', hint: "e.g. MSc Computer Science at MIT, 2017-2019", nodeType: 'education' },
  { question: 'What are your key skills?', hint: "e.g. Python, React, Neo4j, distributed systems", nodeType: 'skill' },
  { question: 'Any languages you speak?', hint: "e.g. English (native), Italian (fluent), French (basic)", nodeType: 'language' },
  { question: 'Certifications, patents, or publications?', hint: "e.g. AWS Solutions Architect, 2023", nodeType: 'certification' },
  { question: 'Anything else you want to add to your orb?', hint: "Projects, collaborators, or anything we missed", nodeType: 'project' },
];

function parseAnswer(text: string, nodeType: string): Array<{ node_type: string; properties: Record<string, string> }> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.toLowerCase() === 'no' || trimmed.toLowerCase() === 'skip' || trimmed.toLowerCase() === 'none') {
    return [];
  }

  // For skills and languages, split by comma
  if (nodeType === 'skill') {
    return trimmed.split(/[,;]/).map((s) => s.trim()).filter(Boolean).map((name) => ({
      node_type: 'skill',
      properties: { name },
    }));
  }

  if (nodeType === 'language') {
    return trimmed.split(/[,;]/).map((s) => s.trim()).filter(Boolean).map((part) => {
      const match = part.match(/^(.+?)\s*\((.+?)\)\s*$/);
      if (match) return { node_type: 'language', properties: { name: match[1].trim(), proficiency: match[2].trim() } };
      return { node_type: 'language', properties: { name: part } };
    });
  }

  // For work experience — try to extract company and title
  if (nodeType === 'work_experience') {
    const atMatch = trimmed.match(/^(.+?)\s+at\s+(.+?)(?:\s*,\s*(.+))?$/i);
    if (atMatch) {
      const props: Record<string, string> = { title: atMatch[1].trim(), company: atMatch[2].trim() };
      if (atMatch[3]) props.location = atMatch[3].trim();
      return [{ node_type: 'work_experience', properties: props }];
    }
    return [{ node_type: 'work_experience', properties: { title: trimmed } }];
  }

  // For education
  if (nodeType === 'education') {
    const atMatch = trimmed.match(/^(.+?)\s+at\s+(.+?)(?:\s*,\s*(.+))?$/i);
    if (atMatch) {
      return [{ node_type: 'education', properties: { degree: atMatch[1].trim(), institution: atMatch[2].trim() } }];
    }
    return [{ node_type: 'education', properties: { institution: trimmed } }];
  }

  // Generic — use as name/title
  const nameField = nodeType === 'publication' ? 'title' : 'name';
  return [{ node_type: nodeType, properties: { [nameField]: trimmed } }];
}

export default function VoiceOnboarding() {
  const navigate = useNavigate();
  const { addNode } = useOrbStore();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'orbis', text: "Let's build your orb together. I'll ask you a few questions — answer by voice or type. Say \"skip\" to move on." },
  ]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [input, setInput] = useState('');
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasSpeechApi = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  // Ask first question after intro
  useEffect(() => {
    const timer = setTimeout(() => {
      if (QUESTIONS[0]) {
        setMessages((prev) => [...prev, { role: 'orbis', text: QUESTIONS[0].question }]);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const processAnswer = async (answer: string) => {
    if (!QUESTIONS[questionIndex]) return;

    const q = QUESTIONS[questionIndex];
    setMessages((prev) => [...prev, { role: 'user', text: answer }]);
    setProcessing(true);

    const nodes = parseAnswer(answer, q.nodeType);
    const isSkip = !answer.trim() || ['no', 'skip', 'none', 'n/a'].includes(answer.trim().toLowerCase());

    if (isSkip) {
      setMessages((prev) => [...prev, { role: 'orbis', text: "No worries, let's move on." }]);
    } else if (nodes.length > 0) {
      // Add nodes to graph
      for (const node of nodes) {
        try {
          await addNode(node.node_type, node.properties);
        } catch { /* toast handles */ }
      }
      const summary = nodes.length === 1
        ? `Added "${Object.values(nodes[0].properties)[0]}" to your graph.`
        : `Added ${nodes.length} entries to your graph.`;
      setMessages((prev) => [...prev, { role: 'orbis', text: summary, nodeType: q.nodeType, added: true }]);
    }

    // Next question or finish
    const nextIdx = questionIndex + 1;
    setQuestionIndex(nextIdx);
    setProcessing(false);

    if (nextIdx < QUESTIONS.length) {
      setTimeout(() => {
        setMessages((prev) => [...prev, { role: 'orbis', text: QUESTIONS[nextIdx].question }]);
      }, 800);
    } else {
      setTimeout(() => {
        setMessages((prev) => [...prev, { role: 'orbis', text: "Your orb is ready! Let's take a look." }]);
      }, 800);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || processing) return;
    setInput('');
    processAnswer(text);
  };

  const toggleRecording = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        processAnswer(transcript);
      }
      setRecording(false);
    };

    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  };

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  const isDone = questionIndex >= QUESTIONS.length;
  const currentQ = QUESTIONS[questionIndex];

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-3 sm:px-4">
      <div className="w-full max-w-[95vw] sm:max-w-2xl flex flex-col h-[85vh] sm:h-[80vh]">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h2 className="text-white text-lg font-semibold">Tell us about yourself</h2>
          <p className="text-white/30 text-sm mt-1">
            {questionIndex + 1} of {QUESTIONS.length} questions
          </p>
          {/* Progress bar */}
          <div className="w-48 mx-auto h-1 bg-white/10 rounded-full mt-3 overflow-hidden">
            <motion.div
              className="h-full bg-purple-500 rounded-full"
              animate={{ width: `${((questionIndex) / QUESTIONS.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-2 sm:space-y-3 px-1 sm:px-2 mb-3 sm:mb-4">
          <AnimatePresence>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-purple-600/70 text-white rounded-br-sm'
                      : msg.added
                        ? 'bg-green-500/15 border border-green-500/20 text-green-200 rounded-bl-sm'
                        : 'bg-white/10 text-white/80 rounded-bl-sm'
                  }`}
                >
                  {msg.added && (
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: NODE_TYPE_COLORS[msg.nodeType || ''] || '#8b5cf6' }} />
                  )}
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {processing && (
            <div className="flex justify-start">
              <div className="bg-white/10 rounded-2xl rounded-bl-sm px-4 py-2.5">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        {!isDone ? (
          <div className="pb-4">
            {currentQ && (
              <p className="text-white/20 text-xs text-center mb-2">{currentQ.hint}</p>
            )}
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              {hasSpeechApi && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                    recording
                      ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                      : 'bg-white/10 border border-white/10 text-white/40 hover:text-white/70 hover:bg-white/15'
                  }`}
                >
                  {recording ? (
                    <span className="w-3 h-3 bg-red-400 rounded-sm animate-pulse" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </button>
              )}
              <div className="flex-1 flex items-center gap-2 bg-white/10 border border-white/10 rounded-full px-3 sm:px-4 py-2 sm:py-2.5">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your answer..."
                  disabled={processing}
                  className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none"
                />
                {input.trim() && (
                  <button type="submit" disabled={processing} className="text-purple-400 hover:text-purple-300 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => processAnswer('skip')}
                disabled={processing}
                className="flex-shrink-0 text-white/20 hover:text-white/50 text-xs font-medium transition-colors"
              >
                Skip
              </button>
            </form>
          </div>
        ) : (
          <div className="pb-4 text-center">
            <button
              onClick={() => navigate('/orb')}
              className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-xl shadow-purple-600/20 text-base"
            >
              View My Orb
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
