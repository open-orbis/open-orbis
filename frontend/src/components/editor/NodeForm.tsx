import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NODE_TYPE_LABELS, NODE_TYPE_COLORS } from '../graph/NodeColors';
import { linkSkill, unlinkSkill } from '../../api/orbs';
import { useOrbStore } from '../../stores/orbStore';

interface EnhanceResult {
  node_type: string;
  properties: Record<string, string>;
}

interface NodeFormProps {
  initialType?: string;
  initialValues?: Record<string, unknown>;
  onSubmit: (nodeType: string, properties: Record<string, unknown>) => void;
  onCancel: () => void;
  onTypeChange?: (nodeType: string) => void;
  onDelete?: () => void;
  onEnhance?: (text: string) => Promise<EnhanceResult | null>;
  onSaveDraft?: (nodeType: string, properties: Record<string, unknown>) => void;
}

// Layout config per type: which fields go where
const LAYOUT_CONFIG: Record<string, {
  left: string[];
  main: string[];
  extra: string[];
  currentToggle?: string;
}> = {
  work_experience: {
    left: ['start_date', 'end_date'],
    main: ['company', 'title', 'location'],
    extra: ['description', 'company_url'],
    currentToggle: 'end_date',
  },
  education: {
    left: ['start_date', 'end_date'],
    main: ['institution', 'degree', 'field_of_study', 'location'],
    extra: ['description'],
    currentToggle: 'end_date',
  },
  project: {
    left: ['start_date', 'end_date'],
    main: ['name', 'role'],
    extra: ['description', 'url'],
    currentToggle: 'end_date',
  },
  certification: {
    left: ['issue_date', 'expiry_date'],
    main: ['name', 'issuing_organization'],
    extra: ['credential_url'],
  },
  publication: {
    left: ['date'],
    main: ['title', 'venue'],
    extra: ['abstract', 'doi', 'url'],
  },
  patent: {
    left: ['filing_date', 'grant_date'],
    main: ['title', 'patent_number', 'inventors'],
    extra: ['description', 'url'],
  },
  award: {
    left: ['date'],
    main: ['name', 'issuing_organization'],
    extra: ['description', 'url'],
  },
  outreach: {
    left: ['date'],
    main: ['title', 'type', 'venue', 'role'],
    extra: ['description', 'url'],
  },
};

// Date pair validation rules per node type
const DATE_PAIRS: Record<string, [string, string, string][]> = {
  work_experience: [['start_date', 'end_date', 'Start date must be before end date']],
  education: [['start_date', 'end_date', 'Start date must be before end date']],
  project: [['start_date', 'end_date', 'Start date must be before end date']],
  certification: [['issue_date', 'expiry_date', 'Issue date must be before expiry date']],
  patent: [['filing_date', 'grant_date', 'Filing date must be before grant date']],
};

// Accept: MM/YYYY or DD/MM/YYYY
const DATE_FORMAT_RE = /^(\d{2}\/\d{4}|\d{2}\/\d{2}\/\d{4})$/;

/** Convert DD/MM/YYYY or MM/YYYY to sortable YYYY-MM-DD or YYYY-MM for comparison. */
function toSortable(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length === 2) return `${parts[1]}-${parts[0]}`; // MM/YYYY → YYYY-MM
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD/MM/YYYY → YYYY-MM-DD
  return dateStr;
}

function validateDates(nodeType: string, values: Record<string, string>, isCurrent: boolean): string | null {
  // Check format of all date fields
  for (const [key, val] of Object.entries(values)) {
    if (!key.includes('date') || !val.trim()) continue;
    if (!DATE_FORMAT_RE.test(val.trim())) {
      return `Invalid date format for ${key.replace(/_/g, ' ')}. Use MM/YYYY or DD/MM/YYYY.`;
    }
  }

  // Check date pairs (start ≤ end)
  const pairs = DATE_PAIRS[nodeType];
  if (!pairs) return null;

  for (const [startField, endField, message] of pairs) {
    const start = values[startField];
    const end = values[endField];
    if (!start || !end) continue;
    if (isCurrent && (endField === 'end_date' || endField === 'expiry_date')) continue;
    // Ensure matching formats (both MM/YYYY or both DD/MM/YYYY)
    const startParts = start.split('/').length;
    const endParts = end.split('/').length;
    if (startParts !== endParts) {
      return `${startField.replace(/_/g, ' ')} and ${endField.replace(/_/g, ' ')} must use the same format`;
    }
    if (toSortable(start) > toSortable(end)) return message;
  }
  return null;
}

// Simple layout types (no 3-column)
const SIMPLE_FIELDS: Record<string, string[]> = {
  skill: ['name', 'category', 'proficiency'],
  language: ['name', 'proficiency'],
};

function FieldInput({
  field,
  value,
  onChange,
  color,
}: {
  field: string;
  value: string;
  onChange: (v: string) => void;
  color: string;
}) {
  const label = field.replace(/_/g, ' ');
  const isDate = field.includes('date');
  const isUrl = field.includes('url');
  const isTextarea = field === 'description' || field === 'abstract';
  const showUrlHint = isUrl && value.trim() !== '' && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(value.trim());
  const showDateHint = isDate && value.trim() !== '' && !/^(\d{2}\/\d{4}|\d{2}\/\d{2}\/\d{4})$/.test(value.trim());

  const baseClass = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/25 focus:outline-none focus:ring-1 focus:border-transparent transition-colors';

  return (
    <div>
      <label className="block text-[10px] font-medium text-white/35 uppercase tracking-wider mb-1">
        {label}
      </label>
      {isTextarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          className={baseClass}
          style={{ '--tw-ring-color': `${color}60` } as React.CSSProperties}
          rows={3}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isDate ? 'MM/YYYY or DD/MM/YYYY' : label}
          className={baseClass}
          style={{ '--tw-ring-color': `${color}60` } as React.CSSProperties}
        />
      )}
      {showUrlHint && (
        <p className="text-[10px] text-amber-400/60 mt-1">
          This doesn't look like a valid URL (e.g. example.com)
        </p>
      )}
      {showDateHint && (
        <p className="text-[10px] text-amber-400/60 mt-1">
          Use format MM/YYYY or DD/MM/YYYY
        </p>
      )}
    </div>
  );
}

export default function NodeForm({ initialType, initialValues, onSubmit, onCancel, onTypeChange, onDelete, onEnhance, onSaveDraft }: NodeFormProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nodeType, setNodeType] = useState(initialType || 'skill');
  const [enhancing, setEnhancing] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  useEffect(() => {
    onTypeChange?.(nodeType);
  }, [nodeType, onTypeChange]);
  const [values, setValues] = useState<Record<string, string>>(
    (initialValues as Record<string, string>) || {}
  );
  const [isCurrent, setIsCurrent] = useState(false);
  const [expanded, setExpanded] = useState(() => {
    // Auto-expand if any extra field has a pre-filled value
    if (!initialValues) return false;
    const layout = LAYOUT_CONFIG[initialType || 'skill'];
    if (!layout) return false;
    return layout.extra.some((f) => initialValues[f]);
  });

  const set = (field: string, v: string) => {
    setValues({ ...values, [field]: v });
    if (dateError) setDateError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateDates(nodeType, values, isCurrent);
    if (error) {
      setDateError(error);
      return;
    }
    setDateError(null);
    const filtered = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== '')
    );
    if (isCurrent) {
      delete filtered.end_date;
      delete filtered.expiry_date;
    }
    onSubmit(nodeType, filtered);
  };

  const handleSaveDraftClick = () => {
    if (!onSaveDraft) return;
    const filtered = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== '')
    );
    if (isCurrent) {
      delete filtered.end_date;
      delete filtered.expiry_date;
    }
    onSaveDraft(nodeType, filtered);
  };

  const handleEnhanceClick = async () => {
    if (!onEnhance || enhancing) return;
    // Build text from all non-empty values
    const text = Object.entries(values)
      .filter(([, v]) => v && v.trim())
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join('\n');
    if (!text) return;
    setEnhancing(true);
    try {
      const result = await onEnhance(text);
      if (result) {
        setNodeType(result.node_type);
        setValues(result.properties);
        // Auto-expand extra fields if they have values
        const newLayout = LAYOUT_CONFIG[result.node_type];
        if (newLayout && newLayout.extra.some((f) => result.properties[f])) {
          setExpanded(true);
        }
      }
    } finally {
      setEnhancing(false);
    }
  };

  const hasAnyText = Object.values(values).some((v) => v && v.trim());

  const color = NODE_TYPE_COLORS[nodeType] || '#8b5cf6';
  const layout = LAYOUT_CONFIG[nodeType];
  const simple = SIMPLE_FIELDS[nodeType];

  const actionButtons = (
    <div className="mt-5">
      {dateError && (
        <p className="text-red-400 text-xs mb-2 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          {dateError}
        </p>
      )}
    <div className="flex gap-2">
      {onEnhance && (
        <button
          type="button"
          onClick={handleEnhanceClick}
          disabled={enhancing || !hasAnyText}
          className={`flex items-center gap-1.5 font-medium py-2.5 px-4 rounded-lg transition-all text-sm border ${
            enhancing
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400/80'
              : hasAnyText
                ? 'border-amber-500/20 text-amber-400/70 hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300'
                : 'border-white/5 text-white/15 cursor-not-allowed'
          }`}
          title="Enhance with AI: translate, improve, and extract fields"
        >
          {enhancing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Enhancing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              Enhance
            </>
          )}
        </button>
      )}
      {onSaveDraft && !initialValues?.uid && (
        <button
          type="button"
          onClick={handleSaveDraftClick}
          disabled={!hasAnyText}
          className={`flex items-center gap-1.5 font-medium py-2.5 px-4 rounded-lg transition-all text-sm border ${
            hasAnyText
              ? 'border-purple-500/30 text-purple-300 hover:border-purple-500/50 hover:bg-purple-500/10'
              : 'border-white/5 text-white/15 cursor-not-allowed'
          }`}
          title="Save as draft to keep refining later"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Save Draft
        </button>
      )}
      <button
        type="submit"
        className="flex-1 text-white font-medium py-2.5 px-4 rounded-lg transition-all hover:brightness-110 text-sm shadow-lg"
        style={{ backgroundColor: color, boxShadow: `0 4px 14px ${color}30` }}
      >
        {initialValues ? 'Update' : 'Add to Graph'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 border border-white/10 hover:bg-white/5 text-white/50 hover:text-white/70 font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
      >
        Cancel
      </button>
      {onDelete && (
        confirmDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="text-white bg-red-500/80 hover:bg-red-500 font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
          >
            Confirm
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-white/25 hover:text-red-400 hover:bg-red-500/10 p-2.5 rounded-lg transition-colors"
            title="Delete this entry"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )
      )}
    </div>
    </div>
  );

  // 3-column structured layout
  if (layout) {
    const toggleField = layout.currentToggle;

    return (
      <form onSubmit={handleSubmit}>
        <TypeSelector nodeType={nodeType} color={color} onChange={(t) => { setNodeType(t); setValues({}); setExpanded(false); }} />

        <AnimatePresence mode="wait">
        <motion.div
          key={nodeType}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          {/* LEFT: dates */}
          <div className="w-full sm:w-1/3 border-b sm:border-b-0 sm:border-r border-white/5 pb-3 sm:pb-0 sm:pr-4 space-y-3">
            {layout.left.map((field) => {
              if (isCurrent && field === toggleField) return null;
              return (
                <FieldInput
                  key={field}
                  field={field}
                  value={values[field] || ''}
                  onChange={(v) => set(field, v)}
                  color={color}
                />
              );
            })}
            {toggleField && (
              <label className="flex items-center gap-2 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={isCurrent}
                  onChange={(e) => setIsCurrent(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/50"
                />
                <span className="text-xs text-white/40">Current</span>
              </label>
            )}
          </div>

          {/* RIGHT 2/3: main fields */}
          <div className="w-full sm:w-2/3 space-y-3">
            {layout.main.map((field) => (
              <FieldInput
                key={field}
                field={field}
                value={values[field] || ''}
                onChange={(v) => set(field, v)}
                color={color}
              />
            ))}
          </div>
        </div>

        {/* Toggle button for extra fields */}
        {layout.extra.length > 0 && (
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: `${color}aa` }}
            >
              {expanded ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                  Less details
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  More details
                </>
              )}
            </button>
          </div>
        )}

        {/* Extra fields (expanded) */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
            {layout.extra.map((field) => (
              <FieldInput
                key={field}
                field={field}
                value={values[field] || ''}
                onChange={(v) => set(field, v)}
                color={color}
              />
            ))}
          </div>
        )}

        {/* Skill linker for work_experience and project */}
        {initialValues?.uid && (nodeType === 'work_experience' || nodeType === 'project') && (
          <SkillLinker nodeUid={initialValues.uid as string} />
        )}
        </motion.div>
        </AnimatePresence>

        {actionButtons}
      </form>
    );
  }

  // Simple layout (skill, language, collaborator)
  return (
    <form onSubmit={handleSubmit}>
      <TypeSelector nodeType={nodeType} color={color} onChange={(t) => { setNodeType(t); setValues({}); }} />

      <AnimatePresence mode="wait">
      <motion.div
        key={nodeType}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
      <div className="space-y-3">
        {(simple || []).map((field) => (
          <FieldInput
            key={field}
            field={field}
            value={values[field] || ''}
            onChange={(v) => set(field, v)}
            color={color}
          />
        ))}
      </div>
      </motion.div>
      </AnimatePresence>

      {actionButtons}
    </form>
  );
}

function SkillLinker({ nodeUid }: { nodeUid: string }) {
  const { data, fetchOrb } = useOrbStore();
  const [linking, setLinking] = useState(false);

  const allSkills = (data?.nodes || []).filter((n) => n._labels?.[0] === 'Skill');
  const linkedSkillUids = new Set(
    (data?.links || [])
      .filter((l) => l.source === nodeUid && l.type === 'USED_SKILL')
      .map((l) => l.target)
  );

  if (allSkills.length === 0) return null;

  const handleToggle = async (skillUid: string) => {
    setLinking(true);
    try {
      if (linkedSkillUids.has(skillUid)) {
        await unlinkSkill(nodeUid, skillUid);
      } else {
        await linkSkill(nodeUid, skillUid);
      }
      await fetchOrb();
    } catch {
      // ignore
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-white/5">
      <label className="block text-[10px] font-medium text-white/35 uppercase tracking-wider mb-2">
        Linked Skills
      </label>
      <div className="flex flex-wrap gap-1.5">
        {allSkills.map((skill) => {
          const isLinked = linkedSkillUids.has(skill.uid);
          return (
            <button
              key={skill.uid}
              type="button"
              disabled={linking}
              onClick={() => handleToggle(skill.uid)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                isLinked
                  ? 'bg-orange-500/15 border-orange-500/30 text-orange-300 font-medium'
                  : 'bg-white/5 border-white/10 text-white/30 hover:border-white/20 hover:text-white/50'
              } ${linking ? 'opacity-50' : ''}`}
            >
              {isLinked ? '\u2713 ' : '+ '}{(skill.name || 'Skill') as string}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TypeSelector({ nodeType, onChange }: { nodeType: string; color: string; onChange: (t: string) => void }) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-1 sm:gap-1.5">
        {Object.entries(NODE_TYPE_LABELS).map(([key, label]) => {
          const isSelected = key === nodeType;
          const btnColor = NODE_TYPE_COLORS[key] || '#8b5cf6';
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border transition-all font-medium ${
                isSelected
                  ? 'text-white border-transparent'
                  : 'text-white/30 border-white/10 hover:border-white/20 hover:text-white/50 bg-transparent'
              }`}
              style={isSelected ? {
                backgroundColor: `${btnColor}25`,
                borderColor: `${btnColor}50`,
                color: btnColor,
              } : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
