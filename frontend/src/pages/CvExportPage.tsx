import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { getMyOrb } from '../api/orbs';
import type { OrbData, OrbNode } from '../api/orbs';
import { useFilterStore, computeFilteredNodeIds } from '../stores/filterStore';

/* ── Helpers ── */

function parseDateSort(v: unknown): number {
  if (!v || typeof v !== 'string') return 0;
  if (v.toLowerCase() === 'present') return Date.now();
  const parts = v.split('/');
  if (parts.length === 2) return new Date(Number(parts[1]), Number(parts[0]) - 1).getTime();
  return 0;
}

function sortDesc(nodes: OrbNode[], field: string): OrbNode[] {
  return [...nodes].sort((a, b) => parseDateSort(b[field]) - parseDateSort(a[field]));
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/* ── PDF pagination constants ── */
const A4_W = 210;
const A4_H = 297;
const M_X = 8;
const M_TOP = 8;
const FOOTER_H = 8;
const USABLE_W = A4_W - 2 * M_X;   // 194mm
const USABLE_H = A4_H - M_TOP - FOOTER_H; // 281mm

/** Collect atomic blocks from the container — items that should not be split across pages. */
function collectBlocks(container: HTMLElement): { top: number; height: number }[] {
  const blocks: { top: number; height: number }[] = [];
  const cTop = container.getBoundingClientRect().top;

  const add = (el: Element) => {
    const r = el.getBoundingClientRect();
    blocks.push({ top: r.top - cTop, height: r.height });
  };

  // Header as one block
  const header = container.querySelector('header');
  if (header) add(header);

  for (const section of container.querySelectorAll('section')) {
    const h3 = section.querySelector(':scope > h3');
    const items = section.querySelectorAll(':scope > .item');
    const cats = section.querySelectorAll(':scope > .skills-category');
    const directChips = section.querySelector(':scope > .chip-container');

    if (items.length > 0) {
      // Keep section title glued to first item
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

/** Given sorted blocks and a page height, return Y positions where new pages begin. */
function computePageBreaks(
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

function hexToHsl(hex: string): [number, number, number] {
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

type SectionKey = 'experience' | 'education' | 'projects' | 'publications' | 'patents' | 'certifications' | 'skills' | 'languages';

const DEFAULT_ORDER: SectionKey[] = [
  'experience', 'education', 'projects', 'publications',
  'patents', 'certifications', 'skills', 'languages',
];

const SECTION_LABELS: Record<SectionKey, string> = {
  experience: 'Experience',
  education: 'Education',
  projects: 'Projects',
  publications: 'Publications',
  patents: 'Patents',
  certifications: 'Certifications',
  skills: 'Skills',
  languages: 'Languages',
};

/* ── Component ── */

export default function CvExportPage() {
  const [data, setData] = useState<OrbData | null>(null);
  const [loading, setLoading] = useState(true);
  const { activeKeywords } = useFilterStore();
  const cvRef = useRef<HTMLDivElement>(null);

  /* Section order + drag state */
  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>(DEFAULT_ORDER);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  /* Profile image toggle */
  const [showProfileImage, setShowProfileImage] = useState(true);

  /* Hidden entries + undo stack */
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [undoStack, setUndoStack] = useState<string[]>([]);

  /* Entry links */
  const [entryLinks, setEntryLinks] = useState<Record<string, string>>({});
  const addLink = (uid: string) => {
    const current = entryLinks[uid] || '';
    const url = prompt('Enter URL for this entry:', current);
    if (url === null) return; // cancelled
    setEntryLinks((prev) => {
      const next = { ...prev };
      if (url) next[uid] = url; else delete next[uid];
      return next;
    });
  };

  const removeEntry = (key: string) => {
    setHiddenKeys((prev) => new Set(prev).add(key));
    setUndoStack((prev) => [...prev, key]);
  };

  /* Floating format toolbar */
  const formatToolbarRef = useRef<HTMLDivElement>(null);
  const [fmtToolbar, setFmtToolbar] = useState<{
    visible: boolean;
    top: number;
    left: number;
    bold: boolean;
    italic: boolean;
  }>({ visible: false, top: 0, left: 0, bold: false, italic: false });

  const isInRichText = useCallback((node: Node | null): boolean => {
    while (node) {
      if (node instanceof HTMLElement && node.classList.contains('rich-text')) return true;
      node = node.parentNode;
    }
    return false;
  }, []);

  const applyFormat = useCallback((cmd: string) => {
    document.execCommand(cmd, false);
    setFmtToolbar((prev) => ({
      ...prev,
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
    }));
  }, []);

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const key = prev[prev.length - 1];
      setHiddenKeys((hk) => {
        const next = new Set(hk);
        next.delete(key);
        return next;
      });
      return prev.slice(0, -1);
    });
  }, []);

  /* ── Visual page-break indicators ── */
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);

  useEffect(() => {
    const el = cvRef.current;
    if (!el || !data) return;

    const update = () => {
      const containerW = el.clientWidth;
      const pxPerMm = containerW / USABLE_W;
      const pageH = USABLE_H * pxPerMm;

      const blocks = collectBlocks(el);
      if (blocks.length === 0) { setPageBreaks([]); return; }
      const contentStart = blocks[0].top;
      const breaks = computePageBreaks(blocks, pageH, contentStart);
      setPageBreaks(breaks);
    };

    const t = setTimeout(update, 120);
    window.addEventListener('resize', update);
    return () => { clearTimeout(t); window.removeEventListener('resize', update); };
  }, [data, hiddenKeys, sectionOrder]);

  /* ── PDF export (native print → selectable text + clickable links) ── */
  const handleDownloadPdf = useCallback(() => {
    const personName = (data?.person?.name as string) || 'CV';
    const prev = document.title;
    document.title = `${personName} CV by OpenOrbis`;
    window.print();
    document.title = prev;
  }, [data]);

  /* Accent color */
  const [accentColor, setAccentColor] = useState('#6750A4');

  useEffect(() => {
    const [h, s] = hexToHsl(accentColor);
    const root = document.documentElement;
    root.style.setProperty('--md-primary', accentColor);
    root.style.setProperty('--md-primary-container', `hsl(${h}, ${Math.min(s, 40)}%, 90%)`);
    root.style.setProperty('--md-on-primary-container', `hsl(${h}, ${s}%, 15%)`);
    return () => {
      root.style.removeProperty('--md-primary');
      root.style.removeProperty('--md-primary-container');
      root.style.removeProperty('--md-on-primary-container');
    };
  }, [accentColor]);

  /* Global Ctrl+Z for undo deletions (when not editing text) */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        const active = document.activeElement;
        if (active && (active as HTMLElement).isContentEditable) return; // let browser handle text undo
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo]);

  /* Show / hide floating format toolbar on text selection inside .rich-text */
  useEffect(() => {
    const updateToolbar = () => {
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) {
          setFmtToolbar((prev) => prev.visible ? { ...prev, visible: false } : prev);
          return;
        }
        if (!isInRichText(sel.anchorNode)) {
          setFmtToolbar((prev) => prev.visible ? { ...prev, visible: false } : prev);
          return;
        }
        const range = sel.getRangeAt(0);
        let rect = range.getBoundingClientRect();
        // Collapsed range may return a zero-height rect; fall back to caret parent
        if (!rect.height) {
          const node = sel.anchorNode;
          const el = node instanceof HTMLElement ? node : node?.parentElement;
          if (!el) { setFmtToolbar((prev) => prev.visible ? { ...prev, visible: false } : prev); return; }
          rect = el.getBoundingClientRect();
        }
        setFmtToolbar({
          visible: true,
          top: rect.top + window.scrollY - 48,
          left: rect.left + window.scrollX + rect.width / 2,
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
        });
      });
    };
    document.addEventListener('mouseup', updateToolbar);
    document.addEventListener('keyup', updateToolbar);
    return () => {
      document.removeEventListener('mouseup', updateToolbar);
      document.removeEventListener('keyup', updateToolbar);
    };
  }, [isInRichText]);

  /* Fetch orb data */
  useEffect(() => {
    getMyOrb()
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  /* Inject Google Fonts & Font Awesome */
  useEffect(() => {
    const links: HTMLLinkElement[] = [];
    const add = (href: string) => {
      const el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = href;
      document.head.appendChild(el);
      links.push(el);
    };
    add('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
    add('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');
    return () => links.forEach((l) => document.head.removeChild(l));
  }, []);

  /* Override body class while this page is mounted */
  useEffect(() => {
    document.body.classList.add('cv-export-active');
    return () => document.body.classList.remove('cv-export-active');
  }, []);

  /* Page title → becomes default PDF filename */
  useEffect(() => {
    if (data?.person?.name) document.title = `${str(data.person.name)} — CV`;
  }, [data]);

  /* ── Filtering ── */
  const filteredIds = useMemo(() => {
    if (!data) return new Set<string>();
    return computeFilteredNodeIds(data.nodes, activeKeywords);
  }, [data, activeKeywords]);

  const visible = useCallback((label: string) =>
    data?.nodes.filter((n) => n._labels.includes(label) && !filteredIds.has(n.uid) && !hiddenKeys.has(n.uid)) ?? [],
  [data, filteredIds, hiddenKeys]);

  /* ── Loading / error states ── */
  if (loading)
    return (
      <>
        <style>{CV_CSS}</style>
        <div className="cv-loading">Loading CV…</div>
      </>
    );
  if (!data)
    return (
      <>
        <style>{CV_CSS}</style>
        <div className="cv-loading">Failed to load orb data.</div>
      </>
    );

  /* ── Prepare data ── */
  const p = data.person;
  const experience = sortDesc(visible('WorkExperience'), 'start_date');
  const education = sortDesc(visible('Education'), 'start_date');
  const projects = visible('Project');
  const publications = visible('Publication');
  const patents = visible('Patent');
  const certifications = sortDesc(visible('Certification'), 'date');
  const skills = visible('Skill');
  const languages = visible('Language');

  /* Which sections have data */
  const hasData: Record<SectionKey, boolean> = {
    experience: experience.length > 0,
    education: education.length > 0,
    projects: projects.length > 0,
    publications: publications.length > 0,
    patents: patents.length > 0,
    certifications: certifications.length > 0,
    skills: skills.length > 0,
    languages: languages.length > 0,
  };

  const visibleSections = sectionOrder.filter((k) => hasData[k]);

  /* ── Drag handlers ── */
  const handleDragStart = (visIdx: number) => setDragIdx(visIdx);

  const handleDragOver = (e: React.DragEvent, visIdx: number) => {
    e.preventDefault();
    setOverIdx(visIdx);
  };

  const handleDrop = () => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const fromKey = visibleSections[dragIdx];
      const toKey = visibleSections[overIdx];
      setSectionOrder((prev) => {
        const next = [...prev];
        const fromFull = next.indexOf(fromKey);
        const toFull = next.indexOf(toKey);
        next.splice(fromFull, 1);
        next.splice(toFull, 0, fromKey);
        return next;
      });
    }
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  /* Group skills by category (fallback: single group) */
  const skillGroups: Record<string, OrbNode[]> = {};
  for (const sk of skills) {
    const cat = str(sk.category) || 'Skills';
    (skillGroups[cat] ??= []).push(sk);
  }

  /* Contact links */
  const contacts = [
    p.email && { icon: 'fas fa-envelope', text: str(p.email) },
    p.website_url && { icon: 'fas fa-globe', href: str(p.website_url), text: 'Website' },
    p.scholar_url && { icon: 'fas fa-graduation-cap', href: str(p.scholar_url), text: 'Scholar' },
    p.github_url && { icon: 'fab fa-github', href: str(p.github_url), text: 'GitHub' },
    p.linkedin_url && { icon: 'fab fa-linkedin', href: str(p.linkedin_url), text: 'LinkedIn' },
    p.twitter_url && { icon: 'fab fa-twitter', href: str(p.twitter_url), text: 'Twitter' },
  ].filter(Boolean) as { icon: string; href?: string; text: string }[];

  const visibleContacts = contacts.filter((_, i) => !hiddenKeys.has(`contact-${i}`));

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  /* ── Delete button for block items (positioned on right gutter) ── */
  const DeleteBtn = ({ id }: { id: string }) => (
    <button className="item-delete no-print" onClick={() => removeEntry(id)} title="Remove from CV">
      <i className="fas fa-times" />
    </button>
  );

  const LinkBtn = ({ id }: { id: string }) => (
    <button className="item-add-link no-print" onClick={() => addLink(id)} title="Add link">
      <i className="fas fa-link" />
    </button>
  );

  const EntryLink = ({ id }: { id: string }) =>
    entryLinks[id] ? (
      <a href={entryLinks[id]} target="_blank" rel="noreferrer" className="item-link">
        <i className="fas fa-external-link-alt" />
      </a>
    ) : null;

  /* ── Section renderer ── */
  const renderSection = (key: SectionKey): JSX.Element | null => {
    switch (key) {
      case 'experience':
        return (
          <section key={key}>
            <h3 className="section-title">Experience</h3>
            {experience.map((n) => (
              <div key={n.uid} className="item">
                <DeleteBtn id={n.uid} />
                <LinkBtn id={n.uid} />
                <div className="item-header">
                  <h4 className="item-title" contentEditable suppressContentEditableWarning>{str(n.title)}</h4>
                  <EntryLink id={n.uid} />
                  <span className="item-date" contentEditable suppressContentEditableWarning>
                    {str(n.start_date)} — {str(n.end_date)}
                  </span>
                </div>
                <p className="item-subtitle" contentEditable suppressContentEditableWarning>
                  {str(n.company)}{n.location ? ` — ${str(n.location)}` : ''}
                </p>
                {n.description && (
                  <div className="rich-text" contentEditable suppressContentEditableWarning>
                    <ul><li>{str(n.description)}</li></ul>
                  </div>
                )}
              </div>
            ))}
          </section>
        );

      case 'education':
        return (
          <section key={key}>
            <h3 className="section-title">Education</h3>
            {education.map((n) => (
              <div key={n.uid} className="item">
                <DeleteBtn id={n.uid} />
                <LinkBtn id={n.uid} />
                <div className="item-header">
                  <h4 className="item-title" contentEditable suppressContentEditableWarning>{str(n.degree)}</h4>
                  <EntryLink id={n.uid} />
                  <span className="item-date" contentEditable suppressContentEditableWarning>
                    {str(n.start_date)} — {str(n.end_date)}
                  </span>
                </div>
                <p className="item-subtitle" contentEditable suppressContentEditableWarning>
                  {str(n.institution)}{n.location ? ` — ${str(n.location)}` : ''}
                </p>
                {n.description && (
                  <div className="rich-text" contentEditable suppressContentEditableWarning>
                    <ul><li>{str(n.description)}</li></ul>
                  </div>
                )}
              </div>
            ))}
          </section>
        );

      case 'projects':
        return (
          <section key={key}>
            <h3 className="section-title">Projects</h3>
            {projects.map((n) => (
              <div key={n.uid} className="item">
                <DeleteBtn id={n.uid} />
                <LinkBtn id={n.uid} />
                <div className="item-header">
                  <h4 className="item-title" contentEditable suppressContentEditableWarning>{str(n.name)}</h4>
                  <EntryLink id={n.uid} />
                </div>
                {n.role && (
                  <p className="item-subtitle" contentEditable suppressContentEditableWarning>{str(n.role)}</p>
                )}
                {n.description && (
                  <div className="rich-text" contentEditable suppressContentEditableWarning>
                    <ul><li>{str(n.description)}</li></ul>
                  </div>
                )}
              </div>
            ))}
          </section>
        );

      case 'publications':
        return (
          <section key={key}>
            <h3 className="section-title">Publications</h3>
            {publications.map((n) => (
              <div key={n.uid} className="item">
                <DeleteBtn id={n.uid} />
                <LinkBtn id={n.uid} />
                <div className="item-header">
                  <h4 className="item-title" contentEditable suppressContentEditableWarning>{str(n.title)}</h4>
                  <EntryLink id={n.uid} />
                </div>
                <p className="item-subtitle" contentEditable suppressContentEditableWarning>{str(n.venue)}</p>
                {n.description && (
                  <div className="rich-text" contentEditable suppressContentEditableWarning>
                    <ul><li>{str(n.description)}</li></ul>
                  </div>
                )}
              </div>
            ))}
          </section>
        );

      case 'patents':
        return (
          <section key={key}>
            <h3 className="section-title">Patents</h3>
            {patents.map((n) => (
              <div key={n.uid} className="item">
                <DeleteBtn id={n.uid} />
                <LinkBtn id={n.uid} />
                <div className="item-header">
                  <h4 className="item-title" contentEditable suppressContentEditableWarning>{str(n.name)}</h4>
                  <EntryLink id={n.uid} />
                </div>
                {n.patent_number && (
                  <p className="item-subtitle" contentEditable suppressContentEditableWarning>
                    Patent Number: {str(n.patent_number)}
                  </p>
                )}
                {n.description && (
                  <div className="rich-text" contentEditable suppressContentEditableWarning>
                    <ul><li>{str(n.description)}</li></ul>
                  </div>
                )}
              </div>
            ))}
          </section>
        );

      case 'certifications':
        return (
          <section key={key}>
            <h3 className="section-title">Certifications</h3>
            {certifications.map((n) => (
              <div key={n.uid} className="item">
                <DeleteBtn id={n.uid} />
                <LinkBtn id={n.uid} />
                <div className="item-header">
                  <h4 className="item-title" contentEditable suppressContentEditableWarning>{str(n.name)}</h4>
                  <EntryLink id={n.uid} />
                  <span className="item-date" contentEditable suppressContentEditableWarning>{str(n.date)}</span>
                </div>
                <p className="item-subtitle" contentEditable suppressContentEditableWarning>{str(n.issuing_organization)}</p>
              </div>
            ))}
          </section>
        );

      case 'skills':
        return (
          <section key={key}>
            <h3 className="section-title">Skills</h3>
            {Object.entries(skillGroups).map(([cat, group]) => (
              <div key={cat} className="skills-category">
                <strong contentEditable suppressContentEditableWarning>{cat}</strong>
                <div className="chip-container">
                  {group.map((sk) => (
                    <span key={sk.uid} className="chip">
                      <span contentEditable suppressContentEditableWarning>{str(sk.name)}</span>
                      <button className="chip-delete no-print" onClick={() => removeEntry(sk.uid)}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>
        );

      case 'languages':
        return (
          <section key={key}>
            <h3 className="section-title">Languages</h3>
            <div className="chip-container">
              {languages.map((n) => (
                <span key={n.uid} className="chip">
                  <span contentEditable suppressContentEditableWarning>
                    {str(n.name)}{n.proficiency ? ` (${str(n.proficiency)})` : ''}
                  </span>
                  <button className="chip-delete no-print" onClick={() => removeEntry(n.uid)}>×</button>
                </span>
              ))}
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <style>{CV_CSS}</style>

      {/* ── Floating format toolbar ── */}
      {fmtToolbar.visible && (
        <div
          ref={formatToolbarRef}
          className="fmt-toolbar no-print"
          style={{ top: fmtToolbar.top, left: fmtToolbar.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            className={'fmt-btn' + (fmtToolbar.bold ? ' active' : '')}
            onMouseDown={(e) => { e.preventDefault(); applyFormat('bold'); }}
            title="Bold (Ctrl+B)"
          >
            <i className="fas fa-bold" />
          </button>
          <button
            className={'fmt-btn' + (fmtToolbar.italic ? ' active' : '')}
            onMouseDown={(e) => { e.preventDefault(); applyFormat('italic'); }}
            title="Italic (Ctrl+I)"
          >
            <i className="fas fa-italic" />
          </button>
          <button
            className="fmt-btn"
            onMouseDown={(e) => { e.preventDefault(); applyFormat('insertUnorderedList'); }}
            title="Bullet List"
          >
            <i className="fas fa-list-ul" />
          </button>
        </div>
      )}

      {/* ── Toolbar (hidden when printing) ── */}
      <div className="cv-toolbar no-print">
        <span className="cv-toolbar-hint">Click text to edit and format · Drag sections to reorder · Save as PDF &amp; uncheck &quot;Headers and footers&quot;</span>

        {/* Profile image toggle */}
        {(data?.person?.profile_image as string) && (
          <label className="cv-color-picker" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showProfileImage}
              onChange={(e) => setShowProfileImage(e.target.checked)}
              style={{ marginRight: '4px' }}
            />
            <span className="cv-color-label">Photo</span>
          </label>
        )}

        {/* Accent color picker */}
        <label className="cv-color-picker">
          <span className="cv-color-swatch" style={{ background: accentColor }} />
          <span className="cv-color-label">Accent</span>
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
          />
        </label>

        {/* Undo button */}
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          className="cv-toolbar-btn cv-toolbar-undo"
          title="Undo last deletion (Ctrl+Z)"
        >
          <i className="fas fa-undo" /> Undo
        </button>

        <button onClick={handleDownloadPdf} className="cv-toolbar-btn cv-toolbar-download">
          <i className="fas fa-file-pdf" /> Download PDF
        </button>
      </div>

      {/* ── Sidebar — section order (hidden when printing) ── */}
      <div className="cv-sidebar no-print">
        <div className="cv-sidebar-title">Section Order</div>
        {visibleSections.map((key, idx) => (
          <div
            key={key}
            className={
              'cv-sidebar-item' +
              (dragIdx === idx ? ' dragging' : '') +
              (overIdx === idx && dragIdx !== idx ? ' drag-over' : '')
            }
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          >
            <i className="fas fa-grip-vertical cv-sidebar-grip" />
            {SECTION_LABELS[key]}
          </div>
        ))}
      </div>

      {/* ── Print-only footer (repeats on every page via position:fixed) ── */}
      <div className="cv-print-footer">
        <span>Made with love by <img src="/favicon.svg" className="cv-footer-logo" alt="" />OpenOrbis</span>
        <span>{today}</span>
      </div>

      {/* ── CV Body ── */}
      <div className="cv-page-body">
        <div ref={cvRef} className="resume-container">

          {/* Header */}
          <header>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ flex: 1 }}>
                <h1 contentEditable suppressContentEditableWarning style={{ marginBottom: 0 }}>{str(p.name)}</h1>
                <h2 className="title" contentEditable suppressContentEditableWarning>{str(p.headline)}</h2>
              </div>
              {showProfileImage && (p.profile_image as string) && (
                <img
                  src={p.profile_image as string}
                  alt=""
                  style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
              )}
            </div>
            <div className="contact-info">
              {visibleContacts.map((c, i) => {
                const origIdx = contacts.indexOf(c);
                return (
                  <span key={origIdx} className="contact-entry">
                    {i > 0 && <span className="contact-sep">|</span>}
                    {c.href ? (
                      <a href={c.href} target="_blank" rel="noreferrer">
                        <i className={c.icon} />
                        <span contentEditable suppressContentEditableWarning>{c.text}</span>
                      </a>
                    ) : (
                      <span><i className={c.icon} /> <span contentEditable suppressContentEditableWarning>{c.text}</span></span>
                    )}
                    <button className="contact-delete no-print" onClick={() => removeEntry(`contact-${origIdx}`)}>×</button>
                  </span>
                );
              })}
            </div>
          </header>

          {/* Sections — rendered in user-defined order */}
          {visibleSections.map((key) => renderSection(key))}

          {/* Page break indicators */}
          {pageBreaks.map((y, i) => (
            <div key={i} className="page-break-line no-print" style={{ top: `${y}px` }}>
              <span className="page-break-label">Page {i + 2}</span>
            </div>
          ))}

        </div>

        {/* On-screen footer */}
        <footer className="no-print">
          <div />
          <div className="footer-center">Made with love by <img src="/favicon.svg" className="cv-footer-logo" alt="" />OpenOrbis</div>
          <div className="footer-right" contentEditable suppressContentEditableWarning>{today}</div>
        </footer>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════
   CSS
   ══════════════════════════════════════════════════ */

const CV_CSS = `
  /* Material Design 3 palette */
  :root {
    --md-primary: #6750A4;
    --md-on-primary: #FFFFFF;
    --md-primary-container: #EADDFF;
    --md-on-primary-container: #21005D;
    --md-surface: #FFFFFF;
    --md-on-surface: #1D1B20;
    --md-surface-variant: #E7E0EC;
    --md-on-surface-variant: #49454F;
    --md-bg: #F3EDF7;
    --md-outline-variant: #CAC4D0;
  }

  body.cv-export-active {
    background-color: var(--md-bg) !important;
    color: var(--md-on-surface) !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .cv-loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    font-family: 'Roboto', sans-serif;
    font-size: 1.1rem;
    color: var(--md-on-surface-variant);
  }

  /* ── Toolbar ── */
  .cv-toolbar {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 100;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
    padding: 10px 24px;
    background: var(--md-surface);
    border-bottom: 1px solid var(--md-outline-variant);
    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
    font-family: 'Roboto', sans-serif;
  }
  .cv-toolbar-hint {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.85rem;
    color: var(--md-on-surface-variant);
    font-style: italic;
  }
  .cv-toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border: none;
    border-radius: 20px;
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
    font-family: 'Roboto', sans-serif;
    transition: background 0.15s, opacity 0.15s;
  }
  .cv-toolbar-download {
    background: var(--md-primary);
    color: var(--md-on-primary);
  }
  .cv-toolbar-download:hover { background: #7c6bbf; }
  .cv-toolbar-undo {
    background: var(--md-surface-variant);
    color: var(--md-on-surface);
  }
  .cv-toolbar-undo:hover { background: var(--md-outline-variant); }
  .cv-toolbar-undo:disabled {
    opacity: 0.35;
    cursor: default;
  }

  /* ── Color picker ── */
  .cv-color-picker {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    position: relative;
  }
  .cv-color-label {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--md-on-surface-variant);
  }
  .cv-color-picker input[type="color"] {
    position: absolute;
    width: 0; height: 0;
    opacity: 0;
    pointer-events: none;
  }
  .cv-color-swatch {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--md-outline-variant);
    transition: box-shadow 0.15s;
    cursor: pointer;
  }
  .cv-color-picker:hover .cv-color-swatch {
    box-shadow: 0 0 0 3px rgba(103,80,164,0.25);
  }

  /* ── Sidebar ── */
  .cv-sidebar {
    position: fixed;
    right: 24px;
    top: 50%;
    transform: translateY(-50%);
    width: 190px;
    background: var(--md-surface);
    border-radius: 16px;
    padding: 16px 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    font-family: 'Roboto', sans-serif;
    z-index: 90;
  }
  .cv-sidebar-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--md-primary);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 10px;
    padding-left: 4px;
  }
  .cv-sidebar-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    font-size: 0.88rem;
    font-weight: 500;
    color: var(--md-on-surface);
    cursor: grab;
    transition: background 0.15s;
    user-select: none;
    border: 2px solid transparent;
  }
  .cv-sidebar-item:active { cursor: grabbing; }
  .cv-sidebar-item:hover { background: var(--md-surface-variant); }
  .cv-sidebar-item.dragging { opacity: 0.35; }
  .cv-sidebar-item.drag-over {
    border-top-color: var(--md-primary);
    background: var(--md-primary-container);
  }
  .cv-sidebar-grip {
    color: var(--md-outline-variant);
    font-size: 0.75rem;
  }

  /* ── Page body ── */
  .cv-page-body {
    font-family: 'Roboto', sans-serif;
    background-color: var(--md-bg);
    color: var(--md-on-surface);
    line-height: 1.5;
    padding: 80px 20px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Resume card ── */
  .resume-container {
    background-color: var(--md-surface);
    max-width: 850px;
    width: 100%;
    padding: 48px;
    border-radius: 28px;
    box-shadow: 0 4px 8px 3px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.1);
    box-sizing: border-box;
    position: relative;
  }

  /* ── Header ── */
  .cv-page-body header {
    background-color: var(--md-primary-container);
    color: var(--md-on-primary-container);
    padding: 24px;
    border-radius: 20px;
    margin-bottom: 24px;
  }
  .cv-page-body h1 {
    font-size: 2.5rem;
    margin: 0 0 4px 0;
    font-weight: 700;
    letter-spacing: -0.25px;
    line-height: 1.1;
  }
  .cv-page-body h2.title {
    font-size: 1.15rem;
    margin: 0 0 12px 0;
    font-weight: 500;
    opacity: 0.9;
  }
  .contact-info {
    font-size: 0.95rem;
    font-weight: 500;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .contact-entry {
    display: flex !important;
    align-items: center;
    gap: 6px;
  }
  .contact-info a {
    color: var(--md-on-primary-container);
    text-decoration: none;
    padding: 4px 8px;
    margin-left: -4px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .contact-delete {
    width: 16px; height: 16px;
    border-radius: 50%;
    border: none;
    background: rgba(0,0,0,0.15);
    color: var(--md-on-primary-container);
    font-size: 0.65rem;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    margin-left: 2px;
    flex-shrink: 0;
  }
  .contact-entry:hover .contact-delete { display: flex; }

  /* ── Sections ── */
  .cv-page-body section { margin-bottom: 24px; }
  .cv-page-body h3.section-title {
    color: var(--md-on-primary-container);
    font-size: 1.3rem;
    font-weight: 700;
    font-variant: small-caps;
    letter-spacing: 0.5px;
    margin: 0 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--md-outline-variant);
    display: flex;
    align-items: center;
  }

  /* ── Items ── */
  .item {
    position: relative;
    margin-bottom: 16px;
  }
  .item:last-child { margin-bottom: 0; }
  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 2px;
  }
  .item-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--md-primary);
    margin: 0;
  }
  .item-subtitle {
    color: var(--md-on-surface);
    font-weight: 600;
    font-size: 0.95rem;
    margin: 0 0 6px 0;
    font-style: italic;
  }
  .item-date {
    color: var(--md-on-surface-variant);
    font-size: 0.85rem;
    font-weight: 500;
    white-space: nowrap;
  }
  .cv-page-body ul {
    margin: 0;
    padding-left: 20px;
    color: var(--md-on-surface-variant);
  }
  .cv-page-body li {
    margin-bottom: 4px;
    font-size: 0.95rem;
  }

  /* ── Item delete — right gutter ── */
  .item-delete {
    position: absolute;
    top: 50%;
    right: -56px;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid var(--md-outline-variant);
    background: var(--md-surface);
    color: var(--md-on-surface-variant);
    font-size: 0.6rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s, color 0.15s;
    z-index: 5;
    padding: 0;
  }
  .item:hover .item-delete {
    opacity: 1;
  }
  .item-delete:hover {
    background: #ef4444;
    color: white;
    border-color: #ef4444;
  }

  /* ── Item add-link button (right gutter, below delete) ── */
  .item-add-link {
    position: absolute;
    top: 50%;
    right: -56px;
    transform: translateY(calc(-50% + 28px));
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid var(--md-outline-variant);
    background: var(--md-surface);
    color: var(--md-on-surface-variant);
    font-size: 0.55rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s, color 0.15s;
    z-index: 5;
    padding: 0;
  }
  .item:hover .item-add-link { opacity: 1; }
  .item-add-link:hover {
    background: var(--md-primary);
    color: white;
    border-color: var(--md-primary);
  }

  /* ── Entry link icon (visible in CV + export) ── */
  .item-link {
    color: var(--md-primary);
    font-size: 0.8rem;
    margin-left: 6px;
    flex-shrink: 0;
    text-decoration: none;
    opacity: 0.7;
    transition: opacity 0.15s;
  }
  .item-link:hover { opacity: 1; }

  /* ── Chips ── */
  .skills-category { margin-bottom: 12px; }
  .skills-category:last-child { margin-bottom: 0; }
  .skills-category strong {
    display: block;
    margin-bottom: 8px;
    color: var(--md-on-surface-variant);
    font-weight: 500;
    font-size: 0.95rem;
  }
  .chip-container {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background-color: var(--md-primary-container);
    color: var(--md-on-primary-container);
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    line-height: 1.3;
    border: 1px solid rgba(0,0,0,0);
  }
  .chip-delete {
    width: 16px; height: 16px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--md-on-surface-variant);
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    flex-shrink: 0;
  }
  .chip:hover .chip-delete {
    display: flex;
    background: rgba(0,0,0,0.08);
  }

  /* ── On-screen footer ── */
  .cv-page-body footer {
    width: 100%;
    max-width: 850px;
    margin-top: 16px;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    color: #9E9E9E;
    font-size: 0.85rem;
    font-weight: 500;
  }
  .footer-center { grid-column: 2; text-align: center; }
  .cv-footer-logo {
    width: 14px;
    height: 14px;
    vertical-align: -2px;
    margin: 0 3px;
    display: inline;
  }
  .footer-right  { grid-column: 3; text-align: right; }

  /* ── Print-only footer (hidden on screen) ── */
  /* ── Editable cues ── */
  [contenteditable]:hover {
    outline: 1px dashed var(--md-primary);
    outline-offset: 2px;
    border-radius: 4px;
  }
  [contenteditable]:focus {
    outline: 2px solid var(--md-primary);
    outline-offset: 2px;
    border-radius: 4px;
  }

  /* ── Page break indicators ── */
  .page-break-line {
    position: absolute;
    left: -40px;
    right: -40px;
    height: 0;
    border-top: 2px dashed rgba(239, 68, 68, 0.45);
    z-index: 10;
    pointer-events: none;
  }
  .page-break-label {
    position: absolute;
    right: calc(100% + 24px);
    top: 50%;
    transform: translateY(-50%);
    white-space: nowrap;
    font-size: 1.36rem;
    font-weight: 600;
    color: rgba(239, 68, 68, 0.6);
    background: var(--md-surface);
    padding: 2px 8px;
    border-radius: 4px;
    letter-spacing: 0.3px;
  }

  /* ── Floating format toolbar ── */
  .fmt-toolbar {
    position: absolute;
    z-index: 200;
    display: flex;
    gap: 2px;
    padding: 4px 6px;
    background: var(--md-on-surface);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    transform: translateX(-50%);
    font-family: 'Roboto', sans-serif;
  }
  .fmt-toolbar::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--md-on-surface);
  }
  .fmt-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--md-surface);
    font-size: 0.8rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s;
  }
  .fmt-btn:hover {
    background: rgba(255,255,255,0.15);
  }
  .fmt-btn.active {
    background: rgba(255,255,255,0.25);
    color: var(--md-primary-container);
  }

  /* ── Rich-text formatting ── */
  .rich-text b, .rich-text strong { font-weight: 700; }
  .rich-text i, .rich-text em { font-style: italic; }
  .rich-text ul {
    list-style-type: disc;
    padding-left: 20px;
    margin: 0;
  }
  .rich-text li {
    display: list-item;
  }
  .rich-text li::marker { color: var(--md-on-surface); }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .cv-sidebar { display: none; }
    .item-delete { right: -28px; width: 20px; height: 20px; font-size: 0.55rem; }
  }
  @media (max-width: 600px) {
    .resume-container { padding: 24px 16px; border-radius: 16px; }
    .cv-page-body header { padding: 20px; }
    .cv-page-body h1 { font-size: 2rem; }
    .item-header { flex-direction: column; }
    .item-date { margin-top: 2px; margin-bottom: 6px; }
    .item-delete { right: -22px; }
    .cv-page-body footer {
      grid-template-columns: 1fr; gap: 8px; text-align: center;
    }
    .footer-center, .footer-right { grid-column: 1; text-align: center; }
  }

  /* ── Print-only footer (hidden on screen) ── */
  .cv-print-footer { display: none; }

  /* ── Print ── */
  @page {
    size: A4;
    margin: 10mm 10mm 18mm 10mm;
  }

  @media print {
    .no-print { display: none !important; }

    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* Kill black background everywhere */
    html, body, body.cv-export-active, #root, #root > * {
      background: white !important;
      background-color: white !important;
      padding: 0 !important;
      margin: 0 !important;
      min-height: 0 !important;
    }

    .cv-page-body {
      padding: 0;
      display: block;
      background: white !important;
    }

    /* Hide anything outside the CV */
    .cv-page-body > footer { display: none !important; }

    /* Keep the card styling but drop shadow */
    .resume-container {
      box-shadow: none;
      border-radius: 0;
      max-width: 100%;
      padding: 8px 16px;
      background: white !important;
    }

    /* Keep header look — background, rounded corners, padding */
    .cv-page-body header {
      border-radius: 16px;
      margin-bottom: 16px;
    }

    /* Smart page breaks — never split an item */
    .item {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    /* Allow sections to break across pages */
    .cv-page-body section {
      break-inside: auto;
    }
    /* Keep section title with at least one item */
    .cv-page-body h3.section-title {
      break-after: avoid;
      page-break-after: avoid;
    }

    /* Hide edit cues */
    [contenteditable]:hover,
    [contenteditable]:focus {
      outline: none !important;
    }

    /* Repeating footer on every page */
    .cv-print-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 6px 0;
      font-size: 0.7rem;
      color: #9E9E9E;
      font-family: 'Roboto', sans-serif;
      font-weight: 500;
      border-top: 1px solid #E0E0E0;
    }
  }
`;
