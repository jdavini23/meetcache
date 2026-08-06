import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const savedMemory = {
  id: '2fe77944-ee05-4dd1-a589-92699b6e2278', child_profile_id: 'profile-1', memory_type: 'helps',
  content: 'A visual timer helps with transitions.', parent_action: 'accepted',
  created_at: '2026-01-02T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
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

  it('keeps invalid onboarding data in the form with an inline validation summary', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    const profileQuery = { select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) };
    from.mockReturnValue(profileQuery);
    render(<CacheApp />);

    const nickname = await screen.findByPlaceholderText('Milo');
    fireEvent.change(nickname, { target: { value: 'Milo' } });
    fireEvent.submit(nickname.closest('form')!);

    expect(await screen.findByText('A few details need your attention.')).toBeInTheDocument();
    expect(screen.getByText('Choose a birth month and year.')).toBeInTheDocument();
    expect(nickname).toHaveValue('Milo');
    expect(screen.getByLabelText('Birth month')).toHaveFocus();
  });

  it('keeps optional context hidden until a parent asks to add it', async () => {
    const user = userEvent.setup();
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    const profileQuery = { select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) };
    from.mockReturnValue(profileQuery);
    render(<CacheApp />);

    const optionalDetails = await screen.findByRole('button', { name: /optional details/i });
    expect(optionalDetails).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText(/pronouns/i)).not.toBeInTheDocument();

    await user.click(optionalDetails);
    expect(optionalDetails).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/pronouns/i)).toBeInTheDocument();
    expect(screen.getByText('0 / 2000')).toBeInTheDocument();
  });

  it('opens existing optional context in the accessible editor and returns focus after closing', async () => {
    const user = userEvent.setup();
    const detailedProfile = { ...savedProfile, pronouns: 'they/them', parent_notes: 'A calm routine helps.' };
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    from.mockImplementation((table: string) => {
      if (table === 'child_profiles') return queryResult(detailedProfile);
      if (table === 'conversations') return queryResult({ id: 'conversation-1', child_profile_id: 'profile-1', user_id: 'user-1' });
      return queryResult([]);
    });
    render(<CacheApp />);

    const editButton = await screen.findByRole('button', { name: /edit saved context/i });
    await user.click(editButton);
    expect(screen.getByRole('dialog', { name: /update milo’s context/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /optional details/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/pronouns/i)).toHaveValue('they/them');

    const closeButton = screen.getByRole('button', { name: 'Close context editor' });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /update milo’s context/i })).not.toBeInTheDocument();
    expect(editButton).toHaveFocus();
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

  it('edits and removes approved memories while preserving historical use text', async () => {
    const user = userEvent.setup();
    let patchAttempts = 0;
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/memories' && !options?.method) return Promise.resolve(new Response(JSON.stringify({ memories: [savedMemory], limit: 12 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      if (url === `/api/memories/${savedMemory.id}` && options?.method === 'PATCH') {
        patchAttempts += 1;
        if (patchAttempts === 1) return Promise.resolve(new Response(JSON.stringify({ error: 'Cache could not update that memory right now.' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
        return Promise.resolve(new Response(JSON.stringify({ memory: { ...savedMemory, content: 'A calm countdown helps with transitions.' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url === `/api/memories/${savedMemory.id}` && options?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
      if (url === '/api/product-events') return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify({ suggestions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    from.mockImplementation((table: string) => {
      if (table === 'child_profiles') return queryResult(savedProfile);
      if (table === 'conversations') return queryResult({ id: 'conversation-1', child_profile_id: 'profile-1', user_id: 'user-1' });
      if (table === 'messages') return queryResult([{ id: 'assistant-1', conversation_id: 'conversation-1', user_id: 'user-1', role: 'assistant', content: 'Try a visual timer.', created_at: '2026-01-01T00:00:00.000Z' }]);
      if (table === 'memory_message_uses') return queryResult([{ assistant_message_id: 'assistant-1', child_memory_id: savedMemory.id, memory_type_snapshot: 'helps', content_snapshot: savedMemory.content }]);
      return queryResult([]);
    });
    render(<CacheApp />);

    expect(await screen.findByRole('heading', { name: 'What Cache remembers' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const editor = screen.getByLabelText('Edit saved memory');
    await user.clear(editor);
    await user.type(editor, 'A calm countdown helps with transitions.');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Cache could not update that memory right now.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('A calm countdown helps with transitions.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Remove this memory?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText('A calm countdown helps with transitions.')).not.toBeInTheDocument();
    expect(screen.getByText(savedMemory.content)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage' })).not.toBeInTheDocument();
  });

  it('populates the focused composer from a starter prompt and preserves a Shift+Enter newline', async () => {
    const user = userEvent.setup();
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    from.mockImplementation((table: string) => {
      if (table === 'child_profiles') return queryResult(savedProfile);
      if (table === 'conversations') return queryResult({ id: 'conversation-1', child_profile_id: 'profile-1', user_id: 'user-1' });
      return queryResult([]);
    });
    render(<CacheApp />);

    await user.click(await screen.findByRole('button', { name: 'Help me think through a tough moment.' }));
    const input = screen.getByLabelText('Message Cache');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('Help me think through a tough moment.');

    await user.keyboard('{Shift>}{Enter}{/Shift}One more detail');
    expect(input).toHaveValue('Help me think through a tough moment.\nOne more detail');
  });

  it('shows persisted memory suggestions below the related Cache reply and dismisses one explicitly', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/memory-suggestions?')) {
        return Promise.resolve(new Response(JSON.stringify({ suggestions: [{
          id: 'suggestion-1', assistant_message_id: 'assistant-1', suggested_type: 'trigger',
          suggested_content: 'Transitions are harder after screen time.', decision: 'pending',
        }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return Promise.resolve(new Response(JSON.stringify({ result: { decision: 'rejected' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    from.mockImplementation((table: string) => {
      if (table === 'child_profiles') return queryResult(savedProfile);
      if (table === 'conversations') return queryResult({ id: 'conversation-1', child_profile_id: 'profile-1', user_id: 'user-1' });
      return queryResult([{ id: 'assistant-1', conversation_id: 'conversation-1', user_id: 'user-1', role: 'assistant', content: 'Try a visual timer.', created_at: '2026-01-01T00:00:00.000Z' }]);
    });
    render(<CacheApp />);

    expect(await screen.findByText('Want me to remember anything from this?')).toBeInTheDocument();
    expect(screen.getByText('Transitions are harder after screen time.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/memory-suggestions/suggestion-1', expect.objectContaining({ method: 'PATCH' }));
    expect(screen.queryByText('Transitions are harder after screen time.')).not.toBeInTheDocument();
  });

  it('adds an accepted suggestion to What Cache remembers without reloading', async () => {
    const user = userEvent.setup();
    const suggestion = {
      id: 'suggestion-1', assistant_message_id: 'assistant-1', suggested_type: 'helps',
      suggested_content: savedMemory.content, decision: 'pending',
    };
    vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/memories') return Promise.resolve(new Response(JSON.stringify({ memories: [], limit: 12 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      if (url.startsWith('/api/memory-suggestions?')) return Promise.resolve(new Response(JSON.stringify({ suggestions: [suggestion] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      if (url === `/api/memory-suggestions/${suggestion.id}` && options?.method === 'PATCH') return Promise.resolve(new Response(JSON.stringify({ result: { decision: 'accepted', memory: savedMemory }, memory: savedMemory }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return Promise.resolve(new Response(null, { status: 204 }));
    }));
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    from.mockImplementation((table: string) => {
      if (table === 'child_profiles') return queryResult(savedProfile);
      if (table === 'conversations') return queryResult({ id: 'conversation-1', child_profile_id: 'profile-1', user_id: 'user-1' });
      if (table === 'messages') return queryResult([{ id: 'assistant-1', conversation_id: 'conversation-1', user_id: 'user-1', role: 'assistant', content: 'Try a timer.', created_at: '2026-01-01T00:00:00.000Z' }]);
      return queryResult([]);
    });
    render(<CacheApp />);

    await user.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'What helps' })).toBeInTheDocument();
    expect(screen.getByText(savedMemory.content)).toBeInTheDocument();
    expect(screen.queryByText('Want me to remember anything from this?')).not.toBeInTheDocument();
  });

  it('blocks another save at twelve memories while leaving management and dismissal available', async () => {
    const user = userEvent.setup();
    const fullMemories = Array.from({ length: 12 }, (_, index) => ({ ...savedMemory, id: `memory-${index}`, content: `Saved detail ${index + 1}` }));
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/memories') return Promise.resolve(new Response(JSON.stringify({ memories: fullMemories, limit: 12 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      if (url.startsWith('/api/memory-suggestions?')) return Promise.resolve(new Response(JSON.stringify({ suggestions: [{ id: 'suggestion-1', assistant_message_id: 'assistant-1', suggested_type: 'helps', suggested_content: 'A new useful detail.', decision: 'pending' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return Promise.resolve(new Response(null, { status: 204 }));
    }));
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    from.mockImplementation((table: string) => {
      if (table === 'child_profiles') return queryResult(savedProfile);
      if (table === 'conversations') return queryResult({ id: 'conversation-1', child_profile_id: 'profile-1', user_id: 'user-1' });
      if (table === 'messages') return queryResult([{ id: 'assistant-1', conversation_id: 'conversation-1', user_id: 'user-1', role: 'assistant', content: 'One idea.', created_at: '2026-01-01T00:00:00.000Z' }]);
      return queryResult([]);
    });
    render(<CacheApp />);

    expect(await screen.findByText('12 of 12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Manage saved memories' }));
    expect(screen.getByRole('dialog', { name: /milo's saved context/i })).toBeInTheDocument();
  });

  it('shows an expandable disclosure beneath a reply that used saved context after reload', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/memories') return Promise.resolve(new Response(JSON.stringify({ memories: [savedMemory], limit: 12 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      if (url === '/api/product-events') return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify({ suggestions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }));
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    from.mockImplementation((table: string) => {
      if (table === 'child_profiles') return queryResult(savedProfile);
      if (table === 'conversations') return queryResult({ id: 'conversation-1', child_profile_id: 'profile-1', user_id: 'user-1' });
      if (table === 'messages') return queryResult([{
        id: 'assistant-1', conversation_id: 'conversation-1', user_id: 'user-1', role: 'assistant',
        content: 'Try a visual timer.', created_at: '2026-01-01T00:00:00.000Z',
      }]);
      if (table === 'memory_message_uses') return queryResult([{
        assistant_message_id: 'assistant-1', child_memory_id: savedMemory.id, memory_type_snapshot: 'helps',
        content_snapshot: 'A visual timer helps with transitions.',
      }]);
      return queryResult([]);
    });
    render(<CacheApp />);

    const disclosure = await screen.findByText('Using saved context');
    const details = disclosure.closest('details');
    expect(details).not.toHaveAttribute('open');
    await user.click(disclosure);
    expect(details).toHaveAttribute('open');
    expect(screen.getAllByText('A visual timer helps with transitions.')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    expect(screen.getByRole('dialog', { name: /milo's saved context/i })).toBeInTheDocument();
    const managedMemory = document.getElementById(`mobile-memory-${savedMemory.id}`);
    expect(managedMemory).toContainElement(screen.getAllByRole('button', { name: 'Edit' })[1]);
    await waitFor(() => expect(document.getElementById(`mobile-memory-${savedMemory.id}`)).toContainElement(document.activeElement as HTMLElement));
  });

  it('sends a composer draft with Enter and clears it after a successful response', async () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'f8b67515-5e62-4a65-b7c7-69b7d7c1b471') });
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.startsWith('/api/memory-suggestions')) return Promise.resolve(new Response(JSON.stringify({ suggestions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return Promise.resolve(new Response(JSON.stringify({
        parentMessage: { id: 'parent-1', conversation_id: 'conversation-1', user_id: 'user-1', role: 'parent', content: 'What should I try?', created_at: '2026-01-01T00:00:00.000Z' },
        message: { id: 'assistant-2', conversation_id: 'conversation-1', user_id: 'user-1', role: 'assistant', content: 'Try one calm step.', created_at: '2026-01-01T00:00:01.000Z' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }));
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } } });
    from.mockImplementation((table: string) => {
      if (table === 'child_profiles') return queryResult(savedProfile);
      if (table === 'conversations') return queryResult({ id: 'conversation-1', child_profile_id: 'profile-1', user_id: 'user-1' });
      return queryResult([]);
    });
    render(<CacheApp />);

    const input = await screen.findByLabelText('Message Cache');
    fireEvent.change(input, { target: { value: 'What should I try?' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input).toHaveValue('');
    expect(await screen.findByText('Try one calm step.')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(fetch).toHaveBeenCalledWith('/api/chat', expect.objectContaining({ method: 'POST' }));
  });

  it('aborts hanging chat attempts and retries with the original idempotency ID', async () => {
    const pendingRequests: RequestInit[] = [];
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'f8b67515-5e62-4a65-b7c7-69b7d7c1b471') });
    vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
      if (url.startsWith('/api/memory-suggestions')) return Promise.resolve(new Response(JSON.stringify({ suggestions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      if (url === '/api/memories') return Promise.resolve(new Response(JSON.stringify({ memories: [], limit: 12 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      if (url === '/api/product-events') return Promise.resolve(new Response(null, { status: 204 }));
      return new Promise<Response>((_resolve, reject) => {
      pendingRequests.push(options ?? {});
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')));
      });
    }));
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
