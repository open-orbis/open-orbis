import { describe, it, expect } from 'vitest';
import { getNodeDates } from './dateFilterStore';

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
