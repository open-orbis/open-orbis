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

// Accept: MM/YYYY or DD/MM/YYYY (or YYYY for types that allow it)
const DATE_FORMAT_RE = /^(\d{2}\/\d{4}|\d{2}\/\d{2}\/\d{4})$/;
const DATE_FORMAT_WITH_YEAR_RE = /^(\d{4}|\d{2}\/\d{4}|\d{2}\/\d{2}\/\d{4})$/;

// Node types where date fields accept year-only (YYYY) format
const YEAR_ONLY_TYPES = new Set(['publication']);

const DAYS_IN_MONTH = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Mask date input to enforce MM/YYYY or DD/MM/YYYY structure.
 * Allows `/` or `-` as separators (dashes converted to `/`).
 * Auto-inserts `/` after 2-digit groups when typing digits only.
 * Respects user-typed separators to distinguish MM/YYYY from DD/MM/YYYY.
 */
function maskDateInput(raw: string, prev: string, allowYearOnly: boolean): string {
  // Normalize: strip invalid chars, convert dashes to slashes
  const v = raw.replace(/[^\d/-]/g, '').replace(/-/g, '/');

  // Detect backspace — let the user delete freely
  if (v.length < prev.length) return v;

  // Split on slashes to get user-typed segments
  const parts = v.split('/');

  // For year-only mode: if no slash and <= 4 digits, allow bare YYYY
  if (allowYearOnly && parts.length === 1 && parts[0].length <= 4) {
    return parts[0].replace(/\D/g, '').slice(0, 4);
  }

  // Enforce segment lengths: each segment max 2 digits, last segment max 4
  const maxLens = parts.length <= 2 ? [2, 4] : [2, 2, 4];
  const capped: string[] = [];
  for (let i = 0; i < parts.length && i < maxLens.length; i++) {
    capped.push(parts[i].replace(/\D/g, '').slice(0, maxLens[i]));
  }

  // Auto-insert `/` when a segment reaches its max and user is typing digits
  const last = capped[capped.length - 1];
  const lastMax = maxLens[capped.length - 1];
  if (capped.length < maxLens.length && last.length >= lastMax) {
    // Segment is full, start next segment
    return capped.join('/') + '/';
  }

  return capped.join('/');
}

/** Convert ISO dates (YYYY-MM-DD, YYYY-MM, YYYY) to display format (DD/MM/YYYY, MM/YYYY). */
function isoToDisplay(value: string): string {
  if (!value) return value;
  const v = value.trim();
  // YYYY-MM-DD → DD/MM/YYYY
  const full = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (full) return `${full[3]}/${full[2]}/${full[1]}`;
  // YYYY-MM → MM/YYYY
  const partial = v.match(/^(\d{4})-(\d{2})$/);
  if (partial) return `${partial[2]}/${partial[1]}`;
  // YYYY alone → 01/YYYY
  const yearOnly = v.match(/^(\d{4})$/);
  if (yearOnly) return `01/${yearOnly[1]}`;
  return value;
}

/** Normalize date fields in initial values from ISO to display format. */
function normalizeInitialDates(values: Record<string, unknown>, fields: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    const str = v != null ? String(v) : '';
    result[k] = fields.includes(k) ? isoToDisplay(str) : str;
  }
  return result;
}

/** Validate that a date string has valid month (1-12) and day (1-maxForMonth). */
function isValidDate(dateStr: string): string | null {
  const parts = dateStr.split('/');
  if (parts.length === 2) {
    // MM/YYYY
    const month = parseInt(parts[0], 10);
    if (month < 1 || month > 12) return 'Month must be between 01 and 12';
  } else if (parts.length === 3) {
    // DD/MM/YYYY
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (month < 1 || month > 12) return 'Month must be between 01 and 12';
    let maxDay = DAYS_IN_MONTH[month];
    // Adjust February for non-leap years
    if (month === 2) {
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      if (!isLeap) maxDay = 28;
    }
    if (day < 1 || day > maxDay) return `Day must be between 01 and ${maxDay} for month ${String(month).padStart(2, '0')}`;
  }
  return null;
}

/** Convert DD/MM/YYYY or MM/YYYY to sortable YYYY-MM-DD or YYYY-MM for comparison. */
function toSortable(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length === 2) return `${parts[1]}-${parts[0]}`; // MM/YYYY → YYYY-MM
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD/MM/YYYY → YYYY-MM-DD
  return dateStr;
}

function validateDates(nodeType: string, values: Record<string, string>, isCurrent: boolean): string | null {
  const allowYearOnly = YEAR_ONLY_TYPES.has(nodeType);
  const formatRe = allowYearOnly ? DATE_FORMAT_WITH_YEAR_RE : DATE_FORMAT_RE;
  const formatHint = allowYearOnly ? 'YYYY, MM/YYYY, or DD/MM/YYYY' : 'MM/YYYY or DD/MM/YYYY';

  // Check format and validity of all date fields
  for (const [key, val] of Object.entries(values)) {
    if (!key.includes('date') || !val.trim()) continue;
    if (!formatRe.test(val.trim())) {
      return `Invalid date format for ${key.replace(/_/g, ' ')}. Use ${formatHint}.`;
    }
    // Skip deep validation for year-only values
    if (/^\d{4}$/.test(val.trim())) continue;
    const dateError = isValidDate(val.trim());
    if (dateError) {
      return `Invalid ${key.replace(/_/g, ' ')}: ${dateError}.`;
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

// Required fields aligned with backend merge keys to ensure a valid add/update payload.
const REQUIRED_FIELDS: Record<string, string[]> = {
  skill: ['name'],
  language: ['name'],
  work_experience: ['company', 'title'],
  education: ['institution', 'degree'],
  certification: ['name', 'issuing_organization'],
  publication: ['title'],
  project: ['name'],
  patent: ['title', 'patent_number'],
  award: ['name'],
  outreach: ['title', 'venue'],
};

// Additional fields that should be required whenever they exist in the active modal.
const ALWAYS_REQUIRED_IF_PRESENT = ['field_of_study', 'location', 'start_date', 'end_date', 'issue_date', 'expiry_date', 'date', 'filing_date', 'grant_date'];

function FieldInput({
  field,
  value,
  onChange,
  color,
  required = false,
  missing = false,
  allowYearOnly = false,
}: {
  field: string;
  value: string;
  onChange: (v: string) => void;
  color: string;
  required?: boolean;
  missing?: boolean;
  allowYearOnly?: boolean;
}) {
  const label = field.replace(/_/g, ' ');
  const isDate = field.includes('date');
  const isUrl = field.includes('url');
  const isTextarea = field === 'description' || field === 'abstract';
  const dateRe = allowYearOnly ? DATE_FORMAT_WITH_YEAR_RE : DATE_FORMAT_RE;
  const showUrlHint = isUrl && value.trim() !== '' && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(value.trim());
  const showDateHint = isDate && value.trim() !== '' && (!dateRe.test(value.trim()) || (/^\d{4}$/.test(value.trim()) ? false : isValidDate(value.trim()) !== null));

  const isFilled = required && !missing;
  const borderClass = required
    ? (missing ? 'border-red-500/85' : '')
    : 'border-white/10';
  const baseClass = `w-full bg-white/5 border rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/25 focus:outline-none focus:ring-1 focus:border-transparent transition-colors`;

  return (
    <div>
      <label className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: isFilled ? color : undefined }}>
        <span className={isFilled ? '' : 'text-white/35'}>{label}</span>
        {required && <span style={isFilled ? { color } : undefined} className={isFilled ? '' : 'text-red-400 ml-0.5'}>*</span>}
        {isDate && (
          <svg className="w-3 h-3 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )}
      </label>
      {isTextarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          className={`${baseClass} ${borderClass}`}
          style={{ '--tw-ring-color': `${color}60`, ...(isFilled ? { borderColor: `${color}70` } : {}) } as React.CSSProperties}
          rows={3}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => {
            if (isDate) {
              onChange(maskDateInput(e.target.value, value, allowYearOnly));
            } else {
              onChange(e.target.value);
            }
          }}
          maxLength={isDate ? 10 : undefined}
          placeholder={isDate ? (allowYearOnly ? 'YYYY, MM/YYYY, or DD/MM/YYYY' : 'MM/YYYY or DD/MM/YYYY') : label}
          className={`${baseClass} ${borderClass}`}
          style={{ '--tw-ring-color': `${color}60`, ...(isFilled ? { borderColor: `${color}70` } : {}) } as React.CSSProperties}
        />
      )}
      {showUrlHint && (
        <p className="text-[10px] text-amber-400/60 mt-1">
          This doesn't look like a valid URL (e.g. example.com)
        </p>
      )}
      {showDateHint && (
        <p className="text-[10px] text-amber-400/60 mt-1">
          {!dateRe.test(value.trim())
            ? (allowYearOnly ? 'Use format YYYY, MM/YYYY, or DD/MM/YYYY' : 'Use format MM/YYYY or DD/MM/YYYY')
            : isValidDate(value.trim()) || 'Invalid date'}
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
  const dateFields = (LAYOUT_CONFIG[nodeType]?.left || []).filter((f) => f.includes('date'));
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!initialValues) return {};
    return normalizeInitialDates(initialValues, dateFields);
  });
  const [isCurrent, setIsCurrent] = useState(false);
  const layoutForType = LAYOUT_CONFIG[nodeType];
  const renderableFields = layoutForType
    ? [...layoutForType.left, ...layoutForType.main, ...layoutForType.extra]
    : (SIMPLE_FIELDS[nodeType] || []);
  const requiredSet = new Set(REQUIRED_FIELDS[nodeType] || []);
  for (const field of ALWAYS_REQUIRED_IF_PRESENT) {
    if (renderableFields.includes(field)) requiredSet.add(field);
  }
  // "Current" means the toggle date field (e.g. end_date) is intentionally omitted.
  if (isCurrent && layoutForType?.currentToggle) {
    requiredSet.delete(layoutForType.currentToggle);
  }
  const requiredFields = Array.from(requiredSet);
  const missingRequiredFields = requiredFields.filter((f) => !(values[f] || '').trim());
  const isRequiredField = (field: string) => requiredFields.includes(field);
  const isMissingRequiredField = (field: string) => missingRequiredFields.includes(field);

  const set = (field: string, v: string) => {
    setValues({ ...values, [field]: v });
    if (dateError) setDateError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (missingRequiredFields.length > 0) {
      setDateError(`Required fields missing: ${missingRequiredFields.map((f) => f.replace(/_/g, ' ')).join(', ')}`);
      return;
    }
    const error = validateDates(nodeType, values, isCurrent);
    if (error) {
      setDateError(error);
      return;
    }
    setDateError(null);
    // Only submit renderable fields — exclude metadata (_labels, uid, score, etc.)
    const filtered = Object.fromEntries(
      renderableFields
        .map((f) => [f, values[f] || ''] as const)
        .filter(([, v]) => v !== '')
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
      renderableFields
        .map((f) => [f, values[f] || ''] as const)
        .filter(([, v]) => v !== '')
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
        const enhanceDateFields = (LAYOUT_CONFIG[result.node_type]?.left || []).filter((f) => f.includes('date'));
        setValues(normalizeInitialDates(result.properties, enhanceDateFields));
      }
    } finally {
      setEnhancing(false);
    }
  };

  const hasAnyText = Object.values(values).some((v) => v && v.trim());

  const color = NODE_TYPE_COLORS[nodeType] || '#8b5cf6';
  const layout = layoutForType;
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
        disabled={missingRequiredFields.length > 0}
        className="flex-1 text-white font-medium py-2.5 px-4 rounded-lg transition-all hover:brightness-110 text-sm shadow-lg disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:brightness-100"
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
        <TypeSelector nodeType={nodeType} color={color} onChange={(t) => { setNodeType(t); setValues({}); }} />

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
                  required={isRequiredField(field)}
                  missing={isMissingRequiredField(field)}
                  allowYearOnly={YEAR_ONLY_TYPES.has(nodeType)}
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
                required={isRequiredField(field)}
                missing={isMissingRequiredField(field)}
              />
            ))}
          </div>
        </div>

        {/* Extra fields */}
        {layout.extra.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
            {layout.extra.map((field) => (
              <FieldInput
                key={field}
                field={field}
                value={values[field] || ''}
                onChange={(v) => set(field, v)}
                color={color}
                required={isRequiredField(field)}
                missing={isMissingRequiredField(field)}
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
            required={isRequiredField(field)}
            missing={isMissingRequiredField(field)}
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
