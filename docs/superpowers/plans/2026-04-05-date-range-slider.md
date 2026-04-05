# Date Range Slider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vertical dual-handle date range slider to the left edge of the orb UI that filters nodes by time period on both owner and public views.

**Architecture:** New Zustand store (`dateFilterStore`) holds the selected range. A pure function computes which node IDs are outside that range (including cascading visibility for dateless nodes). A new `DateRangeSlider` component renders the vertical slider with drag handles. Both `OrbViewPage` and `SharedOrbPage` integrate the slider and merge filtered IDs into the existing `filteredNodeIds` prop.

**Tech Stack:** React 19, TypeScript, Zustand 5, Tailwind CSS 4, pointer events for drag interaction.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/stores/dateFilterStore.ts` | Zustand store + `getNodeDates()` + `computeDateFilteredNodeIds()` |
| Create | `frontend/src/components/graph/DateRangeSlider.tsx` | Vertical dual-handle slider component |
| Modify | `frontend/src/pages/OrbViewPage.tsx` | Integrate slider + merge date filter with keyword filter |
| Modify | `frontend/src/pages/SharedOrbPage.tsx` | Integrate slider + date filter |

---

### Task 1: Create the date filter store

**Files:**
- Create: `frontend/src/stores/dateFilterStore.ts`

- [ ] **Step 1: Create the store with date utilities and filtering logic**

Create `frontend/src/stores/dateFilterStore.ts` with this content:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors related to `dateFilterStore.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/dateFilterStore.ts
git commit -m "feat: add date filter store with range computation and cascading visibility"
```

---

### Task 2: Create the DateRangeSlider component

**Files:**
- Create: `frontend/src/components/graph/DateRangeSlider.tsx`

- [ ] **Step 1: Create the slider component**

Create `frontend/src/components/graph/DateRangeSlider.tsx` with this content:

```tsx
import { useCallback, useRef, useMemo } from 'react';
import { useDateFilterStore } from '../../stores/dateFilterStore';

interface DateRangeSliderProps {
  minDate: string; // "YYYY-MM"
  maxDate: string; // "YYYY-MM"
}

/** Convert "YYYY-MM" to total months since epoch for linear interpolation. */
function toMonths(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
}

/** Convert total months back to "YYYY-MM". */
function fromMonths(total: number): string {
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Format "YYYY-MM" to readable label like "Jun 2020". */
function formatLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${y}`;
}

export default function DateRangeSlider({ minDate, maxDate }: DateRangeSliderProps) {
  const { rangeStart, rangeEnd, setRange } = useDateFilterStore();
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'lower' | 'upper' | null>(null);

  const minM = useMemo(() => toMonths(minDate), [minDate]);
  const maxM = useMemo(() => toMonths(maxDate), [maxDate]);
  const totalSpan = maxM - minM;

  // Current handle positions (default to full range)
  const lowerM = rangeStart ? toMonths(rangeStart) : minM;
  const upperM = rangeEnd ? toMonths(rangeEnd) : maxM;

  // Convert month value to % from BOTTOM of track (bottom = minDate, top = maxDate)
  const toPercent = useCallback(
    (m: number) => (totalSpan === 0 ? 0 : ((m - minM) / totalSpan) * 100),
    [minM, totalSpan],
  );

  const lowerPct = toPercent(lowerM);
  const upperPct = toPercent(upperM);

  // Pointer → month value from track position
  const pointerToMonth = useCallback(
    (clientY: number): number => {
      if (!trackRef.current || totalSpan === 0) return minM;
      const rect = trackRef.current.getBoundingClientRect();
      // Inverted: top of track = maxDate, bottom = minDate
      const ratio = 1 - (clientY - rect.top) / rect.height;
      const clamped = Math.max(0, Math.min(1, ratio));
      return Math.round(minM + clamped * totalSpan);
    },
    [minM, totalSpan],
  );

  const onPointerDown = useCallback(
    (handle: 'lower' | 'upper') => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = handle;
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const m = pointerToMonth(e.clientY);

      if (draggingRef.current === 'lower') {
        const clampedLower = Math.min(m, upperM);
        setRange(fromMonths(clampedLower), fromMonths(upperM));
      } else {
        const clampedUpper = Math.max(m, lowerM);
        setRange(fromMonths(lowerM), fromMonths(clampedUpper));
      }
    },
    [pointerToMonth, lowerM, upperM, setRange],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  return (
    <div
      className="absolute left-2 top-16 bottom-8 w-10 hidden sm:flex flex-col items-center z-20 select-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Max date label (top) */}
      <span className="text-[9px] text-white/30 mb-1 whitespace-nowrap">
        {formatLabel(maxDate)}
      </span>

      {/* Track container */}
      <div ref={trackRef} className="relative flex-1 w-full flex justify-center">
        {/* Background track */}
        <div className="absolute top-0 bottom-0 w-[3px] rounded-full bg-white/10" />

        {/* Active range (purple) */}
        <div
          className="absolute w-[3px] rounded-full bg-[#785EF0]"
          style={{
            bottom: `${lowerPct}%`,
            top: `${100 - upperPct}%`,
          }}
        />

        {/* Upper handle */}
        <div
          className="absolute left-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ bottom: `${upperPct}%`, transform: `translate(-50%, 50%)` }}
          onPointerDown={onPointerDown('upper')}
        >
          <div className="w-[14px] h-[14px] rounded-full bg-[#785EF0] border-2 border-white shadow-lg shadow-purple-500/30" />
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[10px] text-white/50 whitespace-nowrap pointer-events-none">
            {formatLabel(fromMonths(upperM))}
          </span>
        </div>

        {/* Lower handle */}
        <div
          className="absolute left-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ bottom: `${lowerPct}%`, transform: `translate(-50%, 50%)` }}
          onPointerDown={onPointerDown('lower')}
        >
          <div className="w-[14px] h-[14px] rounded-full bg-[#785EF0] border-2 border-white shadow-lg shadow-purple-500/30" />
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[10px] text-white/50 whitespace-nowrap pointer-events-none">
            {formatLabel(fromMonths(lowerM))}
          </span>
        </div>
      </div>

      {/* Min date label (bottom) */}
      <span className="text-[9px] text-white/30 mt-1 whitespace-nowrap">
        {formatLabel(minDate)}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors related to `DateRangeSlider.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/graph/DateRangeSlider.tsx
git commit -m "feat: add DateRangeSlider component with dual draggable handles"
```

---

### Task 3: Integrate slider into OrbViewPage

**Files:**
- Modify: `frontend/src/pages/OrbViewPage.tsx`

- [ ] **Step 1: Add imports**

At the top of `OrbViewPage.tsx`, add these imports alongside the existing ones:

```typescript
import DateRangeSlider from '../components/graph/DateRangeSlider';
import { useDateFilterStore, computeDateFilteredNodeIds, getNodeDates } from '../stores/dateFilterStore';
```

- [ ] **Step 2: Compute date bounds and merge filtered IDs**

In `OrbViewPage.tsx`, find this existing block (around line 847-854):

```typescript
  const orbId = (data?.person?.orb_id as string) || '';
  const { activeKeywords } = useFilterStore();

  // Compute which nodes match any active visibility filter
  const filteredNodeIds = useMemo(
    () => computeFilteredNodeIds(data?.nodes ?? [], activeKeywords),
    [data?.nodes, activeKeywords]
  );
```

Replace it with:

```typescript
  const orbId = (data?.person?.orb_id as string) || '';
  const { activeKeywords } = useFilterStore();
  const { rangeStart, rangeEnd, resetRange } = useDateFilterStore();

  // Compute date bounds for the slider
  const dateBounds = useMemo(() => {
    const allDates: string[] = [];
    for (const node of data?.nodes ?? []) {
      allDates.push(...getNodeDates(node as Record<string, unknown>));
    }
    if (allDates.length === 0) return null;
    allDates.sort();
    const min = allDates[0];
    const max = allDates[allDates.length - 1];
    return min === max ? null : { min, max };
  }, [data?.nodes]);

  // Reset date filter when orb data changes
  useEffect(() => { resetRange(); }, [data, resetRange]);

  // Compute which nodes match any active visibility filter (keyword + date)
  const filteredNodeIds = useMemo(() => {
    const keywordFiltered = computeFilteredNodeIds(data?.nodes ?? [], activeKeywords);
    const dateFiltered = computeDateFilteredNodeIds(
      data?.nodes ?? [],
      data?.links ?? [],
      rangeStart,
      rangeEnd,
    );
    // Union of both sets
    const merged = new Set(keywordFiltered);
    for (const id of dateFiltered) merged.add(id);
    return merged;
  }, [data?.nodes, data?.links, activeKeywords, rangeStart, rangeEnd]);
```

- [ ] **Step 3: Render the slider component**

In `OrbViewPage.tsx`, find the `{/* ── 3D Graph ── */}` comment (around line 996) and add the slider just before it:

```tsx
      {/* ── Date Range Slider ── */}
      {dateBounds && (
        <DateRangeSlider minDate={dateBounds.min} maxDate={dateBounds.max} />
      )}

      {/* ── 3D Graph ── */}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors.

- [ ] **Step 5: Manual smoke test**

Run:
```bash
cd frontend && npm run dev
```

Open the app, navigate to `/myorbis`. Verify:
- The slider appears on the left edge if the orb has dated nodes
- Dragging the handles updates node transparency in real-time
- Skills connected to visible nodes remain visible
- The slider is hidden on mobile viewport (<640px)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/OrbViewPage.tsx
git commit -m "feat: integrate date range slider into OrbViewPage with merged filtering"
```

---

### Task 4: Integrate slider into SharedOrbPage

**Files:**
- Modify: `frontend/src/pages/SharedOrbPage.tsx`

- [ ] **Step 1: Add imports**

At the top of `SharedOrbPage.tsx`, add these imports alongside the existing ones:

```typescript
import DateRangeSlider from '../components/graph/DateRangeSlider';
import { useDateFilterStore, computeDateFilteredNodeIds, getNodeDates } from '../stores/dateFilterStore';
```

- [ ] **Step 2: Add date filtering logic**

Inside the `SharedOrbPage` component, after the existing `useEffect` for resize (line ~33), add:

```typescript
  const { rangeStart, rangeEnd, resetRange } = useDateFilterStore();

  // Compute date bounds for the slider
  const dateBounds = useMemo(() => {
    const allDates: string[] = [];
    for (const node of data?.nodes ?? []) {
      allDates.push(...getNodeDates(node as Record<string, unknown>));
    }
    if (allDates.length === 0) return null;
    allDates.sort();
    const min = allDates[0];
    const max = allDates[allDates.length - 1];
    return min === max ? null : { min, max };
  }, [data?.nodes]);

  // Reset date filter when orb data changes
  useEffect(() => { resetRange(); }, [data, resetRange]);

  // Compute date-filtered node IDs
  const dateFilteredNodeIds = useMemo(
    () => computeDateFilteredNodeIds(
      data?.nodes ?? [],
      data?.links ?? [],
      rangeStart,
      rangeEnd,
    ),
    [data?.nodes, data?.links, rangeStart, rangeEnd],
  );
```

Also add `useMemo` to the React import at line 1:

```typescript
import { useCallback, useEffect, useMemo, useState } from 'react';
```

- [ ] **Step 3: Render slider and pass filteredNodeIds to OrbGraph3D**

In the return JSX, add the slider before the `{/* ── 3D Graph ── */}` comment, and add `filteredNodeIds` to the `OrbGraph3D` props.

Find this block:

```tsx
      {/* ── 3D Graph ── */}
      <OrbGraph3D
        data={data}
        onBackgroundClick={() => {
          if (chatMessages.length > 0) {
            setChatMessages([]);
            setHighlightedNodeIds(new Set());
          }
        }}
        highlightedNodeIds={highlightedNodeIds}
        width={dimensions.width}
        height={dimensions.height}
      />
```

Replace with:

```tsx
      {/* ── Date Range Slider ── */}
      {dateBounds && (
        <DateRangeSlider minDate={dateBounds.min} maxDate={dateBounds.max} />
      )}

      {/* ── 3D Graph ── */}
      <OrbGraph3D
        data={data}
        onBackgroundClick={() => {
          if (chatMessages.length > 0) {
            setChatMessages([]);
            setHighlightedNodeIds(new Set());
          }
        }}
        highlightedNodeIds={highlightedNodeIds}
        filteredNodeIds={dateFilteredNodeIds}
        width={dimensions.width}
        height={dimensions.height}
      />
```

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors.

- [ ] **Step 5: Manual smoke test**

Run the dev server and navigate to a public orb URL (e.g., `/<orbId>`). Verify:
- The slider appears on the left edge
- Dragging filters nodes with transparency
- Dateless nodes follow cascading visibility rules

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/SharedOrbPage.tsx
git commit -m "feat: integrate date range slider into SharedOrbPage"
```

---

### Task 5: Final build verification

**Files:** None (verification only)

- [ ] **Step 1: Run full TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: Zero errors.

- [ ] **Step 2: Run lint**

```bash
cd frontend && npm run lint
```
Expected: No new lint errors.

- [ ] **Step 3: Run production build**

```bash
cd frontend && npm run build
```
Expected: Build succeeds with no errors.
