import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import type { EventData, Placement, TooltipRenderProps } from 'react-joyride';

const TOUR_COMPLETED_KEY = 'orbis_tour_completed';

function isTourCompleted(): boolean {
  return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
}

export function markTourCompleted(): void {
  localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
}

export function resetTour(): void {
  localStorage.removeItem(TOUR_COMPLETED_KEY);
}

// Lazy-load react-joyride to avoid ESM import issues with Vite
const LazyJoyride = lazy(() =>
  import('react-joyride').then((mod) => ({ default: mod.Joyride }))
);

interface TourStep {
  target: string;
  title: string;
  content: ReactNode;
  placement?: Placement | 'auto' | 'center';
  disableBeacon?: boolean;
}

const STEPS: TourStep[] = [
  {
    target: '[data-tour="graph"]',
    title: 'Explore Your Orbis',
    content: 'This is your Orbis — a 3D knowledge graph of your professional profile. Rotate by dragging, zoom with scroll, and click any node to view or edit it.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="node-count"]',
    title: 'Quick Stats',
    content: 'Here you can see how many nodes and edges your orbis contains.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="undo-redo"]',
    title: 'Undo And Redo',
    content: 'Undo and redo your recent changes — adding or deleting nodes can be reversed.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="node-types"]',
    title: 'View Node Types',
    content: 'Open this to view your node categories (education, skills, work experience, and more).',
    placement: 'bottom',
  },
  {
    target: '[data-tour="keyword-filter"]',
    title: 'Filter',
    content: 'Use this button to filter the graph by keywords and focus on relevant parts of your orbis. These filters can also be configured for shared Orbis views to control what other users can see.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="export"]',
    title: 'Export Your CV',
    content: 'Export your orbis as a formatted PDF CV.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="import"]',
    title: 'Import New Data',
    content: 'Import documents (PDF, DOCX, TXT) to enrich your orbis with new data.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="notes"]',
    title: 'Draft Notes',
    content: 'Draft notes — jot down quick thoughts, then convert them into graph entries when ready. AI enhancement can help structure your notes.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="search-orbis-id"]',
    title: 'Search Orbis ID',
    content: 'Use this field to open any Orbis directly by ID. Type an ID and press Enter to navigate.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="user-menu"]',
    title: 'Account Settings',
    content: 'Access your account settings, uploaded CVs, and sign out from here. In Settings you can claim a custom Orbis ID, manage saved versions, or delete your account.',
    placement: 'bottom-end',
  },
  {
    target: '[data-tour="orbis-pulse"]',
    title: 'Orbis Pulse',
    content: 'Orbis Pulse gives you live graph metrics (active nodes/edges, density, skill coverage, top hub, and share readiness) based on the current view and filters.',
    placement: 'left',
  },
  {
    target: '[data-tour="add-entry"]',
    title: 'Add To Graph',
    content: 'Use the + button to quickly add a new node to your orbis.',
    placement: 'top',
  },
  {
    target: '[data-tour="visibility"]',
    title: 'Set Visibility',
    content: 'Use this Share button to open sharing controls and set visibility to public or restricted. Default is restricted. You can then configure who can access your orbis.',
    placement: 'top',
  },
  {
    target: '[data-tour="chatbox"]',
    title: 'Search With Chat',
    content: 'Search your orbis by typing queries here. Matching nodes will be highlighted in the graph. You can also share your orbis from here.',
    placement: 'top',
  },
];

interface GuidedTourProps {
  run?: boolean;
  onFinish?: () => void;
}

function TourTooltip({
  backProps,
  closeProps,
  index,
  isLastStep,
  primaryProps,
  size,
  skipProps,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  const progress = Math.round(((index + 1) / size) * 100);
  const title = typeof step.title === 'string' && step.title.trim().length > 0
    ? step.title
    : 'Guided Tour';
  const isFirstStep = index === 0;

  return (
    <div
      {...tooltipProps}
      className="w-[min(92vw,460px)] overflow-hidden rounded-2xl border border-white/15 bg-[#090d16]/95 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl"
    >
      <div className="border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-purple-200/85">
            OpenOrbis Tour
          </p>
          <button
            {...closeProps}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 text-white/45 transition-colors hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-white/65">
            Step <span className="font-semibold text-white">{index + 1}</span> of {size}
          </p>
          <p className="text-xs font-medium text-purple-200/85">{progress}%</p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <h3 className="text-lg font-semibold leading-tight text-white sm:text-xl">{title}</h3>
        <div className="mt-2 text-sm leading-relaxed text-white/78">
          {step.content}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 sm:px-5 sm:py-4">
        <button
          {...skipProps}
          className="rounded-lg border border-transparent px-2 py-1 text-xs font-medium text-white/50 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
        >
          Skip tour
        </button>
        <div className="flex items-center gap-2">
          {!isFirstStep && (
            <button
              {...backProps}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Back
            </button>
          )}
          <button
            {...primaryProps}
            className="rounded-lg border border-purple-300/40 bg-gradient-to-r from-purple-600 to-fuchsia-500 px-3.5 py-1.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(147,51,234,0.35)] transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GuidedTour({ run: runOverride, onFinish }: GuidedTourProps) {
  const [autoRun, setAutoRun] = useState(false);

  useEffect(() => {
    if (runOverride !== undefined) return;
    if (!isTourCompleted()) {
      const timer = setTimeout(() => setAutoRun(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [runOverride]);

  const run = runOverride ?? autoRun;

  const handleCallback = useCallback((data: EventData) => {
    const { status, action } = data;
    if (status === 'finished' || status === 'skipped' || action === 'close') {
      markTourCompleted();
      setAutoRun(false);
      onFinish?.();
    }
  }, [onFinish]);

  if (!run) return null;

  return (
    <Suspense fallback={null}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <LazyJoyride
        steps={STEPS}
        run={run}
        continuous
        tooltipComponent={TourTooltip}
        callback={handleCallback}
        {...{
          spotlightPadding: 8,
          locale: {
            back: 'Back',
            close: 'Got it',
            last: 'Finish',
            next: 'Next',
            skip: 'Skip tour',
          },
          styles: {
            options: {
              arrowColor: '#090d16',
              backgroundColor: '#090d16',
              overlayColor: 'rgba(0, 0, 0, 0.8)',
              primaryColor: '#a855f6',
              textColor: '#e5e7eb',
              zIndex: 10000,
            },
            tooltip: {
              borderRadius: 18,
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.7)',
            },
            tooltipContent: { padding: 0 },
            spotlight: {
              borderRadius: 14,
              boxShadow: '0 0 0 1px rgba(168, 85, 247, 0.25)',
            },
          },
        } as any}
      />
    </Suspense>
  );
}
