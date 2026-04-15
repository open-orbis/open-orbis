import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { submitIdea } from '../api/orbs';

interface DiscoverUsesModalProps {
  open: boolean;
  onClose: () => void;
  orbId: string;
}

const MCP_USES = [
  {
    title: 'ChatGPT / Claude',
    desc: 'Give your Orbis ID to an AI assistant to answer questions about your professional background.',
    icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  },
  {
    title: 'Lovable / Bolt / v0',
    desc: 'Share with a website builder so it can auto-generate your personal portfolio site.',
    icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    title: 'Cover letter generators',
    desc: 'Share with an AI to draft tailored cover letters based on your skills and experience.',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    title: 'Recruiter AI tools',
    desc: 'Let a recruiter\'s AI agent query your profile for job matching.',
    icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    title: 'Collaboration tools',
    desc: 'Share with collaboration tools to find people with complementary skills.',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  },
];

const LINK_USES = [
  {
    title: 'Add to LinkedIn / CV',
    desc: 'Put your Orbis link on your LinkedIn profile or resume as a rich interactive portfolio.',
    icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  },
  {
    title: 'Email signature',
    desc: 'Add your Orbis link to your email signature.',
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    title: 'Job applications',
    desc: 'Share your Orbis link in job applications for a richer view than a static CV.',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  {
    title: 'Networking',
    desc: 'Share via QR code at conferences or meetups.',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  },
];

type Tab = 'mcp' | 'link';

// Persist draft text across modal open/close (clears on page refresh)
let _ideaDraft = '';

function UseCard({ title, desc, icon }: { title: string; desc: string; icon: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
      <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-white text-sm font-medium">{title}</p>
        <p className="text-white/40 text-xs mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

export default function DiscoverUsesModal({ open, onClose, orbId }: DiscoverUsesModalProps) {
  const [tab, setTab] = useState<Tab>('mcp');
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [ideaOpen, setIdeaOpen] = useState(_ideaDraft.length > 0);
  const [ideaText, setIdeaText] = useState(_ideaDraft);
  const [ideaSending, setIdeaSending] = useState(false);
  const [ideaSent, setIdeaSent] = useState(false);

  const shareUrl = `${window.location.origin}/${orbId}`;
  const mcpUri = `orb://${orbId}`;

  const copyText = (text: string, type: 'id' | 'link') => {
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative bg-gray-950 border border-white/10 rounded-2xl p-5 sm:p-6 max-w-[95vw] sm:max-w-md w-full mx-2 sm:mx-4 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-yellow-500/15 flex items-center justify-center">
                  <svg className="w-4.5 h-4.5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h2 className="text-white font-semibold text-base">Share your Orbis</h2>
              </div>
              <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 p-1 rounded-xl bg-white/[0.04]">
              <button
                onClick={() => setTab('mcp')}
                className={`flex-1 text-xs font-medium py-2 rounded-lg transition-all ${
                  tab === 'mcp'
                    ? 'bg-yellow-500/15 text-yellow-400 shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                Via MCP Client
              </button>
              <button
                onClick={() => setTab('link')}
                className={`flex-1 text-xs font-medium py-2 rounded-lg transition-all ${
                  tab === 'link'
                    ? 'bg-yellow-500/15 text-yellow-400 shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                Via Link
              </button>
            </div>

            {/* Tab content */}
            {tab === 'mcp' && (
              <div>
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => copyText(mcpUri, 'id')}
                    className="text-[10px] font-medium text-yellow-400/70 hover:text-yellow-400 transition-colors px-2 py-0.5 rounded-md bg-yellow-500/5 hover:bg-yellow-500/10"
                  >
                    {copiedId ? 'Copied!' : `Copy ID: ${orbId}`}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {MCP_USES.map((u) => <UseCard key={u.title} {...u} />)}
                </div>
              </div>
            )}

            {tab === 'link' && (
              <div>
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => copyText(shareUrl, 'link')}
                    className="text-[10px] font-medium text-yellow-400/70 hover:text-yellow-400 transition-colors px-2 py-0.5 rounded-md bg-yellow-500/5 hover:bg-yellow-500/10"
                  >
                    {copiedLink ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {LINK_USES.map((u) => <UseCard key={u.title} {...u} />)}
                </div>
              </div>
            )}

            {/* CTA — suggest a use case */}
            <div className="mt-4">
              {!ideaOpen && !ideaSent && (
                <button
                  onClick={() => setIdeaOpen(true)}
                  className="flex items-center gap-2 w-full p-3 rounded-xl border border-dashed border-yellow-500/20 bg-yellow-500/[0.03] hover:bg-yellow-500/[0.06] transition-colors group animate-pulse cursor-pointer"
                >
                  <svg className="w-4 h-4 text-yellow-400/60 group-hover:text-yellow-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <p className="text-xs text-yellow-400/70 group-hover:text-yellow-400 transition-colors">
                    Have another use case in mind?
                  </p>
                </button>
              )}
              {ideaOpen && !ideaSent && (
                <div className="p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.03] space-y-2">
                  <textarea
                    value={ideaText}
                    onChange={(e) => { setIdeaText(e.target.value); _ideaDraft = e.target.value; }}
                    onKeyDown={(e) => {
                      if (e.shiftKey && e.key === 'Enter') {
                        e.preventDefault();
                        if (ideaText.trim() && !ideaSending) {
                          setIdeaSending(true);
                          submitIdea(ideaText.trim())
                            .then(() => { setIdeaSent(true); setIdeaText(''); _ideaDraft = ''; setIdeaOpen(false); })
                            .catch(() => {})
                            .finally(() => setIdeaSending(false));
                        }
                      }
                    }}
                    placeholder="Describe your use case... (Shift+Enter to submit)"
                    rows={3}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-yellow-500/40 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setIdeaOpen(false); setIdeaText(''); _ideaDraft = ''; }}
                      className="px-3 py-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!ideaText.trim()) return;
                        setIdeaSending(true);
                        try {
                          await submitIdea(ideaText.trim());
                          setIdeaSent(true);
                          setIdeaText('');
                          _ideaDraft = '';
                          setIdeaOpen(false);
                          onClose();
                        } catch { /* ignore */ }
                        setIdeaSending(false);
                      }}
                      disabled={!ideaText.trim() || ideaSending}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 disabled:opacity-40 transition-all"
                    >
                      {ideaSending ? 'Sending...' : 'Submit'}
                    </button>
                  </div>
                </div>
              )}
              {ideaSent && (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-green-500/20 bg-green-500/[0.03]">
                  <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-xs text-green-300/70">Thanks for sharing!</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
