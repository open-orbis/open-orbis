import { NODE_TYPE_COLORS } from './NodeColors';

interface NodeTooltipProps {
  node: Record<string, unknown> | null;
  position: { x: number; y: number };
}

// Keys to never show in the tooltip
const HIDDEN_KEYS = new Set([
  'uid', '_labels', 'embedding', 'user_id', 'encryption_key_id',
  'id', 'index', 'x', 'y', 'z', 'vx', 'vy', 'vz',
  '__threeObj', 'threeObj', 'fx', 'fy', 'fz',
]);

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
  Collaborator: 'name',
  Patent: 'title',
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
  Collaborator: 'Collaborator',
  Patent: 'Patent',
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
  Collaborator: 'collaborator',
  Patent: 'patent',
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
  Collaborator: ['email'],
  Patent: ['patent_number', 'filing_date', 'grant_date', 'inventors'],
  Language: ['proficiency'],
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
      </div>
    </div>
  );
}
