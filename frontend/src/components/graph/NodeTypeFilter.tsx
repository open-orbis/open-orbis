import { useState, useRef, useEffect } from 'react';
import { NODE_COLORS, NODE_TYPE_LABELS } from './NodeColors';

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

const ALL_TYPES = Object.keys(TYPE_KEY_MAP);

interface NodeTypeFilterProps {
  hiddenTypes: Set<string>;
  onToggleType: (type: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

export default function NodeTypeFilter({ hiddenTypes, onToggleType, onShowAll, onHideAll }: NodeTypeFilterProps) {
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

  const allVisible = hiddenTypes.size === 0;
  const noneVisible = hiddenTypes.size === ALL_TYPES.length;

  return (
    <div ref={ref} className="absolute bottom-20 right-3 z-30 select-none">
      {open ? (
        <div className="bg-gray-900/90 backdrop-blur-sm border border-white/10 rounded-xl shadow-2xl p-3 w-52 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/70 text-[10px] font-bold uppercase tracking-widest">
              Node Types
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-white/30 hover:text-white/60 transition-colors"
              aria-label="Close view panel"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Show All / Hide All */}
          <div className="flex items-center gap-1.5 mb-2">
            <button
              onClick={onShowAll}
              disabled={allVisible}
              className="text-[10px] font-medium text-purple-400 hover:text-purple-300 disabled:text-white/15 disabled:cursor-default px-1.5 py-0.5 rounded transition-colors"
            >
              Show all
            </button>
            <span className="text-white/10 text-[10px]">|</span>
            <button
              onClick={onHideAll}
              disabled={noneVisible}
              className="text-[10px] font-medium text-purple-400 hover:text-purple-300 disabled:text-white/15 disabled:cursor-default px-1.5 py-0.5 rounded transition-colors"
            >
              Hide all
            </button>
          </div>

          <ul className="space-y-0.5" role="list" aria-label="Node type visibility">
            {ALL_TYPES.map((type) => {
              const color = NODE_COLORS[type];
              const label = NODE_TYPE_LABELS[TYPE_KEY_MAP[type]];
              const isVisible = !hiddenTypes.has(type);

              return (
                <li key={type}>
                  <button
                    onClick={() => onToggleType(type)}
                    className="flex items-center gap-2 py-1 px-1 w-full rounded-md hover:bg-white/5 transition-colors group"
                  >
                    <span
                      className="w-3 h-3 rounded-sm flex-shrink-0 transition-opacity"
                      style={{
                        backgroundColor: color,
                        opacity: isVisible ? 1 : 0.15,
                      }}
                      aria-hidden="true"
                    />
                    <span
                      className="text-xs flex-1 text-left transition-opacity"
                      style={{ color: isVisible ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)' }}
                    >
                      {label}
                    </span>
                    {isVisible ? (
                      <svg className="w-3.5 h-3.5 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-lg px-2.5 py-1.5 text-white/50 hover:text-white/80 hover:border-white/20 transition-all text-xs font-medium flex items-center gap-1.5"
          aria-label="Toggle node type visibility"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          View
          {hiddenTypes.size > 0 && (
            <span className="bg-purple-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {hiddenTypes.size}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
