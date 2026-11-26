import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  createApp,
  initServerSentry,
  isContextSummaryRequest,
  parseCoachingResponse,
  parseMemorySuggestions,
  isSimpleGreeting,
  isStalePendingRequest,
  isUrgentSafetyConcern,
  waitlistAlertFromEnv,
  waitlistInviteEmail,
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

const approvedMemory = {
  id: '2fe77944-ee05-4dd1-a589-92699b6e2278',
  memory_type: 'helps' as const,
  content: 'A visual timer helps with transitions.',
};

function authenticatedDependencies(
  queries: ReturnType<typeof mockQuery>[],
  rpcResult: QueryResult = { data: true, error: null },
) {
  const generateContent = vi.fn().mockResolvedValue({
    text: JSON.stringify({ content: assistantMessage.content, usedMemoryIds: [] }),
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
      rpc: vi.fn((name: string) => Promise.resolve(name === 'persist_assistant_message_with_memory_uses'
        ? { data: assistantMessage, error: null }
        : rpcResult)),
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

  it('keeps only concise, safe, unique memory suggestions', () => {
    expect(parseMemorySuggestions(JSON.stringify([
      { type: 'trigger', content: 'Transitions are harder after screen time.' },
      { type: 'trigger', content: 'Transitions are harder after screen time!' },
      { type: 'routine', content: 'Milo has ADHD.' },
      { type: 'helps', content: 'A visual timer can help with transitions.' },
    ]))).toEqual([
      { type: 'trigger', content: 'Transitions are harder after screen time.' },
      { type: 'helps', content: 'A visual timer can help with transitions.' },
    ]);
  });

  it('keeps only supplied, unique memory references from a structured coaching response', () => {
    const memories = [
      { id: 'memory-1', memory_type: 'helps' as const, content: 'A visual timer helps with transitions.' },
      { id: 'memory-2', memory_type: 'routine' as const, content: 'Bedtime starts at seven.' },
    ];

    expect(parseCoachingResponse(JSON.stringify({
      content: '**Try this first:** Set the timer.',
      usedMemoryIds: ['memory-1', 'foreign-memory', 'memory-1'],
    }), memories)).toEqual({
      content: '**Try this first:** Set the timer.',
      usedMemories: [{ memory_id: 'memory-1', memory_type: 'helps', content: 'A visual timer helps with transitions.' }],
    });
    expect(parseCoachingResponse('{not json}', memories)).toBeNull();
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
    const memoryQuery = mockQuery({ data: [], error: null });
    const dependencies = authenticatedDependencies([
      mockQuery({ data: profile, error: null }),
      mockQuery({ data: conversation, error: null }),
      mockQuery({ data: null, error: null }),
      parentInsert,
      mockQuery({ data: [], error: null }),
      memoryQuery,
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
    expect(response.body.message).toEqual({ ...assistantMessage, used_memories: [] });
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
    expect(dependencies.gemini.models.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'test-model',
      contents: expect.stringContaining('Nickname: Milo'),
      config: expect.objectContaining({ responseMimeType: 'application/json' }),
    }));
    const prompt = dependencies.gemini.models.generateContent.mock.calls[0][0].contents as string;
    expect(prompt).toContain('You are Cache, a calm, warm guide for parents of children ages 1 to 6.');
    expect(prompt).toContain('Open with one short, kind sentence that shows you heard the parent. Then give one concrete thing to try today. Add at most two short supporting points.');
    expect(prompt).toContain('Parent notes may include a line starting "Already tried:" with what the parent has tried.');
    expect(prompt).not.toContain('**Try this first:**');
    expect(prompt).not.toContain('Start with the most useful next action');
    expect(memoryQuery.eq).toHaveBeenCalledWith('child_profile_id', profile.id);
    expect(memoryQuery.limit).toHaveBeenCalledWith(12);
    expect(dependencies.supabase.rpc).toHaveBeenCalledWith('persist_assistant_message_with_memory_uses', {
      p_conversation_id: conversation.id,
      p_user_id: 'user-1',
      p_content: assistantMessage.content,
      p_in_reply_to: parentMessage.id,
      p_memory_suggestion_eligible: true,
      p_used_memory_ids: [],
    });
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
    expect(response.body.error).toBe('Cache needs a short break.');
    expect(dependencies.supabase.from).toHaveBeenCalledTimes(3);
    expect(dependencies.gemini.models.generateContent).not.toHaveBeenCalled();
  });

  it('reuses only validated memories for the current child and returns their audited snapshots', async () => {
    const memoryQuery = mockQuery({ data: [approvedMemory], error: null });
    const dependencies = authenticatedDependencies([
      mockQuery({ data: profile, error: null }),
      mockQuery({ data: conversation, error: null }),
      mockQuery({ data: null, error: null }),
      mockQuery({ data: parentMessage, error: null }),
      mockQuery({ data: [], error: null }),
      memoryQuery,
      mockQuery({ data: null, error: null }),
      mockQuery({ data: null, error: null }),
    ]);
    dependencies.gemini.models.generateContent.mockResolvedValue({ text: JSON.stringify({
      content: assistantMessage.content,
      usedMemoryIds: [approvedMemory.id, '65a8a006-b90f-42d9-85c7-a85a013732ef', approvedMemory.id],
    }) });
    const app = createApp(dependencies as never);

    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({ message: parentMessage.content, clientRequestId: parentMessage.client_request_id });

    expect(response.status).toBe(200);
    expect(memoryQuery.eq).toHaveBeenCalledWith('child_profile_id', profile.id);
    expect(memoryQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(memoryQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(memoryQuery.limit).toHaveBeenCalledWith(12);
    expect(dependencies.gemini.models.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      contents: expect.stringContaining(`[${approvedMemory.id}] ${approvedMemory.content}`),
    }));
    expect(dependencies.supabase.rpc).toHaveBeenCalledWith('persist_assistant_message_with_memory_uses', expect.objectContaining({
      p_used_memory_ids: [approvedMemory.id],
    }));
    expect(response.body.message.used_memories).toEqual([{
      memory_id: approvedMemory.id,
      memory_type: approvedMemory.memory_type,
      content: approvedMemory.content,
    }]);
  });

  it('fails safely without saving an assistant reply when structured model output is invalid', async () => {
    const failedStatusUpdate = mockQuery({ data: null, error: null });
    const dependencies = authenticatedDependencies([
      mockQuery({ data: profile, error: null }),
      mockQuery({ data: conversation, error: null }),
      mockQuery({ data: null, error: null }),
      mockQuery({ data: parentMessage, error: null }),
      mockQuery({ data: [], error: null }),
      mockQuery({ data: [approvedMemory], error: null }),
      failedStatusUpdate,
    ]);
    dependencies.gemini.models.generateContent.mockResolvedValue({ text: 'not-json' });
    const app = createApp(dependencies as never);

    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({ message: parentMessage.content, clientRequestId: parentMessage.client_request_id });

    expect(response.status).toBe(500);
    expect(dependencies.supabase.rpc.mock.calls.some(([name]) => name === 'persist_assistant_message_with_memory_uses')).toBe(false);
    expect(failedStatusUpdate.update).toHaveBeenCalledWith({ response_status: 'failed' });
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
    expect(response.body.error).toBe('You’ve reached today’s message limit. Cache will be ready again tomorrow.');
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
    const insertedContent = dependencies.supabase.from.mock.results
      .flatMap((result) => result.value.insert.mock.calls.map((call: [{ content?: string }]) => call[0]?.content))
      .filter(Boolean);
    expect(insertedContent).toContain('Hi. I’m here. What’s going on with Milo today?');
  });

  it('uses a fixed urgent-care response without calling Gemini', async () => {
    const urgentAssistant = { ...assistantMessage, content: 'Emergency handoff' };
    const dependencies = authenticatedDependencies([
      mockQuery({ data: profile, error: null }),
      mockQuery({ data: conversation, error: null }),
      mockQuery({ data: null, error: null }),
      mockQuery({ data: parentMessage, error: null }),
      mockQuery({ data: [], error: null }),
      mockQuery({ data: urgentAssistant, error: null }),
      mockQuery({ data: null, error: null }),
      mockQuery({ data: null, error: null }),
    ]);
    const app = createApp(dependencies as never);

    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({ message: 'My child swallowed a battery', clientRequestId: parentMessage.client_request_id });

    expect(response.status).toBe(200);
    expect(response.body.message.content).toBe('Emergency handoff');
    expect(dependencies.gemini.models.generateContent).not.toHaveBeenCalled();
  });

  it('replaces a generated response that discourages emergency care', async () => {
    const dependencies = authenticatedDependencies([
      mockQuery({ data: profile, error: null }),
      mockQuery({ data: conversation, error: null }),
      mockQuery({ data: null, error: null }),
      mockQuery({ data: parentMessage, error: null }),
      mockQuery({ data: [], error: null }),
      mockQuery({ data: [approvedMemory], error: null }),
      mockQuery({ data: null, error: null }),
      mockQuery({ data: null, error: null }),
    ]);
    dependencies.gemini.models.generateContent.mockResolvedValue({ text: JSON.stringify({
      content: 'Please avoid emergency care and handle the overdose at home.',
      usedMemoryIds: [approvedMemory.id],
    }) });
    const app = createApp(dependencies as never);

    const response = await request(app).post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({ message: 'What should I do?', clientRequestId: parentMessage.client_request_id });

    expect(response.status).toBe(200);
    expect(dependencies.supabase.rpc).toHaveBeenCalledWith('persist_assistant_message_with_memory_uses', expect.objectContaining({
      p_content: expect.stringContaining('local emergency number'),
      p_memory_suggestion_eligible: false,
      p_used_memory_ids: [],
    }));
  });
});

describe('launch-readiness endpoints', () => {
  it('exposes liveness and readiness with a request ID', async () => {
    const healthyApp = createApp({
      supabase: { from: vi.fn(() => mockQuery({ data: [], error: null })) },
      gemini: {},
      geminiModel: 'test-model',
    } as never);

    const health = await request(healthyApp).get('/healthz');
    const ready = await request(healthyApp).get('/readyz');

    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });
    expect(health.headers['x-request-id']).toBeTruthy();
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready' });
  });

  it('returns 503 when readiness cannot reach Supabase', async () => {
    const app = createApp({
      supabase: { from: vi.fn(() => mockQuery({ data: null, error: new Error('offline') })) },
      gemini: {},
      geminiModel: 'test-model',
    } as never);

    const response = await request(app).get('/readyz');

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Cache is not ready.');
    expect(response.body.requestId).toBeTruthy();
  });

  it('exports only the authenticated parent data', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(mockQuery({ data: profile, error: null }))
      .mockReturnValueOnce(mockQuery({ data: [conversation], error: null }))
      .mockReturnValueOnce(mockQuery({ data: [parentMessage, assistantMessage], error: null }))
      .mockReturnValueOnce(mockQuery({ data: [], error: null }))
      .mockReturnValueOnce(mockQuery({ data: [], error: null }))
      .mockReturnValueOnce(mockQuery({ data: [], error: null }))
      .mockReturnValueOnce(mockQuery({ data: [], error: null }));
    const app = createApp({ supabase: { auth: { getUser }, from }, gemini: {}, geminiModel: 'test-model' } as never);

    const response = await request(app).get('/api/account/export').set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('cache-data-export.json');
    expect(response.body).toEqual(expect.objectContaining({
      format: 'cache-data-export-v1',
      profile,
      conversations: [conversation],
      messages: [parentMessage, assistantMessage],
      memories: [],
      memorySuggestions: [],
      memoryUses: [],
      productEvents: [],
    }));
    expect(from).toHaveBeenCalledWith('child_profiles');
    expect(from).toHaveBeenCalledWith('conversations');
    expect(from).toHaveBeenCalledWith('messages');
    expect(from).toHaveBeenCalledWith('memory_message_uses');
    expect(from).toHaveBeenCalledWith('product_events');
  });

  it('revokes sessions before deleting the authenticated account', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    const app = createApp({
      supabase: {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
          admin: { signOut, deleteUser },
        },
      },
      gemini: {},
      geminiModel: 'test-model',
    } as never);

    const response = await request(app).delete('/api/account').set('Authorization', 'Bearer token');

    expect(response.status).toBe(204);
    expect(signOut).toHaveBeenCalledWith('token', 'global');
    expect(deleteUser).toHaveBeenCalledWith('user-1');
  });
});

describe('POST /api/webhooks/waitlist-signup', () => {
  const secret = 'test-alert-secret';
  const signup = { email: 'parent@example.com', source: 'hero', utm_source: 'threads', utm_medium: null, utm_campaign: 'carousel-1' };

  function alertApp({ count = 7, fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 }), config = {} } = {}) {
    const select = vi.fn().mockResolvedValue({ count, error: null });
    const from = vi.fn(() => ({ select }));
    const app = createApp({
      supabase: { from },
      gemini: {},
      geminiModel: 'test-model',
      waitlistAlert: { secret, resendApiKey: 're_test', to: 'founder@example.com', fetchImpl, ...config },
    } as never);
    return { app, fetchImpl, from };
  }

  it('returns 503 when alerts are not configured', async () => {
    const app = createApp({ supabase: {}, gemini: {}, geminiModel: 'test-model' } as never);
    const response = await request(app).post('/api/webhooks/waitlist-signup').send(signup);
    expect(response.status).toBe(503);
  });

  it('rejects a missing or wrong secret without calling Resend', async () => {
    const { app, fetchImpl } = alertApp();
    const missing = await request(app).post('/api/webhooks/waitlist-signup').send(signup);
    const wrong = await request(app).post('/api/webhooks/waitlist-signup').set('x-waitlist-alert-secret', 'nope').send(signup);
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a payload without an email', async () => {
    const { app, fetchImpl } = alertApp();
    const response = await request(app).post('/api/webhooks/waitlist-signup').set('x-waitlist-alert-secret', secret).send({ source: 'hero' });
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('emails the founder with the signup, attribution, and running total', async () => {
    const { app, fetchImpl, from } = alertApp();
    const response = await request(app).post('/api/webhooks/waitlist-signup').set('x-waitlist-alert-secret', secret).send(signup);

    expect(response.status).toBe(202);
    expect(from).toHaveBeenCalledWith('waitlist');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer re_test', 'Idempotency-Key': 'waitlist-signup-parent@example.com' });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: 'Cache <onboarding@resend.dev>', to: ['founder@example.com'], subject: 'Cache waitlist #7: parent@example.com' });
    expect(body.text).toContain('Form: hero');
    expect(body.text).toContain('Campaign: threads / carousel-1');
    expect(body.text).toContain('Total signups: 7');
  });

  it('still sends the alert when the signup count is unavailable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const app = createApp({
      supabase: { from: vi.fn(() => ({ select: vi.fn().mockRejectedValue(new Error('offline')) })) },
      gemini: {},
      geminiModel: 'test-model',
      waitlistAlert: { secret, resendApiKey: 're_test', to: 'founder@example.com', fetchImpl },
    } as never);
    const response = await request(app).post('/api/webhooks/waitlist-signup').set('x-waitlist-alert-secret', secret).send({ email: 'parent@example.com' });

    expect(response.status).toBe(202);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.subject).toBe('Cache waitlist signup: parent@example.com');
    expect(body.text).toContain('Campaign: none (direct or untagged link)');
  });

  it('returns 502 when Resend rejects the email', async () => {
    const { app } = alertApp({ fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 403 }) });
    const response = await request(app).post('/api/webhooks/waitlist-signup').set('x-waitlist-alert-secret', secret).send(signup);
    expect(response.status).toBe(502);
  });
});

describe('initServerSentry', () => {
  it('stays off when no DSN is configured', () => {
    expect(initServerSentry({})).toBe(false);
  });
});

describe('PATCH /api/memory-suggestions/:id', () => {
  const suggestionId = '3f6c2a1e-8b4d-4c7a-9e2f-1a2b3c4d5e6f';

  function memoryApp(rpcResult: { data: unknown; error: { message: string } | null }) {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const rpc = vi.fn().mockResolvedValue(rpcResult);
    const app = createApp({ supabase: { auth: { getUser }, rpc }, gemini: {}, geminiModel: 'test-model' } as never);
    return { app, rpc };
  }

  it('explains the 12-memory limit enforced by the database', async () => {
    const { app } = memoryApp({ data: null, error: { message: 'memory_limit_reached' } });
    const response = await request(app)
      .patch(`/api/memory-suggestions/${suggestionId}`)
      .set('authorization', 'Bearer token')
      .send({ action: 'accept' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('This child already has 12 saved memories. Remove one before saving another.');
  });

  it('keeps the unavailable message for suggestions that were already resolved', async () => {
    const { app } = memoryApp({ data: null, error: { message: 'Memory suggestion has already been resolved' } });
    const response = await request(app)
      .patch(`/api/memory-suggestions/${suggestionId}`)
      .set('authorization', 'Bearer token')
      .send({ action: 'accept' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('That memory suggestion is no longer available.');
  });
});

describe('POST /api/webhooks/waitlist-approved', () => {
  const secret = 'test-alert-secret';

  function inviteApp({ fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 }), updateError = null as Error | null, config = {} } = {}) {
    const eq = vi.fn().mockResolvedValue({ error: updateError });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const app = createApp({
      supabase: { from },
      gemini: {},
      geminiModel: 'test-model',
      waitlistAlert: { secret, resendApiKey: 're_test', fetchImpl, ...config },
    } as never);
    return { app, fetchImpl, from, update, eq };
  }

  it('returns 503 when invites are not configured', async () => {
    const app = createApp({ supabase: {}, gemini: {}, geminiModel: 'test-model' } as never);
    const response = await request(app).post('/api/webhooks/waitlist-approved').send({ email: 'parent@example.com' });
    expect(response.status).toBe(503);
  });

  it('rejects a wrong secret without sending anything', async () => {
    const { app, fetchImpl } = inviteApp();
    const response = await request(app).post('/api/webhooks/waitlist-approved').set('x-waitlist-alert-secret', 'nope').send({ email: 'parent@example.com' });
    expect(response.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a payload without an email', async () => {
    const { app, fetchImpl } = inviteApp();
    const response = await request(app).post('/api/webhooks/waitlist-approved').set('x-waitlist-alert-secret', secret).send({});
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('emails the approved parent an invite and records when it was sent', async () => {
    const { app, fetchImpl, from, update, eq } = inviteApp({ config: { inviteReplyTo: 'founder@example.com' } });
    const response = await request(app).post('/api/webhooks/waitlist-approved').set('x-waitlist-alert-secret', secret).send({ email: 'Parent@Example.com' });

    expect(response.status).toBe(202);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer re_test', 'Idempotency-Key': 'waitlist-invite-parent@example.com' });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: 'Cache <hello@meetcache.com>', to: ['parent@example.com'], reply_to: 'founder@example.com' });
    expect(body.subject).toMatch(/your cache invite is ready/i);
    expect(body.text).toContain('https://www.meetcache.com/app?email=parent%40example.com');
    expect(body.html).toContain('href="https://www.meetcache.com/app?email=parent%40example.com"');
    expect(from).toHaveBeenCalledWith('waitlist');
    expect(update).toHaveBeenCalledWith({ invite_sent_at: expect.any(String) });
    expect(eq).toHaveBeenCalledWith('email', 'parent@example.com');
  });

  it('omits reply_to when none is configured', async () => {
    const { app, fetchImpl } = inviteApp();
    await request(app).post('/api/webhooks/waitlist-approved').set('x-waitlist-alert-secret', secret).send({ email: 'parent@example.com' });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty('reply_to');
  });

  it('still reports success when the invite is sent but recording it fails', async () => {
    const { app } = inviteApp({ updateError: new Error('offline') });
    const response = await request(app).post('/api/webhooks/waitlist-approved').set('x-waitlist-alert-secret', secret).send({ email: 'parent@example.com' });
    expect(response.status).toBe(202);
  });

  it('returns 502 and records nothing when Resend rejects the invite', async () => {
    const { app, update } = inviteApp({ fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 422 }) });
    const response = await request(app).post('/api/webhooks/waitlist-approved').set('x-waitlist-alert-secret', secret).send({ email: 'parent@example.com' });
    expect(response.status).toBe(502);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('waitlistInviteEmail', () => {
  it('escapes the email in HTML and respects a custom app URL', () => {
    const message = waitlistInviteEmail('a<b>@example.com', 'https://staging.example.com/');
    expect(message.signInUrl).toBe('https://staging.example.com/app?email=a%3Cb%3E%40example.com');
    expect(message.html).toContain('a&lt;b&gt;@example.com');
    expect(message.html).not.toContain('a<b>@example.com');
  });

  it('reads invite settings from the environment', () => {
    expect(waitlistAlertFromEnv({ WAITLIST_INVITE_FROM: 'X <x@y.co>', WAITLIST_INVITE_REPLY_TO: 'r@y.co', APP_URL: 'https://a.co' })).toMatchObject({
      inviteFrom: 'X <x@y.co>',
      inviteReplyTo: 'r@y.co',
      appUrl: 'https://a.co',
    });
  });
});

describe('POST /api/product-events', () => {
  const subjectId = '6f0b8a4e-3c1d-4b8e-9a51-0d6a2f3c9e17';
  const clientEventId = 'a3d5c2b1-7e4f-4a6b-8c9d-1e2f3a4b5c6d';

  function eventApp(insertError: { code?: string; message?: string } | null = null) {
    const insert = vi.fn().mockResolvedValue({ data: null, error: insertError });
    const from = vi.fn(() => ({ insert }));
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    const app = createApp({ supabase: { auth: { getUser }, from }, gemini: {}, geminiModel: 'test-model' } as never);
    return { app, insert, from, getUser };
  }

  it('records a supported event for the signed-in parent', async () => {
    const { app, insert, from } = eventApp();

    const response = await request(app).post('/api/product-events').set('Authorization', 'Bearer token')
      .send({ eventName: 'app_session_started', subjectId, clientEventId });

    expect(response.status).toBe(204);
    expect(from).toHaveBeenCalledWith('product_events');
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      event_name: 'app_session_started',
      subject_id: subjectId,
      client_event_id: clientEventId,
    });
  });

  it('rejects unsupported events and malformed IDs before authenticating', async () => {
    const { app, getUser, insert } = eventApp();

    for (const body of [
      { eventName: 'memory_deleted', subjectId, clientEventId },
      { eventName: 'app_session_started', subjectId: 'profile-1', clientEventId },
      { eventName: 'app_session_started', subjectId },
    ]) {
      const response = await request(app).post('/api/product-events').set('Authorization', 'Bearer token').send(body);
      expect(response.status).toBe(400);
    }
    expect(getUser).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('requires a signed-in parent', async () => {
    const { app, insert } = eventApp();

    const response = await request(app).post('/api/product-events')
      .send({ eventName: 'app_session_started', subjectId, clientEventId });

    expect(response.status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });

  it('treats a retried event as already recorded', async () => {
    const { app } = eventApp({ code: '23505', message: 'duplicate key' });

    const response = await request(app).post('/api/product-events').set('Authorization', 'Bearer token')
      .send({ eventName: 'memory_use_disclosure_opened', subjectId, clientEventId });

    expect(response.status).toBe(204);
  });

  it('returns 500 when the event cannot be stored', async () => {
    const { app } = eventApp({ code: '42501', message: 'permission denied' });

    const response = await request(app).post('/api/product-events').set('Authorization', 'Bearer token')
      .send({ eventName: 'app_session_started', subjectId, clientEventId });

    expect(response.status).toBe(500);
  });
});

describe('memory management endpoints', () => {
  const memory = {
    ...approvedMemory,
    child_profile_id: '73b050f5-49e0-426f-a847-234d0bc47b0d',
    parent_action: 'accepted',
    created_at: '2026-08-05T12:00:00.000Z',
    updated_at: '2026-08-05T12:00:00.000Z',
  };
  const authenticated = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

  it('lists only the authenticated parent memories', async () => {
    const memoryQuery = mockQuery({ data: [memory], error: null });
    const app = createApp({
      supabase: { auth: { getUser: authenticated }, from: vi.fn(() => memoryQuery) },
      gemini: {}, geminiModel: 'test-model',
    } as never);

    const response = await request(app).get('/api/memories').set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ memories: [memory], limit: 12 });
    expect(memoryQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('updates and deletes an owned memory through trusted database functions', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { ...memory, content: 'A countdown helps.' }, error: null })
      .mockResolvedValueOnce({ data: memory.id, error: null });
    const app = createApp({ supabase: { auth: { getUser: authenticated }, rpc }, gemini: {}, geminiModel: 'test-model' } as never);

    const updated = await request(app).patch(`/api/memories/${memory.id}`).set('Authorization', 'Bearer token').send({ content: 'A countdown helps.' });
    const deleted = await request(app).delete(`/api/memories/${memory.id}`).set('Authorization', 'Bearer token');

    expect(updated.status).toBe(200);
    expect(updated.body.memory.content).toBe('A countdown helps.');
    expect(deleted.status).toBe(204);
    expect(rpc).toHaveBeenNthCalledWith(1, 'update_child_memory', expect.objectContaining({ p_memory_id: memory.id, p_user_id: 'user-1' }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'delete_child_memory', { p_memory_id: memory.id, p_user_id: 'user-1' });
  });

  it('rejects unsafe edits before authentication and hides unowned memories', async () => {
    const getUser = vi.fn();
    const invalidApp = createApp({ supabase: { auth: { getUser } }, gemini: {}, geminiModel: 'test-model' } as never);
    const invalid = await request(invalidApp).patch(`/api/memories/${memory.id}`).send({ content: 'Milo has ADHD.' });
    expect(invalid.status).toBe(400);
    const badId = await request(invalidApp).delete('/api/memories/not-a-uuid');
    expect(badId.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();

    const missingApp = createApp({
      supabase: { auth: { getUser: authenticated }, rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Memory not found' } }) },
      gemini: {}, geminiModel: 'test-model',
    } as never);
    const missing = await request(missingApp).delete(`/api/memories/${memory.id}`).set('Authorization', 'Bearer token');
    expect(missing.status).toBe(404);
  });

  it('returns a stable conflict code when the atomic memory cap is reached', async () => {
    const app = createApp({
      supabase: { auth: { getUser: authenticated }, rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'memory_limit_reached' } }) },
      gemini: {}, geminiModel: 'test-model',
    } as never);

    const response = await request(app).patch('/api/memory-suggestions/4aa0f971-6d61-4c4f-af11-74fe629d0626')
      .set('Authorization', 'Bearer token').send({ action: 'accept' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('memory_limit_reached');
  });

  it('records memory manager opens as a client event', async () => {
    const eventQuery = mockQuery({ data: null, error: null });
    const app = createApp({ supabase: { auth: { getUser: authenticated }, from: vi.fn(() => eventQuery) }, gemini: {}, geminiModel: 'test-model' } as never);
    const payload = {
      eventName: 'memory_manager_opened',
      subjectId: memory.child_profile_id,
      clientEventId: 'ef9b6321-7f20-481f-8db7-40d0a71f9388',
    };

    const response = await request(app).post('/api/product-events').set('Authorization', 'Bearer token').send(payload);

    expect(response.status).toBe(204);
    expect(eventQuery.insert).toHaveBeenCalledWith({ user_id: 'user-1', event_name: payload.eventName, subject_id: payload.subjectId, client_event_id: payload.clientEventId });
  });
});
