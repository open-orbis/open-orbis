import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConnectedAiClientsPage from './ConnectedAiClientsPage';

vi.mock('../api/oauth');
vi.mock('../stores/toastStore', () => ({
  useToastStore: () => ({ addToast: vi.fn() }),
}));

import { listGrants, revokeGrant } from '../api/oauth';

function renderPage() {
  return render(
    <MemoryRouter>
      <ConnectedAiClientsPage />
    </MemoryRouter>
  );
}

describe('ConnectedAiClientsPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders loading state then grant list', async () => {
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
    renderPage();
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
    await waitFor(() => screen.getByText('ChatGPT'));
    expect(screen.getByText(/Full access/)).toBeInTheDocument();
  });

  it('renders empty state when no grants', async () => {
    (listGrants as any).mockResolvedValue({ grants: [] });
    renderPage();
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
    renderPage();
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
    renderPage();
    await waitFor(() => screen.getByText('ChatGPT'));
    fireEvent.click(screen.getByText(/^Revoke$/));
    await waitFor(() => expect(revokeGrant).toHaveBeenCalledWith('c-1'));
    await waitFor(() => expect(screen.queryByText('ChatGPT')).not.toBeInTheDocument());
  });

  it('renders error state when listGrants fails', async () => {
    (listGrants as any).mockRejectedValue({ response: { data: { detail: 'boom' } } });
    renderPage();
    await waitFor(() => screen.getByText(/boom/));
  });
});
