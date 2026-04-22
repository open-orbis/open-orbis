import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ConsentPage from './ConsentPage';

vi.mock('../api/oauth');
vi.mock('../api/orbs');
import { getAuthorizeContext, submitConsent } from '../api/oauth';
import { listShareTokens } from '../api/orbs';

const INITIAL_URL =
  '/oauth/authorize?client_id=c-1&state=s&code_challenge=abc&code_challenge_method=S256&redirect_uri=https://chat.openai.com/cb&response_type=code&scope=orbis.read';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[INITIAL_URL]}>
      <Routes>
        <Route path="/oauth/authorize" element={<ConsentPage />} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ConsentPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders client name and offers Full/Restricted modes', async () => {
    (getAuthorizeContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      login_required: false,
      client_id: 'c-1',
      client_name: 'ChatGPT',
      registered_at: '2026-04-20T00:00:00Z',
      registered_from_ip: '1.2.3.4',
      redirect_uri: 'https://chat.openai.com/cb',
      scope: 'orbis.read',
    });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/ChatGPT wants to access/)).toBeInTheDocument()
    );
    expect(screen.getByText(/Full access/)).toBeInTheDocument();
    expect(screen.getByText(/Restricted access/)).toBeInTheDocument();
  });

  it('redirects to /login when login_required', async () => {
    (getAuthorizeContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      login_required: true,
      next: '/oauth/authorize?client_id=c-1',
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('LOGIN')).toBeInTheDocument());
  });

  it('displays the registered IP + client_id in the footer', async () => {
    (getAuthorizeContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      login_required: false,
      client_id: 'c-1',
      client_name: 'ChatGPT',
      registered_at: '2026-04-20T00:00:00Z',
      registered_from_ip: '1.2.3.4',
      redirect_uri: 'https://chat.openai.com/cb',
      scope: 'orbis.read',
    });

    renderPage();
    await waitFor(() => screen.getByText(/from IP 1\.2\.3\.4/));
    expect(screen.getByText(/client id c-1/)).toBeInTheDocument();
  });

  it('Restricted mode loads share tokens and binds on Allow', async () => {
    (getAuthorizeContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      login_required: false,
      client_id: 'c-1',
      client_name: 'ChatGPT',
      registered_at: '2026-04-20T00:00:00Z',
      registered_from_ip: '1.2.3.4',
      redirect_uri: 'https://chat.openai.com/cb',
      scope: 'orbis.read',
    });
    (listShareTokens as ReturnType<typeof vi.fn>).mockResolvedValue({
      tokens: [
        {
          token_id: 'tok-1',
          label: 'Recruiter view',
          revoked: false,
          keywords: [],
          hidden_node_types: [],
          orb_id: 'orb-1',
          created_at: '',
          expires_at: null,
          mcp_last_used_at: null,
          mcp_use_count: 0,
        },
      ],
    });
    (submitConsent as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 'ac_abc',
      state: 's',
      redirect_uri: 'https://chat.openai.com/cb',
    });

    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true,
    });

    renderPage();

    await waitFor(() => screen.getByText(/Restricted access/));
    // Click the restricted radio
    const restrictedRadio = screen.getAllByRole('radio')[1];
    fireEvent.click(restrictedRadio);
    // Wait for the share-token dropdown to load
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'tok-1' },
    });
    fireEvent.click(screen.getByText(/^Allow$/));

    await waitFor(() => expect(submitConsent).toHaveBeenCalled());
    const call = (submitConsent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.access_mode).toBe('restricted');
    expect(call.share_token_id).toBe('tok-1');
  });

  it('Allow is disabled until a share token is picked in Restricted mode', async () => {
    (getAuthorizeContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      login_required: false,
      client_id: 'c-1',
      client_name: 'x',
      registered_at: '2026-04-20T00:00:00Z',
      registered_from_ip: null,
      redirect_uri: 'https://e.com/cb',
      scope: 'orbis.read',
    });
    (listShareTokens as ReturnType<typeof vi.fn>).mockResolvedValue({ tokens: [] });

    renderPage();
    await waitFor(() => screen.getByText(/Restricted access/));
    const restrictedRadio = screen.getAllByRole('radio')[1];
    fireEvent.click(restrictedRadio);

    const allowBtn = screen.getByText(/^Allow$/).closest('button')!;
    expect(allowBtn).toBeDisabled();
  });

  it('Full mode submits with access_mode=full and no share_token_id', async () => {
    (getAuthorizeContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      login_required: false,
      client_id: 'c-1',
      client_name: 'ChatGPT',
      registered_at: '2026-04-20T00:00:00Z',
      registered_from_ip: null,
      redirect_uri: 'https://chat.openai.com/cb',
      scope: 'orbis.read',
    });
    (submitConsent as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 'ac_xyz',
      state: 's',
      redirect_uri: 'https://chat.openai.com/cb',
    });

    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true,
    });

    renderPage();
    await waitFor(() => screen.getByText(/Full access/));
    fireEvent.click(screen.getByText(/^Allow$/));
    await waitFor(() => expect(submitConsent).toHaveBeenCalled());
    const call = (submitConsent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.access_mode).toBe('full');
    expect(call.share_token_id).toBeUndefined();
  });
});
