/**
 * Static demo dataset for the landing page interactive orb.
 * Showcases all node types with realistic data.
 */
import type { OrbData } from '../api/orbs';

const DEMO_ORB: OrbData = {
  person: {
    user_id: 'demo',
    orb_id: 'demo',
    name: 'Alex Morgan',
    headline: 'Senior ML Engineer & Quantum Computing Researcher',
    location: 'Berlin, Germany',
  },
  nodes: [
    // Work Experience
    { uid: 'we1', _labels: ['WorkExperience'], title: 'Senior ML Engineer', company: 'DeepMind', start_date: '2022-01', end_date: null, location: 'London, UK', description: 'Led development of reinforcement learning systems for protein folding optimization.' },
    { uid: 'we2', _labels: ['WorkExperience'], title: 'Research Scientist', company: 'CERN', start_date: '2019-06', end_date: '2021-12', location: 'Geneva, Switzerland', description: 'Applied machine learning to particle physics data analysis and anomaly detection.' },
    { uid: 'we3', _labels: ['WorkExperience'], title: 'Software Engineer', company: 'Spotify', start_date: '2017-03', end_date: '2019-05', location: 'Stockholm, Sweden', description: 'Built recommendation engine features serving 400M+ users.' },

    // Education
    { uid: 'ed1', _labels: ['Education'], institution: 'ETH Zurich', degree: 'PhD in Computer Science', start_date: '2014-09', end_date: '2018-06', description: 'Thesis: Neural Architecture Search for Efficient Inference.' },
    { uid: 'ed2', _labels: ['Education'], institution: 'MIT', degree: 'BSc in Mathematics & CS', start_date: '2010-09', end_date: '2014-06', description: 'Summa cum laude. Focus on algorithms and computational complexity.' },

    // Skills
    { uid: 'sk1', _labels: ['Skill'], name: 'Python', category: 'Programming' },
    { uid: 'sk2', _labels: ['Skill'], name: 'Machine Learning', category: 'Research Area' },
    { uid: 'sk3', _labels: ['Skill'], name: 'PyTorch', category: 'Framework' },
    { uid: 'sk4', _labels: ['Skill'], name: 'Reinforcement Learning', category: 'Research Area' },
    { uid: 'sk5', _labels: ['Skill'], name: 'Quantum Computing', category: 'Research Area' },
    { uid: 'sk6', _labels: ['Skill'], name: 'Kubernetes', category: 'Tool' },
    { uid: 'sk7', _labels: ['Skill'], name: 'Rust', category: 'Programming' },
    { uid: 'sk8', _labels: ['Skill'], name: 'TensorFlow', category: 'Framework' },
    { uid: 'sk9', _labels: ['Skill'], name: 'Data Science', category: 'Methodology' },
    { uid: 'sk10', _labels: ['Skill'], name: 'Graph Neural Networks', category: 'Research Area' },

    // Publications
    { uid: 'pub1', _labels: ['Publication'], title: 'Efficient Neural Architecture Search via Parameter Sharing', venue: 'NeurIPS 2023', date: '2023-12' },
    { uid: 'pub2', _labels: ['Publication'], title: 'Anomaly Detection in High-Energy Physics with GNNs', venue: 'Physical Review Letters (2021)', date: '2021-08' },

    // Projects
    { uid: 'pr1', _labels: ['Project'], name: 'OpenQML', role: 'Creator', description: 'Open-source quantum machine learning library. 2K+ GitHub stars.', start_date: '2022-06' },
    { uid: 'pr2', _labels: ['Project'], name: 'ParticleNet', role: 'Lead Developer', description: 'Graph neural network for jet tagging at the LHC.', start_date: '2020-01', end_date: '2021-12' },

    // Certifications
    { uid: 'ce1', _labels: ['Certification'], name: 'AWS Solutions Architect', issuing_organization: 'Amazon Web Services', date: '2023-03' },

    // Languages
    { uid: 'la1', _labels: ['Language'], name: 'English', proficiency: 'Native' },
    { uid: 'la2', _labels: ['Language'], name: 'German', proficiency: 'Professional (C1)' },

    // Patent
    { uid: 'pa1', _labels: ['Patent'], title: 'Method for Efficient Gradient Computation in Sparse Networks', patent_number: 'EP2023/074521', filing_date: '2023-01' },

    // Award
    { uid: 'aw1', _labels: ['Award'], name: 'Best Paper Award', issuing_organization: 'NeurIPS 2023', date: '2023-12' },

    // Outreach
    { uid: 'ou1', _labels: ['Outreach'], title: 'Keynote: The Future of AI in Science', type: 'keynote', venue: 'AI Summit Berlin', date: '2024-03', role: 'Speaker' },
  ],
  links: [
    // Person -> nodes (same as Neo4j HAS_* relationships)
    { source: 'demo', target: 'we1', type: 'HAS_WORK_EXPERIENCE' },
    { source: 'demo', target: 'we2', type: 'HAS_WORK_EXPERIENCE' },
    { source: 'demo', target: 'we3', type: 'HAS_WORK_EXPERIENCE' },
    { source: 'demo', target: 'ed1', type: 'HAS_EDUCATION' },
    { source: 'demo', target: 'ed2', type: 'HAS_EDUCATION' },
    { source: 'demo', target: 'sk1', type: 'HAS_SKILL' },
    { source: 'demo', target: 'sk2', type: 'HAS_SKILL' },
    { source: 'demo', target: 'sk3', type: 'HAS_SKILL' },
    { source: 'demo', target: 'sk4', type: 'HAS_SKILL' },
    { source: 'demo', target: 'sk5', type: 'HAS_SKILL' },
    { source: 'demo', target: 'sk6', type: 'HAS_SKILL' },
    { source: 'demo', target: 'sk7', type: 'HAS_SKILL' },
    { source: 'demo', target: 'sk8', type: 'HAS_SKILL' },
    { source: 'demo', target: 'sk9', type: 'HAS_SKILL' },
    { source: 'demo', target: 'sk10', type: 'HAS_SKILL' },
    { source: 'demo', target: 'pub1', type: 'HAS_PUBLICATION' },
    { source: 'demo', target: 'pub2', type: 'HAS_PUBLICATION' },
    { source: 'demo', target: 'pr1', type: 'HAS_PROJECT' },
    { source: 'demo', target: 'pr2', type: 'HAS_PROJECT' },
    { source: 'demo', target: 'ce1', type: 'HAS_CERTIFICATION' },
    { source: 'demo', target: 'la1', type: 'SPEAKS' },
    { source: 'demo', target: 'la2', type: 'SPEAKS' },
    { source: 'demo', target: 'pa1', type: 'HAS_PATENT' },
    { source: 'demo', target: 'aw1', type: 'HAS_AWARD' },
    { source: 'demo', target: 'ou1', type: 'HAS_OUTREACH' },

    // Work Experience -> Skills
    { source: 'we1', target: 'sk2', type: 'USED_SKILL' },
    { source: 'we1', target: 'sk3', type: 'USED_SKILL' },
    { source: 'we1', target: 'sk4', type: 'USED_SKILL' },
    { source: 'we1', target: 'sk1', type: 'USED_SKILL' },
    { source: 'we2', target: 'sk2', type: 'USED_SKILL' },
    { source: 'we2', target: 'sk10', type: 'USED_SKILL' },
    { source: 'we2', target: 'sk1', type: 'USED_SKILL' },
    { source: 'we3', target: 'sk1', type: 'USED_SKILL' },
    { source: 'we3', target: 'sk9', type: 'USED_SKILL' },
    { source: 'we3', target: 'sk6', type: 'USED_SKILL' },

    // Education -> Skills
    { source: 'ed1', target: 'sk2', type: 'USED_SKILL' },
    { source: 'ed1', target: 'sk1', type: 'USED_SKILL' },

    // Projects -> Skills
    { source: 'pr1', target: 'sk5', type: 'USED_SKILL' },
    { source: 'pr1', target: 'sk1', type: 'USED_SKILL' },
    { source: 'pr1', target: 'sk3', type: 'USED_SKILL' },
    { source: 'pr2', target: 'sk10', type: 'USED_SKILL' },
    { source: 'pr2', target: 'sk8', type: 'USED_SKILL' },

    // Publications -> Skills
    { source: 'pub1', target: 'sk2', type: 'USED_SKILL' },
    { source: 'pub2', target: 'sk10', type: 'USED_SKILL' },

    // Award -> Skills
    { source: 'aw1', target: 'sk2', type: 'USED_SKILL' },

    // Outreach -> Skills
    { source: 'ou1', target: 'sk2', type: 'USED_SKILL' },
    { source: 'ou1', target: 'sk5', type: 'USED_SKILL' },
  ],
};

export default DEMO_ORB;
