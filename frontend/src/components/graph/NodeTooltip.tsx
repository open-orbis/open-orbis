import { NODE_TYPE_COLORS } from './NodeColors';

interface NodeTooltipProps {
  node: Record<string, unknown> | null;
  position: { x: number; y: number };
}

// Which fields to show as the "title" for each node type
const TITLE_FIELD: Record<string, string> = {
  Person: 'name',
  WorkExperience: 'title',
  Education: 'institution',
  Skill: 'name',
  Language: 'name',
  Certification: 'name',
  Publication: 'title',
  Project: 'name',
  Patent: 'title',
  Award: 'name',
  Outreach: 'title',
};

// Which fields to show as the "subtitle"
const SUBTITLE_FIELD: Record<string, string> = {
  WorkExperience: 'company',
  Education: 'degree',
  Certification: 'issuing_organization',
  Publication: 'venue',
  Project: 'role',
  Skill: 'category',
  Language: 'proficiency',
  Patent: 'patent_number',
  Award: 'issuing_organization',
  Outreach: 'venue',
};

// Nice display labels
const DISPLAY_LABELS: Record<string, string> = {
  Person: 'Person',
  WorkExperience: 'Work Experience',
  Education: 'Education',
  Skill: 'Skill',
  Language: 'Language',
  Certification: 'Certification',
  Publication: 'Publication',
  Project: 'Project',
  Patent: 'Patent',
  Award: 'Award',
  Outreach: 'Outreach',
};

// Map PascalCase label to snake_case for color lookup
const LABEL_TO_TYPE: Record<string, string> = {
  WorkExperience: 'work_experience',
  Education: 'education',
  Skill: 'skill',
  Language: 'language',
  Certification: 'certification',
  Publication: 'publication',
  Project: 'project',
  Patent: 'patent',
  Award: 'award',
  Outreach: 'outreach',
};

// Fields to show in the detail section (ordered)
const DETAIL_FIELDS: Record<string, string[]> = {
  WorkExperience: ['company', 'location', 'start_date', 'end_date'],
  Education: ['degree', 'field_of_study', 'location', 'start_date', 'end_date'],
  Certification: ['issuing_organization', 'date', 'issue_date', 'expiry_date'],
  Publication: ['venue', 'date'],
  Project: ['start_date', 'end_date'],
  Skill: ['proficiency', 'category'],
  Person: ['headline', 'location', 'email', 'orb_id'],
  Patent: ['patent_number', 'filing_date', 'grant_date', 'inventors'],
  Language: ['proficiency'],
  Award: ['issuing_organization', 'date'],
  Outreach: ['type', 'role', 'date'],
};

function formatDate(val: unknown): string {
  if (!val || typeof val !== 'string') return '';
  // Already formatted or a date string
  return val;
}

function formatFieldName(key: string): string {
  return key.replace(/_/g, ' ');
}

export default function NodeTooltip({ node, position }: NodeTooltipProps) {
  if (!node) return null;

  const labels = (node._labels as string[]) || [];
  const label = labels[0] || 'Node';
  const typeColor = NODE_TYPE_COLORS[LABEL_TO_TYPE[label] || ''] || '#8b5cf6';

  const titleField = TITLE_FIELD[label];
  const title = titleField ? (node[titleField] as string) : undefined;

  const subtitleField = SUBTITLE_FIELD[label];
  const subtitle = subtitleField ? (node[subtitleField] as string) : undefined;

  const detailKeys = DETAIL_FIELDS[label] || [];
  const shownFields = new Set([titleField, subtitleField].filter(Boolean));
  const details = detailKeys
    .filter((k) => node[k] != null && node[k] !== '' && !shownFields.has(k))
    .map((k) => ({ key: k, value: formatDate(node[k]) || String(node[k]) }));

  const description = node.description as string | undefined;
  const nodeUrl = (node.url || node.company_url || node.credential_url || node.doi) as string | undefined;

  // Clamp tooltip position so it doesn't overflow the viewport
  const tooltipX = Math.min(position.x + 16, window.innerWidth - 420);
  const tooltipY = Math.min(position.y + 16, window.innerHeight - 300);

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: tooltipX, top: tooltipY }}
    >
      <div
        className="bg-gray-900/95 backdrop-blur-sm text-white rounded-xl shadow-2xl overflow-hidden max-w-[85vw] sm:max-w-sm"
        style={{ borderTop: `3px solid ${typeColor}` }}
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-2">
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: typeColor }}>
            {DISPLAY_LABELS[label] || label}
          </div>
          {title && (
            <div className="text-sm font-semibold text-white leading-tight">{title}</div>
          )}
          {subtitle && (
            <div className="text-xs text-gray-300 mt-0.5">{subtitle}</div>
          )}
        </div>

        {/* Details */}
        {details.length > 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-x-4 gap-y-0.5">
            {details.map(({ key, value }) => (
              <div key={key} className="text-[11px]">
                <span className="text-gray-500">{formatFieldName(key)}</span>{' '}
                <span className="text-gray-300">{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Full description */}
        {description && (
          <div className="px-4 pb-3 border-t border-gray-700/50 pt-2">
            <p className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-line">{description}</p>
          </div>
        )}

        {/* Link hint */}
        {nodeUrl && (
          <div className="px-4 pb-2.5 border-t border-gray-700/50 pt-2 flex items-center gap-1.5">
            <svg className="w-3 h-3 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
            </svg>
            <span className="text-[11px] text-blue-400 font-medium">Click the node to open the associated link</span>
          </div>
        )}
      </div>
    </div>
  );
}
