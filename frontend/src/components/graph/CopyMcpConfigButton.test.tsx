import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CopyMcpConfigButton } from './CopyMcpConfigButton';

describe('CopyMcpConfigButton', () => {
  const mockWriteText = vi.fn();

  beforeEach(() => {
    mockWriteText.mockClear();
    Object.assign(navigator, {
      clipboard: { writeText: mockWriteText.mockResolvedValue(undefined) },
    });
    vi.stubEnv('VITE_MCP_URL', 'https://mcp.example.com/mcp');
  });

  it('renders the button', () => {
    render(<CopyMcpConfigButton tokenId="abc123" label="Recruiter view" />);
    expect(screen.getByRole('button', { name: /copy mcp config/i })).toBeInTheDocument();
  });

  it('opens popover with JSON snippet when clicked', () => {
    render(<CopyMcpConfigButton tokenId="abc123" label="Recruiter view" />);
    fireEvent.click(screen.getByRole('button', { name: /copy mcp config/i }));
    const pre = screen.getByTestId('mcp-config-snippet');
    expect(pre.textContent).toContain('"url": "https://mcp.example.com/mcp"');
    expect(pre.textContent).toContain('"X-MCP-Key": "orbs_abc123"');
    expect(pre.textContent).toContain('"orbis-recruiter-view"');
  });

  it('falls back to orbis-<first-8> when label is empty', () => {
    render(<CopyMcpConfigButton tokenId="abcdefghij" label={null} />);
    fireEvent.click(screen.getByRole('button', { name: /copy mcp config/i }));
    const pre = screen.getByTestId('mcp-config-snippet');
    expect(pre.textContent).toContain('"orbis-abcdefgh"');
  });

  it('normalizes label: lowercase, symbols to dash, collapsed', () => {
    render(
      <CopyMcpConfigButton
        tokenId="abc"
        label={"Recruiter\u2019s View!! 2026"}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /copy mcp config/i }));
    const pre = screen.getByTestId('mcp-config-snippet');
    expect(pre.textContent).toContain('"orbis-recruiter-s-view-2026"');
  });

  it('copies snippet to clipboard on Copy click', async () => {
    render(<CopyMcpConfigButton tokenId="abc123" label="t" />);
    fireEvent.click(screen.getByRole('button', { name: /copy mcp config/i }));
    fireEvent.click(screen.getByRole('button', { name: /^copy snippet$/i }));
    expect(mockWriteText).toHaveBeenCalledOnce();
    const copied = mockWriteText.mock.calls[0][0];
    expect(copied).toContain('"X-MCP-Key": "orbs_abc123"');
  });
});
