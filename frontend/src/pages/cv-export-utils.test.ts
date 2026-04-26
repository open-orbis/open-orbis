import { describe, it, expect } from 'vitest';
import { parseDateSort, sortDesc, sortRolesDesc, formatExportDate, formatExportDateRange } from './cv-export-utils';
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

  it('parses ISO YYYY-MM-DD / YYYY-MM / YYYY (the actual on-disk format)', () => {
    expect(parseDateSort('2024-06-15')).toBeGreaterThan(parseDateSort('2024-06-14'));
    expect(parseDateSort('2024-07')).toBeGreaterThan(parseDateSort('2024-06'));
    expect(parseDateSort('2024')).toBeGreaterThan(parseDateSort('2023'));
    // YYYY-MM is treated as the 1st of the month, so any same-month YYYY-MM-DD
    // ranks at or above the bare YYYY-MM.
    expect(parseDateSort('2024-06-15')).toBeGreaterThanOrEqual(parseDateSort('2024-06'));
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

  it('sorts ISO-formatted dates correctly (real-world data shape)', () => {
    const result = sortDesc(
      [
        node('a', { date: '2020-01' }),
        node('b', { date: '2024-12-09' }),
        node('c', { date: '2022' }),
        node('d', { date: '2024-06' }),
      ],
      'date',
    );
    expect(result.map((n) => n.uid)).toEqual(['b', 'd', 'c', 'a']);
  });
});

describe('sortRolesDesc', () => {
  // Roles (WorkExperience / Education / Project) treat an empty or 'present'
  // end_date as "still ongoing" — those entries must rank above any completed
  // role, regardless of how recently the completed one ended.
  const role = (uid: string, fields: Record<string, unknown>): OrbNode => ({
    uid,
    _labels: ['WorkExperience'],
    ...fields,
  });

  it('places ongoing roles (empty end_date) above completed roles', () => {
    const result = sortRolesDesc([
      role('phd-completed', { start_date: '2020-11-01', end_date: '2024-05-07' }),
      role('postdoc-ongoing', { start_date: '2024-04-18', end_date: null }),
      role('lecturer-ongoing', { start_date: '2024-12-09', end_date: '' }),
    ]);
    expect(result.map((n) => n.uid)).toEqual([
      'lecturer-ongoing', // most-recent start among ongoing
      'postdoc-ongoing',
      'phd-completed',    // completed roles always last
    ]);
  });

  it('treats explicit "Present" identically to empty end_date', () => {
    const result = sortRolesDesc([
      role('completed', { start_date: '2018', end_date: '2024-12' }),
      role('ongoing-present', { start_date: '2024-04', end_date: 'Present' }),
    ]);
    expect(result.map((n) => n.uid)).toEqual(['ongoing-present', 'completed']);
  });

  it('orders completed roles by end_date desc', () => {
    const result = sortRolesDesc([
      role('older', { start_date: '2010', end_date: '2015' }),
      role('newer', { start_date: '2018', end_date: '2022' }),
      role('middle', { start_date: '2014', end_date: '2018' }),
    ]);
    expect(result.map((n) => n.uid)).toEqual(['newer', 'middle', 'older']);
  });
});

describe('formatExportDate', () => {
  it('renders YYYY-MM-DD as DD/MM/YYYY', () => {
    expect(formatExportDate('2024-06-15')).toBe('15/06/2024');
  });

  it('renders YYYY-MM as MM/YYYY (no day)', () => {
    expect(formatExportDate('2024-06')).toBe('06/2024');
  });

  it('renders YYYY as a bare year', () => {
    expect(formatExportDate('2024')).toBe('2024');
  });

  it('renders "present" / "Present" as "Present"', () => {
    expect(formatExportDate('present')).toBe('Present');
    expect(formatExportDate('Present')).toBe('Present');
  });

  it('returns empty for missing or non-string input', () => {
    expect(formatExportDate('')).toBe('');
    expect(formatExportDate(undefined)).toBe('');
    expect(formatExportDate(null)).toBe('');
  });

  it('passes unknown formats through as-is so existing legacy values still display', () => {
    expect(formatExportDate('Sep 2020')).toBe('Sep 2020');
    expect(formatExportDate('06/2024')).toBe('06/2024');
  });
});

describe('formatExportDateRange', () => {
  it('joins start and end with an em-dash', () => {
    expect(formatExportDateRange('2020-11', '2024-05')).toBe('11/2020 — 05/2024');
  });

  it('renders an absent end as "Present" — the role is still active', () => {
    expect(formatExportDateRange('2020-11', '')).toBe('11/2020 — Present');
    expect(formatExportDateRange('2020-11', undefined)).toBe('11/2020 — Present');
  });

  it('omits the dash when there is no start either (avoids dangling " — Present")', () => {
    expect(formatExportDateRange('', '')).toBe('');
    expect(formatExportDateRange(undefined, undefined)).toBe('');
  });

  it('handles end-only ranges by showing just the end', () => {
    expect(formatExportDateRange('', '2024-06')).toBe('06/2024');
  });
});
