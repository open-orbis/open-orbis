import { create } from 'zustand';

// ── Date utilities ──

const DATE_FIELDS = [
  'start_date', 'end_date', 'date',
  'issue_date', 'expiry_date',
  'filing_date', 'grant_date',
] as const;

/**
 * Normalize a date string to "YYYY-MM" format.
 * Accepts: "YYYY", "YYYY-MM", "YYYY-MM-DD", "YYYY-MM-DDTHH:MM:SS...",
 * "MM/YYYY", "DD/MM/YYYY". Skips non-date values like "present".
 */
function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === 'present' || trimmed === 'current') return null;

  // "YYYY"
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01`;
  // "YYYY-MM"
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  // "YYYY-MM-DD" optionally followed by time component (ISO datetime)
  const isoMatch = trimmed.match(/^(\d{4}-\d{2})-\d{2}/);
  if (isoMatch) return isoMatch[1];
  // "MM/YYYY"
  const mmYyyy = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) return `${mmYyyy[2]}-${mmYyyy[1].padStart(2, '0')}`;
  // "DD/MM/YYYY"
  const ddMmYyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMmYyyy) return `${ddMmYyyy[3]}-${ddMmYyyy[2].padStart(2, '0')}`;

  return null;
}

/**
 * Extract all normalized dates from a node's known date fields.
 */
export function getNodeDates(node: Record<string, unknown>): string[] {
  const dates: string[] = [];
  for (const field of DATE_FIELDS) {
    const val = node[field];
    if (typeof val === 'string' && val) {
      const norm = normalizeDate(val);
      if (norm) dates.push(norm);
    }
  }
  return dates;
}

/**
 * Check if a dated node overlaps with the selected range.
 * A node is "in range" if any of its dates fall within [rangeStart, rangeEnd],
 * OR if it has a span (start_date..end_date etc.) that overlaps the range.
 */
function nodeIsInRange(
  node: Record<string, unknown>,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  const dates = getNodeDates(node);
  if (dates.length === 0) return false; // dateless — handled separately

  // Check if any single date is within range
  for (const d of dates) {
    if (d >= rangeStart && d <= rangeEnd) return true;
  }

  // Span check: catches nodes whose date range brackets the selected range entirely
  // (e.g., start_date before rangeStart AND end_date after rangeEnd)
  const sorted = [...dates].sort();
  const nodeMin = sorted[0];
  const nodeMax = sorted[sorted.length - 1];
  // Overlap: nodeMin <= rangeEnd AND nodeMax >= rangeStart
  return nodeMin <= rangeEnd && nodeMax >= rangeStart;
}

/**
 * Compute node IDs that should be ghosted (transparent) based on the date range.
 *
 * Logic:
 * 1. If range is null, return empty set (no filtering).
 * 2. Dated nodes outside the range → filtered.
 * 3. Dateless nodes (Skill, Language, etc.) are visible iff at least one
 *    directly-linked dated neighbor overlaps the range. A dateless node
 *    with zero dated neighbors — or whose dated neighbors are all out of
 *    range — is filtered. Link walk is one-hop only (a dateless neighbor
 *    is never considered "reachable"), which keeps the computation O(N+E)
 *    and matches the "the skill is active in this timeframe" intuition.
 * 4. Person node is never filtered.
 */
export function computeDateFilteredNodeIds(
  nodes: Array<Record<string, unknown>>,
  links: Array<{ source: string; target: string }>,
  rangeStart: string | null,
  rangeEnd: string | null,
  boundsMin?: string | null,
  boundsMax?: string | null,
): Set<string> {
  if (!rangeStart || !rangeEnd) return new Set();
  // If range covers the full bounds, no filtering needed
  if (boundsMin && boundsMax && rangeStart <= boundsMin && rangeEnd >= boundsMax) return new Set();

  const outOfRangeIds = new Set<string>();
  const datelessIds: string[] = [];
  const datedInRangeIds = new Set<string>();

  // First pass — dated nodes. Dateless nodes are deferred to the second pass
  // once we know which dated nodes are in range.
  for (const node of nodes) {
    const uid = node.uid as string;
    const labels = node._labels as string[] | undefined;

    // Person node is never filtered
    if (labels?.[0] === 'Person') continue;

    const dates = getNodeDates(node);
    if (dates.length === 0) {
      datelessIds.push(uid);
      continue;
    }

    if (nodeIsInRange(node, rangeStart, rangeEnd)) {
      datedInRangeIds.add(uid);
    } else {
      outOfRangeIds.add(uid);
    }
  }

  if (datelessIds.length === 0) return outOfRangeIds;

  // Second pass — for each dateless node, check if any one-hop neighbor is
  // a dated node that's in range. If yes, keep it visible; otherwise filter.
  const neighborsByUid = new Map<string, string[]>();
  for (const { source, target } of links) {
    let outA = neighborsByUid.get(source);
    if (!outA) {
      outA = [];
      neighborsByUid.set(source, outA);
    }
    outA.push(target);
    let outB = neighborsByUid.get(target);
    if (!outB) {
      outB = [];
      neighborsByUid.set(target, outB);
    }
    outB.push(source);
  }

  for (const uid of datelessIds) {
    const neighbors = neighborsByUid.get(uid);
    const hasVisibleDatedNeighbor = neighbors?.some((nb) => datedInRangeIds.has(nb)) ?? false;
    if (!hasVisibleDatedNeighbor) {
      outOfRangeIds.add(uid);
    }
  }

  return outOfRangeIds;
}

// ── Zustand store ──

interface DateFilterState {
  rangeStart: string | null;
  rangeEnd: string | null;
  setRange: (start: string, end: string) => void;
  resetRange: () => void;
}

export const useDateFilterStore = create<DateFilterState>((set) => ({
  rangeStart: null,
  rangeEnd: null,
  setRange: (start, end) => set({ rangeStart: start, rangeEnd: end }),
  resetRange: () => set({ rangeStart: null, rangeEnd: null }),
}));
