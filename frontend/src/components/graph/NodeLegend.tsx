import { useState, useRef, useEffect } from 'react';
import { NODE_COLORS, NODE_TYPE_LABELS } from './NodeColors';

// PascalCase -> snake_case mapping for labels lookup
const TYPE_KEY_MAP: Record<string, string> = {
  Education: 'education',
  WorkExperience: 'work_experience',
  Certification: 'certification',
  Language: 'language',
  Publication: 'publication',
  Project: 'project',
  Skill: 'skill',
  Collaborator: 'collaborator',
  Patent: 'patent',
};

const LEGEND_TYPES = Object.keys(TYPE_KEY_MAP);

export default function NodeLegend() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="absolute bottom-20 right-3 z-30 select-none">
      {open ? (
        <div className="bg-gray-900/90 backdrop-blur-sm border border-white/10 rounded-xl shadow-2xl p-3 w-48 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/70 text-[10px] font-bold uppercase tracking-widest">
              Node Types
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-white/30 hover:text-white/60 transition-colors"
              aria-label="Close legend"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <ul className="space-y-1" role="list" aria-label="Graph node type legend">
            {LEGEND_TYPES.map((type) => {
              const color = NODE_COLORS[type];
              const label = NODE_TYPE_LABELS[TYPE_KEY_MAP[type]];

              return (
                <li key={type} className="flex items-center gap-2 py-0.5">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span className="text-white/70 text-xs">{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-lg px-2.5 py-1.5 text-white/50 hover:text-white/80 hover:border-white/20 transition-all text-xs font-medium flex items-center gap-1.5"
          aria-label="Show node type legend"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          Legend
        </button>
      )}
    </div>
  );
}
