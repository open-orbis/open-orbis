import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { textSearch } from '../../api/orbs';
import type { OrbNode, OrbVisibility } from '../../api/orbs';
import { NODE_TYPE_COLORS } from '../graph/NodeColors';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  matchedNodes?: OrbNode[];
  selectedNodeUid?: string;
}

interface ChatBoxProps {
  onHighlight: (nodeIds: Set<string>) => void;
  onFocusNode?: (nodeUid: string) => void;
  onClearResults?: () => void;
  highlightedNodeIds?: Set<string>;
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[]) => void;
  onAdd?: () => void;
  onShare?: () => void;
  onDiscover?: () => void;
  highlightAdd?: boolean;
  placeholder?: string;
  searchFn?: (query: string) => Promise<OrbNode[]>;
  interactionHint?: string;
  onRecenter?: () => void;
  visibility?: OrbVisibility;
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

function getNodeScore(node: OrbNode): number {
  const raw = node.score ?? (node._score as number | undefined);
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 0;
  return Math.max(0, Math.min(1, raw));
}

function getScoreStyle(score: number): { dot: string; text: string } {
  if (score >= 0.8) return { dot: '#34d399', text: '#86efac' };
  if (score >= 0.6) return { dot: '#facc15', text: '#fde68a' };
  return { dot: '#f87171', text: '#fca5a5' };
}

export default function ChatBox({
  onHighlight,
  onFocusNode,
  onClearResults,
  highlightedNodeIds,
  messages,
  onMessagesChange,
  onAdd,
  onShare,
  onDiscover,
  highlightAdd,
  placeholder = 'Query your orbis...',
  searchFn = textSearch,
  interactionHint = 'Zoom: mouse wheel · Pan: right-drag · Rotate: left-drag',
  onRecenter,
  visibility = 'public',
}: ChatBoxProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const setMessages = (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    if (typeof updater === 'function') {
      onMessagesChange(updater(messages));
    } else {
      onMessagesChange(updater);
    }
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const hasMessages = messages.length > 0;
  const { resultMessageIndex, resultMessage, resultNodes } = useMemo(() => {
    const index = messages.findIndex((msg) => msg.role === 'assistant' && (msg.matchedNodes?.length ?? 0) > 0);
    const message = index >= 0 ? messages[index] : null;
    return {
      resultMessageIndex: index,
      resultMessage: message,
      resultNodes: message?.matchedNodes ?? [],
    };
  }, [messages]);
  const latestQuery = useMemo(
    () => [...messages].reverse().find((msg) => msg.role === 'user')?.text ?? '',
    [messages],
  );
  const shareButtonClass = visibility === 'restricted'
    ? 'bg-emerald-600/80 hover:bg-emerald-500 border-emerald-500/35 hover:border-emerald-400/55 shadow-emerald-600/25'
    : 'bg-orange-600/80 hover:bg-orange-500 border-orange-500/35 hover:border-orange-400/55 shadow-orange-600/25';

  const clearResults = useCallback(() => {
    onMessagesChange([]);
    onHighlight(new Set());
    setActiveResultIndex(-1);
    onClearResults?.();
  }, [onMessagesChange, onHighlight, onClearResults]);

  useEffect(() => {
    if (resultNodes.length === 0) {
      setActiveResultIndex(-1);
      return;
    }
    const highlightedUid = highlightedNodeIds && highlightedNodeIds.size === 1
      ? Array.from(highlightedNodeIds)[0]
      : resultMessage?.selectedNodeUid;
    const index = highlightedUid ? resultNodes.findIndex((node) => node.uid === highlightedUid) : 0;
    setActiveResultIndex(index >= 0 ? index : 0);
  }, [highlightedNodeIds, resultMessage?.selectedNodeUid, resultNodes]);

  useEffect(() => {
    if (!hasMessages) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !containerRef.current) return;
      if (!containerRef.current.contains(target)) {
        clearResults();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [hasMessages, clearResults]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    setInput('');
    setMessages([{ role: 'user', text: query }]);
    setLoading(true);

    try {
      const results = await searchFn(query);
      const sortedResults = [...results].sort((a, b) => getNodeScore(b) - getNodeScore(a));

      if (sortedResults.length === 0) {
        setMessages([
          { role: 'user', text: query },
          { role: 'assistant', text: `No matches found for "${query}". This information isn't in your orbis yet.` },
        ]);
        onHighlight(new Set());
      } else {
        const selectedNodeUid = sortedResults[0].uid;
        onHighlight(new Set([selectedNodeUid]));
        onFocusNode?.(selectedNodeUid);

        const summary = sortedResults.length === 1
          ? 'Found 1 matching node — highlighted in your graph.'
          : `Found ${sortedResults.length} matching nodes — click one to highlight it in your graph.`;

        setMessages([
          { role: 'user', text: query },
          { role: 'assistant', text: summary, matchedNodes: sortedResults, selectedNodeUid },
        ]);
      }
    } catch {
      setMessages([
        { role: 'user', text: query },
        { role: 'assistant', text: 'Something went wrong. Please try again.' },
      ]);
      onHighlight(new Set());
    } finally {
      setLoading(false);
    }
  };

  const handleResultClick = (messageIndex: number, nodeUid: string) => {
    onHighlight(new Set([nodeUid]));
    onFocusNode?.(nodeUid);
    setMessages((prev) => prev.map((msg, idx) => {
      if (idx !== messageIndex || !msg.matchedNodes) return msg;
      return { ...msg, selectedNodeUid: nodeUid };
    }));
  };

  const handleClearResults = () => {
    clearResults();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && hasMessages) {
      e.preventDefault();
      handleClearResults();
      return;
    }

    if (resultNodes.length === 0 || resultMessageIndex < 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = activeResultIndex < 0 ? 0 : (activeResultIndex + 1) % resultNodes.length;
      setActiveResultIndex(next);
      handleResultClick(resultMessageIndex, resultNodes[next].uid);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = activeResultIndex < 0
        ? resultNodes.length - 1
        : (activeResultIndex - 1 + resultNodes.length) % resultNodes.length;
      setActiveResultIndex(next);
      handleResultClick(resultMessageIndex, resultNodes[next].uid);
      return;
    }

    if (e.key === 'Enter' && !input.trim() && activeResultIndex >= 0) {
      e.preventDefault();
      handleResultClick(resultMessageIndex, resultNodes[activeResultIndex].uid);
    }
  };

  return (
    <div
      data-tour="chatbox"
      ref={containerRef}
      className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-[90vw] sm:max-w-xl px-2 sm:px-4 pb-6 sm:pb-10"
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
          <div className="max-h-[200px] sm:max-h-[280px] overflow-y-auto px-3 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3">
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
                  <>
                  <div className="flex justify-start">
                    <div className="space-y-2 max-w-[95%]">
                      <div
                        className="text-white/90 text-sm px-4 py-2 rounded-2xl rounded-bl-sm"
                        style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                      >
                        {msg.text}
                      </div>
                    </div>
                  </div>
                  {msg.matchedNodes && msg.matchedNodes.length > 0 && (
                    <div className="w-full">
                        <div
                          className="rounded-xl border border-white/10 bg-black/20 p-2.5 sm:p-3"
                          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
                        >
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-[0.12em] text-white/40">
                                Search Results
                              </p>
                              <p className="text-xs text-white/75 truncate">
                                {msg.matchedNodes.length} {msg.matchedNodes.length === 1 ? 'match' : 'matches'} for "{latestQuery}"
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleClearResults}
                              className="text-[11px] px-2 py-1 rounded-md border border-white/15 text-white/55 hover:text-white/85 hover:border-white/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
                            >
                              Clear
                            </button>
                          </div>
                          <div className="space-y-2 pl-0.5" role="listbox" id="chat-search-results-list" aria-label="Search matches">
                          {msg.matchedNodes.map((node, j) => {
                            const label = node._labels?.[0] || '';
                            const typeKey = LABEL_TO_TYPE[label] || '';
                            const color = NODE_TYPE_COLORS[typeKey] || '#8b5cf6';
                            const score = getNodeScore(node);
                            const scorePercent = Math.round(score * 100);
                            const scoreStyle = getScoreStyle(score);
                            const isSelected = highlightedNodeIds?.has(node.uid) ?? (msg.selectedNodeUid === node.uid);
                            const isActive = j === activeResultIndex;
                            return (
                              <button
                                key={j}
                                type="button"
                                onClick={() => handleResultClick(i, node.uid)}
                                onMouseEnter={() => setActiveResultIndex(j)}
                                role="option"
                                aria-selected={isSelected}
                                className="w-full flex items-center gap-2 rounded-lg px-3 py-2 sm:py-2.5 backdrop-blur-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
                                style={{
                                  backgroundColor: isSelected
                                    ? 'rgba(139,92,246,0.18)'
                                    : isActive
                                      ? 'rgba(255,255,255,0.13)'
                                      : 'rgba(255,255,255,0.08)',
                                  border: isSelected
                                    ? '1px solid rgba(167,139,250,0.65)'
                                    : '1px solid rgba(255,255,255,0.1)',
                                }}
                              >
                                <div className="flex flex-col items-center gap-1.5 flex-shrink-0 min-w-[40px]">
                                  <div className="flex items-center gap-1.5">
                                    <div
                                      className="w-2.5 h-2.5 rounded-full"
                                      style={{ backgroundColor: scoreStyle.dot, boxShadow: `0 0 6px ${scoreStyle.dot}` }}
                                    />
                                    <span className="text-[10px] font-semibold" style={{ color: scoreStyle.text }}>
                                      {scorePercent}%
                                    </span>
                                  </div>
                                  <div className="w-10 h-1 rounded-full bg-white/10 overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${scorePercent}%`, backgroundColor: scoreStyle.dot }}
                                    />
                                  </div>
                                </div>
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
                              </button>
                            );
                          })}
                          </div>
                        </div>
                    </div>
                  )}
                  </>
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
          </div>
        </div>
      )}

      {/* Feedback button above chatbox */}
      <div className="flex justify-center mb-1.5">
        <button
          type="button"
          onClick={() => { if (!feedbackSent) setShowFeedback(true); }}
          className={`text-[10px] transition-colors ${
            feedbackSent
              ? 'text-yellow-400 font-bold'
              : 'text-emerald-400/30 hover:text-emerald-400/60'
          }`}
        >
          {feedbackSent ? 'Thanks for inspiring us!' : 'Send Feedback'}
        </button>
      </div>

      {/* Bottom bar — discover + recenter + chat input + action buttons */}
      <div className="flex items-center gap-2">
        {onDiscover && (
          <button
            type="button"
            onClick={onDiscover}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 hover:border-yellow-400/50 text-yellow-400 hover:text-yellow-300 transition-all backdrop-blur-sm flex-shrink-0 shadow-lg shadow-yellow-600/10"
            title="Discover uses"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </button>
        )}
        {onRecenter && (
          <button
            type="button"
            onClick={onRecenter}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/15 hover:border-white/25 text-white/50 hover:text-white transition-all backdrop-blur-sm flex-shrink-0"
            title="Recenter graph"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        )}
        {/* Chat input */}
        <form onSubmit={handleSubmit} className="flex-1">
          <div
            className="flex items-center gap-2 sm:gap-3 rounded-full px-3 sm:px-5 py-2.5 sm:py-3 backdrop-blur-md shadow-lg"
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
              onKeyDown={handleInputKeyDown}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 focus:outline-none"
              aria-controls={resultNodes.length > 0 ? 'chat-search-results-list' : undefined}
              aria-expanded={resultNodes.length > 0}
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

        {/* Action buttons */}
        {(onAdd || onShare) && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onShare && (
              <button
                data-tour="visibility"
                onClick={onShare}
                className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center border text-white/90 hover:text-white transition-all shadow-lg ${shareButtonClass}`}
                title="Share"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            )}
            {onAdd && (
              <button
                data-tour="add-entry"
                onClick={onAdd}
                className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-lg shadow-purple-600/30 hover:shadow-purple-500/40 ${highlightAdd ? 'animate-pulse ring-2 ring-purple-400 ring-offset-2 ring-offset-black' : ''}`}
                title="Add Entry"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-white/35">
        {interactionHint}
      </p>

      {/* Feedback modal — portaled to body to escape chatbox z-index/pointer traps */}
      {showFeedback && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowFeedback(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-md w-full mx-4 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowFeedback(false)}
              className="absolute right-3 top-3 h-8 w-8 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors flex items-center justify-center"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-white text-base font-semibold mb-1">Send Feedback</h3>
            <p className="text-gray-400 text-sm mb-4">What would you like to share with us?</p>
            <textarea
              autoFocus
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Your feedback, ideas, or suggestions..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 resize-none h-28 focus:outline-none focus:border-purple-500/50"
            />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowFeedback(false)}
                className="h-9 px-4 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!feedbackText.trim() || feedbackSending}
                onClick={async () => {
                  setFeedbackSending(true);
                  try {
                    const { submitIdea } = await import('../../api/orbs');
                    await submitIdea(feedbackText.trim(), 'feedback');
                    setFeedbackSent(true);
                    setTimeout(() => setFeedbackSent(false), 5000);
                  } catch { /* best effort */ }
                  finally {
                    setFeedbackSending(false);
                    setFeedbackText('');
                    setShowFeedback(false);
                  }
                }}
                className="h-9 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {feedbackSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
