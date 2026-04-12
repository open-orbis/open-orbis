import { describe, it, expect, beforeEach } from 'vitest';
import { useFilterStore, computeFilteredNodeIds } from './filterStore';

describe('filterStore', () => {
  beforeEach(() => {
    useFilterStore.setState({ keywords: [], activeKeywords: [] });
  });

  it('addKeyword adds a new keyword', () => {
    useFilterStore.getState().addKeyword('python');
    expect(useFilterStore.getState().keywords).toContain('python');
  });

  it('addKeyword trims and lowercases', () => {
    useFilterStore.getState().addKeyword('  Python  ');
    expect(useFilterStore.getState().keywords).toContain('python');
  });

  it('addKeyword ignores duplicates', () => {
    useFilterStore.getState().addKeyword('python');
    useFilterStore.getState().addKeyword('python');
    expect(useFilterStore.getState().keywords).toHaveLength(1);
  });

  it('removeKeyword removes from both lists', () => {
    useFilterStore.setState({
      keywords: ['python', 'react'],
      activeKeywords: ['python'],
    });
    useFilterStore.getState().removeKeyword('python');
    expect(useFilterStore.getState().keywords).toEqual(['react']);
    expect(useFilterStore.getState().activeKeywords).toEqual([]);
  });

  it('toggleKeyword activates and deactivates', () => {
    useFilterStore.setState({ keywords: ['python'], activeKeywords: [] });

    useFilterStore.getState().toggleKeyword('python');
    expect(useFilterStore.getState().activeKeywords).toContain('python');

    useFilterStore.getState().toggleKeyword('python');
    expect(useFilterStore.getState().activeKeywords).not.toContain('python');
  });
});

describe('computeFilteredNodeIds', () => {
  it('returns matching node uids when keywords are active', () => {
    const nodes = [
      { uid: '1', name: 'Python Developer' },
      { uid: '2', name: 'React Engineer' },
      { uid: '3', company: 'Python Corp' },
    ];
    const filtered = computeFilteredNodeIds(nodes, ['python']);
    expect(filtered.has('1')).toBe(true);
    expect(filtered.has('3')).toBe(true);
    expect(filtered.has('2')).toBe(false);
  });

  it('returns empty set when no keywords active', () => {
    const nodes = [{ uid: '1', name: 'Python' }];
    expect(computeFilteredNodeIds(nodes, []).size).toBe(0);
  });
});
