import { useState, useRef, useEffect } from 'react';
import { textSearch } from '../../api/orbs';
import type { OrbNode } from '../../api/orbs';
import { NODE_TYPE_COLORS } from '../graph/NodeColors';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  matchedNodes?: OrbNode[];
}

interface ChatBoxProps {
  onHighlight: (nodeIds: Set<string>) => void;
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[]) => void;
}

export type { ChatMessage };

const LABEL_TO_TYPE: Record<string, string> = {
  WorkExperience: 'work_experience',
  Education: 'education',
  Skill: 'skill',
  Language: 'language',
  Certification: 'certification',
  Publication: 'publication',
  Project: 'project',
  Collaborator: 'collaborator',
  Patent: 'patent',
};

const DISPLAY_LABELS: Record<string, string> = {
  WorkExperience: 'Work Experience',
  Education: 'Education',
  Skill: 'Skill',
  Language: 'Language',
  Certification: 'Certification',
  Publication: 'Publication',
  Project: 'Project',
  Collaborator: 'Collaborator',
  Patent: 'Patent',
};

function getNodeTitle(node: OrbNode): string {
  return (node.name || node.title || node.company || node.institution || 'Untitled') as string;
}

function getNodeSubtitle(node: OrbNode): string {
  const label = node._labels?.[0];
  if (label === 'WorkExperience') return (node.company || '') as string;
  if (label === 'Education') return (node.degree || '') as string;
  if (label === 'Certification') return (node.issuing_organization || '') as string;
  if (label === 'Publication') return (node.venue || '') as string;
  if (label === 'Project') return (node.role || '') as string;
  return '';
}

export default function ChatBox({ onHighlight, messages, onMessagesChange }: ChatBoxProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const setMessages = (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    if (typeof updater === 'function') {
      onMessagesChange(updater(messages));
    } else {
      onMessagesChange(updater);
    }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: query }]);
    setLoading(true);

    try {
      const results = await textSearch(query);

      if (results.length === 0) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: `No matches found for "${query}". This information isn't in your orb yet.` },
        ]);
        onHighlight(new Set());
      } else {
        const nodeIds = new Set(results.map((n) => n.uid));
        onHighlight(nodeIds);

        const summary = results.length === 1
          ? `Found 1 matching node — highlighted in your graph.`
          : `Found ${results.length} matching nodes — highlighted in your graph.`;

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: summary, matchedNodes: results },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Something went wrong. Please try again.' },
      ]);
      onHighlight(new Set());
    } finally {
      setLoading(false);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div
      className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 pb-10"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Messages area — only shown when there are messages */}
      {hasMessages && (
        <div
          className="mb-2 rounded-2xl overflow-hidden backdrop-blur-md"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <div className="max-h-[280px] overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === 'user' ? (
                  <div className="flex justify-end">
                    <div
                      className="text-white text-sm px-4 py-2 rounded-2xl rounded-br-sm max-w-[80%]"
                      style={{ backgroundColor: 'rgba(139,92,246,0.7)' }}
                    >
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-start">
                    <div className="space-y-2 max-w-[90%]">
                      <div
                        className="text-white/90 text-sm px-4 py-2 rounded-2xl rounded-bl-sm"
                        style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                      >
                        {msg.text}
                      </div>
                      {msg.matchedNodes && msg.matchedNodes.length > 0 && (
                        <div className="space-y-1.5 pl-1">
                          {msg.matchedNodes.map((node, j) => {
                            const label = node._labels?.[0] || '';
                            const typeKey = LABEL_TO_TYPE[label] || '';
                            const color = NODE_TYPE_COLORS[typeKey] || '#8b5cf6';
                            return (
                              <div
                                key={j}
                                className="flex items-center gap-2 rounded-lg px-3 py-1.5 backdrop-blur-sm"
                                style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                              >
                                <div
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-white/90 truncate">
                                    {getNodeTitle(node)}
                                  </div>
                                  {getNodeSubtitle(node) && (
                                    <div className="text-[10px] text-white/50 truncate">
                                      {getNodeSubtitle(node)}
                                    </div>
                                  )}
                                </div>
                                <span
                                  className="text-[9px] font-semibold uppercase tracking-wide ml-auto flex-shrink-0"
                                  style={{ color }}
                                >
                                  {DISPLAY_LABELS[label] || label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div
                  className="text-white/60 text-sm px-4 py-2.5 rounded-2xl rounded-bl-sm"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
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
        </div>
      )}

      {/* Input bar — always visible, Claude-style */}
      <form onSubmit={handleSubmit}>
        <div
          className="flex items-center gap-3 rounded-full px-5 py-3 backdrop-blur-md shadow-lg"
          style={{
            backgroundColor: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <svg className="w-4 h-4 text-white/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Query your orb..."
            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 focus:outline-none"
          />
          {input.trim() && (
            <button
              type="submit"
              disabled={loading}
              className="bg-white/20 hover:bg-white/30 disabled:opacity-40 text-white rounded-full w-7 h-7 flex items-center justify-center transition-colors flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
