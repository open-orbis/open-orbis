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
    expect(btn.className).toMatch(/from-cyan/);
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
    const share = screen.getByRole('button', { name: /share visibility/i });
    const robot = screen.getByRole('button', { name: /connected ai clients/i });
    const add = screen.getByRole('button', { name: /^add entry$/i });
    const order = [share, robot, add].map((el) =>
      Array.from(el.parentElement!.children).indexOf(el),
    );
    expect(order).toEqual([0, 1, 2]);
  });
});

describe('ChatBox search result row', () => {
  const nodeA = {
    uid: 'uid-a',
    name: 'Alpha Skill',
    _labels: ['Skill'],
    score: 0.9,
  } as unknown as import('../../api/orbs').OrbNode;

  const seededMessages = [
    { role: 'user' as const, text: 'alpha' },
    {
      role: 'assistant' as const,
      text: 'Found 1 matching node — highlighted in your graph.',
      matchedNodes: [nodeA],
      selectedNodeUid: nodeA.uid,
    },
  ];

  it('clicking a result row fires both onFocusNode and onEditNode with the node uid', () => {
    const onFocusNode = vi.fn();
    const onEditNode = vi.fn();
    render(
      <ChatBox
        onHighlight={() => {}}
        messages={seededMessages}
        onMessagesChange={() => {}}
        onFocusNode={onFocusNode}
        onEditNode={onEditNode}
      />,
    );
    const row = screen.getByRole('option', { name: /alpha skill/i });
    fireEvent.click(row);
    expect(onFocusNode).toHaveBeenCalledWith('uid-a');
    expect(onEditNode).toHaveBeenCalledWith('uid-a');
  });
});
