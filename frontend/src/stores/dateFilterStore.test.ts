import { describe, it, expect } from 'vitest';
import { getNodeDates, computeDateFilteredNodeIds } from './dateFilterStore';

describe('getNodeDates', () => {
  it('extracts YYYY-MM from ISO dates', () => {
    const node = { start_date: '2023-06-15', end_date: '2024-01-01' };
    const dates = getNodeDates(node);
    expect(dates).toContain('2023-06');
    expect(dates).toContain('2024-01');
  });

  it('handles YYYY format', () => {
    const dates = getNodeDates({ start_date: '2020' });
    expect(dates).toContain('2020-01');
  });

  it('handles MM/YYYY format', () => {
    const dates = getNodeDates({ start_date: '06/2023' });
    expect(dates).toContain('2023-06');
  });

  it('skips "present" and empty values', () => {
    const dates = getNodeDates({ start_date: '2020', end_date: 'present' });
    expect(dates).toHaveLength(1);
  });

  it('returns empty for nodes with no date fields', () => {
    expect(getNodeDates({ name: 'Python' })).toHaveLength(0);
  });
});

describe('computeDateFilteredNodeIds — dateless neighbor logic', () => {
  const person = { uid: 'p', _labels: ['Person'] };

  it('returns empty set when range is null', () => {
    const filtered = computeDateFilteredNodeIds(
      [person, { uid: 'w1', _labels: ['WorkExperience'], start_date: '2020' }],
      [],
      null,
      null,
    );
    expect(filtered.size).toBe(0);
  });

  it('returns empty set when range covers full bounds', () => {
    const filtered = computeDateFilteredNodeIds(
      [{ uid: 'w1', _labels: ['WorkExperience'], start_date: '2020-01' }],
      [],
      '2019-01',
      '2025-12',
      '2020-01',
      '2024-01',
    );
    expect(filtered.size).toBe(0);
  });

  it('never filters the Person node', () => {
    const filtered = computeDateFilteredNodeIds(
      [person],
      [],
      '2020-01',
      '2020-12',
    );
    expect(filtered.has('p')).toBe(false);
  });

  it('filters dated nodes that are out of range', () => {
    const filtered = computeDateFilteredNodeIds(
      [
        { uid: 'w1', _labels: ['WorkExperience'], start_date: '2018-01', end_date: '2019-06' },
        { uid: 'w2', _labels: ['WorkExperience'], start_date: '2022-01', end_date: '2023-06' },
      ],
      [],
      '2022-01',
      '2022-12',
    );
    expect(filtered.has('w1')).toBe(true);
    expect(filtered.has('w2')).toBe(false);
  });

  it('keeps Skill visible when ONE of two linked WorkExperiences is in range', () => {
    const filtered = computeDateFilteredNodeIds(
      [
        { uid: 'w_old', _labels: ['WorkExperience'], start_date: '2015-01', end_date: '2016-06' },
        { uid: 'w_new', _labels: ['WorkExperience'], start_date: '2023-01', end_date: '2024-06' },
        { uid: 's', _labels: ['Skill'], name: 'Python' },
      ],
      [
        { source: 'w_old', target: 's' },
        { source: 'w_new', target: 's' },
      ],
      '2023-01',
      '2024-01',
    );
    expect(filtered.has('w_old')).toBe(true);
    expect(filtered.has('w_new')).toBe(false);
    expect(filtered.has('s')).toBe(false); // kept visible because w_new overlaps
  });

  it('hides Skill when ALL linked dated nodes are out of range', () => {
    const filtered = computeDateFilteredNodeIds(
      [
        { uid: 'w_old1', _labels: ['WorkExperience'], start_date: '2010-01', end_date: '2011-06' },
        { uid: 'w_old2', _labels: ['WorkExperience'], start_date: '2012-01', end_date: '2013-06' },
        { uid: 's', _labels: ['Skill'], name: 'COBOL' },
      ],
      [
        { source: 'w_old1', target: 's' },
        { source: 'w_old2', target: 's' },
      ],
      '2023-01',
      '2024-01',
    );
    expect(filtered.has('s')).toBe(true);
  });

  it('hides Skill with no links at all', () => {
    const filtered = computeDateFilteredNodeIds(
      [
        { uid: 'w', _labels: ['WorkExperience'], start_date: '2023-01' },
        { uid: 's', _labels: ['Skill'], name: 'Orphan' },
      ],
      [], // no edges
      '2023-01',
      '2024-01',
    );
    expect(filtered.has('s')).toBe(true);
  });

  it('one-hop only: Skill linked only to another dateless node stays hidden', () => {
    // Skill A → Skill B (both dateless). Neither has a dated neighbor, so
    // both are hidden — no transitive rescue.
    const filtered = computeDateFilteredNodeIds(
      [
        { uid: 'w', _labels: ['WorkExperience'], start_date: '2023-01' },
        { uid: 'sA', _labels: ['Skill'], name: 'A' },
        { uid: 'sB', _labels: ['Skill'], name: 'B' },
      ],
      [
        { source: 'sA', target: 'sB' },
        { source: 'w', target: 'sB' }, // sB is rescued by w, but sA is not transitively rescued through sB
      ],
      '2023-01',
      '2024-01',
    );
    expect(filtered.has('sB')).toBe(false); // directly linked to w_new → kept
    expect(filtered.has('sA')).toBe(true);  // only linked to another dateless → hidden
  });

  it('link direction does not matter (undirected traversal)', () => {
    // The input is directed (source/target), but a Skill linked via
    // "Skill -> WorkExperience" should still be rescued the same as
    // "WorkExperience -> Skill".
    const filtered = computeDateFilteredNodeIds(
      [
        { uid: 'w', _labels: ['WorkExperience'], start_date: '2023-01' },
        { uid: 's', _labels: ['Skill'] },
      ],
      [{ source: 's', target: 'w' }], // flipped direction
      '2023-01',
      '2024-01',
    );
    expect(filtered.has('s')).toBe(false);
  });
});
