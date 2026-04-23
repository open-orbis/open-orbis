import { describe, it, expect } from 'vitest';
import { buildAdjacencyMap } from './adjacency';

describe('buildAdjacencyMap', () => {
  it('returns an empty map for no links', () => {
    const map = buildAdjacencyMap([]);
    expect(map.size).toBe(0);
  });

  it('builds an undirected entry for a single link', () => {
    const map = buildAdjacencyMap([{ source: 'A', target: 'B' }]);
    expect(map.get('A')).toEqual(new Set(['B']));
    expect(map.get('B')).toEqual(new Set(['A']));
  });

  it('merges duplicate links into a single neighbor entry', () => {
    const map = buildAdjacencyMap([
      { source: 'A', target: 'B' },
      { source: 'A', target: 'B' },
    ]);
    expect(map.get('A')).toEqual(new Set(['B']));
    expect(map.get('B')).toEqual(new Set(['A']));
  });

  it('ignores self-loops (a node is not its own neighbor)', () => {
    const map = buildAdjacencyMap([{ source: 'A', target: 'A' }]);
    expect(map.get('A') ?? new Set()).toEqual(new Set());
  });

  it('resolves link source/target whether they are strings or objects with id', () => {
    const map = buildAdjacencyMap([
      { source: 'A', target: 'B' },
      { source: { id: 'B' }, target: { id: 'C' } },
    ]);
    expect(map.get('A')).toEqual(new Set(['B']));
    expect(map.get('B')).toEqual(new Set(['A', 'C']));
    expect(map.get('C')).toEqual(new Set(['B']));
  });

  it('handles a small graph correctly', () => {
    // A — B — C — D, plus A — D (a triangle-ish shape)
    const map = buildAdjacencyMap([
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
      { source: 'C', target: 'D' },
      { source: 'A', target: 'D' },
    ]);
    expect(map.get('A')).toEqual(new Set(['B', 'D']));
    expect(map.get('B')).toEqual(new Set(['A', 'C']));
    expect(map.get('C')).toEqual(new Set(['B', 'D']));
    expect(map.get('D')).toEqual(new Set(['C', 'A']));
  });
});
