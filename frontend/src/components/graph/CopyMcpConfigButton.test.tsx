import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('modal has role=dialog and aria-modal=true', () => {
    render(<CopyMcpConfigButton tokenId="abc123" label="t" />);
    fireEvent.click(screen.getByRole('button', { name: /copy mcp config/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'MCP client config');
  });

  it('Close button dismisses the modal', async () => {
    render(<CopyMcpConfigButton tokenId="abc123" label="t" />);
    fireEvent.click(screen.getByRole('button', { name: /copy mcp config/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Two "Close" buttons exist (X icon in header, footer text button) — click
    // the text one explicitly.
    const closeButtons = screen.getAllByRole('button', { name: /^close$/i });
    const footerClose = closeButtons.find((b) => b.textContent === 'Close');
    fireEvent.click(footerClose!);
    // framer-motion exit animation — wait for AnimatePresence to unmount
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('cURL disclosure reveals a curl example that copies correctly', () => {
    render(<CopyMcpConfigButton tokenId="abc123" label="t" />);
    fireEvent.click(screen.getByRole('button', { name: /copy mcp config/i }));
    // cURL pre is hidden until the disclosure is clicked
    expect(screen.queryByTestId('mcp-curl-example')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/test with curl first/i));
    const curlPre = screen.getByTestId('mcp-curl-example');
    expect(curlPre.textContent).toContain("orbs_abc123");
    expect(curlPre.textContent).toContain('https://mcp.example.com/mcp');
    // Copy cURL button writes a different payload than the JSON snippet
    fireEvent.click(screen.getByRole('button', { name: /copy curl/i }));
    const copied = mockWriteText.mock.calls.at(-1)?.[0];
    expect(copied).toContain('curl -X POST');
    expect(copied).toContain("orbs_abc123");
  });
});
