export const NODE_COLORS: Record<string, string> = {
  Person: '#8b5cf6',
  Education: '#3b82f6',
  WorkExperience: '#10b981',
  Certification: '#f59e0b',
  Language: '#ec4899',
  Publication: '#6366f1',
  Project: '#14b8a6',
  Skill: '#f97316',
  Collaborator: '#a855f7',
  Patent: '#06b6d4',
};

export function getNodeColor(labels: string[]): string {
  for (const label of labels) {
    if (NODE_COLORS[label]) return NODE_COLORS[label];
  }
  return '#6b7280';
}

export const NODE_TYPE_COLORS: Record<string, string> = {
  education: '#3b82f6',
  work_experience: '#10b981',
  certification: '#f59e0b',
  language: '#ec4899',
  publication: '#6366f1',
  project: '#14b8a6',
  skill: '#f97316',
  collaborator: '#a855f7',
  patent: '#06b6d4',
};

export const NODE_TYPE_LABELS: Record<string, string> = {
  education: 'Education',
  work_experience: 'Work Experience',
  certification: 'Certification',
  language: 'Language',
  publication: 'Publication',
  project: 'Project',
  skill: 'Skill',
  collaborator: 'Collaborator',
  patent: 'Patent',
};
