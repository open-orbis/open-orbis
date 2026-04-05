# Date Range Slider — Design Spec

## Overview

A vertical dual-handle date range slider on the left edge of the orb visualization that filters nodes by time period. Nodes outside the selected range become transparent (ghosted). Available on both the owner's `/myorbis` page and public orb views.

## Data Model & Store

### `stores/dateFilterStore.ts`

New Zustand store (no persistence — resets on page load):

```typescript
interface DateFilterState {
  rangeStart: string | null;  // "YYYY-MM" e.g. "2018-06"
  rangeEnd: string | null;    // "YYYY-MM" e.g. "2025-12"
  setRange: (start: string, end: string) => void;
  resetRange: () => void;
}
```

### `computeDateFilteredNodeIds(nodes, links, rangeStart, rangeEnd) → Set<string>`

Pure function exported from the store file. Logic:

1. If `rangeStart` and `rangeEnd` are both null, return empty set (no filtering).
2. For each node, extract **all dates** from known date fields: `start_date`, `end_date`, `date`, `issue_date`, `expiry_date`, `filing_date`, `grant_date`.
3. **Dated nodes**: A node is considered **in range** if any of its dates fall within `[rangeStart, rangeEnd]`. For nodes with a span (e.g. `start_date` to `end_date`), the node is in range if the span overlaps with the selected range at all. If none of the node's dates overlap with the range, add to the filtered set.
4. **Dateless nodes** (Skill, Language, Collaborator — no date fields): Check all connected nodes via `links`. If **at least one** connected node is **inside** the range (not filtered), the dateless node stays visible. If all connected nodes are outside the range, add the dateless node to the filtered set.
5. The Person node is never filtered.

### Date extraction utility

A helper `getNodeDates(node): string[]` that checks known date fields and returns all found dates normalized to `"YYYY-MM"`. Date fields may be formatted as `"YYYY-MM"`, `"YYYY-MM-DD"`, or `"YYYY"` — normalize all to `"YYYY-MM"` (day-of-month is ignored, year-only becomes `"YYYY-01"`). Returns empty array if the node has no date fields.

For computing slider bounds (min/max), scan all returned dates across all nodes and take the global min and max.

## Slider Component

### `components/graph/DateRangeSlider.tsx`

**Props:**
```typescript
interface DateRangeSliderProps {
  minDate: string;  // "YYYY-MM" — oldest date across all nodes
  maxDate: string;  // "YYYY-MM" — newest date across all nodes
}
```

**Layout:**
- Absolutely positioned on the left edge of the orb container
- ~40px wide, vertically spanning from below the header to near the bottom
- Top of track = `maxDate` (most recent), bottom of track = `minDate` (oldest)

**Elements:**
- **Track**: Thin vertical line, `rgba(255,255,255,0.1)`
- **Active range**: Purple (`#785EF0`) segment between the two handles
- **Upper handle**: Draggable circle at the top boundary of the selected range
- **Lower handle**: Draggable circle at the bottom boundary of the selected range
- **Handle labels**: Date text (e.g. "Jun 2020") shown next to each handle
- **Boundary labels**: `minDate` at bottom, `maxDate` at top, in small muted text

**Interaction:**
- Drag handles via pointer events (`onPointerDown` / `onPointerMove` / `onPointerUp`)
- Handles cannot cross each other (upper always >= lower)
- Snaps to month granularity
- On drag, calls `dateFilterStore.setRange()` — triggers real-time filtering
- On initial render, both handles at extremes (full range, all nodes visible)

**Responsive:**
- Hidden on mobile (`< 640px`) via Tailwind `hidden sm:flex`

**Styling:**
- Dark theme consistent with existing UI
- Handles: small purple circles with white border (`#785EF0`, 14px diameter, 2px white border)
- Labels: `text-[10px] text-white/40`
- No extra dependencies — pure React + pointer events + Tailwind

## Integration

### OrbViewPage.tsx

1. Compute `minDate` / `maxDate` from `data.nodes` by scanning all date fields via `getNodeDates()`.
2. Render `<DateRangeSlider minDate={minDate} maxDate={maxDate} />` as a sibling to `<OrbGraph3D>`.
3. Read `rangeStart` / `rangeEnd` from `useDateFilterStore()`.
4. Compute `dateFilteredIds = computeDateFilteredNodeIds(nodes, links, rangeStart, rangeEnd)`.
5. Merge with existing keyword filter: `mergedFilteredIds = union(keywordFilteredIds, dateFilteredIds)`.
6. Pass `mergedFilteredIds` as `filteredNodeIds` to `<OrbGraph3D>`.

### SharedOrbPage.tsx

Same integration as OrbViewPage:
1. Compute `minDate` / `maxDate` from data.
2. Render `<DateRangeSlider>`.
3. Compute `dateFilteredIds` and pass to `<OrbGraph3D filteredNodeIds={dateFilteredIds}>`.
   (SharedOrbPage currently has no keyword filtering, so no merge needed.)

### OrbGraph3D.tsx

No changes. Already handles `filteredNodeIds` by rendering matched nodes as transparent.

## Edge Cases

- **No dated nodes**: If all nodes lack dates, don't render the slider.
- **Single date**: If min === max, don't render the slider (no range to filter).
- **Partial dates**: `"2020"` → normalized to `"2020-01"`. `"2020-06-15"` → `"2020-06"`.
- **Person node**: Never filtered, always visible regardless of slider position.
- **Reset on data change**: When orb data reloads, call `resetRange()` and recompute bounds.

## Files to Create
- `frontend/src/stores/dateFilterStore.ts`
- `frontend/src/components/graph/DateRangeSlider.tsx`

## Files to Modify
- `frontend/src/pages/OrbViewPage.tsx` — add slider + merge date filter IDs
- `frontend/src/pages/SharedOrbPage.tsx` — add slider + date filter IDs
