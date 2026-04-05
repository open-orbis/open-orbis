import { create } from 'zustand';

// ── Date utilities ──

const DATE_FIELDS = [
  'start_date', 'end_date', 'date',
  'issue_date', 'expiry_date',
  'filing_date', 'grant_date',
] as const;

/**
 * Normalize a date string to "YYYY-MM" format.
 * Accepts "YYYY", "YYYY-MM", or "YYYY-MM-DD".
 */
function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01`;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 7);
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

  // Check span overlap: node's earliest..latest overlaps range
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
 * 3. Dateless nodes: visible if at least one connected node is in range; otherwise filtered.
 * 4. Person node is never filtered.
 */
export function computeDateFilteredNodeIds(
  nodes: Array<Record<string, unknown>>,
  links: Array<{ source: string; target: string }>,
  rangeStart: string | null,
  rangeEnd: string | null,
): Set<string> {
  if (!rangeStart || !rangeEnd) return new Set();

  // First pass: determine which dated nodes are in/out of range
  const inRangeIds = new Set<string>();
  const outOfRangeIds = new Set<string>();
  const datelessIds: string[] = [];

  for (const node of nodes) {
    const uid = node.uid as string;
    const labels = node._labels as string[] | undefined;

    // Person node is never filtered
    if (labels?.[0] === 'Person') {
      inRangeIds.add(uid);
      continue;
    }

    const dates = getNodeDates(node);
    if (dates.length === 0) {
      datelessIds.push(uid);
    } else if (nodeIsInRange(node, rangeStart, rangeEnd)) {
      inRangeIds.add(uid);
    } else {
      outOfRangeIds.add(uid);
    }
  }

  // Second pass: dateless nodes — check if any connected node is in range
  // Build adjacency from links
  const neighbors = new Map<string, string[]>();
  for (const link of links) {
    const src = typeof link.source === 'string' ? link.source : (link.source as any).id ?? link.source;
    const tgt = typeof link.target === 'string' ? link.target : (link.target as any).id ?? link.target;
    if (!neighbors.has(src)) neighbors.set(src, []);
    if (!neighbors.has(tgt)) neighbors.set(tgt, []);
    neighbors.get(src)!.push(tgt);
    neighbors.get(tgt)!.push(src);
  }

  for (const uid of datelessIds) {
    const adj = neighbors.get(uid) || [];
    const hasVisibleNeighbor = adj.some((nid) => inRangeIds.has(nid));
    if (!hasVisibleNeighbor) {
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
