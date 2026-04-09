import { useState, useEffect, useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, ACTIONS, EVENTS } from 'react-joyride';
import type { Step } from 'react-joyride';

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

const STEPS: Step[] = [
  {
    target: '[data-tour="graph"]',
    content: 'This is your Orbis — a 3D knowledge graph of your professional profile. Rotate by dragging, zoom with scroll, and click any node to view or edit it.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="node-count"]',
    content: 'Here you can see how many nodes and edges your orbis contains.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="undo-redo"]',
    content: 'Undo and redo your recent changes — adding or deleting nodes can be reversed.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="node-types"]',
    content: 'Filter which types of nodes are visible in the graph — education, skills, work experience, and more.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="export"]',
    content: 'Export your orbis as a formatted PDF CV.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="import"]',
    content: 'Import documents (PDF, DOCX, TXT) to enrich your orbis with new data. Up to 3 documents are tracked.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="notes"]',
    content: 'Draft notes — jot down quick thoughts, then convert them into graph entries when ready. AI enhancement can help structure your notes.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="chatbox"]',
    content: 'Search your orbis by typing queries here. Matching nodes will be highlighted in the graph. You can also share your orbis from here.',
    placement: 'top',
  },
  {
    target: '[data-tour="user-menu"]',
    content: 'Access your account settings, uploaded CVs, and sign out from here. In Settings you can claim a custom Orbis ID, manage saved versions, or delete your account.',
    placement: 'bottom-end',
  },
];

interface GuidedTourProps {
  run?: boolean;
  onFinish?: () => void;
}

export default function GuidedTour({ run: runOverride, onFinish }: GuidedTourProps) {
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (runOverride !== undefined) {
      setRun(runOverride);
      return;
    }
    // Auto-start for new users who haven't completed the tour
    if (!isTourCompleted()) {
      // Small delay to let the page render and elements mount
      const timer = setTimeout(() => setRun(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [runOverride]);

  const handleCallback = useCallback((data: CallBackProps) => {
    const { status, action, type } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      markTourCompleted();
      setRun(false);
      onFinish?.();
    }

    // Close on overlay click
    if (type === EVENTS.STEP_AFTER && action === ACTIONS.CLOSE) {
      markTourCompleted();
      setRun(false);
      onFinish?.();
    }
  }, [onFinish]);

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      showSkipButton
      showProgress
      disableOverlayClose={false}
      callback={handleCallback}
      locale={{
        back: 'Back',
        close: 'Got it',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip tour',
      }}
      styles={{
        options: {
          arrowColor: 'rgb(23, 23, 23)',
          backgroundColor: 'rgb(23, 23, 23)',
          overlayColor: 'rgba(0, 0, 0, 0.75)',
          primaryColor: '#a855f6',
          textColor: 'rgba(255, 255, 255, 0.85)',
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 16,
          padding: '20px 24px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
        },
        tooltipContent: {
          fontSize: 14,
          lineHeight: '1.6',
          padding: '8px 0',
        },
        tooltipTitle: {
          fontSize: 16,
          fontWeight: 600,
        },
        buttonNext: {
          backgroundColor: '#a855f6',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          padding: '8px 16px',
        },
        buttonBack: {
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: 13,
          marginRight: 8,
        },
        buttonSkip: {
          color: 'rgba(255, 255, 255, 0.3)',
          fontSize: 12,
        },
        buttonClose: {
          color: 'rgba(255, 255, 255, 0.4)',
        },
        spotlight: {
          borderRadius: 12,
        },
      }}
    />
  );
}
