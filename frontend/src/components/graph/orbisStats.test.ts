import { describe, expect, it } from 'vitest';
import type { OrbData } from '../../api/orbs';
import { computeOrbisStatsSummary } from './orbisStats';

const baseData: OrbData = {
  person: { user_id: 'person-1', name: 'Ada Lovelace' },
  nodes: [
    {
      uid: 'work-1',
      _labels: ['WorkExperience'],
      title: 'Research Engineer',
      company: 'OpenOrbis',
      start_date: '2022-01',
    },
    { uid: 'skill-1', _labels: ['Skill'], name: 'TypeScript' },
    { uid: 'skill-2', _labels: ['Skill'], name: 'Python' },
    {
      uid: 'project-1',
      _labels: ['Project'],
      title: 'Graph Insights',
      description: 'Interactive graph analytics dashboard',
      start_date: '2024-01',
      end_date: '2025-06',
    },
    {
      uid: 'edu-1',
      _labels: ['Education'],
      institution: 'University of Pisa',
      degree: 'MSc AI',
      start_date: '2018-09',
      end_date: '2020-07',
    },
  ],
  links: [
    { source: 'person-1', target: 'work-1', type: 'HAS_WORK_EXPERIENCE' },
    { source: 'person-1', target: 'project-1', type: 'HAS_PROJECT' },
    { source: 'person-1', target: 'edu-1', type: 'HAS_EDUCATION' },
    { source: 'work-1', target: 'skill-1', type: 'USED_SKILL' },
    { source: 'project-1', target: 'skill-1', type: 'USED_SKILL' },
    { source: 'project-1', target: 'skill-2', type: 'USED_SKILL' },
    { source: 'work-1', target: 'project-1', type: 'RELATED_TO' },
  ],
};

describe('computeOrbisStatsSummary', () => {
  it('computes core metrics excluding Person node edges', () => {
    const stats = computeOrbisStatsSummary(baseData, new Set(), new Set(), new Date('2026-04-14T00:00:00Z'));

    expect(stats.visibleNodes).toBe(5);
    expect(stats.activeNodes).toBe(5);
    // Person edges (3) excluded: only work-1→skill-1, project-1→skill-1, project-1→skill-2, work-1→project-1
    expect(stats.visibleLinks).toBe(4);
    expect(stats.activeLinks).toBe(4);
    expect(stats.skillEligibleNodes).toBe(3); // work-1, project-1, edu-1
    expect(stats.skillLinkedNodes).toBe(2); // work-1, project-1
    expect(stats.skillCoverageRate).toBeCloseTo(2 / 3, 4);
    // Top hub: project-1 has 3 edges (skill-1, skill-2, work-1)
    expect(stats.topHubName).toBe('Graph Insights');
    expect(stats.topHubDegree).toBe(3);
    expect(stats.topHubNeighbors).toHaveLength(3);
    // Avg edges/node: 4 edges / 5 nodes = 0.8
    expect(stats.avgLinksPerNode).toBeCloseTo(0.8, 4);
  });

  it('computes orphan nodes (nodes with zero non-Person edges)', () => {
    const stats = computeOrbisStatsSummary(baseData, new Set(), new Set(), new Date('2026-04-14T00:00:00Z'));

    // edu-1 has no non-Person edges (only person-1→edu-1 which is excluded)
    expect(stats.orphanNodes).toBe(1);
    expect(stats.orphanNodeDetails).toHaveLength(1);
    expect(stats.orphanNodeDetails[0].uid).toBe('edu-1');
    expect(stats.orphanRate).toBeCloseTo(1 / 5, 4);
  });

  it('computes freshness score based on last 24 months', () => {
    const stats = computeOrbisStatsSummary(baseData, new Set(), new Set(), new Date('2026-04-14T00:00:00Z'));

    // Dated nodes: work-1 (2022-01), project-1 (2024-01, 2025-06), edu-1 (2018-09, 2020-07)
    // Recent (within 24 months of 2026-04): project-1 (2025-06 yes, 2024-01 no — but 2025-06 qualifies it)
    // So 1 out of 3 dated nodes is recent
    expect(stats.freshnessScore).toBeCloseTo(1 / 3, 2);
  });

  it('sorts top hub neighbors by edge count descending', () => {
    const stats = computeOrbisStatsSummary(baseData, new Set(), new Set(), new Date('2026-04-14T00:00:00Z'));

    // project-1 neighbors: skill-1 (degree 2), skill-2 (degree 1), work-1 (degree 2)
    // Sorted by degree desc: skill-1 and work-1 (both 2) then skill-2 (1)
    expect(stats.topHubNeighbors[0].name).toBe('Research Engineer'); // work-1, degree 2
    expect(stats.topHubNeighbors[2].name).toBe('Python'); // skill-2, degree 1
  });

  it('updates active metrics when nodes are muted by filters', () => {
    const stats = computeOrbisStatsSummary(
      baseData,
      new Set(),
      new Set(['edu-1']),
      new Date('2026-04-14T00:00:00Z'),
    );

    expect(stats.filtersActive).toBe(true);
    expect(stats.activeNodes).toBe(4);
    // Person edges excluded, edu-1 filtered out: work-1→skill-1, project-1→skill-1, project-1→skill-2, work-1→project-1
    expect(stats.activeLinks).toBe(4);
  });

  it('drops hidden node types from visible metrics', () => {
    const stats = computeOrbisStatsSummary(
      baseData,
      new Set(['Skill']),
      new Set(),
      new Date('2026-04-14T00:00:00Z'),
    );

    expect(stats.visibleNodes).toBe(3);
    // Only non-Person, non-Skill edges where both endpoints visible: work-1→project-1
    expect(stats.visibleLinks).toBe(1);
    expect(stats.skillEligibleNodes).toBe(3);
    expect(stats.skillLinkedNodes).toBe(0);
    expect(stats.skillCoverageRate).toBe(0);
  });
});
