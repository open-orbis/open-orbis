import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FilterState {
  /** List of filter keywords configured by the user */
  keywords: string[];
  /** Set of currently active filter keywords */
  activeKeywords: string[];

  addKeyword: (keyword: string) => void;
  removeKeyword: (keyword: string) => void;
  toggleKeyword: (keyword: string) => void;
  setActiveKeywords: (keywords: string[]) => void;
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set, get) => ({
      keywords: [],
      activeKeywords: [],

      addKeyword: (keyword: string) => {
        const trimmed = keyword.trim().toLowerCase();
        if (!trimmed) return;
        const { keywords } = get();
        if (keywords.includes(trimmed)) return;
        set({ keywords: [...keywords, trimmed] });
      },

      removeKeyword: (keyword: string) => {
        const { keywords, activeKeywords } = get();
        set({
          keywords: keywords.filter((k) => k !== keyword),
          activeKeywords: activeKeywords.filter((k) => k !== keyword),
        });
      },

      toggleKeyword: (keyword: string) => {
        const { activeKeywords } = get();
        if (activeKeywords.includes(keyword)) {
          set({ activeKeywords: activeKeywords.filter((k) => k !== keyword) });
        } else {
          set({ activeKeywords: [...activeKeywords, keyword] });
        }
      },

      setActiveKeywords: (keywords: string[]) => {
        set({ activeKeywords: keywords });
      },
    }),
    {
      name: 'orbis_filters',
    }
  )
);

/**
 * Check if a node matches a filter keyword.
 * Returns true if any string field of the node contains the keyword (case-insensitive).
 */
export function nodeMatchesFilter(
  node: Record<string, unknown>,
  keyword: string
): boolean {
  const lowerKeyword = keyword.toLowerCase();
  for (const value of Object.values(node)) {
    if (typeof value === 'string' && value.toLowerCase().includes(lowerKeyword)) {
      return true;
    }
  }
  return false;
}

/**
 * Compute the set of node UIDs that match any of the active filter keywords.
 */
export function computeFilteredNodeIds(
  nodes: Array<Record<string, unknown>>,
  activeKeywords: string[]
): Set<string> {
  if (activeKeywords.length === 0) return new Set();
  const filtered = new Set<string>();
  for (const node of nodes) {
    for (const keyword of activeKeywords) {
      if (nodeMatchesFilter(node, keyword)) {
        filtered.add(node.uid as string);
        break;
      }
    }
  }
  return filtered;
}
