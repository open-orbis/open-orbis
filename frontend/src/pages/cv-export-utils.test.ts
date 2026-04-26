import { describe, it, expect } from 'vitest';
import { parseDateSort, sortDesc } from './cv-export-utils';
import type { OrbNode } from '../api/orbs';

const node = (uid: string, fields: Record<string, unknown> = {}): OrbNode => ({
  uid,
  _labels: [],
  ...fields,
});

describe('parseDateSort', () => {
  it('returns 0 for missing or non-string values', () => {
    expect(parseDateSort(undefined)).toBe(0);
    expect(parseDateSort(null)).toBe(0);
    expect(parseDateSort(42)).toBe(0);
  });

  it('parses MM/YYYY into a comparable timestamp', () => {
    expect(parseDateSort('06/2024')).toBeGreaterThan(parseDateSort('06/2020'));
    expect(parseDateSort('07/2024')).toBeGreaterThan(parseDateSort('06/2024'));
  });

  it('treats "present" as the current moment so it ranks above completed dates', () => {
    expect(parseDateSort('present')).toBeGreaterThan(parseDateSort('06/2024'));
    expect(parseDateSort('Present')).toBeGreaterThan(parseDateSort('06/2024'));
  });
});

describe('sortDesc', () => {
  it('sorts nodes by a single date field, most-recent first', () => {
    const result = sortDesc(
      [
        node('a', { date: '03/2020' }),
        node('b', { date: '07/2024' }),
        node('c', { date: '11/2022' }),
      ],
      'date',
    );
    expect(result.map((n) => n.uid)).toEqual(['b', 'c', 'a']);
  });

  it('places "present" above all completed items', () => {
    const result = sortDesc(
      [
        node('old', { end_date: '12/2018' }),
        node('current', { end_date: 'present' }),
        node('recent', { end_date: '03/2024' }),
      ],
      'end_date',
    );
    expect(result.map((n) => n.uid)).toEqual(['current', 'recent', 'old']);
  });

  it('falls back to a secondary field when the primary is missing', () => {
    // Use case: a Project still in progress has no end_date — sort by
    // start_date so it doesn't drop to the bottom.
    const result = sortDesc(
      [
        node('completed', { end_date: '01/2020', start_date: '06/2018' }),
        node('inflight', { start_date: '03/2024' }), // no end_date
        node('older-completed', { end_date: '06/2019', start_date: '01/2017' }),
      ],
      'end_date',
      'start_date',
    );
    expect(result.map((n) => n.uid)).toEqual(['inflight', 'completed', 'older-completed']);
  });

  it('does not mutate the input array', () => {
    const input = [node('a', { date: '01/2020' }), node('b', { date: '01/2024' })];
    const snapshot = input.map((n) => n.uid);
    sortDesc(input, 'date');
    expect(input.map((n) => n.uid)).toEqual(snapshot);
  });

  it('keeps undated items at the bottom without crashing', () => {
    const result = sortDesc(
      [
        node('dated', { date: '03/2024' }),
        node('undated'),
      ],
      'date',
    );
    expect(result.map((n) => n.uid)).toEqual(['dated', 'undated']);
  });
});
