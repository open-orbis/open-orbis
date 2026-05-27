import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GuidedTour, { isTourCompleted } from './GuidedTour';

// react-joyride is lazy-imported inside GuidedTour; capture the props it receives
// so we can assert the event handler is wired to the prop the library actually calls.
let joyrideProps: Record<string, unknown> | null = null;

vi.mock('react-joyride', () => ({
  Joyride: (props: Record<string, unknown>) => {
    joyrideProps = props;
    return <div data-testid="joyride" />;
  },
}));

// react-joyride v3 invokes the `onEvent` prop (v2 used `callback`).
function fireJoyride(data: {
  status?: string;
  action?: string;
  origin?: string;
  type?: string;
}) {
  const onEvent = joyrideProps?.onEvent as
    | ((d: unknown, c: unknown) => void)
    | undefined;
  if (typeof onEvent !== 'function') {
    throw new Error('Joyride did not receive an onEvent handler');
  }
  onEvent(data, {});
}

describe('GuidedTour', () => {
  beforeEach(() => {
    joyrideProps = null;
    localStorage.clear();
  });

  it('wires its event handler to the v3 `onEvent` prop', async () => {
    render(<GuidedTour run onFinish={() => {}} />);
    await screen.findByTestId('joyride');
    expect(typeof joyrideProps?.onEvent).toBe('function');
  });

  it('calls onFinish and marks the tour completed when the tour finishes', async () => {
    const onFinish = vi.fn();
    render(<GuidedTour run onFinish={onFinish} />);
    await screen.findByTestId('joyride');

    fireJoyride({ status: 'finished', action: 'next', type: 'tour:end' });

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(isTourCompleted()).toBe(true);
  });

  it('calls onFinish when the tour is skipped/exited', async () => {
    const onFinish = vi.fn();
    render(<GuidedTour run onFinish={onFinish} />);
    await screen.findByTestId('joyride');

    fireJoyride({ status: 'skipped', action: 'skip', type: 'tour:end' });

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  // In v3 the X button, overlay click, and ESC all fire a CLOSE action while the
  // tour is still "running" (close advances the step). We treat that as an exit.
  it.each([
    ['X / close button', 'button_close'],
    ['overlay click', 'overlay'],
    ['ESC key', 'keyboard'],
  ])('calls onFinish when the tour is dismissed via %s', async (_label, origin) => {
    const onFinish = vi.fn();
    render(<GuidedTour run onFinish={onFinish} />);
    await screen.findByTestId('joyride');

    fireJoyride({ status: 'running', action: 'close', origin, type: 'step:after' });

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it.each(['next', 'prev'])(
    'does not call onFinish during normal "%s" navigation',
    async (action) => {
      const onFinish = vi.fn();
      render(<GuidedTour run onFinish={onFinish} />);
      await screen.findByTestId('joyride');

      fireJoyride({ status: 'running', action, type: 'step:after' });

      expect(onFinish).not.toHaveBeenCalled();
    },
  );
});
