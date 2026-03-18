import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getMessages,
  replyToMessage,
  markMessageRead,
  deleteMessage,
} from '../../api/orbs';
import type { Message, MessageReply } from '../../api/orbs';

interface InboxProps {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return (
    d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
}

export default function Inbox({ open, onClose, onUnreadCountChange }: InboxProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessages = async () => {
    try {
      const data = await getMessages();
      setMessages(data);
      onUnreadCountChange?.(data.filter((m) => !m.read).length);
    } catch {
      setMessages([]);
      onUnreadCountChange?.(0);
    } finally {
      setLoading(false);
    }
  };

  // Fetch unread count on mount
  useEffect(() => {
    getMessages()
      .then((data) => onUnreadCountChange?.(data.filter((m) => !m.read).length))
      .catch(() => onUnreadCountChange?.(0));
  }, []);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchMessages();
    }
  }, [open]);

  const handleExpand = async (msg: Message) => {
    if (expandedId === msg.uid) {
      setExpandedId(null);
      return;
    }
    setExpandedId(msg.uid);
    setReplyText('');
    if (!msg.read) {
      try {
        await markMessageRead(msg.uid);
        setMessages((prev) =>
          prev.map((m) => (m.uid === msg.uid ? { ...m, read: true } : m))
        );
        onUnreadCountChange?.(
          messages.filter((m) => !m.read && m.uid !== msg.uid).length
        );
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => replyRef.current?.focus(), 150);
  };

  const handleReply = async (messageId: string) => {
    if (!replyText.trim() || replying) return;
    setReplying(true);
    try {
      const reply = await replyToMessage(messageId, replyText.trim());
      setMessages((prev) =>
        prev.map((m) =>
          m.uid === messageId ? { ...m, replies: [...m.replies, reply] } : m
        )
      );
      setReplyText('');
    } catch {
      /* ignore */
    } finally {
      setReplying(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    try {
      await deleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.uid !== messageId));
      if (expandedId === messageId) setExpandedId(null);
      onUnreadCountChange?.(
        messages.filter((m) => !m.read && m.uid !== messageId).length
      );
    } catch {
      /* ignore */
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative w-full sm:max-w-md h-full bg-gray-950/95 backdrop-blur-lg border-l border-white/10 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h2 className="text-white text-base font-semibold">Inbox</h2>
                <p className="text-white/40 text-xs mt-0.5">
                  Messages from recruiters & agents
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Messages list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-white/15 mb-3">
                    <svg
                      className="w-10 h-10 mx-auto"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-white/20 text-sm">No messages yet</p>
                  <p className="text-white/10 text-xs mt-1">
                    Messages from MCP agents and recruiters will appear here
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {messages.map((msg) => {
                    const isExpanded = expandedId === msg.uid;
                    return (
                      <div key={msg.uid}>
                        {/* Message row */}
                        <button
                          onClick={() => handleExpand(msg)}
                          className={`w-full text-left px-5 py-3.5 hover:bg-white/5 transition-colors ${
                            isExpanded ? 'bg-white/5' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Unread dot */}
                            <div className="pt-1.5 w-2 flex-shrink-0">
                              {!msg.read && (
                                <span className="block w-2 h-2 bg-green-500 rounded-full" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`text-sm truncate ${
                                    msg.read
                                      ? 'text-white/60'
                                      : 'text-white font-semibold'
                                  }`}
                                >
                                  {msg.sender_name}
                                </span>
                                <span className="text-white/20 text-[10px] flex-shrink-0">
                                  {formatTime(msg.created_at)}
                                </span>
                              </div>
                              <p
                                className={`text-sm truncate mt-0.5 ${
                                  msg.read ? 'text-white/40' : 'text-white/70'
                                }`}
                              >
                                {msg.subject}
                              </p>
                              <p className="text-white/25 text-xs truncate mt-0.5">
                                {msg.body}
                              </p>
                            </div>
                          </div>
                        </button>

                        {/* Expanded view */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-4 border-b border-white/5">
                                {/* Sender info */}
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-white/30 text-xs">
                                    {msg.sender_email}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(msg.uid);
                                    }}
                                    className="text-white/20 hover:text-red-400 transition-colors p-1"
                                    title="Delete message"
                                  >
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  </button>
                                </div>

                                {/* Full body */}
                                <div className="bg-white/5 border border-white/5 rounded-xl px-4 py-3 mb-3">
                                  <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">
                                    {msg.body}
                                  </p>
                                </div>

                                {/* Replies thread */}
                                {msg.replies.length > 0 && (
                                  <div className="space-y-2 mb-3">
                                    {msg.replies.map((reply: MessageReply) => (
                                      <div
                                        key={reply.uid}
                                        className={`rounded-xl px-4 py-2.5 text-sm ${
                                          reply.from_owner
                                            ? 'bg-purple-600/20 border border-purple-500/20 ml-4'
                                            : 'bg-white/5 border border-white/5 mr-4'
                                        }`}
                                      >
                                        <p
                                          className={`leading-relaxed whitespace-pre-wrap ${
                                            reply.from_owner
                                              ? 'text-purple-200/80'
                                              : 'text-white/60'
                                          }`}
                                        >
                                          {reply.body}
                                        </p>
                                        <span className="text-white/20 text-[10px] mt-1 block">
                                          {reply.from_owner ? 'You' : msg.sender_name}{' '}
                                          &middot; {formatTime(reply.created_at)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Reply input */}
                                <div className="flex gap-2">
                                  <textarea
                                    ref={replyRef}
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleReply(msg.uid);
                                      }
                                    }}
                                    placeholder="Write a reply..."
                                    rows={2}
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/25 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30"
                                  />
                                  <button
                                    onClick={() => handleReply(msg.uid)}
                                    disabled={!replyText.trim() || replying}
                                    className="self-end bg-purple-600/80 hover:bg-purple-600 disabled:opacity-30 text-white text-xs font-medium px-3 py-2 rounded-xl transition-colors"
                                  >
                                    {replying ? '...' : 'Send'}
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
