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
  it('computes core vanity metrics for the active graph', () => {
    const stats = computeOrbisStatsSummary(baseData, new Set(), new Set(), new Date('2026-04-14T00:00:00Z'));

    expect(stats.visibleNodes).toBe(5);
    expect(stats.activeNodes).toBe(5);
    expect(stats.visibleLinks).toBe(7);
    expect(stats.activeLinks).toBe(7);
    expect(stats.typeDiversity).toBe(4);
    expect(stats.skillEligibleNodes).toBe(3);
    expect(stats.skillLinkedNodes).toBe(2);
    expect(stats.skillCoverageRate).toBeCloseTo(2 / 3, 4);
    expect(stats.topHubName).toBe('Graph Insights');
    expect(stats.topHubDegree).toBe(4);
    expect(stats.signatureSkillName).toBe('TypeScript');
    expect(stats.signatureSkillLinks).toBe(2);
    expect(stats.focusTopSkillEdges).toBe(3);
    expect(stats.usedSkillEdges).toBe(3);
    expect(stats.focusScore).toBe(1);
    expect(stats.careerSpanHasData).toBe(true);
    expect(stats.careerSpanYears).toBeCloseTo(6.75, 2);
    expect(stats.recencyScore).toBeCloseTo(0.2, 3);
    expect(stats.hubConcentration).toBeCloseTo(4 / 7, 3);
    expect(stats.domainBalanceScore).toBeGreaterThan(0);
    expect(stats.completenessRate).toBe(1);
    expect(stats.completeNodes).toBe(5);
    expect(stats.largestClusterRate).toBe(1);
    expect(stats.largestClusterNodes).toBe(5);
  });

  it('updates active metrics when nodes are muted by filters', () => {
    const stats = computeOrbisStatsSummary(
      baseData,
      new Set(),
      new Set(['edu-1']),
      new Date('2026-04-14T00:00:00Z'),
    );

    expect(stats.filtersActive).toBe(true);
    expect(stats.mutedNodes).toBe(1);
    expect(stats.activeNodes).toBe(4);
    expect(stats.activeLinks).toBe(6);
    expect(stats.connectivityRate).toBe(1);
    expect(stats.filtersActive).toBe(true);
    expect(stats.largestClusterRate).toBe(1);
  });

  it('drops hidden node types from visible metrics', () => {
    const stats = computeOrbisStatsSummary(
      baseData,
      new Set(['Skill']),
      new Set(),
      new Date('2026-04-14T00:00:00Z'),
    );

    expect(stats.hiddenNodes).toBe(2);
    expect(stats.visibleNodes).toBe(3);
    expect(stats.visibleLinks).toBe(4);
    expect(stats.skillEligibleNodes).toBe(3);
    expect(stats.skillLinkedNodes).toBe(0);
    expect(stats.skillCoverageRate).toBe(0);
    expect(stats.signatureSkillName).toBe('No linked skill yet');
    expect(stats.focusScore).toBe(0);
  });
});
