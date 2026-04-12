/**
 * Utility functions and constants extracted from CvExportPage (#181.7).
 *
 * Pure functions with no React dependencies — safe to import from
 * anywhere and trivially unit-testable.
 */

import type { OrbNode } from '../api/orbs';

/* ── Sorting ── */

export function parseDateSort(v: unknown): number {
  if (!v || typeof v !== 'string') return 0;
  if (v.toLowerCase() === 'present') return Date.now();
  const parts = v.split('/');
  if (parts.length === 2) return new Date(Number(parts[1]), Number(parts[0]) - 1).getTime();
  return 0;
}

export function sortDesc(nodes: OrbNode[], field: string): OrbNode[] {
  return [...nodes].sort((a, b) => parseDateSort(b[field]) - parseDateSort(a[field]));
}

export const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/* ── PDF pagination constants (must match @page + print CSS) ── */

export const A4_H = 297;
export const PAGE_M_TOP = 10;
export const PAGE_M_BOTTOM = 18;
export const PAGE_M_X = 10;
export const PAGE_USABLE_H = A4_H - PAGE_M_TOP - PAGE_M_BOTTOM; // 269mm

const PRINT_PAD_X_PX = 16;
const PRINT_PAD_X_MM = PRINT_PAD_X_PX * 25.4 / 96;
export const PRINT_CONTENT_W = (210 - 2 * PAGE_M_X) - 2 * PRINT_PAD_X_MM;

/* ── Block-level page break computation ── */

export function collectBlocks(container: HTMLElement): { top: number; height: number }[] {
  const blocks: { top: number; height: number }[] = [];
  const cTop = container.getBoundingClientRect().top;

  const add = (el: Element) => {
    const r = el.getBoundingClientRect();
    blocks.push({ top: r.top - cTop, height: r.height });
  };

  const header = container.querySelector('header');
  if (header) add(header);

  for (const section of container.querySelectorAll('section')) {
    const h3 = section.querySelector(':scope > h3');
    const items = section.querySelectorAll(':scope > .item');
    const cats = section.querySelectorAll(':scope > .skills-category');
    const directChips = section.querySelector(':scope > .chip-container');

    if (items.length > 0) {
      if (h3 && items[0]) {
        const h3r = h3.getBoundingClientRect();
        const ir = items[0].getBoundingClientRect();
        blocks.push({ top: h3r.top - cTop, height: ir.bottom - h3r.top });
      }
      for (let i = 1; i < items.length; i++) add(items[i]);
    } else if (cats.length > 0) {
      if (h3 && cats[0]) {
        const h3r = h3.getBoundingClientRect();
        const cr = cats[0].getBoundingClientRect();
        blocks.push({ top: h3r.top - cTop, height: cr.bottom - h3r.top });
      }
      for (let i = 1; i < cats.length; i++) add(cats[i]);
    } else if (directChips || h3) {
      add(section);
    }
  }
  return blocks.sort((a, b) => a.top - b.top);
}

export function computePageBreaks(
  blocks: { top: number; height: number }[],
  pageH: number,
  startY: number,
): number[] {
  const breaks: number[] = [];
  let pageBottom = startY + pageH;

  for (const block of blocks) {
    const blockBottom = block.top + block.height;
    if (blockBottom > pageBottom) {
      if (block.top > startY && block.top > (breaks[breaks.length - 1] ?? startY)) {
        breaks.push(block.top);
        pageBottom = block.top + pageH;
      }
      while (blockBottom > pageBottom) pageBottom += pageH;
    }
  }
  return breaks;
}

/* ── Color utilities ── */

export function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/* ── Section types ── */

export type SectionKey = 'experience' | 'education' | 'projects' | 'publications' | 'patents' | 'awards' | 'outreach' | 'certifications' | 'skills' | 'languages';

export const DEFAULT_ORDER: SectionKey[] = [
  'experience', 'education', 'projects', 'publications',
  'patents', 'awards', 'outreach', 'certifications', 'skills', 'languages',
];

export const SECTION_LABELS: Record<SectionKey, string> = {
  experience: 'Experience',
  education: 'Education',
  projects: 'Projects',
  publications: 'Publications',
  patents: 'Patents',
  awards: 'Awards',
  outreach: 'Outreach',
  certifications: 'Certifications',
  skills: 'Skills',
  languages: 'Languages',
};
