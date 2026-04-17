import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ExtractedData } from '../../api/cv';
import { NODE_TYPE_LABELS, NODE_TYPE_COLORS } from '../graph/NodeColors';
import NodeForm from '../editor/NodeForm';

const CLASSIFIABLE_TYPES = [
  'skill',
  'language',
  'work_experience',
  'education',
  'certification',
  'publication',
  'project',
  'patent',
  'award',
  'outreach',
  'training',
] as const;

type ExtractedNode = ExtractedData['nodes'][number];

interface UnmatchedEntriesReviewProps {
  entries: string[];
  onDone: (result: { classifiedNodes: ExtractedNode[]; remainingUnmatched: string[] }) => void;
  onBack?: () => void;
  backLabel?: string;
  header?: React.ReactNode;
}

type RowState =
  | { kind: 'pending'; text: string }
  | { kind: 'classifying'; text: string; type: string }
  | { kind: 'classified'; text: string; node: ExtractedNode }
  | { kind: 'skipped'; text: string };

function finalize(rows: RowState[]): {
  classifiedNodes: ExtractedNode[];
  remainingUnmatched: string[];
} {
  const classifiedNodes: ExtractedNode[] = [];
  const remainingUnmatched: string[] = [];
  for (const row of rows) {
    if (row.kind === 'classified') classifiedNodes.push(row.node);
    else remainingUnmatched.push(row.text);
  }
  return { classifiedNodes, remainingUnmatched };
}

export default function UnmatchedEntriesReview({
  entries,
  onDone,
  onBack,
  backLabel = 'Back',
  header,
}: UnmatchedEntriesReviewProps) {
  const [rows, setRows] = useState<RowState[]>(() =>
    entries.map((text) => ({ kind: 'pending', text })),
  );

  const classifiedCount = rows.filter((r) => r.kind === 'classified').length;
  const skippedCount = rows.filter((r) => r.kind === 'skipped').length;
  const pendingCount = rows.length - classifiedCount - skippedCount;

  const handleContinue = () => onDone(finalize(rows));

  const handleSkipAll = () => {
    const next: RowState[] = rows.map((r) =>
      r.kind === 'classified' ? r : { kind: 'skipped', text: r.text },
    );
    onDone(finalize(next));
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center px-3 sm:px-4 py-10 sm:py-16">
      <div className="w-full max-w-[95vw] sm:max-w-2xl">
        {header && <div className="mb-5">{header}</div>}

        <div className="text-center mb-6">
          <h2 className="text-white text-xl font-semibold">Review unclassified entries</h2>
          <p className="text-white/50 text-sm mt-1">
            We could not auto-classify {entries.length}{' '}
            {entries.length === 1 ? 'entry' : 'entries'}. Pick a type to add them to your
            graph, or skip to save them as Draft Notes.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 px-2 py-0.5">
              {classifiedCount} classified
            </span>
            <span className="rounded-full border border-white/15 bg-white/[0.04] text-white/65 px-2 py-0.5">
              {skippedCount} skipped
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.02] text-white/45 px-2 py-0.5">
              {pendingCount} pending
            </span>
          </div>
          <button
            type="button"
            onClick={handleSkipAll}
            className="text-xs text-white/60 hover:text-white underline decoration-dotted"
          >
            Skip all &amp; continue
          </button>
        </div>

        <div className="space-y-2 mb-6">
          {rows.map((row, i) => {
            const setRow = (next: RowState) => {
              setRows((prev) => prev.map((r, idx) => (idx === i ? next : r)));
            };

            if (row.kind === 'classifying') {
              const color = NODE_TYPE_COLORS[row.type] || '#8b5cf6';
              return (
                <motion.div
                  key={i}
                  layout
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-3"
                >
                  <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">
                      Original text
                    </p>
                    <p className="text-white/80 text-sm break-words whitespace-pre-wrap">
                      {row.text}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-white/55">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span>Fill in as {NODE_TYPE_LABELS[row.type] ?? row.type}</span>
                  </div>
                  <NodeForm
                    initialType={row.type}
                    initialValues={{}}
                    onSubmit={(nodeType, properties) =>
                      setRow({
                        kind: 'classified',
                        text: row.text,
                        node: { node_type: nodeType, properties },
                      })
                    }
                    onCancel={() => setRow({ kind: 'pending', text: row.text })}
                  />
                </motion.div>
              );
            }

            const isClassified = row.kind === 'classified';
            const isSkipped = row.kind === 'skipped';
            return (
              <motion.div
                key={i}
                layout
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 flex flex-wrap items-center gap-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-sm break-words">{row.text}</p>
                  <p className="text-white/35 text-[11px] mt-0.5">
                    {isClassified
                      ? `Added as ${NODE_TYPE_LABELS[row.node.node_type] ?? row.node.node_type}`
                      : isSkipped
                        ? 'Will be saved as a Draft Note'
                        : 'Choose a type or skip'}
                  </p>
                </div>
                {isClassified || isSkipped ? (
                  <button
                    type="button"
                    onClick={() => setRow({ kind: 'pending', text: row.text })}
                    className="text-xs text-white/50 hover:text-white underline decoration-dotted"
                  >
                    Undo
                  </button>
                ) : (
                  <>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const type = e.target.value;
                        if (type)
                          setRow({ kind: 'classifying', text: row.text, type });
                      }}
                      className="text-xs bg-white/[0.05] border border-white/10 rounded-md px-2 py-1 text-white/80"
                    >
                      <option value="" disabled>
                        Classify as…
                      </option>
                      {CLASSIFIABLE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {NODE_TYPE_LABELS[t] ?? t}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setRow({ kind: 'skipped', text: row.text })}
                      className="text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-md px-2 py-1 transition-colors"
                    >
                      Skip for now
                    </button>
                  </>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={handleContinue}
            className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-xl shadow-purple-600/20 text-base cursor-pointer"
          >
            Continue to review
          </button>
          {onBack && (
            <button
              onClick={onBack}
              className="border border-white/10 text-white/40 hover:text-white/70 font-medium py-3 px-6 rounded-xl transition-colors text-base cursor-pointer"
            >
              {backLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
