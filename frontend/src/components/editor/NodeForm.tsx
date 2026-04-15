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
  training: {
    left: ['date'],
    main: ['title', 'provider'],
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
  patent: ['title', 'patent_number', 'inventors'],
  award: ['name'],
  outreach: ['title', 'venue'],
  training: ['title', 'provider'],
};

// Additional fields that should be required whenever they exist in the active modal.
const ALWAYS_REQUIRED_IF_PRESENT = ['field_of_study', 'location', 'start_date', 'end_date', 'issue_date', 'expiry_date', 'date', 'filing_date', 'grant_date'];

interface FieldMessage {
  text: string;
  tone: 'error' | 'warning';
}

function FieldInput({
  field,
  value,
  onChange,
  color,
  required = false,
  missing = false,
  allowYearOnly = false,
  message,
}: {
  field: string;
  value: string;
  onChange: (v: string) => void;
  color: string;
  required?: boolean;
  missing?: boolean;
  allowYearOnly?: boolean;
  message?: FieldMessage | null;
}) {
  const label = field.replace(/_/g, ' ');
  const isDate = field.includes('date');
  const isTextarea = field === 'description' || field === 'abstract';
  const hasValue = value.trim() !== '';
  const hasError = message?.tone === 'error';
  const hasWarning = message?.tone === 'warning';
  const isRequiredSatisfied = required && !missing && hasValue;
  const focusRingColor = hasError ? '#fb7185' : hasWarning ? '#f59e0b' : `${color}70`;
  const baseClass = `w-full rounded-xl border bg-black/35 px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:border-transparent transition-colors`;
  const toneBorderClass = hasError
    ? 'border-red-500/80'
    : hasWarning
      ? 'border-amber-500/60'
      : 'border-white/15';
  const displayLabel = label.replace(/\b\w/g, (m) => m.toUpperCase());

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium tracking-wide">
        <span className={isRequiredSatisfied ? 'text-white' : 'text-white/70'}>{displayLabel}</span>
        {required && <span style={isRequiredSatisfied ? { color } : undefined} className={isRequiredSatisfied ? '' : 'text-red-400'}>*</span>}
        {isDate && (
          <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )}
      </label>
      {isTextarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={displayLabel}
          className={`${baseClass} ${toneBorderClass} min-h-[90px] resize-y`}
          aria-invalid={hasError || undefined}
          style={{ '--tw-ring-color': focusRingColor, ...(isRequiredSatisfied && !hasError && !hasWarning ? { borderColor: `${color}70` } : {}) } as React.CSSProperties}
          rows={4}
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
          placeholder={isDate ? (allowYearOnly ? 'YYYY, MM/YYYY, or DD/MM/YYYY' : 'MM/YYYY or DD/MM/YYYY') : displayLabel}
          className={`${baseClass} ${toneBorderClass}`}
          aria-invalid={hasError || undefined}
          style={{ '--tw-ring-color': focusRingColor, ...(isRequiredSatisfied && !hasError && !hasWarning ? { borderColor: `${color}70` } : {}) } as React.CSSProperties}
        />
      )}
      {message && (
        <p className={`text-[11px] ${message.tone === 'error' ? 'text-red-300/90' : 'text-amber-300/85'}`}>
          {message.text}
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
  const toggleField = layoutForType?.currentToggle;
  const hiddenField = isCurrent && toggleField ? toggleField : null;
  const visibleFields = renderableFields.filter((field) => field !== hiddenField);
  const requiredVisibleFields = visibleFields.filter((field) => isRequiredField(field));
  const optionalVisibleFields = visibleFields.filter((field) => !isRequiredField(field));
  const allowYearOnlyForType = YEAR_ONLY_TYPES.has(nodeType);
  const dateFormatRe = allowYearOnlyForType ? DATE_FORMAT_WITH_YEAR_RE : DATE_FORMAT_RE;
  const dateFormatHint = allowYearOnlyForType ? 'Use YYYY, MM/YYYY, or DD/MM/YYYY.' : 'Use MM/YYYY or DD/MM/YYYY.';
  const urlRe = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i;

  const fieldMessages: Record<string, FieldMessage | null> = {};
  for (const field of visibleFields) {
    const val = (values[field] || '').trim();
    if (isMissingRequiredField(field)) {
      fieldMessages[field] = { text: 'This field is required.', tone: 'error' };
      continue;
    }
    if (!val) {
      fieldMessages[field] = null;
      continue;
    }
    if (field.includes('date')) {
      if (!dateFormatRe.test(val)) {
        fieldMessages[field] = { text: dateFormatHint, tone: 'error' };
        continue;
      }
      if (!/^\d{4}$/.test(val)) {
        const dateValidationError = isValidDate(val);
        if (dateValidationError) {
          fieldMessages[field] = { text: dateValidationError, tone: 'error' };
          continue;
        }
      }
    }
    if (field.includes('url') && !urlRe.test(val)) {
      fieldMessages[field] = { text: 'This does not look like a valid URL (e.g. example.com).', tone: 'warning' };
      continue;
    }
    fieldMessages[field] = null;
  }

  const renderField = (field: string) => (
    <div key={field} className={field === 'description' || field === 'abstract' ? 'sm:col-span-2' : undefined}>
      <FieldInput
        field={field}
        value={values[field] || ''}
        onChange={(v) => set(field, v)}
        color={color}
        required={isRequiredField(field)}
        missing={isMissingRequiredField(field)}
        allowYearOnly={allowYearOnlyForType}
        message={fieldMessages[field]}
      />
    </div>
  );

  const actionButtons = (
    <div className="mt-5 border-t border-white/10 pt-4">
      {dateError && (
        <p className="text-red-300 text-xs mb-3 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          {dateError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {onEnhance && (
            <button
              type="button"
              onClick={handleEnhanceClick}
              disabled={enhancing || !hasAnyText}
              className={`flex items-center gap-1.5 font-medium py-2.5 px-3.5 rounded-xl transition-all text-sm border ${
                enhancing
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : hasAnyText
                    ? 'border-amber-500/35 text-amber-300/90 hover:border-amber-400/70 hover:bg-amber-500/10'
                    : 'border-white/10 text-white/25 cursor-not-allowed'
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
              className={`flex items-center gap-1.5 font-medium py-2.5 px-3.5 rounded-xl transition-all text-sm border ${
                hasAnyText
                  ? 'border-violet-500/35 text-violet-200 hover:border-violet-400/70 hover:bg-violet-500/10'
                  : 'border-white/10 text-white/25 cursor-not-allowed'
              }`}
              title="Save as draft to keep refining later"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save Draft
            </button>
          )}
          {onDelete && (
            confirmDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="h-10 px-4 rounded-xl border border-red-400/60 bg-red-500/20 text-red-200 hover:bg-red-500/30 transition-colors text-sm font-medium"
              >
                Confirm Delete
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="h-10 px-3 rounded-xl border border-white/10 text-white/35 hover:text-red-300 hover:border-red-400/40 hover:bg-red-500/10 transition-colors"
                title="Delete this entry"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )
          )}
        </div>

        <div className="ml-auto flex w-full sm:w-auto flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-xl border border-white/15 text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={missingRequiredFields.length > 0}
            className="h-10 px-5 rounded-xl text-sm font-semibold text-white transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: color, boxShadow: `0 8px 22px ${color}45` }}
          >
            {initialValues ? 'Update Node' : 'Add to Graph'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-5">
        <aside className="md:w-56 md:flex-shrink-0">
          <TypeSelector nodeType={nodeType} onChange={(t) => { setNodeType(t); setValues({}); }} />
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={nodeType}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.24, ease: 'easeInOut' }}
              className="space-y-3.5"
            >
              <section className="rounded-2xl border border-white/12 bg-white/[0.04] p-3.5 sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Required Fields</p>
                  <span className="text-[11px] text-white/40">{requiredVisibleFields.length}</span>
                </div>
                {requiredVisibleFields.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {requiredVisibleFields.map(renderField)}
                  </div>
                ) : (
                  <p className="text-sm text-white/45">No required fields for this node type.</p>
                )}

                {toggleField && (
                  <label className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isCurrent}
                      onChange={(e) => setIsCurrent(e.target.checked)}
                      className="h-4 w-4 rounded border-white/25 bg-black/35 text-violet-500 focus:ring-violet-500/50"
                    />
                    <span className="text-xs text-white/65">This entry is current</span>
                  </label>
                )}
              </section>

              {optionalVisibleFields.length > 0 && (
                <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-3.5 sm:p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">Optional Details</p>
                    <span className="text-[11px] text-white/35">{optionalVisibleFields.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {optionalVisibleFields.map(renderField)}
                  </div>
                </section>
              )}

              {Boolean(initialValues?.uid) && (nodeType === 'work_experience' || nodeType === 'project') && (
                <SkillLinker nodeUid={initialValues!.uid as string} />
              )}
            </motion.div>
          </AnimatePresence>

          {actionButtons}
        </div>
      </div>
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 sm:p-4">
      <label className="block text-[11px] font-semibold text-white/45 uppercase tracking-[0.12em] mb-2.5">
        Linked Skills
      </label>
      <div className="flex flex-wrap gap-2">
        {allSkills.map((skill) => {
          const isLinked = linkedSkillUids.has(skill.uid);
          return (
            <button
              key={skill.uid}
              type="button"
              disabled={linking}
              onClick={() => handleToggle(skill.uid)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                isLinked
                  ? 'bg-orange-500/20 border-orange-500/45 text-orange-200 font-medium'
                  : 'bg-black/35 border-white/12 text-white/45 hover:border-white/25 hover:text-white/75'
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

const NODE_TYPE_DESCRIPTIONS: Record<string, string> = {
  education: 'Degrees and studies',
  work_experience: 'Jobs and positions',
  certification: 'Credentials and licenses',
  language: 'Spoken languages',
  publication: 'Articles and papers',
  project: 'Projects and products',
  skill: 'Technical or soft skills',
  patent: 'Inventions and filings',
  award: 'Awards and honors',
  outreach: 'Events and speaking',
  training: 'Courses and workshops',
};

function TypeSelector({ nodeType, onChange }: { nodeType: string; onChange: (t: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">Node Type</p>

      <div className="md:hidden -mx-1 px-1 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2" role="tablist" aria-label="Node type tabs">
          {Object.entries(NODE_TYPE_LABELS).map(([key, label]) => {
            const isSelected = key === nodeType;
            const btnColor = NODE_TYPE_COLORS[key] || '#8b5cf6';
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onChange(key)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                  isSelected
                    ? 'text-white border-white/25 bg-white/[0.1]'
                    : 'text-white/70 border-white/12 bg-black/35 hover:border-white/25 hover:text-white'
                }`}
                style={isSelected ? { borderColor: `${btnColor}80`, boxShadow: `inset 0 0 0 1px ${btnColor}35` } : undefined}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: btnColor }} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden md:block rounded-2xl border border-white/12 bg-white/[0.03] p-2">
        <div
          role="tablist"
          aria-label="Node type tabs"
          aria-orientation="vertical"
          className="max-h-[54vh] overflow-y-auto space-y-1 pr-1"
        >
          {Object.entries(NODE_TYPE_LABELS).map(([key, label]) => {
            const isSelected = key === nodeType;
            const btnColor = NODE_TYPE_COLORS[key] || '#8b5cf6';
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onChange(key)}
                className={`w-full text-left rounded-xl border p-2.5 transition-all ${
                  isSelected
                    ? 'border-white/25 bg-white/[0.09] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
                    : 'border-white/12 bg-black/35 hover:border-white/25 hover:bg-white/[0.05]'
                }`}
                style={isSelected ? { borderColor: `${btnColor}80`, boxShadow: `inset 0 0 0 1px ${btnColor}35` } : undefined}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: btnColor, boxShadow: `0 0 10px ${btnColor}66` }}
                  />
                  <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-white/80'}`}>{label}</span>
                </div>
                <p className={`mt-1 text-[10px] leading-snug ${isSelected ? 'text-white/70' : 'text-white/45'}`}>
                  {NODE_TYPE_DESCRIPTIONS[key] || 'Entry details'}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
