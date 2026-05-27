import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AiConnectPanel from './AiConnectPanel';

describe('AiConnectPanel', () => {
  const mockWriteText = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: mockWriteText.mockResolvedValue(undefined) },
    });
  });

  it('lists all five platforms and shows the MCP URL', () => {
    render(<AiConnectPanel />);
    for (const name of ['Claude', 'ChatGPT', 'Perplexity', 'Gemini', 'Lovable']) {
      expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument();
    }
    expect(screen.getByTestId('mcp-endpoint-url').textContent).toMatch(/\/mcp$/);
  });

  it('copies the MCP URL', async () => {
    render(<AiConnectPanel />);
    fireEvent.click(screen.getByRole('button', { name: /^copy url$/i }));
    await waitFor(() => expect(mockWriteText).toHaveBeenCalled());
    expect(mockWriteText.mock.calls[0][0]).toMatch(/\/mcp$/);
  });

  it('shows steps and prompts only after a platform is selected', () => {
    render(<AiConnectPanel />);
    expect(screen.queryByText(/Settings → Connectors/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/best-fitting job opportunity/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Claude/i }));
    expect(screen.getByText(/Settings → Connectors/i)).toBeInTheDocument();
    expect(screen.getByText(/log in & consent/i)).toBeInTheDocument();
    expect(screen.getByText(/best-fitting job opportunity/i)).toBeInTheDocument();
  });

  it('reveals the API-key header behind the advanced toggle', () => {
    render(<AiConnectPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Claude/i }));
    expect(screen.queryByText(/X-MCP-Key/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /connect with an api key/i }));
    expect(screen.getByText(/X-MCP-Key/)).toBeInTheDocument();
  });

  it('shows the Gemini CLI caveat when Gemini is selected', () => {
    render(<AiConnectPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Gemini/i }));
    expect(screen.getByText(/consumer Gemini app/i)).toBeInTheDocument();
  });

  it('shows the Lovable-specific prompt only for Lovable', () => {
    render(<AiConnectPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Claude/i }));
    expect(screen.queryByText(/portfolio site using my Orbis/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lovable/i }));
    expect(screen.getByText(/portfolio site using my Orbis/i)).toBeInTheDocument();
  });
});
