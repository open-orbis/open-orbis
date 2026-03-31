// ── Colorblind-safe palette (Wong + IBM Design) ──
// Tested against Deuteranopia, Protanopia, and Tritanopia.
export const NODE_COLORS: Record<string, string> = {
  Person: '#CC79A7',       // Reddish Purple (Wong)
  Education: '#0072B2',    // Blue (Wong)
  WorkExperience: '#009E73', // Bluish Green (Wong)
  Certification: '#E69F00', // Orange (Wong)
  Language: '#F0E442',     // Yellow (Wong)
  Publication: '#56B4E9',  // Sky Blue (Wong)
  Project: '#D55E00',      // Vermillion (Wong)
  Skill: '#648FFF',        // Periwinkle (IBM)
  Collaborator: '#785EF0', // Purple (IBM)
  Patent: '#DC267F',       // Magenta (IBM)
};

export function getNodeColor(labels: string[]): string {
  for (const label of labels) {
    if (NODE_COLORS[label]) return NODE_COLORS[label];
  }
  return '#6b7280';
}

export const NODE_TYPE_COLORS: Record<string, string> = {
  education: '#0072B2',
  work_experience: '#009E73',
  certification: '#E69F00',
  language: '#F0E442',
  publication: '#56B4E9',
  project: '#D55E00',
  skill: '#648FFF',
  collaborator: '#785EF0',
  patent: '#DC267F',
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

// Secondary visual cues — shape markers so color is never the sole differentiator.
export const NODE_SHAPE_MARKERS: Record<string, string> = {
  Person: '\u25CF',        // ● filled circle
  Education: '\u25C6',     // ◆ diamond
  WorkExperience: '\u25A0', // ■ square
  Certification: '\u2605', // ★ star
  Language: '\u25B2',      // ▲ triangle
  Publication: '\u25C7',   // ◇ open diamond
  Project: '\u2B22',       // ⬢ hexagon
  Skill: '\u25C9',         // ◉ bullseye
  Collaborator: '\u25CE',  // ◎ double circle
  Patent: '\u2B1F',        // ⬟ pentagon
};

export const NODE_TYPE_SHAPE_MARKERS: Record<string, string> = {
  education: '\u25C6',
  work_experience: '\u25A0',
  certification: '\u2605',
  language: '\u25B2',
  publication: '\u25C7',
  project: '\u2B22',
  skill: '\u25C9',
  collaborator: '\u25CE',
  patent: '\u2B1F',
};
