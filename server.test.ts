import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  createApp,
  isContextSummaryRequest,
  parseCoachingResponse,
  parseMemorySuggestions,
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
    expect(getUser).not.toHaveBeenCalled();

    const missingApp = createApp({
      supabase: { auth: { getUser: authenticated }, rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Memory not found' } }) },
      gemini: {}, geminiModel: 'test-model',
    } as never);
    const missing = await request(missingApp).delete(`/api/memories/${memory.id}`).set('Authorization', 'Bearer token');
    expect(missing.status).toBe(404);
  });

  it('returns a stable conflict when the atomic memory cap is reached', async () => {
    const app = createApp({
      supabase: { auth: { getUser: authenticated }, rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'memory_limit_reached' } }) },
      gemini: {}, geminiModel: 'test-model',
    } as never);

    const response = await request(app).patch('/api/memory-suggestions/4aa0f971-6d61-4c4f-af11-74fe629d0626')
      .set('Authorization', 'Bearer token').send({ action: 'accept' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('memory_limit_reached');
  });

  it('records allowlisted client events idempotently without content', async () => {
    const eventQuery = mockQuery({ data: null, error: { code: '23505' } as never });
    const from = vi.fn(() => eventQuery);
    const app = createApp({ supabase: { auth: { getUser: authenticated }, from }, gemini: {}, geminiModel: 'test-model' } as never);
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
