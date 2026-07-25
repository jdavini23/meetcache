import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CacheApp from './CacheApp';

const { getSession, onAuthStateChange, signInWithOtp, signOut, from } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession, onAuthStateChange, signInWithOtp, signOut },
    from,
  },
}));

function queryResult(data: unknown, error: Error | null = null) {
  const result = { data, error };
  const query: Record<string, unknown> & PromiseLike<typeof result> = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  for (const method of ['select', 'eq', 'order']) (query[method] as ReturnType<typeof vi.fn>).mockReturnValue(query);
  (query.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  (query.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return query;
}

const savedProfile = {
  id: 'profile-1', user_id: 'user-1', nickname: 'Milo', birth_month: 7, birth_year: 2023,
  pronouns: null, routines: 'Preschool', challenges: 'Transitions', parent_notes: null,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
};

describe('CacheApp', () => {
  beforeEach(() => {
    getSession.mockReset();
    onAuthStateChange.mockReset();
    signInWithOtp.mockReset();
    signOut.mockReset();
    from.mockReset();
    getSession.mockResolvedValue({ data: { session: null } });
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('requests a magic link from the signed-out app', async () => {
    const user = userEvent.setup();
    signInWithOtp.mockResolvedValue({ error: null });
    render(<CacheApp />);

    await user.type(await screen.findByPlaceholderText('you@example.com'), 'parent@example.com');
    await user.click(screen.getByRole('button', { name: /send sign-in link/i }));

    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'parent@example.com' }));
    expect(await screen.findByText('Check your email for a secure sign-in link.')).toBeInTheDocument();
  });

  it('keeps invalid onboarding data in the form with a clear validation error', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    const profileQuery = { select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) };
    from.mockReturnValue(profileQuery);
    render(<CacheApp />);

    const nickname = await screen.findByPlaceholderText('Milo');
    fireEvent.change(nickname, { target: { value: 'Milo' } });
    fireEvent.submit(nickname.closest('form')!);

    expect(await screen.findByText(/supports children ages 1 through 6/i)).toBeInTheDocument();
  });

  it('traps focus in account settings and resets deletion confirmation when closed', async () => {
    const user = userEvent.setup();
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    from.mockImplementation((table: string) => {
      if (table === 'child_profiles') return queryResult(savedProfile);
      if (table === 'conversations') return queryResult({ id: 'conversation-1', child_profile_id: 'profile-1', user_id: 'user-1' });
      return queryResult([{ id: 'assistant-1', conversation_id: 'conversation-1', user_id: 'user-1', role: 'assistant', content: '**Try this first:** Pause.', created_at: '2026-01-01T00:00:00.000Z' }]);
    });
    render(<CacheApp />);

    expect(await screen.findByText('Chatting about Milo')).toBeInTheDocument();
    expect(screen.getByText('Try this first:')).toBeInTheDocument();
    const accountButton = screen.getByRole('button', { name: 'Account' });
    await user.click(accountButton);

    const deleteButton = screen.getByRole('button', { name: /delete my account and data/i });
    expect(deleteButton).toBeDisabled();
    const closeButton = screen.getByRole('button', { name: 'Close account settings' });
    const confirmationInput = screen.getByLabelText('Type DELETE to confirm');
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(confirmationInput).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    await user.type(confirmationInput, 'DELETE');
    expect(deleteButton).toBeEnabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(accountButton).toHaveFocus();

    await user.click(accountButton);
    expect(screen.getByLabelText('Type DELETE to confirm')).toHaveValue('');
  });

  it('aborts hanging chat attempts and retries with the original idempotency ID', async () => {
    const pendingRequests: RequestInit[] = [];
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'f8b67515-5e62-4a65-b7c7-69b7d7c1b471') });
    vi.stubGlobal('fetch', vi.fn((_url: string, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      pendingRequests.push(options ?? {});
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')));
    })));
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    from.mockImplementation((table: string) => {
      if (table === 'child_profiles') return queryResult(savedProfile);
      if (table === 'conversations') return queryResult({ id: 'conversation-1', child_profile_id: 'profile-1', user_id: 'user-1' });
      return queryResult([]);
    });
    render(<CacheApp />);

    const input = await screen.findByLabelText('Message Cache');
    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: 'What should I try?' } });
    fireEvent.submit(input.closest('form')!);
    await act(async () => {
      await Promise.resolve();
    });
    expect(pendingRequests).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000);
    });

    expect(pendingRequests.length).toBeGreaterThan(1);
    expect(pendingRequests[0].signal?.aborted).toBe(true);
    expect(pendingRequests.every((request) => JSON.parse(request.body as string).clientRequestId === 'f8b67515-5e62-4a65-b7c7-69b7d7c1b471')).toBe(true);
    expect(screen.getByText(/cache is still preparing this response/i)).toBeInTheDocument();
  });
});
