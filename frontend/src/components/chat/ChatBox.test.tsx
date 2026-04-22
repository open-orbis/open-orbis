import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatBox from './ChatBox';

vi.mock('../../api/orbs', () => ({
  textSearch: vi.fn().mockResolvedValue([]),
}));

vi.mock('../graph/NodeColors', () => ({
  NODE_TYPE_COLORS: {},
}));

describe('ChatBox action buttons', () => {
  const baseProps = {
    onHighlight: () => {},
    messages: [],
    onMessagesChange: () => {},
  };

  it('does not render the robot button when onConnectedAi is omitted', () => {
    render(<ChatBox {...baseProps} onShare={() => {}} onAdd={() => {}} />);
    expect(
      screen.queryByRole('button', { name: /connected ai clients/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the cyan robot button and fires onConnectedAi on click', () => {
    const onConnectedAi = vi.fn();
    render(
      <ChatBox
        {...baseProps}
        onShare={() => {}}
        onAdd={() => {}}
        onConnectedAi={onConnectedAi}
      />,
    );
    const btn = screen.getByRole('button', { name: /connected ai clients/i });
    expect(btn.className).toMatch(/bg-cyan-600/);
    fireEvent.click(btn);
    expect(onConnectedAi).toHaveBeenCalledOnce();
  });

  it('positions the robot button between share and add', () => {
    render(
      <ChatBox
        {...baseProps}
        onShare={() => {}}
        onAdd={() => {}}
        onConnectedAi={() => {}}
      />,
    );
    const share = screen.getByTitle('Share');
    const robot = screen.getByRole('button', { name: /connected ai clients/i });
    const add = screen.getByTitle('Add Entry');
    const order = [share, robot, add].map((el) =>
      Array.from(el.parentElement!.children).indexOf(el),
    );
    expect(order).toEqual([0, 1, 2]);
  });
});
