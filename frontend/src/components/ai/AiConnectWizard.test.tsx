import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AiConnectWizard from './AiConnectWizard';

describe('AiConnectWizard', () => {
  const mockWriteText = vi.fn();
  const baseProps = {
    open: true,
    onClose: () => {},
    onManageConnections: () => {},
  };

  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: mockWriteText.mockResolvedValue(undefined) },
    });
  });

  it('renders nothing when closed', () => {
    render(<AiConnectWizard {...baseProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('step 1 lists all five platforms', () => {
    render(<AiConnectWizard {...baseProps} />);
    for (const name of ['Claude', 'ChatGPT', 'Perplexity', 'Gemini', 'Lovable']) {
      expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument();
    }
  });

  it("selecting a platform shows the MCP URL and that platform’s first step", () => {
    render(<AiConnectWizard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Claude/i }));
    expect(screen.getByTestId('mcp-endpoint-url').textContent).toMatch(/\/mcp$/);
    expect(screen.getByText(/Settings → Connectors/i)).toBeInTheDocument();
    expect(screen.getByText(/log in & consent/i)).toBeInTheDocument();
  });

  it('copies the MCP URL', async () => {
    render(<AiConnectWizard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Claude/i }));
    fireEvent.click(screen.getByRole('button', { name: /^copy url$/i }));
    await waitFor(() => expect(mockWriteText).toHaveBeenCalled());
    expect(mockWriteText.mock.calls[0][0]).toMatch(/\/mcp$/);
  });

  it('reveals the API-key header behind the advanced toggle', () => {
    render(<AiConnectWizard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Claude/i }));
    expect(screen.queryByText(/X-MCP-Key/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /api key/i }));
    expect(screen.getByText(/X-MCP-Key/)).toBeInTheDocument();
  });

  it('shows the Gemini CLI caveat', () => {
    render(<AiConnectWizard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Gemini/i }));
    expect(screen.getByText(/consumer Gemini app/i)).toBeInTheDocument();
  });

  it('reaches step 3 and shows starter prompts; Lovable adds its own', () => {
    render(<AiConnectWizard {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Lovable/i }));
    fireEvent.click(screen.getByRole('button', { name: /i've connected/i }));
    expect(screen.getByText(/best-fitting job opportunity/i)).toBeInTheDocument();
    expect(screen.getByText(/portfolio site using my Orbis/i)).toBeInTheDocument();
  });

  it('footer "Manage connections" calls the callback', () => {
    const onManageConnections = vi.fn();
    render(<AiConnectWizard {...baseProps} onManageConnections={onManageConnections} />);
    fireEvent.click(screen.getByRole('button', { name: /Claude/i }));
    fireEvent.click(screen.getByRole('button', { name: /i've connected/i }));
    fireEvent.click(screen.getByRole('button', { name: /manage connections/i }));
    expect(onManageConnections).toHaveBeenCalledOnce();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<AiConnectWizard {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
