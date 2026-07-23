import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  createApp,
  isContextSummaryRequest,
  isSimpleGreeting,
  isStalePendingRequest,
  isUrgentSafetyConcern,
} from './server';

const dependencies = (getUser = vi.fn()) => ({
  supabase: { auth: { getUser } },
  gemini: {},
  geminiModel: 'test-model',
});

type QueryResult = {
  data: unknown;
  error: Error | null;
};

function mockQuery(result: QueryResult) {
  const query: Record<string, ReturnType<typeof vi.fn>> & PromiseLike<QueryResult> = {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  } as never;

  for (const method of ['insert', 'update', 'select', 'eq', 'neq', 'lt', 'order', 'limit']) {
    query[method].mockReturnValue(query);
  }

  return query;
}

const profile = {
  id: 'profile-1',
  user_id: 'user-1',
  nickname: 'Milo',
  birth_month: 7,
  birth_year: 2023,
  pronouns: 'they/them',
  routines: 'Preschool and bedtime at 7.',
  challenges: 'Transitions.',
  parent_notes: null,
};

const conversation = {
  id: 'conversation-1',
  user_id: 'user-1',
  child_profile_id: 'profile-1',
};

const parentMessage = {
  id: 'parent-1',
  conversation_id: 'conversation-1',
  user_id: 'user-1',
  role: 'parent',
  content: 'What can I try during transitions?',
  client_request_id: 'f8b67515-5e62-4a65-b7c7-69b7d7c1b471',
  response_status: 'pending',
  processing_started_at: '2026-07-22T12:00:00.000Z',
  created_at: '2026-07-22T12:00:00.000Z',
};

const assistantMessage = {
  id: 'assistant-1',
  conversation_id: 'conversation-1',
  user_id: 'user-1',
  role: 'assistant',
  content: '**Try this first:** Give a two-minute warning.',
  in_reply_to: 'parent-1',
  response_status: null,
  processing_started_at: null,
  created_at: '2026-07-22T12:00:01.000Z',
};

function authenticatedDependencies(
  queries: ReturnType<typeof mockQuery>[],
  rpcResult: QueryResult = { data: true, error: null },
) {
  const generateContent = vi.fn().mockResolvedValue({
    text: assistantMessage.content,
  });

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from: vi.fn(() => {
        const query = queries.shift();
        if (!query) throw new Error('Unexpected database query');
        return query;
      }),
      rpc: vi.fn().mockResolvedValue(rpcResult),
    },
    gemini: { models: { generateContent } },
    geminiModel: 'test-model',
    rateLimitMax: 10,
    rateLimitWindowSeconds: 60,
    dailyLimitMax: 100,
    staleRequestSeconds: 90,
  };
}

describe('chat safety helpers', () => {
  it('recognizes greetings, context requests, and urgent safety concerns', () => {
    expect(isSimpleGreeting('Hello there!')).toBe(true);
    expect(isContextSummaryRequest('What do you know about my saved profile?')).toBe(true);
    expect(isUrgentSafetyConcern('My child is having trouble breathing')).toBe(true);
  });

  it('only treats expired pending leases as stale', () => {
    const now = new Date('2026-07-22T12:02:00.000Z');
    expect(isStalePendingRequest(parentMessage as never, 90, now)).toBe(true);
    expect(isStalePendingRequest({
      ...parentMessage,
      response_status: 'completed',
    } as never, 90, now)).toBe(false);
  });
});

describe('POST /api/chat', () => {
  it('rejects unauthenticated requests before accessing external services', async () => {
    const getUser = vi.fn();
    const app = createApp(dependencies(getUser) as never);

    const response = await request(app).post('/api/chat').send({
      message: 'Hello',
      clientRequestId: 'f8b67515-5e62-4a65-b7c7-69b7d7c1b471',
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Authentication is required.');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects invalid payloads before authentication', async () => {
    const getUser = vi.fn();
    const app = createApp(dependencies(getUser) as never);

    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({ message: '', clientRequestId: 'not-a-uuid' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Please send a message up to 4,000 characters.');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects expired sessions', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('expired') });
    const app = createApp(dependencies(getUser) as never);

    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({ message: 'Hello', clientRequestId: 'f8b67515-5e62-4a65-b7c7-69b7d7c1b471' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Your session has expired. Please sign in again.');
  });

  it('persists a parent message and Gemini response', async () => {
    const parentInsert = mockQuery({ data: parentMessage, error: null });
    const assistantInsert = mockQuery({ data: assistantMessage, error: null });
    const dependencies = authenticatedDependencies([
      mockQuery({ data: profile, error: null }),
      mockQuery({ data: conversation, error: null }),
      mockQuery({ data: null, error: null }),
      parentInsert,
      mockQuery({ data: [], error: null }),
      assistantInsert,
      mockQuery({ data: null, error: null }),
      mockQuery({ data: null, error: null }),
    ]);
    const app = createApp(dependencies as never);

    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({
        message: parentMessage.content,
        clientRequestId: parentMessage.client_request_id,
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toEqual(assistantMessage);
    expect(dependencies.supabase.rpc).toHaveBeenCalledWith('consume_chat_rate_limit', {
      p_user_id: 'user-1',
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    expect(dependencies.supabase.rpc).toHaveBeenCalledWith('consume_daily_chat_quota', {
      p_user_id: 'user-1',
      p_max_requests: 100,
    });
    expect(parentInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      content: parentMessage.content,
      response_status: 'pending',
    }));
    expect(dependencies.gemini.models.generateContent).toHaveBeenCalledWith({
      model: 'test-model',
      contents: expect.stringContaining('Nickname: Milo'),
    });
    expect(assistantInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      content: assistantMessage.content,
      in_reply_to: parentMessage.id,
    }));
  });

  it('returns 429 before storing a new message when the durable quota is exhausted', async () => {
    const dependencies = authenticatedDependencies([
      mockQuery({ data: profile, error: null }),
      mockQuery({ data: conversation, error: null }),
      mockQuery({ data: null, error: null }),
    ], { data: false, error: null });
    const app = createApp(dependencies as never);

    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({
        message: parentMessage.content,
        clientRequestId: parentMessage.client_request_id,
      });

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('60');
    expect(dependencies.supabase.from).toHaveBeenCalledTimes(3);
    expect(dependencies.gemini.models.generateContent).not.toHaveBeenCalled();
  });

  it('enforces the daily cost ceiling after the burst limit passes', async () => {
    const dependencies = authenticatedDependencies([
      mockQuery({ data: profile, error: null }),
      mockQuery({ data: conversation, error: null }),
      mockQuery({ data: null, error: null }),
    ]);
    dependencies.supabase.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    const app = createApp(dependencies as never);

    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({
        message: parentMessage.content,
        clientRequestId: parentMessage.client_request_id,
      });

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('3600');
    expect(response.body.error).toContain('today’s message limit');
    expect(dependencies.supabase.from).toHaveBeenCalledTimes(3);
    expect(dependencies.gemini.models.generateContent).not.toHaveBeenCalled();
  });

  it('reclaims a stale pending request before generating its response', async () => {
    const staleParentMessage = {
      ...parentMessage,
      content: 'Hello',
      processing_started_at: '2026-07-22T11:00:00.000Z',
      created_at: '2026-07-22T11:00:00.000Z',
    };
    const reclaim = mockQuery({ data: staleParentMessage, error: null });
    const dependencies = authenticatedDependencies([
      mockQuery({ data: profile, error: null }),
      mockQuery({ data: conversation, error: null }),
      mockQuery({ data: staleParentMessage, error: null }),
      mockQuery({ data: null, error: null }),
      reclaim,
      mockQuery({ data: [], error: null }),
      mockQuery({ data: assistantMessage, error: null }),
      mockQuery({ data: null, error: null }),
      mockQuery({ data: null, error: null }),
    ]);
    const app = createApp(dependencies as never);

    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({
        message: 'Hello',
        clientRequestId: parentMessage.client_request_id,
      });

    expect(response.status).toBe(200);
    expect(reclaim.update).toHaveBeenCalledWith(expect.objectContaining({
      response_status: 'pending',
      processing_started_at: expect.any(String),
    }));
    expect(reclaim.lt).toHaveBeenCalledWith('processing_started_at', expect.any(String));
    expect(dependencies.gemini.models.generateContent).not.toHaveBeenCalled();
  });
});
