import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConnectedAiClientsModal from './ConnectedAiClientsModal';

vi.mock('../api/oauth');
vi.mock('../stores/toastStore', () => ({
  useToastStore: () => ({ addToast: vi.fn() }),
}));

import { listGrants, revokeGrant } from '../api/oauth';

describe('ConnectedAiClientsModal', () => {
  const mockWriteText = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: mockWriteText.mockResolvedValue(undefined) },
    });
  });

  it('renders nothing when closed', () => {
    (listGrants as any).mockResolvedValue({ grants: [] });
    render(<ConnectedAiClientsModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(listGrants).not.toHaveBeenCalled();
  });

  it('shows loading state then grant list when opened', async () => {
    (listGrants as any).mockResolvedValue({
      grants: [
        {
          client_id: 'c-1',
          client_name: 'ChatGPT',
          share_token_id: null,
          share_token_label: null,
          connected_at: '2026-04-20T00:00:00Z',
          last_used_at: '2026-04-21T10:00:00Z',
        },
      ],
    });
    render(<ConnectedAiClientsModal open onClose={() => {}} />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
    await waitFor(() => screen.getByText('ChatGPT'));
    expect(screen.getByText(/Full access/)).toBeInTheDocument();
  });

  it('renders empty state when no grants', async () => {
    (listGrants as any).mockResolvedValue({ grants: [] });
    render(<ConnectedAiClientsModal open onClose={() => {}} />);
    await waitFor(() => screen.getByText(/Nothing connected yet/));
  });

  it('renders Restricted label when share_token_id is set', async () => {
    (listGrants as any).mockResolvedValue({
      grants: [
        {
          client_id: 'c-2',
          client_name: 'Cursor',
          share_token_id: 'tok-abc',
          share_token_label: 'Recruiter view',
          connected_at: '2026-04-20T00:00:00Z',
          last_used_at: null,
        },
      ],
    });
    render(<ConnectedAiClientsModal open onClose={() => {}} />);
    await waitFor(() => screen.getByText('Cursor'));
    expect(screen.getByText(/Restricted: Recruiter view/)).toBeInTheDocument();
  });

  it('Revoke button removes row on success', async () => {
    (listGrants as any).mockResolvedValue({
      grants: [
        {
          client_id: 'c-1',
          client_name: 'ChatGPT',
          share_token_id: null,
          share_token_label: null,
          connected_at: '2026-04-20T00:00:00Z',
          last_used_at: null,
        },
      ],
    });
    (revokeGrant as any).mockResolvedValue(undefined);
    render(<ConnectedAiClientsModal open onClose={() => {}} />);
    await waitFor(() => screen.getByText('ChatGPT'));
    fireEvent.click(screen.getByText(/^Revoke$/));
    await waitFor(() => expect(revokeGrant).toHaveBeenCalledWith('c-1'));
    await waitFor(() => expect(screen.queryByText('ChatGPT')).not.toBeInTheDocument());
  });

  it('renders error state when listGrants fails', async () => {
    (listGrants as any).mockRejectedValue({ response: { data: { detail: 'boom' } } });
    render(<ConnectedAiClientsModal open onClose={() => {}} />);
    await waitFor(() => screen.getByText(/boom/));
  });

  it('shows the MCP endpoint URL and copies it to clipboard', async () => {
    (listGrants as any).mockResolvedValue({ grants: [] });
    render(<ConnectedAiClientsModal open onClose={() => {}} />);
    const url = screen.getByTestId('mcp-endpoint-url');
    expect(url.textContent).toMatch(/\/mcp$/);
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));
    await waitFor(() => expect(mockWriteText).toHaveBeenCalledOnce());
    expect(mockWriteText.mock.calls[0][0]).toMatch(/\/mcp$/);
    await waitFor(() => screen.getByRole('button', { name: /copied/i }));
  });

  it('fires onClose when backdrop is clicked', async () => {
    (listGrants as any).mockResolvedValue({ grants: [] });
    const onClose = vi.fn();
    const { container } = render(<ConnectedAiClientsModal open onClose={onClose} />);
    await waitFor(() => screen.getByText(/Nothing connected yet/));
    const backdrop = container.querySelector('.bg-black\\/60') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
